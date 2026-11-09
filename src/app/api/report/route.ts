import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, resolveAccess, eventScopeWhere, eventScopeSql, clientScopeWhere, clientScopeSql, type AccessInfo } from "@/lib/server";
import { monthLabel } from "@/lib/jalali";
import { normalizeDateInput } from "@/lib/jdate";
import { rawRows, sqlLocalDate, num } from "@/lib/analytics";
import { buildXlsx } from "@/lib/xlsx";

// =====================================================================
// گزارش‌ساز حرفه‌ای — موتور گزارش‌گیری عمومی (مطابق read_mysql/repengine.py)
// • دوازده منبع داده: جلسات، مالی، کاربران، رزروها، ارجاعات، پیامک‌ها،
//   موارد حاد، جلسات گروهی، لاگ فعالیت، مالیات مشاوران، سهمیه‌ها، درخواست‌های رزرو
// • حالت «جزئیات» صفحه‌بندی‌شده + حالت «خلاصه» با GROUP BY داخل دیتابیس
// • خروجی CSV (سازگار با اکسل فارسی) و اکسل XLSX راست‌به‌چپ
// • همهٔ ستون‌ها/فیلترها از وایت‌لیست می‌آیند — امن در برابر تزریق
// • نسخهٔ ۶.۱۰ — هر گزارش فقط در محدودهٔ دامنهٔ دادهٔ کاربر:
//   مدیر همه / مدیر استان دادهٔ استان / مدیر کلینیک دادهٔ کلینیک / مشاور فقط دادهٔ خودش
// =====================================================================

type SortDir = "asc" | "desc";

type ReportBody = {
  dataset?: string;
  mode?: "detail" | "summary";
  columns?: string[];
  filters?: {
    q?: string;
    status?: string;
    serviceId?: number | string;
    centerId?: number | string;
    from?: string;
    to?: string;
    blocked?: string;
    severity?: string;
  };
  groupBy?: string;
  metric?: string;
  sort?: { key?: string; dir?: SortDir };
  page?: number;
  pageSize?: number;
  format?: "json" | "csv" | "xlsx";
};

const SUMMARY_CAP = 50000; // سقف ردیف برای حالت جزئیاتِ خروجی فایل

function num2(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function dateFrom(v?: string): Date | null {
  const iso = normalizeDateInput(v);
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00.000");
  return isNaN(d.getTime()) ? null : d;
}
function dateTo(v?: string): Date | null {
  const iso = normalizeDateInput(v);
  if (!iso) return null;
  const d = new Date(iso + "T23:59:59.999");
  return isNaN(d.getTime()) ? null : d;
}

const faBool = (v: boolean | null | undefined) => (v === null || v === undefined ? "—" : v ? "بله" : "خیر");
void faBool;

export async function POST(req: NextRequest) {
  const acc = await resolveAccess(req);
  if (!acc) return fail("UNAUTHORIZED", 401);

  let body: ReportBody;
  try {
    body = await req.json();
  } catch {
    return fail("BAD_REQUEST");
  }

  const dataset = String(body.dataset ?? "events");
  const mode = body.mode === "summary" ? "summary" : "detail";
  const format = body.format === "csv" ? "csv" : body.format === "xlsx" ? "xlsx" : "json";
  const filters = body.filters ?? {};
  const sortDir: SortDir = body.sort?.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(body.page ?? 1));
  const pageSize = Math.min(100, Math.max(5, Number(body.pageSize ?? 20)));

  const serviceId = num2(filters.serviceId);
  const centerId = num2(filters.centerId);
  const fromDate = dateFrom(filters.from);
  const toDate = dateTo(filters.to);
  const q = String(filters.q ?? "").trim();

  try {
    const ctx0 = { acc } as const;
    switch (dataset) {
      case "events":
        return await reportEvents({ ...ctx0, mode, body, filters, q, serviceId, centerId, fromDate, toDate, sortDir, page, pageSize, format });
      case "finance":
        return await reportFinance({ ...ctx0, mode, body, q, serviceId, centerId, fromDate, toDate, sortDir, page, pageSize, format });
      case "users":
        return await reportUsers({ ...ctx0, mode, body, filters, q, fromDate, toDate, sortDir, page, pageSize, format });
      case "reserves":
        return await reportReserves({ ...ctx0, mode, body, q, fromDate, toDate, sortDir, page, pageSize, format });
      case "referrals":
        return await reportReferrals({ ...ctx0, mode, body, filters, q, fromDate, toDate, sortDir, page, pageSize, format });
      case "sms":
        return await reportSms({ ...ctx0, mode, body, filters, q, fromDate, toDate, sortDir, page, pageSize, format });
      case "ems":
        return await reportEms({ ...ctx0, mode, body, filters, q, fromDate, toDate, sortDir, page, pageSize, format });
      case "group-events":
        return await reportGroupEvents({ ...ctx0, mode, body, filters, q, serviceId, centerId, fromDate, toDate, sortDir, page, pageSize, format });
      case "logs":
        return await reportLogs({ ...ctx0, mode, body, q, fromDate, toDate, sortDir, page, pageSize, format });
      case "taxes":
        return await reportTaxes({ ...ctx0, mode, body, q, fromDate, toDate, sortDir, page, pageSize, format });
      case "budgets":
        return await reportBudgets({ ...ctx0, mode, body, q, fromDate, toDate, sortDir, page, pageSize, format });
      case "reserve-requests":
        return await reportReserveRequests({ ...ctx0, mode, body, filters, q, fromDate, toDate, sortDir, page, pageSize, format });
      default:
        return fail("DATASET_UNKNOWN");
    }
  } catch (e: any) {
    console.error("[report] failed:", e?.message ?? e);
    return fail("خطا در تولید گزارش: " + String(e?.message ?? "نامشخص"), 500);
  }
}

// ------------------------------------------------------------ ساختار پاسخ
type Ctx = {
  acc: AccessInfo; // هویت و دامنهٔ دادهٔ مؤثر — هر گزارش فقط داخل همین محدوده
  mode: "detail" | "summary";
  body: ReportBody;
  filters?: any;
  q: string;
  serviceId?: number | null;
  centerId?: number | null;
  fromDate: Date | null;
  toDate: Date | null;
  sortDir: SortDir;
  page: number;
  pageSize: number;
  format: "json" | "csv" | "xlsx";
};

/** افزودن شرط اسکوپ SQL به فهرست شرط‌های حالت خلاصه (که با AND به هم می‌پیوندند) */
function pushScope(parts: string[], args: unknown[], sc: { clause: string; args: unknown[] }): void {
  const c = sc.clause.replace(/^\s*AND\s+/, "");
  if (c) { parts.push(`(${c})`); args.push(...sc.args); }
}

type ColDef = { label: string; type?: "date" | "money" | "bool" | "num" };

/** پاسخ جزئیات — در حالت فایل، همهٔ ردیف‌ها بدون صفحه‌بندی تا سقف EXPORT */
async function detailResponse(ctx: Ctx, columns: Record<string, ColDef>, allRows: () => Promise<Record<string, unknown>[]>, pageCounted: () => Promise<{ rows: Record<string, unknown>[]; total: number }>, filename: string, defaultSortKey: string) {
  if (ctx.format === "json") {
    const { rows, total } = await pageCounted();
    return ok({ columns, rows, total, page: ctx.page, pageSize: ctx.pageSize, groupKeys: null, metrics: null });
  }
  // خروجی فایل — تا ۵۰ هزار ردیف
  const rows = (await allRows()).slice(0, SUMMARY_CAP);
  return fileResponse(ctx, columns, rows, filename, defaultSortKey);
}

/** ساخت CSV/XLSX از ردیف‌های نگاشت‌شده — کلید ستون = body.columns یا همهٔ ستون‌ها */
function fileResponse(ctx: Ctx, columns: Record<string, ColDef>, rows: Record<string, unknown>[], filename: string, defaultSortKey: string): NextResponse {
  const wanted = (ctx.body.columns && ctx.body.columns.length ? ctx.body.columns : Object.keys(columns)).filter((c) => columns[c]);
  const header = wanted.map((c) => columns[c].label);
  const cellText = (v: unknown, type?: string): string => {
    if (v === null || v === undefined) return "—";
    if (type === "bool") return v ? "بله" : "خیر";
    if (type === "date") {
      const d = v instanceof Date ? v : new Date(String(v));
      return isNaN(d.getTime()) ? String(v) : monthLabel(d);
    }
    return String(v);
  };
  if (ctx.format === "csv") {
    const esc = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const lines = [header.map(esc).join(",")];
    for (const r of rows) lines.push(wanted.map((c) => esc(cellText(r[c], columns[c].type))).join(","));
    return new NextResponse("\uFEFF" + lines.join("\r\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
      },
    });
  }
  // xlsx — ستون‌های عددی به‌صورت عدد تا در اکسل جمع‌پذیر باشند
  const sheet: { v: string | number | null; type?: "s" | "n" }[][] = [header.map((h) => ({ v: h }))];
  for (const r of rows) {
    sheet.push(wanted.map((c) => {
      const v = r[c];
      const t = columns[c].type;
      if (v === null || v === undefined) return { v: null };
      if (t === "money" || t === "num") return { v: num(v), type: "n" };
      if (t === "bool") return { v: v ? "بله" : "خیر" };
      if (t === "date") {
        const d = v instanceof Date ? v : new Date(String(v));
        return { v: isNaN(d.getTime()) ? String(v) : monthLabel(d) };
      }
      return { v: String(v) };
    }));
  }
  const buf = buildXlsx("گزارش", sheet);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
    },
  });
}

