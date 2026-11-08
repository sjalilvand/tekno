import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail } from "@/lib/server";
import { monthLabel } from "@/lib/jalali";

// =====================================================================
// گزارش‌ساز حرفه‌ای — موتور گزارش‌گیری عمومی
// همهٔ ستون‌ها/فیلترها/گروه‌بندی‌ها از وایت‌لیست می‌آیند (بدون SQL خام
// و بدون ورودی دلخواه کاربر در کوئری) — امن در برابر تزریق.
// دو حالت: «جزئیات» (صفحه‌بندی‌شده) و «خلاصه» (گروه‌بندی + تجمیع)
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
  };
  groupBy?: string;
  metric?: string;
  sort?: { key?: string; dir?: SortDir };
  page?: number;
  pageSize?: number;
};

const SUMMARY_CAP = 20000; // سقف ردیف برای حالت خلاصه
const MONTHLY_CAP = 50000;

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function dateFrom(v?: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
function dateTo(v?: string): Date | null {
  const d = dateFrom(v);
  if (!d) return null;
  d.setHours(23, 59, 59, 999);
  return d;
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);

  let body: ReportBody;
  try {
    body = await req.json();
  } catch {
    return fail("BAD_REQUEST");
  }

  const dataset = String(body.dataset ?? "events");
  const mode = body.mode === "summary" ? "summary" : "detail";
  const filters = body.filters ?? {};
  const sortDir: SortDir = body.sort?.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(body.page ?? 1));
  const pageSize = Math.min(100, Math.max(5, Number(body.pageSize ?? 20)));

  // فیلترهای مشترک قابل اعتبارسنجی
  const serviceId = num(filters.serviceId);
  const centerId = num(filters.centerId);
  const fromDate = dateFrom(filters.from);
  const toDate = dateTo(filters.to);
  const q = String(filters.q ?? "").trim();

  try {
    switch (dataset) {
      case "events":
        return await reportEvents({ mode, body, filters, q, serviceId, centerId, fromDate, toDate, sortDir, page, pageSize });
      case "finance":
        return await reportFinance({ mode, body, q, serviceId, centerId, fromDate, toDate, sortDir, page, pageSize });
      case "users":
        return await reportUsers({ mode, body, filters, q, fromDate, toDate, sortDir, page, pageSize });
      case "reserves":
        return await reportReserves({ mode, body, q, fromDate, toDate, sortDir, page, pageSize });
      case "referrals":
        return await reportReferrals({ mode, body, filters, q, fromDate, toDate, sortDir, page, pageSize });
      case "sms":
        return await reportSms({ mode, body, filters, q, fromDate, toDate, sortDir, page, pageSize });
      default:
        return fail("DATASET_UNKNOWN");
    }
  } catch (e: any) {
    console.error("[report] failed:", e?.message ?? e);
    return fail("خطا در تولید گزارش: " + String(e?.message ?? "نامشخص"), 500);
  }
}

// ------------------------------------------------------------ جلسات
type Ctx = {
  mode: "detail" | "summary";
  body: ReportBody;
  filters: any;
  q: string;
  serviceId: number | null;
  centerId: number | null;
  fromDate: Date | null;
  toDate: Date | null;
  sortDir: SortDir;
  page: number;
  pageSize: number;
};

const EVENT_COLUMNS: Record<string, { label: string }> = {
  id: { label: "شناسه" },
  trackingCode: { label: "کد رهگیری" },
  startDate: { label: "تاریخ جلسه", type: "date" },
  status: { label: "وضعیت" },
  topic: { label: "موضوع" },
  userName: { label: "مراجع" },
  userNid: { label: "کد ملی مراجع" },
  service: { label: "خدمت" },
  center: { label: "مرکز" },
  city: { label: "شهر" },
  userTariff: { label: "تعرفه (ریال)", type: "money" },
  acceptorFee: { label: "حق مشاور (ریال)", type: "money" },
  isEms: { label: "مورد حاد", type: "bool" },
};