// ------------------------------------------------------------ حالت خلاصه با SQL
/**
 * خلاصهٔ SQL: یک GROUP BY داخل دیتابیس — روی میلیون‌ها ردیف هم سریع است.
 * groups: هر کلید یا SQLِ گروه‌بندی مستقیم است («e.status») یا «dateCol» برای ماه شمسی.
 */
async function summarizeSql(
  ctx: Ctx,
  base: { from: string; where: string; args: unknown[]; joins?: string },
  groups: Record<string, { label: string; sql?: string; dateCol?: string }>,
  metrics: Record<string, ColDef>,
): Promise<Response> {
  const gk = ctx.body.groupBy && groups[ctx.body.groupBy] ? ctx.body.groupBy : Object.keys(groups)[0];
  const g = groups[gk];
  const metricKey = ctx.body.metric && metrics[ctx.body.metric] ? ctx.body.metric : "count";
  const joins = base.joins ?? "";
  const where = base.where || "WHERE 1=1";
  const args = base.args;

  // تجمیع عمومی: هر متریک با SUM/AVG — همه در یک کوئری
  const metricCols: Record<string, string> = {
    count: "COUNT(*) AS m_count",
  };
  for (const key of Object.keys(metrics)) {
    if (key === "count") continue;
    const [, field] = key.split(":");
    if (key.startsWith("sum:")) metricCols[key] = `SUM(\`${field}\`) AS m_${key.replace(":", "_")}`;
    else if (key.startsWith("avg:")) metricCols[key] = `AVG(\`${field}\`) AS m_${key.replace(":", "_")}`;
  }

  if (g.dateCol) {
    const dd = sqlLocalDate(g.dateCol);
    const rows = await rawRows(
      `SELECT ${dd} AS d, ${Object.values(metricCols).join(", ")}
       FROM ${base.from}${joins} ${where}
       ${where.includes("WHERE") ? "AND" : "WHERE"} ${g.dateCol} IS NOT NULL
       GROUP BY ${dd} ORDER BY 1`,
      args,
    );
    // ماه شمسی از ردیف‌های روزانه
    const buckets = new Map<string, { label: string; count: number; agg: Record<string, number> }>();
    for (const r of rows) {
      const iso = String(r.d ?? "").slice(0, 10);
      if (!iso) continue;
      const key = monthLabel(new Date(iso + "T00:00:00.000"));
      const cur = buckets.get(key) ?? { label: key, count: 0, agg: {} };
      cur.count += num(r.m_count);
      for (const key2 of Object.keys(metrics)) {
        if (key2 === "count") continue;
        const alias = `m_${key2.replace(":", "_")}`;
        cur.agg[key2] = (cur.agg[key2] ?? 0) + num(r[alias]);
      }
      buckets.set(key, cur);
    }
    const result = [...buckets.entries()].map(([name, b]) => ({
      name,
      value: metricKey === "count" ? b.count
        : metricKey.startsWith("sum:") ? b.agg[metricKey] ?? 0
        : metricKey.startsWith("avg:") ? (b.count ? Math.round((b.agg[metricKey] ?? 0) / b.count) : 0)
        : b.count,
    }));
    return ok({
      columns: null, rows: result, total: result.length,
      summary: { groupBy: { key: gk, label: g.label }, metric: { key: metricKey, label: metrics[metricKey].label }, sourceRows: result.reduce((s, r) => s + r.value, 0), capped: false },
      groupKeys: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, { label: v.label }])),
      metrics,
    });
  }

  // گروه‌بندی ستونی مستقیم
  const groupSql = g.sql ?? "";
  const rows = await rawRows(
    `SELECT ${groupSql} AS g, ${Object.values(metricCols).join(", ")}
     FROM ${base.from}${joins} ${where}
     GROUP BY ${groupSql} ORDER BY m_count DESC`,
    args,
  );
  const result = rows
    .filter((r) => r.g !== null && r.g !== undefined && String(r.g) !== "")
    .map((r) => ({
      name: String(r.g),
      value: metricKey === "count" ? num(r.m_count)
        : metricKey.startsWith("sum:") ? num(r[`m_${metricKey.replace(":", "_")}`])
        : metricKey.startsWith("avg:") ? Math.round(num(r[`m_${metricKey.replace(":", "_")}`]))
        : num(r.m_count),
    }))
    .sort((a, b) => b.value - a.value);
  return ok({
    columns: null, rows: result, total: result.length,
    summary: { groupBy: { key: gk, label: g.label }, metric: { key: metricKey, label: metrics[metricKey].label }, sourceRows: result.reduce((s, r) => s + r.value, 0), capped: false },
    groupKeys: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, { label: v.label }])),
    metrics,
  });
}

// ------------------------------------------------------------ شرط‌های مشترک SQL
function eventWhere(q: string, serviceId: number | null, centerId: number | null, fromDate: Date | null, toDate: Date | null, alias = "e"): { where: string; args: unknown[] } {
  const parts: string[] = ["1=1"];
  const args: unknown[] = [];
  if (serviceId !== null) { parts.push(`${alias}.\`serviceId\` = ?`); args.push(serviceId); }
  if (centerId !== null) { parts.push(`${alias}.\`centerId\` = ?`); args.push(centerId); }
  if (fromDate) { parts.push(`${alias}.\`startDate\` >= ?`); args.push(fromDate); }
  if (toDate) { parts.push(`${alias}.\`startDate\` <= ?`); args.push(toDate); }
  if (q) { parts.push(`(${alias}.\`topic\` LIKE ? OR ${alias}.\`trackingCode\` LIKE ?)`); args.push(`%${q}%`, `%${q}%`); }
  return { where: `WHERE ${parts.join(" AND ")}`, args };
}

// ============================================================ جلسات
const EVENT_COLUMNS: Record<string, ColDef> = {
  id: { label: "شناسه" },
  trackingCode: { label: "کد رهگیری" },
  startDate: { label: "تاریخ جلسه", type: "date" },
  endDate: { label: "تاریخ پایان", type: "date" },
  status: { label: "وضعیت" },
  topic: { label: "موضوع" },
  userName: { label: "مراجع" },
  userNid: { label: "کد ملی مراجع" },
  userMobile: { label: "موبایل مراجع" },
  adviser: { label: "مشاور" },
  service: { label: "خدمت" },
  center: { label: "مرکز" },
  province: { label: "استان" },
  city: { label: "شهر" },
  userTariff: { label: "تعرفه (ریال)", type: "money" },
  acceptorFee: { label: "حق مشاور (ریال)", type: "money" },
  isEms: { label: "مورد حاد", type: "bool" },
};

const EVENT_GROUPS = {
  status: { label: "وضعیت", sql: "e.`status`" },
  service: { label: "خدمت", sql: "s.`name`" },
  center: { label: "مرکز", sql: "c.`title`" },
  adviser: { label: "مشاور", sql: "u.`name`" },
  month: { label: "ماه شمسی", dateCol: "e.`startDate`" },
};

const EVENT_METRICS: Record<string, ColDef> = {
  count: { label: "تعداد جلسات" },
  "sum:userTariff": { label: "جمع تعرفه (ریال)" },
  "sum:acceptorFee": { label: "جمع حق مشاور (ریال)" },
  "avg:userTariff": { label: "میانگین تعرفه (ریال)" },
};

const eventSelect = {
  id: true, trackingCode: true, startDate: true, endDate: true, status: true, topic: true,
  userTariff: true, acceptorFee: true, isEms: true,
  user: { select: { name: true, family: true, nid: true, mobile: true } },
  acceptor: { select: { name: true, family: true } },
  service: { select: { short: true, name: true } },
  center: { select: { title: true, cityTitle: true, provinceTitle: true } },
} as const;

function mapEvent(e: any) {
  return {
    id: e.id,
    trackingCode: e.trackingCode,
    startDate: e.startDate,
    endDate: e.endDate,
    status: e.status,
    topic: e.topic,
    userName: e.user ? `${e.user.name ?? ""} ${e.user.family ?? ""}`.trim() : null,
    userNid: e.user?.nid != null ? String(e.user.nid) : null,
    userMobile: e.user?.mobile != null ? String(e.user.mobile) : null,
    adviser: e.acceptor ? `${e.acceptor.name ?? ""} ${e.acceptor.family ?? ""}`.trim() : null,
    service: e.service ? e.service.short || e.service.name : null,
    center: e.center?.title ?? null,
    province: e.center?.provinceTitle ?? null,
    city: e.center?.cityTitle ?? null,
    userTariff: e.userTariff,
    acceptorFee: e.acceptorFee,
    isEms: e.isEms,
  };
}

async function reportEvents(ctx: Ctx) {
  if (ctx.mode === "summary") return summarizeEvents(ctx);

  const where: any = {};
  if (ctx.filters?.status) where.status = ctx.filters?.status;
  if (ctx.filters?.doneOnly === "1") where.endDate = { not: null };
  if (ctx.filters?.doneOnly === "0") where.endDate = null;
  if (ctx.serviceId != null) where.serviceId = ctx.serviceId;
  if (ctx.centerId != null) where.centerId = ctx.centerId;
  if (ctx.fromDate || ctx.toDate) {
    where.startDate = {};
    if (ctx.fromDate) where.startDate.gte = ctx.fromDate;
    if (ctx.toDate) where.startDate.lte = ctx.toDate;
  }
  if (ctx.q) {
    const asNum = num2(ctx.q);
    where.OR = [
      { topic: { contains: ctx.q } },
      { user: { OR: [{ name: { contains: ctx.q } }, { family: { contains: ctx.q } }, { username: { contains: ctx.q } }] } },
      { acceptor: { OR: [{ name: { contains: ctx.q } }, { family: { contains: ctx.q } }] } },
      ...(asNum !== null ? [{ trackingCode: asNum }, { id: asNum }] : []),
    ];
  }
  // دامنهٔ داده — مدیر همه / استان / کلینیک / مشاور فقط جلسات خودش
  where.AND = [eventScopeWhere(ctx.acc)];

  const sortMap: Record<string, any> = {
    id: { id: ctx.sortDir },
    trackingCode: { trackingCode: ctx.sortDir },
    startDate: { startDate: ctx.sortDir },
    endDate: { endDate: ctx.sortDir },
    status: { status: ctx.sortDir },
    userTariff: { userTariff: ctx.sortDir },
    acceptorFee: { acceptorFee: ctx.sortDir },
    userName: { user: { family: ctx.sortDir } },
    adviser: { acceptor: { family: ctx.sortDir } },
  };
  const orderBy = sortMap[ctx.body.sort?.key ?? "startDate"] ?? sortMap.startDate;

  return detailResponse(
    ctx,
    EVENT_COLUMNS,
    async () => (await db.event.findMany({ where, select: eventSelect, orderBy, take: SUMMARY_CAP })).map(mapEvent),
    async () => {
      const [total, rows] = await Promise.all([
        db.event.count({ where }),
        db.event.findMany({ where, select: eventSelect, orderBy, skip: (ctx.page - 1) * ctx.pageSize, take: ctx.pageSize }),
      ]);
      return { rows: rows.map(mapEvent), total };
    },
    "report-events",
    "startDate",
  );
}

async function summarizeEvents(ctx: Ctx) {
  const { where, args } = eventWhere(ctx.q, ctx.serviceId ?? null, ctx.centerId ?? null, ctx.fromDate, ctx.toDate);
  const extra: string[] = [];
  const extraArgs: unknown[] = [];
  if (ctx.filters?.status) { extra.push("e.`status` = ?"); extraArgs.push(ctx.filters?.status); }
  if (ctx.filters?.doneOnly === "1") extra.push("e.`endDate` IS NOT NULL");
  if (ctx.filters?.doneOnly === "0") extra.push("e.`endDate` IS NULL");
  pushScope(extra, extraArgs, eventScopeSql(ctx.acc, "e")); // دامنهٔ داده
  const joins = " LEFT JOIN `Services` s ON e.`serviceId` = s.`id` LEFT JOIN `Centers` c ON e.`centerId` = c.`id` LEFT JOIN `Users` u ON e.`acceptorId` = u.`id`";
  return summarizeSql(
    ctx,
    { from: "`Events` e", joins, where: where + (extra.length ? " AND " + extra.join(" AND ") : ""), args: [...args, ...extraArgs] },
    { ...EVENT_GROUPS },
    EVENT_METRICS,
  );
}

// ============================================================ مالی
const FINANCE_COLUMNS: Record<string, ColDef> = {
  id: { label: "شناسه" },
  startDate: { label: "تاریخ جلسه", type: "date" },
  status: { label: "وضعیت" },
  userName: { label: "مراجع" },
  service: { label: "خدمت" },
  center: { label: "مرکز" },
  userTariff: { label: "تعرفه مراجع (ریال)", type: "money" },
  acceptorFee: { label: "حق مشاور (ریال)", type: "money" },
  centerFee: { label: "سهم مرکز (ریال)", type: "money" },
  adminFee: { label: "سهم سامانه (ریال)", type: "money" },
  supervisorFee: { label: "حق نظارت (ریال)", type: "money" },
};

const FINANCE_GROUPS = {
  status: { label: "وضعیت", sql: "e.`status`" },
  service: { label: "خدمت", sql: "s.`name`" },
  center: { label: "مرکز", sql: "c.`title`" },
  month: { label: "ماه شمسی", dateCol: "e.`startDate`" },
};

const FINANCE_METRICS: Record<string, ColDef> = {
  count: { label: "تعداد جلسات" },
  "sum:userTariff": { label: "جمع تعرفه (ریال)" },
  "sum:acceptorFee": { label: "جمع حق مشاور (ریال)" },
  "sum:centerFee": { label: "جمع سهم مرکز (ریال)" },
  "sum:adminFee": { label: "جمع سهم سامانه (ریال)" },
};

async function reportFinance(ctx: Ctx) {
  const where: any = {};
  if (ctx.serviceId != null) where.serviceId = ctx.serviceId;
  if (ctx.centerId != null) where.centerId = ctx.centerId;
  if (ctx.fromDate || ctx.toDate) {
    where.startDate = {};
    if (ctx.fromDate) where.startDate.gte = ctx.fromDate;
    if (ctx.toDate) where.startDate.lte = ctx.toDate;
  }
  if (ctx.q) where.OR = [{ user: { OR: [{ name: { contains: ctx.q } }, { family: { contains: ctx.q } }] } }];
  where.AND = [eventScopeWhere(ctx.acc)]; // دامنهٔ داده

  const select = {
    id: true, startDate: true, status: true, userTariff: true, acceptorFee: true,
    centerFee: true, adminFee: true, supervisorFee: true,
    user: { select: { name: true, family: true } },
    service: { select: { short: true, name: true } },
    center: { select: { title: true } },
  } as const;

  const mapF = (e: any) => ({
    id: e.id, startDate: e.startDate, status: e.status,
    userName: e.user ? `${e.user.name ?? ""} ${e.user.family ?? ""}`.trim() : null,
    service: e.service ? e.service.short || e.service.name : null,
    center: e.center?.title ?? null,
    userTariff: e.userTariff, acceptorFee: e.acceptorFee, centerFee: e.centerFee,
    adminFee: e.adminFee, supervisorFee: e.supervisorFee,
  });

  if (ctx.mode === "summary") {
    const { where: wsql, args } = eventWhere(ctx.q, ctx.serviceId ?? null, ctx.centerId ?? null, ctx.fromDate, ctx.toDate);
    const scArgs: unknown[] = [];
    const scParts: string[] = [];
    pushScope(scParts, scArgs, eventScopeSql(ctx.acc, "e")); // دامنهٔ داده
    const joins = " LEFT JOIN `Services` s ON e.`serviceId` = s.`id` LEFT JOIN `Centers` c ON e.`centerId` = c.`id`";
    return summarizeSql(ctx, { from: "`Events` e", joins, where: wsql + (scParts.length ? " AND " + scParts.join(" AND ") : ""), args: [...args, ...scArgs] }, FINANCE_GROUPS, FINANCE_METRICS);
  }

  const res = await detailResponse(
    ctx, FINANCE_COLUMNS,
    async () => (await db.event.findMany({ where, select, orderBy: { startDate: "desc" }, take: SUMMARY_CAP })).map(mapF),
    async () => {
      const [total, rows] = await Promise.all([
        db.event.count({ where }),
        db.event.findMany({ where, select, orderBy: { startDate: "desc" }, skip: (ctx.page - 1) * ctx.pageSize, take: ctx.pageSize }),
      ]);
      return { rows: rows.map(mapF), total };
    },
    "report-finance",
    "startDate",
  );
  return res;
}

// ============================================================ کاربران
const USER_COLUMNS: Record<string, ColDef> = {
  id: { label: "شناسه" },
  nid: { label: "کد ملی" },
  username: { label: "نام کاربری" },
  name: { label: "نام" },
  family: { label: "نام خانوادگی" },
  mobile: { label: "موبایل" },
  gender: { label: "جنسیت" },
  signupDate: { label: "تاریخ عضویت", type: "date" },
  blocked: { label: "مسدود", type: "bool" },
  confirm: { label: "تایید شده", type: "bool" },
};

const USER_GROUPS = {
  gender: { label: "جنسیت", sql: "u.`gender`" },
  blocked: { label: "وضعیت مسدودی", sql: "u.`blocked`" },
  month: { label: "ماه عضویت", dateCol: "u.`signupDate`" },
};

const USER_METRICS: Record<string, ColDef> = { count: { label: "تعداد کاربران" } };