const EVENT_GROUP_KEYS: Record<string, { label: string }> = {
  status: { label: "وضعیت" },
  service: { label: "خدمت" },
  center: { label: "مرکز" },
  month: { label: "ماه شمسی" },
};

const EVENT_METRICS: Record<string, { label: string }> = {
  count: { label: "تعداد جلسات" },
  "sum:userTariff": { label: "جمع تعرفه (ریال)" },
  "sum:acceptorFee": { label: "جمع حق مشاور (ریال)" },
  "avg:userTariff": { label: "میانگین تعرفه (ریال)" },
};

async function reportEvents(ctx: Ctx) {
  const where: any = {};
  if (ctx.filters.status) where.status = ctx.filters.status;
  if (ctx.serviceId !== null) where.serviceId = ctx.serviceId;
  if (ctx.centerId !== null) where.centerId = ctx.centerId;
  if (ctx.fromDate || ctx.toDate) {
    where.startDate = {};
    if (ctx.fromDate) where.startDate.gte = ctx.fromDate;
    if (ctx.toDate) where.startDate.lte = ctx.toDate;
  }
  if (ctx.q) {
    const asNum = num(ctx.q);
    where.OR = [
      { topic: { contains: ctx.q } },
      { user: { OR: [{ name: { contains: ctx.q } }, { family: { contains: ctx.q } }, { username: { contains: ctx.q } }] } },
      ...(asNum !== null ? [{ trackingCode: asNum }, { id: asNum }] : []),
    ];
  }

  const sortMap: Record<string, any> = {
    id: { id: ctx.sortDir },
    trackingCode: { trackingCode: ctx.sortDir },
    startDate: { startDate: ctx.sortDir },
    status: { status: ctx.sortDir },
    userTariff: { userTariff: ctx.sortDir },
    acceptorFee: { acceptorFee: ctx.sortDir },
    userName: { user: { family: ctx.sortDir } },
  };
  const orderBy = sortMap[ctx.body.sort?.key ?? "startDate"] ?? sortMap.startDate;

  const select = {
    id: true, trackingCode: true, startDate: true, status: true, topic: true,
    userTariff: true, acceptorFee: true, isEms: true,
    user: { select: { name: true, family: true, nid: true } },
    service: { select: { short: true, name: true } },
    center: { select: { title: true, cityTitle: true } },
  } as const;

  if (ctx.mode === "detail") {
    const [total, rows] = await Promise.all([
      db.event.count({ where }),
      db.event.findMany({ where, select, orderBy, skip: (ctx.page - 1) * ctx.pageSize, take: ctx.pageSize }),
    ]);
    return ok({
      columns: EVENT_COLUMNS,
      rows: rows.map(mapEvent),
      total, page: ctx.page, pageSize: ctx.pageSize,
      groupKeys: null, metrics: null,
    });
  }

  // خلاصه
  const rows = await db.event.findMany({ where, select, orderBy: { startDate: "desc" }, take: SUMMARY_CAP });
  const mapped = rows.map(mapEvent);
  return summarize(ctx, mapped, EVENT_GROUP_KEYS, EVENT_METRICS);
}

function mapEvent(e: any) {
  return {
    id: e.id,
    trackingCode: e.trackingCode,
    startDate: e.startDate,
    status: e.status,
    topic: e.topic,
    userName: e.user ? `${e.user.name ?? ""} ${e.user.family ?? ""}`.trim() : null,
    userNid: e.user?.nid ?? null,
    service: e.service ? e.service.short || e.service.name : null,
    center: e.center?.title ?? null,
    city: e.center?.cityTitle ?? null,
    userTariff: e.userTariff,
    acceptorFee: e.acceptorFee,
    isEms: e.isEms,
  };
}