async function reportUsers(ctx: Ctx) {
  const where: any = {};
  if (ctx.filters?.blocked === "true") where.blocked = true;
  if (ctx.filters?.blocked === "false") where.blocked = false;
  if (ctx.fromDate || ctx.toDate) {
    where.signupDate = {};
    if (ctx.fromDate) where.signupDate.gte = ctx.fromDate;
    if (ctx.toDate) where.signupDate.lte = ctx.toDate;
  }
  if (ctx.q) {
    const asNum = num2(ctx.q);
    where.OR = [
      { name: { contains: ctx.q } },
      { family: { contains: ctx.q } },
      { username: { contains: ctx.q } },
      ...(asNum !== null ? [{ nid: asNum }, { mobile: asNum }] : []),
    ];
  }
  // دامنهٔ داده — چه کاربرانی دیده شود (نسخهٔ ۶.۱۰)
  where.AND = [clientScopeWhere(ctx.acc)];

  if (ctx.mode === "summary") {
    const parts: string[] = ["1=1"];
    const args: unknown[] = [];
    if (ctx.filters?.blocked === "true") parts.push("u.`blocked` = 1");
    if (ctx.filters?.blocked === "false") parts.push("u.`blocked` = 0");
    if (ctx.fromDate) { parts.push("u.`signupDate` >= ?"); args.push(ctx.fromDate); }
    if (ctx.toDate) { parts.push("u.`signupDate` <= ?"); args.push(ctx.toDate); }
    if (ctx.q) { parts.push("(u.`name` LIKE ? OR u.`family` LIKE ? OR u.`username` LIKE ?)"); args.push(`%${ctx.q}%`, `%${ctx.q}%`, `%${ctx.q}%`); }
    pushScope(parts, args, clientScopeSql(ctx.acc, "u")); // دامنهٔ داده
    return summarizeSql(ctx, { from: "`Users` u", where: `WHERE ${parts.join(" AND ")}`, args }, USER_GROUPS, USER_METRICS);
  }

  const res = await detailResponse(
    ctx, USER_COLUMNS,
    async () => (await db.user.findMany({ where, orderBy: { id: ctx.sortDir }, take: SUMMARY_CAP })).map((u: any) => ({
      ...u, nid: u.nid != null ? String(u.nid) : null, mobile: u.mobile != null ? String(u.mobile) : null,
    })),
    async () => {
      const [total, rows] = await Promise.all([
        db.user.count({ where }),
        db.user.findMany({ where, orderBy: { id: ctx.sortDir }, skip: (ctx.page - 1) * ctx.pageSize, take: ctx.pageSize }),
      ]);
      return { rows: rows.map((u: any) => ({ ...u, nid: u.nid != null ? String(u.nid) : null, mobile: u.mobile != null ? String(u.mobile) : null })), total };
    },
    "report-users",
    "id",
  );
  return res;
}

// ============================================================ رزروها
const RESERVE_COLUMNS: Record<string, ColDef> = {
  id: { label: "شناسه" },
  date: { label: "تاریخ رزرو", type: "date" },
  eventTrackingCode: { label: "کد رهگیری جلسه" },
  eventStatus: { label: "وضعیت جلسه" },
  userName: { label: "مراجع" },
};

const RESERVE_GROUPS = {
  eventStatus: { label: "وضعیت جلسه", sql: "e.`status`" },
  month: { label: "ماه شمسی", dateCol: "r.`date`" },
};

const RESERVE_METRICS: Record<string, ColDef> = { count: { label: "تعداد رزروها" } };

async function reportReserves(ctx: Ctx) {
  const where: any = {};
  if (ctx.fromDate || ctx.toDate) {
    where.date = {};
    if (ctx.fromDate) where.date.gte = ctx.fromDate;
    if (ctx.toDate) where.date.lte = ctx.toDate;
  }
  if (ctx.q) where.event = { user: { OR: [{ name: { contains: ctx.q } }, { family: { contains: ctx.q } }] } };
  // دامنهٔ داده — رزروهای جلسات در محدودهٔ مجاز
  where.AND = [{ event: eventScopeWhere(ctx.acc) }];

  const select = {
    id: true, date: true,
    event: { select: { trackingCode: true, status: true, user: { select: { name: true, family: true } } } },
  } as const;

  const mapR = (r: any) => ({
    id: r.id, date: r.date,
    eventTrackingCode: r.event?.trackingCode ?? null,
    eventStatus: r.event?.status ?? null,
    userName: r.event?.user ? `${r.event.user.name ?? ""} ${r.event.user.family ?? ""}`.trim() : null,
  });

  if (ctx.mode === "summary") {
    const parts: string[] = ["1=1"];
    const args: unknown[] = [];
    if (ctx.fromDate) { parts.push("r.`date` >= ?"); args.push(ctx.fromDate); }
    if (ctx.toDate) { parts.push("r.`date` <= ?"); args.push(ctx.toDate); }
    if (ctx.q) { parts.push("(ru.`name` LIKE ? OR ru.`family` LIKE ?)"); args.push(`%${ctx.q}%`, `%${ctx.q}%`); }
    pushScope(parts, args, eventScopeSql(ctx.acc, "e")); // دامنهٔ داده
    return summarizeSql(
      ctx,
      { from: "`EventReserves` r", joins: " LEFT JOIN `Events` e ON r.`eventId` = e.`id` LEFT JOIN `Users` ru ON e.`userId` = ru.`id`", where: `WHERE ${parts.join(" AND ")}`, args },
      RESERVE_GROUPS, RESERVE_METRICS,
    );
  }

  return detailResponse(
    ctx, RESERVE_COLUMNS,
    async () => (await db.eventReserve.findMany({ where, select, orderBy: { date: ctx.sortDir }, take: SUMMARY_CAP })).map(mapR),
    async () => {
      const [total, rows] = await Promise.all([
        db.eventReserve.count({ where }),
        db.eventReserve.findMany({ where, select, orderBy: { date: ctx.sortDir }, skip: (ctx.page - 1) * ctx.pageSize, take: ctx.pageSize }),
      ]);
      return { rows: rows.map(mapR), total };
    },
    "report-reserves",
    "date",
  );
}

// ============================================================ ارجاعات
const REFERRAL_COLUMNS: Record<string, ColDef> = {
  id: { label: "شناسه" },
  refId: { label: "کد ارجاع" },
  creationDate: { label: "تاریخ ارجاع", type: "date" },
  userName: { label: "نام مراجع" },
  userNid: { label: "کد ملی" },
  userMobile: { label: "موبایل" },
  service: { label: "خدمت" },
  sessionsCount: { label: "تعداد جلسات", type: "num" },
  status: { label: "وضعیت" },
  description: { label: "توضیح" },
};

const REFERRAL_GROUPS = {
  status: { label: "وضعیت", sql: "r.`status`" },
  service: { label: "خدمت", sql: "s.`name`" },
  month: { label: "ماه شمسی", dateCol: "r.`creationDate`" },
};

const REFERRAL_METRICS: Record<string, ColDef> = {
  count: { label: "تعداد ارجاعات" },
  "sum:sessionsCount": { label: "جمع جلسات پیش‌بینی‌شده" },
};

async function reportReferrals(ctx: Ctx) {
  const where: any = {};
  if (ctx.filters?.status) where.status = ctx.filters?.status;
  if (ctx.fromDate || ctx.toDate) {
    where.creationDate = {};
    if (ctx.fromDate) where.creationDate.gte = ctx.fromDate;
    if (ctx.toDate) where.creationDate.lte = ctx.toDate;
  }
  if (ctx.q) {
    const asNum = num2(ctx.q);
    where.OR = [
      { userName: { contains: ctx.q } },
      { description: { contains: ctx.q } },
      ...(asNum !== null ? [{ refId: asNum }] : []),
    ];
  }
  // دامنهٔ داده — ارجاعات استان/مرکز/مشاور پذیرنده (نسخهٔ ۶.۱۰)
  {
    const s = ctx.acc.scope;
    if (!ctx.acc.seeAllData) {
      if (s.kind === "province" && s.provinces.length) where.provinceId = { in: s.provinces };
      else if (s.kind === "center" && s.centers.length) where.centerId = { in: s.centers };
      else where.acceptorId = ctx.acc.uid;
    }
  }

  const select = {
    id: true, refId: true, creationDate: true, userName: true, userNid: true,
    userMobile: true, sessionsCount: true, status: true, description: true,
    service: { select: { short: true, name: true } },
  } as const;

  const mapRef = (r: any) => ({ ...r, service: r.service ? r.service.short || r.service.name : null, userNid: r.userNid != null ? String(r.userNid) : null, userMobile: r.userMobile != null ? String(r.userMobile) : null, refId: r.refId != null ? String(r.refId) : null });

  if (ctx.mode === "summary") {
    const parts: string[] = ["1=1"];
    const args: unknown[] = [];
    if (ctx.filters?.status) { parts.push("r.`status` = ?"); args.push(ctx.filters?.status); }
    if (ctx.fromDate) { parts.push("r.`creationDate` >= ?"); args.push(ctx.fromDate); }
    if (ctx.toDate) { parts.push("r.`creationDate` <= ?"); args.push(ctx.toDate); }
    if (ctx.q) { parts.push("(r.`userName` LIKE ? OR r.`description` LIKE ?)"); args.push(`%${ctx.q}%`, `%${ctx.q}%`); }
    // دامنهٔ داده — ارجاعات
    {
      const s = ctx.acc.scope;
      if (!ctx.acc.seeAllData) {
        if (s.kind === "province" && s.provinces.length) { parts.push("r.`provinceId` IN (" + s.provinces.map(() => "?").join(",") + ")"); args.push(...s.provinces); }
        else if (s.kind === "center" && s.centers.length) { parts.push("r.`centerId` IN (" + s.centers.map(() => "?").join(",") + ")"); args.push(...s.centers); }
        else { parts.push("r.`acceptorId` = ?"); args.push(ctx.acc.uid); }
      }
    }
    return summarizeSql(
      ctx,
      { from: "`Referrs` r", joins: " LEFT JOIN `Services` s ON r.`serviceId` = s.`id`", where: `WHERE ${parts.join(" AND ")}`, args },
      REFERRAL_GROUPS, REFERRAL_METRICS,
    );
  }

  return detailResponse(
    ctx, REFERRAL_COLUMNS,
    async () => (await db.referr.findMany({ where, select, orderBy: { id: ctx.sortDir }, take: SUMMARY_CAP })).map(mapRef),
    async () => {
      const [total, rows] = await Promise.all([
        db.referr.count({ where }),
        db.referr.findMany({ where, select, orderBy: { id: ctx.sortDir }, skip: (ctx.page - 1) * ctx.pageSize, take: ctx.pageSize }),
      ]);
      return { rows: rows.map(mapRef), total };
    },
    "report-referrals",
    "id",
  );
}

// ============================================================ پیامک‌ها
const SMS_COLUMNS: Record<string, ColDef> = {
  id: { label: "شناسه" },
  createTime: { label: "تاریخ ارسال", type: "date" },
  number: { label: "شماره" },
  receiverName: { label: "گیرنده" },
  message: { label: "متن پیام" },
  efforts: { label: "تعداد تلاش", type: "num" },
  status: { label: "وضعیت" },
  response: { label: "پاسخ سامانه" },
};

const SMS_GROUPS = {
  status: { label: "وضعیت", sql: "s.`status`" },
  month: { label: "ماه شمسی", dateCol: "s.`createTime`" },
};

const SMS_METRICS: Record<string, ColDef> = { count: { label: "تعداد پیامک" } };

async function reportSms(ctx: Ctx) {
  const where: any = {};
  if (ctx.filters?.status) where.status = ctx.filters?.status;
  if (ctx.fromDate || ctx.toDate) {
    where.createTime = {};
    if (ctx.fromDate) where.createTime.gte = ctx.fromDate;
    if (ctx.toDate) where.createTime.lte = ctx.toDate;
  }
  if (ctx.q) {
    const asNum = num2(ctx.q);
    where.OR = [
      { message: { contains: ctx.q } },
      { receiver: { OR: [{ name: { contains: ctx.q } }, { family: { contains: ctx.q } }] } },
      ...(asNum !== null ? [{ number: asNum }] : []),
    ];
  }
  // دامنهٔ داده — مشاور فقط پیامک‌های خودش؛ مدیران استان/مرکز همه را می‌بینند
  if (!ctx.acc.seeAllData && ctx.acc.scope.kind === "self") {
    where.AND = [{ OR: [{ senderId: ctx.acc.uid }, { receiverId: ctx.acc.uid }] }];
  }

  const select = {
    id: true, createTime: true, number: true, message: true, efforts: true, status: true, response: true,
    receiver: { select: { name: true, family: true } },
  } as const;

  const mapS = (s: any) => ({ ...s, number: s.number != null ? String(s.number) : null, receiverName: s.receiver ? `${s.receiver.name ?? ""} ${s.receiver.family ?? ""}`.trim() : null });

  if (ctx.mode === "summary") {
    const parts: string[] = ["1=1"];
    const args: unknown[] = [];
    if (ctx.filters?.status) { parts.push("s.`status` = ?"); args.push(ctx.filters?.status); }
    if (ctx.fromDate) { parts.push("s.`createTime` >= ?"); args.push(ctx.fromDate); }
    if (ctx.toDate) { parts.push("s.`createTime` <= ?"); args.push(ctx.toDate); }
    if (ctx.q) { parts.push("s.`message` LIKE ?"); args.push(`%${ctx.q}%`); }
    if (!ctx.acc.seeAllData && ctx.acc.scope.kind === "self") { parts.push("(s.`senderId` = ? OR s.`receiverId` = ?)"); args.push(ctx.acc.uid, ctx.acc.uid); }
    return summarizeSql(ctx, { from: "`SMS` s", where: `WHERE ${parts.join(" AND ")}`, args }, SMS_GROUPS, SMS_METRICS);
  }

  return detailResponse(
    ctx, SMS_COLUMNS,
    async () => (await db.sms.findMany({ where, select, orderBy: { id: ctx.sortDir }, take: SUMMARY_CAP })).map(mapS),
    async () => {
      const [total, rows] = await Promise.all([
        db.sms.count({ where }),
        db.sms.findMany({ where, select, orderBy: { id: ctx.sortDir }, skip: (ctx.page - 1) * ctx.pageSize, take: ctx.pageSize }),
      ]);
      return { rows: rows.map(mapS), total };
    },
    "report-sms",
    "id",
  );
}

// ============================================================ موارد حاد (EMS)
const EMS_COLUMNS: Record<string, ColDef> = {
  id: { label: "شناسه" },
  date: { label: "تاریخ ثبت", type: "date" },
  userName: { label: "مراجع" },
  userNid: { label: "کد ملی" },
  province: { label: "استان" },
  city: { label: "شهر" },
  adviser: { label: "مشاور" },
  adviserMobile: { label: "موبایل مشاور" },
  emsType: { label: "نوع مورد حاد" },
  suicidalFrom: { label: "عوامل خودکشی" },
  severity: { label: "شدت خطر" },
  payStatus: { label: "وضعیت پرداخت" },
  amount: { label: "مبلغ (ریال)", type: "money" },
  eventStatus: { label: "وضعیت جلسه" },
};

const EMS_GROUPS = {
  severity: { label: "شدت خطر", sql: "ee.`severity`" },
  payStatus: { label: "وضعیت پرداخت", sql: "ee.`hadPaymentStatus`" },
  month: { label: "ماه شمسی", dateCol: "ee.`dateTime`" },
};

const EMS_METRICS: Record<string, ColDef> = {
  count: { label: "تعداد موارد" },
  "sum:hadPaymentAmount": { label: "جمع مبلغ پرداخت (ریال)" },
};

async function reportEms(ctx: Ctx) {
  const where: any = {};
  if (ctx.filters?.severity) where.severity = ctx.filters?.severity;
  if (ctx.fromDate || ctx.toDate) {
    where.dateTime = {};
    if (ctx.fromDate) where.dateTime.gte = ctx.fromDate;
    if (ctx.toDate) where.dateTime.lte = ctx.toDate;
  }
  if (ctx.q) {
    const asNum = num2(ctx.q);
    where.OR = [
      { actionsTaken: { contains: ctx.q } },
      { event: { user: { OR: [{ name: { contains: ctx.q } }, { family: { contains: ctx.q } }] } } },
      ...(asNum !== null ? [{ event: { nid: asNum } }] : []),
    ];
  }
  // دامنهٔ داده — موارد حادِ جلسات در محدودهٔ مجاز
  where.AND = [{ event: eventScopeWhere(ctx.acc) }];

  const select = {
    id: true, dateTime: true, emsType: true, suicidalFrom: true, severity: true,
    hadPaymentStatus: true, hadPaymentAmount: true,
    event: {
      select: {
        status: true,
        user: { select: { name: true, family: true, nid: true } },
        acceptor: { select: { name: true, family: true, mobile: true } },
        center: { select: { provinceTitle: true, cityTitle: true } },
      },
    },
  } as const;

  const mapE = (ee: any) => ({
    id: ee.id,
    date: ee.dateTime,
    userName: ee.event?.user ? `${ee.event.user.name ?? ""} ${ee.event.user.family ?? ""}`.trim() : null,
    userNid: ee.event?.user?.nid != null ? String(ee.event.user.nid) : null,
    province: ee.event?.center?.provinceTitle ?? null,
    city: ee.event?.center?.cityTitle ?? null,
    adviser: ee.event?.acceptor ? `${ee.event.acceptor.name ?? ""} ${ee.event.acceptor.family ?? ""}`.trim() : null,
    adviserMobile: ee.event?.acceptor?.mobile != null ? String(ee.event.acceptor.mobile) : null,
    emsType: ee.emsType,
    suicidalFrom: ee.suicidalFrom,
    severity: ee.severity,
    payStatus: ee.hadPaymentStatus,
    amount: ee.hadPaymentAmount != null ? Number(ee.hadPaymentAmount) : 0,
    eventStatus: ee.event?.status ?? null,
  });

  if (ctx.mode === "summary") {
    const parts: string[] = ["1=1"];
    const args: unknown[] = [];
    if (ctx.filters?.severity) { parts.push("ee.`severity` = ?"); args.push(ctx.filters?.severity); }
    if (ctx.fromDate) { parts.push("ee.`dateTime` >= ?"); args.push(ctx.fromDate); }
    if (ctx.toDate) { parts.push("ee.`dateTime` <= ?"); args.push(ctx.toDate); }
    if (ctx.q) { parts.push("(eu.`name` LIKE ? OR eu.`family` LIKE ?)"); args.push(`%${ctx.q}%`, `%${ctx.q}%`); }
    pushScope(parts, args, eventScopeSql(ctx.acc, "e")); // دامنهٔ داده
    return summarizeSql(
      ctx,
      { from: "`EventsEms` ee", joins: " LEFT JOIN `Events` e ON ee.`eventId` = e.`id` LEFT JOIN `Users` eu ON e.`userId` = eu.`id`", where: `WHERE ${parts.join(" AND ")}`, args },
      EMS_GROUPS, EMS_METRICS,
    );
  }

  return detailResponse(
    ctx, EMS_COLUMNS,
    async () => (await db.eventsEms.findMany({ where, select, orderBy: { dateTime: "desc" }, take: SUMMARY_CAP })).map(mapE),
    async () => {
      const [total, rows] = await Promise.all([
        db.eventsEms.count({ where }),
        db.eventsEms.findMany({ where, select, orderBy: { dateTime: "desc" }, skip: (ctx.page - 1) * ctx.pageSize, take: ctx.pageSize }),
      ]);
      return { rows: rows.map(mapE), total };
    },
    "report-ems",
    "dateTime",
  );
}