// ------------------------------------------------------------ مالی
const FINANCE_COLUMNS: Record<string, { label: string }> = {
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

const FINANCE_GROUP_KEYS: Record<string, { label: string }> = {
  status: { label: "وضعیت" },
  service: { label: "خدمت" },
  center: { label: "مرکز" },
  month: { label: "ماه شمسی" },
};

const FINANCE_METRICS: Record<string, { label: string }> = {
  count: { label: "تعداد جلسات" },
  "sum:userTariff": { label: "جمع تعرفه (ریال)" },
  "sum:acceptorFee": { label: "جمع حق مشاور (ریال)" },
  "sum:centerFee": { label: "جمع سهم مرکز (ریال)" },
  "sum:adminFee": { label: "جمع سهم سامانه (ریال)" },
};

async function reportFinance(ctx: Ctx) {
  const where: any = {};
  if (ctx.serviceId !== null) where.serviceId = ctx.serviceId;
  if (ctx.centerId !== null) where.centerId = ctx.centerId;
  if (ctx.fromDate || ctx.toDate) {
    where.startDate = {};
    if (ctx.fromDate) where.startDate.gte = ctx.fromDate;
    if (ctx.toDate) where.startDate.lte = ctx.toDate;
  }
  if (ctx.q) where.OR = [{ user: { OR: [{ name: { contains: ctx.q } }, { family: { contains: ctx.q } }] } }];

  const select = {
    id: true, startDate: true, status: true, userTariff: true, acceptorFee: true,
    centerFee: true, adminFee: true, supervisorFee: true,
    user: { select: { name: true, family: true } },
    service: { select: { short: true, name: true } },
    center: { select: { title: true } },
  } as const;

  if (ctx.mode === "detail") {
    const [total, rows] = await Promise.all([
      db.event.count({ where }),
      db.event.findMany({ where, select, orderBy: { startDate: "desc" }, skip: (ctx.page - 1) * ctx.pageSize, take: ctx.pageSize }),
    ]);
    return ok({
      columns: FINANCE_COLUMNS,
      rows: rows.map((e) => ({
        id: e.id, startDate: e.startDate, status: e.status,
        userName: e.user ? `${e.user.name ?? ""} ${e.user.family ?? ""}`.trim() : null,
        service: e.service ? e.service.short || e.service.name : null,
        center: e.center?.title ?? null,
        userTariff: e.userTariff, acceptorFee: e.acceptorFee, centerFee: e.centerFee,
        adminFee: e.adminFee, supervisorFee: e.supervisorFee,
      })),
      total, page: ctx.page, pageSize: ctx.pageSize,
      groupKeys: null, metrics: null,
    });
  }
  const rows = await db.event.findMany({ where, select, orderBy: { startDate: "desc" }, take: MONTHLY_CAP });
  const mapped = rows.map((e: any) => ({
    id: e.id, startDate: e.startDate, status: e.status,
    userName: e.user ? `${e.user.name ?? ""} ${e.user.family ?? ""}`.trim() : null,
    service: e.service ? e.service.short || e.service.name : null,
    center: e.center?.title ?? null,
    userTariff: e.userTariff, acceptorFee: e.acceptorFee, centerFee: e.centerFee,
    adminFee: e.adminFee, supervisorFee: e.supervisorFee,
  }));
  return summarize(ctx, mapped, FINANCE_GROUP_KEYS, FINANCE_METRICS);
}

// ------------------------------------------------------------ کاربران
const USER_COLUMNS: Record<string, { label: string }> = {
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

const USER_GROUP_KEYS: Record<string, { label: string }> = {
  gender: { label: "جنسیت" },
  blocked: { label: "وضعیت مسدودی" },
  month: { label: "ماه عضویت" },
};

const USER_METRICS: Record<string, { label: string }> = { count: { label: "تعداد کاربران" } };

async function reportUsers(ctx: Ctx) {
  const where: any = {};
  if (ctx.filters.blocked === "true") where.blocked = true;
  if (ctx.filters.blocked === "false") where.blocked = false;
  if (ctx.fromDate || ctx.toDate) {
    where.signupDate = {};
    if (ctx.fromDate) where.signupDate.gte = ctx.fromDate;
    if (ctx.toDate) where.signupDate.lte = ctx.toDate;
  }
  if (ctx.q) {
    const asNum = num(ctx.q);
    where.OR = [
      { name: { contains: ctx.q } },
      { family: { contains: ctx.q } },
      { username: { contains: ctx.q } },
      ...(asNum !== null ? [{ nid: asNum }, { mobile: asNum }] : []),
    ];
  }

  const select = {
    id: true, nid: true, username: true, name: true, family: true,
    mobile: true, gender: true, signupDate: true, blocked: true, confirm: true,
  } as const;

  if (ctx.mode === "detail") {
    const [total, rows] = await Promise.all([
      db.user.count({ where }),
      db.user.findMany({ where, select, orderBy: { id: ctx.sortDir }, skip: (ctx.page - 1) * ctx.pageSize, take: ctx.pageSize }),
    ]);
    return ok({
      columns: USER_COLUMNS,
      rows: rows.map((u) => ({ ...u, gender: (u as any).gender ?? null })),
      total, page: ctx.page, pageSize: ctx.pageSize,
      groupKeys: null, metrics: null,
    });
  }
  const rows = await db.user.findMany({ where, select, orderBy: { id: "desc" }, take: MONTHLY_CAP });
  return summarize(ctx, rows, USER_GROUP_KEYS, USER_METRICS);
}

// ------------------------------------------------------------ رزروها
const RESERVE_COLUMNS: Record<string, { label: string }> = {
  id: { label: "شناسه" },
  date: { label: "تاریخ رزرو", type: "date" },
  eventTrackingCode: { label: "کد رهگیری جلسه" },
  eventStatus: { label: "وضعیت جلسه" },
  userName: { label: "مراجع" },
};

const RESERVE_GROUP_KEYS: Record<string, { label: string }> = {
  eventStatus: { label: "وضعیت جلسه" },
  month: { label: "ماه شمسی" },
};

const RESERVE_METRICS: Record<string, { label: string }> = { count: { label: "تعداد رزروها" } };

async function reportReserves(ctx: Ctx) {
  const where: any = {};
  if (ctx.fromDate || ctx.toDate) {
    where.date = {};
    if (ctx.fromDate) where.date.gte = ctx.fromDate;
    if (ctx.toDate) where.date.lte = ctx.toDate;
  }
  if (ctx.q) where.event = { user: { OR: [{ name: { contains: ctx.q } }, { family: { contains: ctx.q } }] } };

  const select = {
    id: true, date: true,
    event: { select: { trackingCode: true, status: true, user: { select: { name: true, family: true } } } },
  } as const;

  if (ctx.mode === "detail") {
    const [total, rows] = await Promise.all([
      db.eventReserve.count({ where }),
      db.eventReserve.findMany({ where, select, orderBy: { date: ctx.sortDir }, skip: (ctx.page - 1) * ctx.pageSize, take: ctx.pageSize }),
    ]);
    return ok({
      columns: RESERVE_COLUMNS,
      rows: rows.map((r: any) => ({
        id: r.id, date: r.date,
        eventTrackingCode: r.event?.trackingCode ?? null,
        eventStatus: r.event?.status ?? null,
        userName: r.event?.user ? `${r.event.user.name ?? ""} ${r.event.user.family ?? ""}`.trim() : null,
      })),
      total, page: ctx.page, pageSize: ctx.pageSize,
      groupKeys: null, metrics: null,
    });
  }
  const rows = await db.eventReserve.findMany({ where, select, orderBy: { date: "desc" }, take: SUMMARY_CAP });
  const mapped = rows.map((r: any) => ({
    id: r.id, date: r.date,
    eventTrackingCode: r.event?.trackingCode ?? null,
    eventStatus: r.event?.status ?? null,
    userName: r.event?.user ? `${r.event.user.name ?? ""} ${r.event.user.family ?? ""}`.trim() : null,
  }));
  return summarize(ctx, mapped, RESERVE_GROUP_KEYS, RESERVE_METRICS);
}

// ------------------------------------------------------------ ارجاعات
const REFERRAL_COLUMNS: Record<string, { label: string }> = {
  id: { label: "شناسه" },
  refId: { label: "کد ارجاع" },
  creationDate: { label: "تاریخ ارجاع", type: "date" },
  userName: { label: "نام مراجع" },
  userNid: { label: "کد ملی" },
  userMobile: { label: "موبایل" },
  service: { label: "خدمت" },
  sessionsCount: { label: "تعداد جلسات" },
  status: { label: "وضعیت" },
  description: { label: "توضیح" },
};

const REFERRAL_GROUP_KEYS: Record<string, { label: string }> = {
  status: { label: "وضعیت" },
  service: { label: "خدمت" },
  month: { label: "ماه شمسی" },
};

const REFERRAL_METRICS: Record<string, { label: string }> = {
  count: { label: "تعداد ارجاعات" },
  "sum:sessionsCount": { label: "جمع جلسات پیش‌بینی‌شده" },
};

async function reportReferrals(ctx: Ctx) {
  const where: any = {};
  if (ctx.filters.status) where.status = ctx.filters.status;
  if (ctx.fromDate || ctx.toDate) {
    where.creationDate = {};
    if (ctx.fromDate) where.creationDate.gte = ctx.fromDate;
    if (ctx.toDate) where.creationDate.lte = ctx.toDate;
  }
  if (ctx.q) {
    const asNum = num(ctx.q);
    where.OR = [
      { userName: { contains: ctx.q } },
      { description: { contains: ctx.q } },
      ...(asNum !== null ? [{ refId: asNum }] : []),
    ];
  }

  const select = {
    id: true, refId: true, creationDate: true, userName: true, userNid: true,
    userMobile: true, sessionsCount: true, status: true, description: true,
    service: { select: { short: true, name: true } },
  } as const;

  if (ctx.mode === "detail") {
    const [total, rows] = await Promise.all([
      db.referr.count({ where }),
      db.referr.findMany({ where, select, orderBy: { id: ctx.sortDir }, skip: (ctx.page - 1) * ctx.pageSize, take: ctx.pageSize }),
    ]);
    return ok({
      columns: REFERRAL_COLUMNS,
      rows: rows.map((r: any) => ({ ...r, service: r.service ? r.service.short || r.service.name : null })),
      total, page: ctx.page, pageSize: ctx.pageSize,
      groupKeys: null, metrics: null,
    });
  }
  const rows = await db.referr.findMany({ where, select, orderBy: { id: "desc" }, take: SUMMARY_CAP });
  const mapped = rows.map((r: any) => ({ ...r, service: r.service ? r.service.short || r.service.name : null }));
  return summarize(ctx, mapped, REFERRAL_GROUP_KEYS, REFERRAL_METRICS);
}

// ------------------------------------------------------------ پیامک‌ها
const SMS_COLUMNS: Record<string, { label: string }> = {
  id: { label: "شناسه" },
  createTime: { label: "تاریخ ارسال", type: "date" },
  number: { label: "شماره" },
  receiverName: { label: "گیرنده" },
  message: { label: "متن پیام" },
  efforts: { label: "تعداد تلاش" },
  status: { label: "وضعیت" },
  response: { label: "پاسخ سامانه" },
};

const SMS_GROUP_KEYS: Record<string, { label: string }> = {
  status: { label: "وضعیت" },
  month: { label: "ماه شمسی" },
};

const SMS_METRICS: Record<string, { label: string }> = { count: { label: "تعداد پیامک" } };

async function reportSms(ctx: Ctx) {
  const where: any = {};
  if (ctx.filters.status) where.status = ctx.filters.status;
  if (ctx.fromDate || ctx.toDate) {
    where.createTime = {};
    if (ctx.fromDate) where.createTime.gte = ctx.fromDate;
    if (ctx.toDate) where.createTime.lte = ctx.toDate;
  }
  if (ctx.q) {
    const asNum = num(ctx.q);
    where.OR = [
      { message: { contains: ctx.q } },
      { receiver: { OR: [{ name: { contains: ctx.q } }, { family: { contains: ctx.q } }] } },
      ...(asNum !== null ? [{ number: asNum }] : []),
    ];
  }

  const select = {
    id: true, createTime: true, number: true, message: true, efforts: true, status: true, response: true,
    receiver: { select: { name: true, family: true } },
  } as const;

  if (ctx.mode === "detail") {
    const [total, rows] = await Promise.all([
      db.sms.count({ where }),
      db.sms.findMany({ where, select, orderBy: { id: ctx.sortDir }, skip: (ctx.page - 1) * ctx.pageSize, take: ctx.pageSize }),
    ]);
    return ok({
      columns: SMS_COLUMNS,
      rows: rows.map((s: any) => ({ ...s, receiverName: s.receiver ? `${s.receiver.name ?? ""} ${s.receiver.family ?? ""}`.trim() : null })),
      total, page: ctx.page, pageSize: ctx.pageSize,
      groupKeys: null, metrics: null,
    });
  }
  const rows = await db.sms.findMany({ where, select, orderBy: { id: "desc" }, take: SUMMARY_CAP });
  const mapped = rows.map((s: any) => ({ ...s, receiverName: s.receiver ? `${s.receiver.name ?? ""} ${s.receiver.family ?? ""}`.trim() : null }));
  return summarize(ctx, mapped, SMS_GROUP_KEYS, SMS_METRICS);
}

// ------------------------------------------------------------ حالت خلاصه
function summarize(ctx: Ctx, rows: any[], groupKeys: Record<string, { label: string }>, metrics: Record<string, { label: string }>) {
  const groupBy = ctx.body.groupBy && groupKeys[ctx.body.groupBy] ? ctx.body.groupBy : "status";
  const metric = ctx.body.metric && metrics[ctx.body.metric] ? ctx.body.metric : "count";

  const groups = new Map<string, { raw: number; agg: number[]; sample?: any }>();
  for (const r of rows) {
    let key: string;
    if (groupBy === "month") {
      const d = r.startDate ?? r.date ?? r.creationDate ?? r.signupDate ?? r.createTime;
      key = d ? monthLabel(d) : "بدون تاریخ";
    } else {
      key = String(r[groupBy] ?? "نامشخص");
    }
    const g = groups.get(key) ?? { raw: 0, agg: [] };
    g.raw++;
    if (metric.startsWith("sum:") || metric.startsWith("avg:")) {
      const field = metric.split(":")[1];
      g.agg.push(Number(r[field] ?? 0));
    }
    groups.set(key, g);
  }

  const result = Array.from(groups.entries())
    .map(([name, g]) => {
      let value = g.raw;
      if (metric.startsWith("sum:")) value = g.agg.reduce((s, x) => s + x, 0);
      else if (metric.startsWith("avg:")) value = g.agg.length ? Math.round(g.agg.reduce((s, x) => s + x, 0) / g.agg.length) : 0;
      return { name, value };
    })
    .sort((a, b) => b.value - a.value);

  return ok({
    columns: null,
    rows: result,
    total: result.length,
    summary: {
      groupBy: { key: groupBy, label: groupKeys[groupBy].label },
      metric: { key: metric, label: metrics[metric].label },
      sourceRows: rows.length,
      capped: rows.length >= SUMMARY_CAP,
    },
    groupKeys, metrics,
  });
}