// ============================================================ جلسات گروهی
const GROUP_COLUMNS: Record<string, ColDef> = {
  id: { label: "شناسه" },
  sessionNumber: { label: "شمارهٔ جلسه", type: "num" },
  topic: { label: "موضوع" },
  groupTitle: { label: "گروه" },
  membersCount: { label: "تعداد حاضران", type: "num" },
  center: { label: "مرکز" },
  adviser: { label: "مشاور" },
  startDate: { label: "تاریخ جلسه", type: "date" },
  endDate: { label: "تاریخ پایان", type: "date" },
  status: { label: "وضعیت" },
  userTariff: { label: "تعرفه (ریال)", type: "money" },
  acceptorFee: { label: "حق مشاور (ریال)", type: "money" },
};

const GROUP_GROUPS = {
  status: { label: "وضعیت", sql: "g.`status`" },
  center: { label: "مرکز", sql: "c.`title`" },
  adviser: { label: "مشاور", sql: "u.`name`" },
  month: { label: "ماه شمسی", dateCol: "g.`startDate`" },
};

const GROUP_METRICS: Record<string, ColDef> = {
  count: { label: "تعداد جلسات" },
  "sum:userTariff": { label: "جمع تعرفه (ریال)" },
  "sum:acceptorFee": { label: "جمع حق مشاور (ریال)" },
};

async function reportGroupEvents(ctx: Ctx) {
  const where: any = {};
  if (ctx.filters?.status) where.status = ctx.filters?.status;
  if (ctx.filters?.doneOnly === "1") where.endDate = { not: null };
  if (ctx.filters?.doneOnly === "0") where.endDate = null;
  if (ctx.serviceId != null) where.serviceId = ctx.serviceId;
  if (ctx.centerId != null) where.centerId = ctx.centerId;
  if (ctx.fromDate || ctx.toDate) {
    where.startDate = {};
    if (ctx.fromDate) where.startDate.gte = ctx.fromDate;
    if (ctx.toDate) where.startDate.lte = ctx.toDate;
  }
  if (ctx.q) {
    where.OR = [
      { topic: { contains: ctx.q } },
      { group: { title: { contains: ctx.q } } },
    ];
  }
  // دامنهٔ داده — جلسات گروهی استان/مرکز/مشاور پذیرنده (نسخهٔ ۶.۱۰)
  if (!ctx.acc.seeAllData) {
    const s = ctx.acc.scope;
    if (s.kind === "province" && s.provinces.length) {
      const cs = await db.center.findMany({ where: { provinceId: { in: s.provinces } }, select: { id: true } });
      where.AND = [{ centerId: { in: cs.map((c) => Number(c.id)) } }];
    } else if (s.kind === "center" && s.centers.length) {
      where.AND = [{ centerId: { in: s.centers } }];
    } else {
      where.AND = [{ OR: [{ acceptorId: ctx.acc.uid }, { supervisorId: ctx.acc.uid }] }];
    }
  }

  const select = {
    id: true, sessionNumber: true, topic: true, startDate: true, endDate: true, status: true,
    userTariff: true, acceptorFee: true, acceptorId: true, centerId: true, groupId: true,
    members: { select: { id: true } },
  } as const;

  const mapG = (g: any, adviserName: string | null, centerTitle: string | null, groupTitle: string | null) => ({
    id: g.id, sessionNumber: g.sessionNumber, topic: g.topic,
    groupTitle,
    membersCount: g.members?.length ?? 0,
    center: centerTitle,
    adviser: adviserName,
    startDate: g.startDate, endDate: g.endDate, status: g.status,
    userTariff: g.userTariff, acceptorFee: g.acceptorFee,
  });

  const nameMaps = async (rows: any[]) => {
    const aids = [...new Set(rows.map((g: any) => g.acceptorId).filter((x: number | null) => x != null && x > 0))];
    const cids = [...new Set(rows.map((g: any) => g.centerId).filter((x: number | null) => x != null && x > 0))];
    const gids = [...new Set(rows.map((g: any) => g.groupId).filter((x: number | null) => x != null && x > 0))];
    const [us, cs, gs] = await Promise.all([
      aids.length ? db.user.findMany({ where: { id: { in: aids } }, select: { id: true, name: true, family: true } }) : [],
      cids.length ? db.center.findMany({ where: { id: { in: cids } }, select: { id: true, title: true } }) : [],
      gids.length ? db.group.findMany({ where: { id: { in: gids } }, select: { id: true, title: true } }) : [],
    ]);
    return {
      a: new Map(us.map((u: any) => [u.id, `${u.name ?? ""} ${u.family ?? ""}`.trim()])),
      c: new Map(cs.map((x: any) => [x.id, x.title])),
      g: new Map(gs.map((x: any) => [x.id, x.title])),
    };
  };

  if (ctx.mode === "summary") {
    const parts: string[] = ["1=1"];
    const args: unknown[] = [];
    if (ctx.filters?.status) { parts.push("g.`status` = ?"); args.push(ctx.filters?.status); }
    if (ctx.serviceId != null) { parts.push("g.`serviceId` = ?"); args.push(ctx.serviceId); }
    if (ctx.centerId != null) { parts.push("g.`centerId` = ?"); args.push(ctx.centerId); }
    if (ctx.fromDate) { parts.push("g.`startDate` >= ?"); args.push(ctx.fromDate); }
    if (ctx.toDate) { parts.push("g.`startDate` <= ?"); args.push(ctx.toDate); }
    if (ctx.q) { parts.push("g.`topic` LIKE ?"); args.push(`%${ctx.q}%`); }
    const doneF = ctx.filters?.doneOnly === "1" ? " AND g.`endDate` IS NOT NULL" : ctx.filters?.doneOnly === "0" ? " AND g.`endDate` IS NULL" : "";
    // دامنهٔ داده
    let scopeSql = "";
    const scArgs: unknown[] = [];
    if (!ctx.acc.seeAllData) {
      const s = ctx.acc.scope;
      if (s.kind === "province" && s.provinces.length) {
        scopeSql = " AND g.`centerId` IN (SELECT c2.`id` FROM `Centers` c2 WHERE c2.`provinceId` IN (" + s.provinces.map(() => "?").join(",") + "))";
        scArgs.push(...s.provinces);
      } else if (s.kind === "center" && s.centers.length) {
        scopeSql = " AND g.`centerId` IN (" + s.centers.map(() => "?").join(",") + ")";
        scArgs.push(...s.centers);
      } else {
        scopeSql = " AND (g.`acceptorId` = ? OR g.`supervisorId` = ?)";
        scArgs.push(ctx.acc.uid, ctx.acc.uid);
      }
    }
    return summarizeSql(
      ctx,
      { from: "`GroupEvents` g", joins: " LEFT JOIN `Centers` c ON g.`centerId` = c.`id` LEFT JOIN `Users` u ON g.`acceptorId` = u.`id`", where: `WHERE ${parts.join(" AND ")}` + doneF + scopeSql, args: [...args, ...scArgs] },
      GROUP_GROUPS, GROUP_METRICS,
    );
  }

  return detailResponse(
    ctx, GROUP_COLUMNS,
    async () => {
      const rows = await db.groupEvent.findMany({ where, select, orderBy: { startDate: "desc" }, take: SUMMARY_CAP });
      const maps = await nameMaps(rows);
      const g = (row: any) => mapG(row, row.acceptorId ? maps.a.get(row.acceptorId) ?? null : null, row.centerId ? maps.c.get(row.centerId) ?? null : null, maps.g.get(row.groupId) ?? null);
      return rows.map(g);
    },
    async () => {
      const [total, rows] = await Promise.all([
        db.groupEvent.count({ where }),
        db.groupEvent.findMany({ where, select, orderBy: { startDate: "desc" }, skip: (ctx.page - 1) * ctx.pageSize, take: ctx.pageSize }),
      ]);
      const maps = await nameMaps(rows);
      const g = (row: any) => mapG(row, row.acceptorId ? maps.a.get(row.acceptorId) ?? null : null, row.centerId ? maps.c.get(row.centerId) ?? null : null, maps.g.get(row.groupId) ?? null);
      return { rows: rows.map(g), total };
    },
    "report-group-events",
    "startDate",
  );
}

// ============================================================ لاگ فعالیت
const LOG_COLUMNS: Record<string, ColDef> = {
  id: { label: "شناسه" },
  timestamp: { label: "زمان", type: "date" },
  userName: { label: "کاربر" },
  category: { label: "دسته" },
  description: { label: "شرح" },
  level: { label: "سطح", type: "num" },
  ip: { label: "IP" },
};

const LOG_GROUPS = {
  category: { label: "دستهٔ رویداد", sql: "l.`category`" },
  level: { label: "سطح", sql: "l.`level`" },
  month: { label: "ماه شمسی", dateCol: "l.`timestamp`" },
};

const LOG_METRICS: Record<string, ColDef> = { count: { label: "تعداد رویدادها" } };

async function reportLogs(ctx: Ctx) {
  const where: any = {};
  if (ctx.fromDate || ctx.toDate) {
    where.timestamp = {};
    if (ctx.fromDate) where.timestamp.gte = ctx.fromDate;
    if (ctx.toDate) where.timestamp.lte = ctx.toDate;
  }
  if (ctx.q) where.OR = [{ description: { contains: ctx.q } }, { category: { contains: ctx.q } }, { user: { OR: [{ name: { contains: ctx.q } }, { family: { contains: ctx.q } }] } }];
  // دامنهٔ داده — مشاور فقط لاگ فعالیت خودش؛ مدیران همه را می‌بینند
  if (!ctx.acc.seeAllData && ctx.acc.scope.kind === "self") where.userId = ctx.acc.uid;

  const select = {
    id: true, timestamp: true, category: true, description: true, level: true, ip: true,
    user: { select: { name: true, family: true } },
  } as const;

  const mapL = (l: any) => ({ ...l, userName: l.user ? `${l.user.name ?? ""} ${l.user.family ?? ""}`.trim() : null });

  if (ctx.mode === "summary") {
    const parts: string[] = ["1=1"];
    const args: unknown[] = [];
    if (ctx.fromDate) { parts.push("l.`timestamp` >= ?"); args.push(ctx.fromDate); }
    if (ctx.toDate) { parts.push("l.`timestamp` <= ?"); args.push(ctx.toDate); }
    if (ctx.q) { parts.push("l.`description` LIKE ?"); args.push(`%${ctx.q}%`); }
    if (!ctx.acc.seeAllData && ctx.acc.scope.kind === "self") { parts.push("l.`userId` = ?"); args.push(ctx.acc.uid); }
    return summarizeSql(ctx, { from: "`Log` l", where: `WHERE ${parts.join(" AND ")}`, args }, LOG_GROUPS, LOG_METRICS);
  }

  return detailResponse(
    ctx, LOG_COLUMNS,
    async () => (await db.log.findMany({ where, select, orderBy: { timestamp: "desc" }, take: SUMMARY_CAP })).map(mapL),
    async () => {
      const [total, rows] = await Promise.all([
        db.log.count({ where }),
        db.log.findMany({ where, select, orderBy: { timestamp: "desc" }, skip: (ctx.page - 1) * ctx.pageSize, take: ctx.pageSize }),
      ]);
      return { rows: rows.map(mapL), total };
    },
    "report-logs",
    "timestamp",
  );
}

// ============================================================ مالیات مشاوران
const TAX_COLUMNS: Record<string, ColDef> = {
  id: { label: "شناسه" },
  userName: { label: "مشاور" },
  nid: { label: "کد ملی" },
  year: { label: "سال", type: "num" },
  month: { label: "ماه", type: "num" },
  taxAmount: { label: "مالیات (ریال)", type: "money" },
  totalPayment: { label: "جمع پرداخت (ریال)", type: "money" },
  exemptionMonths: { label: "ماه‌های معافیت", type: "num" },
  createdAt: { label: "تاریخ ثبت", type: "date" },
};

const TAX_GROUPS = {
  year: { label: "سال", sql: "t.`year`" },
  month: { label: "ماه", sql: "t.`month`" },
  user: { label: "مشاور", sql: "u.`name`" },
};

const TAX_METRICS: Record<string, ColDef> = {
  count: { label: "تعداد رکورد" },
  "sum:taxAmount": { label: "جمع مالیات (ریال)" },
  "sum:totalPayment": { label: "جمع پرداخت (ریال)" },
};

async function reportTaxes(ctx: Ctx) {
  const where: any = {};
  if (ctx.fromDate || ctx.toDate) {
    where.createdAt = {};
    if (ctx.fromDate) where.createdAt.gte = ctx.fromDate;
    if (ctx.toDate) where.createdAt.lte = ctx.toDate;
  }
  if (ctx.q) {
    const asNum = num2(ctx.q);
    where.OR = [
      { user: { OR: [{ name: { contains: ctx.q } }, { family: { contains: ctx.q } }] } },
      ...(asNum !== null ? [{ nid: asNum }] : []),
    ];
  }
  // دامنهٔ داده — مشاور فقط مالیات خودش؛ مدیران استان/مرکز همهٔ مشاوران حوزهٔ خود
  if (!ctx.acc.seeAllData) {
    if (ctx.acc.scope.kind === "self") where.userId = ctx.acc.uid;
    else if (ctx.acc.scope.kind === "province" && ctx.acc.scope.provinces.length) {
      const us = await db.user.findMany({ where: { provinceId: { in: ctx.acc.scope.provinces } }, select: { id: true } });
      where.userId = { in: us.map((u) => Number(u.id)) };
    } else if (ctx.acc.scope.kind === "center" && ctx.acc.scope.centers.length) {
      const us = await db.user.findMany({ where: { eventsAsAcceptor: { some: { centerId: { in: ctx.acc.scope.centers } } } }, select: { id: true } });
      where.userId = { in: us.map((u) => Number(u.id)) };
    }
  }

  const select = {
    id: true, nid: true, year: true, month: true, taxAmount: true, totalPayment: true, exemptionMonths: true, createdAt: true,
    user: { select: { name: true, family: true } },
  } as const;

  const mapT = (t: any) => ({
    ...t,
    nid: t.nid != null ? String(t.nid) : null,
    userName: t.user ? `${t.user.name ?? ""} ${t.user.family ?? ""}`.trim() : null,
    taxAmount: Number(t.taxAmount ?? 0),
    totalPayment: Number(t.totalPayment ?? 0),
  });

  if (ctx.mode === "summary") {
    const parts: string[] = ["1=1"];
    const args: unknown[] = [];
    if (ctx.fromDate) { parts.push("t.`createdAt` >= ?"); args.push(ctx.fromDate); }
    if (ctx.toDate) { parts.push("t.`createdAt` <= ?"); args.push(ctx.toDate); }
    if (ctx.q) { parts.push("(u.`name` LIKE ? OR u.`family` LIKE ?)"); args.push(`%${ctx.q}%`, `%${ctx.q}%`); }
    // دامنهٔ داده — مالیات
    if (!ctx.acc.seeAllData) {
      if (ctx.acc.scope.kind === "self") { parts.push("t.`userId` = ?"); args.push(ctx.acc.uid); }
      else if (ctx.acc.scope.kind === "province" && ctx.acc.scope.provinces.length) {
        parts.push("t.`userId` IN (SELECT u2.`id` FROM `Users` u2 WHERE u2.`provinceId` IN (" + ctx.acc.scope.provinces.map(() => "?").join(",") + "))");
        args.push(...ctx.acc.scope.provinces);
      } else if (ctx.acc.scope.kind === "center" && ctx.acc.scope.centers.length) {
        parts.push("t.`userId` IN (SELECT e2.`acceptorId` FROM `Events` e2 WHERE e2.`centerId` IN (" + ctx.acc.scope.centers.map(() => "?").join(",") + "))");
        args.push(...ctx.acc.scope.centers);
      }
    }
    return summarizeSql(
      ctx,
      { from: "`ConsultantTax` t", joins: " LEFT JOIN `Users` u ON t.`userId` = u.`id`", where: `WHERE ${parts.join(" AND ")}`, args },
      TAX_GROUPS, TAX_METRICS,
    );
  }

  return detailResponse(
    ctx, TAX_COLUMNS,
    async () => (await db.consultantTax.findMany({ where, select, orderBy: [{ year: "desc" }, { month: "desc" }], take: SUMMARY_CAP })).map(mapT),
    async () => {
      const [total, rows] = await Promise.all([
        db.consultantTax.count({ where }),
        db.consultantTax.findMany({ where, select, orderBy: [{ year: "desc" }, { month: "desc" }], skip: (ctx.page - 1) * ctx.pageSize, take: ctx.pageSize }),
      ]);
      return { rows: rows.map(mapT), total };
    },
    "report-taxes",
    "createdAt",
  );
}

// ============================================================ سهمیه‌ها (بودجه)
const BUDGET_COLUMNS: Record<string, ColDef> = {
  id: { label: "شناسه" },
  title: { label: "عنوان" },
  kind: { label: "نوع" },
  amount: { label: "سقف", type: "money" },
  used: { label: "استفاده‌شده", type: "money" },
  reserved: { label: "رزرو", type: "money" },
  remained: { label: "مانده", type: "money" },
  assigned: { label: "اختصاص‌یافته", type: "money" },
  pct: { label: "درصد مصرف", type: "num" },
  startDate: { label: "شروع", type: "date" },
  endDate: { label: "پایان", type: "date" },
};

const BUDGET_GROUPS = {
  kind: { label: "نوع خدمت", sql: "b.`kind`" },
  month: { label: "ماه شروع", dateCol: "b.`startDate`" },
};

const BUDGET_METRICS: Record<string, ColDef> = {
  count: { label: "تعداد سهمیه" },
  "sum:amount": { label: "جمع سقف" },
  "sum:used": { label: "جمع مصرف" },
};

async function reportBudgets(ctx: Ctx) {
  const where: any = {};
  if (ctx.fromDate || ctx.toDate) {
    where.startDate = {};
    if (ctx.fromDate) where.startDate.gte = ctx.fromDate;
    if (ctx.toDate) where.startDate.lte = ctx.toDate;
  }
  if (ctx.q) where.OR = [{ title: { contains: ctx.q } }];
  // دامنهٔ داده — مدیر استان فقط سهمیه‌های استان خود؛ بقیه (مرکز/مشاور) بدون دادهٔ بودجه
  if (!ctx.acc.seeAllData) {
    const s = ctx.acc.scope;
    if (s.kind === "province" && s.provinces.length) where.provinces = { some: { provinceId: { in: s.provinces } } };
    else where.id = { in: [] }; // هیچ
  }

  if (ctx.mode === "summary") {
    const parts: string[] = ["1=1"];
    const args: unknown[] = [];
    if (ctx.fromDate) { parts.push("b.`startDate` >= ?"); args.push(ctx.fromDate); }
    if (ctx.toDate) { parts.push("b.`startDate` <= ?"); args.push(ctx.toDate); }
    if (ctx.q) { parts.push("b.`title` LIKE ?"); args.push(`%${ctx.q}%`); }
    let scopeSql = "";
    if (!ctx.acc.seeAllData) {
      const s = ctx.acc.scope;
      if (s.kind === "province" && s.provinces.length) {
        scopeSql = " AND b.`id` IN (SELECT bp.`budgetId` FROM `BudgetProvince` bp WHERE bp.`provinceId` IN (" + s.provinces.map(() => "?").join(",") + "))";
        args.push(...s.provinces);
      } else scopeSql = " AND 1=0";
    }
    return summarizeSql(ctx, { from: "`Budget` b", where: `WHERE ${parts.join(" AND ")}` + scopeSql, args }, BUDGET_GROUPS, BUDGET_METRICS);
  }

  const mapB = (b: any) => ({
    ...b,
    pct: b.amount > 0 ? Math.round((b.used * 1000) / b.amount) / 10 : 0,
  });

  return detailResponse(
    ctx, BUDGET_COLUMNS,
    async () => (await db.budget.findMany({ where, orderBy: { id: "asc" }, take: SUMMARY_CAP })).map(mapB),
    async () => {
      const [total, rows] = await Promise.all([
        db.budget.count({ where }),
        db.budget.findMany({ where, orderBy: { id: "asc" }, skip: (ctx.page - 1) * ctx.pageSize, take: ctx.pageSize }),
      ]);
      return { rows: rows.map(mapB), total };
    },
    "report-budgets",
    "id",
  );
}

// ============================================================ درخواست‌های رزرو
const RREQ_COLUMNS: Record<string, ColDef> = {
  id: { label: "شناسه" },
  creationDate: { label: "تاریخ درخواست", type: "date" },
  userName: { label: "درخواست‌دهنده" },
  description: { label: "توضیح" },
  province: { label: "استان" },
  center: { label: "مرکز" },
  status: { label: "وضعیت" },
};

const RREQ_GROUPS = {
  status: { label: "وضعیت", sql: "r.`status`" },
  province: { label: "استان", sql: "p.`title`" },
  month: { label: "ماه شمسی", dateCol: "r.`creationDate`" },
};

const RREQ_METRICS: Record<string, ColDef> = { count: { label: "تعداد درخواست‌ها" } };

async function reportReserveRequests(ctx: Ctx) {
  const where: any = {};
  if (ctx.filters?.status) where.status = ctx.filters?.status;
  if (ctx.fromDate || ctx.toDate) {
    where.creationDate = {};
    if (ctx.fromDate) where.creationDate.gte = ctx.fromDate;
    if (ctx.toDate) where.creationDate.lte = ctx.toDate;
  }
  if (ctx.q) where.OR = [{ userName: { contains: ctx.q } }, { description: { contains: ctx.q } }];
  // دامنهٔ داده — درخواست‌های رزرو استان/مرکز (نسخهٔ ۶.۱۰)
  if (!ctx.acc.seeAllData) {
    const s = ctx.acc.scope;
    if (s.kind === "province" && s.provinces.length) where.provinceId = { in: s.provinces };
    else if (s.kind === "center" && s.centers.length) where.centerId = { in: s.centers };
    else where.adminReferrerId = ctx.acc.uid;
  }

  const select = {
    id: true, creationDate: true, userName: true, description: true, status: true,
    provinceId: true, centerId: true,
  } as const;

  const nameMaps = async (rows: any[]) => {
    const pids = [...new Set(rows.map((r: any) => r.provinceId).filter(Boolean))];
    const cids = [...new Set(rows.map((r: any) => r.centerId).filter((x: number | null) => x != null))];
    const [ps, cs] = await Promise.all([
      pids.length ? db.province.findMany({ where: { id: { in: pids } }, select: { id: true, title: true } }) : [],
      cids.length ? db.center.findMany({ where: { id: { in: cids } }, select: { id: true, title: true } }) : [],
    ]);
    return {
      p: new Map(ps.map((x: any) => [x.id, x.title])),
      c: new Map(cs.map((x: any) => [x.id, x.title])),
    };
  };

  const mapR = (r: any, maps: { p: Map<number, string>; c: Map<number, string> }) => ({
    ...r,
    provinceId: undefined,
    centerId: undefined,
    province: r.provinceId ? maps.p.get(r.provinceId) ?? null : null,
    center: r.centerId ? maps.c.get(r.centerId) ?? null : null,
  });

  if (ctx.mode === "summary") {
    const parts: string[] = ["1=1"];
    const args: unknown[] = [];
    if (ctx.filters?.status) { parts.push("r.`status` = ?"); args.push(ctx.filters?.status); }
    if (ctx.fromDate) { parts.push("r.`creationDate` >= ?"); args.push(ctx.fromDate); }
    if (ctx.toDate) { parts.push("r.`creationDate` <= ?"); args.push(ctx.toDate); }
    if (ctx.q) { parts.push("(r.`userName` LIKE ? OR r.`description` LIKE ?)"); args.push(`%${ctx.q}%`, `%${ctx.q}%`); }
    // دامنهٔ داده — درخواست‌های رزرو
    if (!ctx.acc.seeAllData) {
      const s = ctx.acc.scope;
      if (s.kind === "province" && s.provinces.length) { parts.push("r.`provinceId` IN (" + s.provinces.map(() => "?").join(",") + ")"); args.push(...s.provinces); }
      else if (s.kind === "center" && s.centers.length) { parts.push("r.`centerId` IN (" + s.centers.map(() => "?").join(",") + ")"); args.push(...s.centers); }
      else { parts.push("r.`adminReferrerId` = ?"); args.push(ctx.acc.uid); }
    }
    return summarizeSql(
      ctx,
      { from: "`ReferrsRequest` r", joins: " LEFT JOIN `Province` p ON r.`provinceId` = p.`id` LEFT JOIN `Centers` c ON r.`centerId` = c.`id`", where: `WHERE ${parts.join(" AND ")}`, args },
      { ...RREQ_GROUPS, center: { label: "مرکز", sql: "c.`title`" } },
      RREQ_METRICS,
    );
  }

  return detailResponse(
    ctx, RREQ_COLUMNS,
    async () => {
      const rows = await db.referrRequest.findMany({ where, select, orderBy: { creationDate: "desc" }, take: SUMMARY_CAP });
      const maps = await nameMaps(rows);
      return rows.map((r) => mapR(r, maps));
    },
    async () => {
      const [total, rows] = await Promise.all([
        db.referrRequest.count({ where }),
        db.referrRequest.findMany({ where, select, orderBy: { creationDate: "desc" }, skip: (ctx.page - 1) * ctx.pageSize, take: ctx.pageSize }),
      ]);
      const maps = await nameMaps(rows);
      return { rows: rows.map((r) => mapR(r, maps)), total };
    },
    "report-reserve-requests",
    "creationDate",
  );
}
