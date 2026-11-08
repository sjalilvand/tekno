// =====================================================================
// موتور تحلیلی سرور — تجمیع با SQL خام (سریع روی میلیون‌ها ردیف) + کش زمانی
// + گروه‌بندی ماه شمسی + تفسیر خودکار نمودارها + خروجی CSV
// ---------------------------------------------------------------
// الگوبرداری از سامانهٔ گزارش‌گیری read_mysql:
//  • هیچ ردیفی به JS منتقل نمی‌شود؛ همهٔ جمع‌ها با GROUP BY داخل دیتابیس انجام می‌شود
//  • نتایج تا ۵ دقیقه در حافظه کش می‌شوند (کلید = پارامترهای فیلتر)
//  • گروه‌بندی روزانه در SQL و تجمیع ماهِ شمسی در JS (روی ردیف‌های روزانه که کم‌اند)
//  • SQLها بین SQLite (توسعه) و MySQL (تولید) قابل حمل‌اند
// =====================================================================
import { db } from "@/lib/db";
import { isoToJ, jMonths, normalizeDateInput } from "@/lib/jdate";
import { faNum } from "@/lib/jalali";

export type Provider = "mysql" | "sqlite";

export function dbProvider(): Provider {
  const url = process.env.DATABASE_URL ?? "";
  return url.startsWith("mysql") || url.startsWith("mariadb") ? "mysql" : "sqlite";
}

// -------------------------------------------------------------- کش TTL
type CacheEntry = { at: number; data: unknown };
const store = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // ۵ دقیقه — مطابق read_mysql
const CACHE_MAX = 30;

export function cacheGet<T>(key: string): T | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) { store.delete(key); return null; }
  return hit.data as T;
}

export function cacheSet(key: string, data: unknown): void {
  store.set(key, { at: Date.now(), data });
  if (store.size > CACHE_MAX) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
}

// ------------------------------------------------------- SQL قابل حمل
// منطقهٔ زمانی ایران: +3:30 — گروه‌بندی روزانه باید به‌وقت محلی باشد
export function sqlLocalDate(expr: string): string {
  if (dbProvider() === "mysql") return `DATE_FORMAT(DATE_ADD(${expr}, INTERVAL 210 MINUTE), '%Y-%m-%d')`;
  return `DATE(${expr}, '+210 minutes')`;
}

/** اجرای SQL خام با پارامتر بایندشده — خطا به‌جای شکست صفحه، خالی برمی‌گردد */
export async function rawRows<T = Record<string, unknown>>(sql: string, args: unknown[] = []): Promise<T[]> {
  try {
    const rows = (await db.$queryRawUnsafe(sql, ...args)) as Record<string, unknown>[];
    return rows.map(debigint) as T[];
  } catch (e) {
    console.error("rawRows failed:", (e as Error)?.message?.slice(0, 200));
    return [];
  }
}

export async function rawScalar(sql: string, args: unknown[] = []): Promise<number> {
  const rows = await rawRows(sql, args);
  const v = rows.length ? (rows[0] as Record<string, unknown>)[Object.keys(rows[0] as object)[0]] : 0;
  return num(v);
}

/** ساعت روز (۰-۲۳) به‌وقت محلی — عدد صحیح */
export function sqlLocalHour(expr: string): string {
  if (dbProvider() === "mysql") return `HOUR(DATE_ADD(${expr}, INTERVAL 210 MINUTE))`;
  return `CAST(strftime('%H', ${expr}, '+210 minutes') AS INT)`;
}

/** تبدیل امن مقدار SQL به number — BigInt هم می‌پذیرد */
export function num(v: unknown): number {
  const x = typeof v === "bigint" ? Number(v) : Number(v);
  return Number.isFinite(x) ? x : 0;
}

/** تمام مقادیر BigInt/Date یک ردیف را امن می‌کند — JSON.stringify با BigInt می‌شکند */
function debigint(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = typeof v === "bigint" ? num(v) : v instanceof Date ? v.toISOString().slice(0, 10) : v;
  }
  return out;
}

// --------------------------------------------------- بازهٔ تاریخ شمسی
export type DateWindow = { fromIso: string | null; toIso: string | null };

/** ورودی شمسی یا میلادی را به بازهٔ ISO تمیز تبدیل می‌کند */
export function parseWindow(from?: string | null, to?: string | null): DateWindow {
  return { fromIso: normalizeDateInput(from), toIso: normalizeDateInput(to) };
}

export function windowKey(w: DateWindow, extra: Record<string, unknown> = {}): string {
  return JSON.stringify([w.fromIso, w.toIso, extra]);
}

/** شرط بازهٔ تاریخ برای ستون DateTime — روی تاریخِ محلیِ شیفت‌یافته مقایسه می‌شود */
export function sqlDateRange(colExpr: string, w: DateWindow, alias: string): { clause: string; args: string[] } {
  const parts: string[] = [];
  const args: string[] = [];
  if (w.fromIso) { parts.push(`${sqlLocalDate(colExpr)} >= ?`); args.push(w.fromIso); }
  if (w.toIso) { parts.push(`${sqlLocalDate(colExpr)} <= ?`); args.push(w.toIso); }
  return { clause: parts.length ? ` AND ${parts.join(" AND ")}` : "", args };
}

// ------------------------------------------ ماه شمسی از ردیف‌های روزانه
export type DailyRow = { d: string; c: number; extra?: number };
export type MonthBucket = { key: string; label: string; count: number; extra: number };

/** ردیف‌های روزانه را به ماه‌های شمسی تجمیع می‌کند — خروجی مرتب و برچسب‌دار */
export function jalaliMonthly(daily: DailyRow[], extraName = "انجام‌شده"): MonthBucket[] {
  const map = new Map<string, MonthBucket>();
  for (const row of daily) {
    const jp = isoToJ(row.d);
    if (!jp) continue;
    const key = `${jp.jy}/${String(jp.jm).padStart(2, "0")}`;
    const cur = map.get(key) ?? { key, label: `${jMonths[jp.jm - 1]} ${faNum(String(jp.jy))}`, count: 0, extra: 0 };
    cur.count += Number(row.c) || 0;
    cur.extra += Number(row.extra) || 0;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** آخرین N ماه شمسی را از سری ماهانه برمی‌دارد */
export function lastMonths(months: MonthBucket[], n: number): MonthBucket[] {
  return months.slice(Math.max(0, months.length - n));
}

// ------------------------------------------------- نمودارها و تفسیرها
export type Chart =
  | { kind: "donut"; id: string; title: string; labels: string[]; values: number[]; total: number; insight?: string }
  | { kind: "bars"; id: string; title: string; labels: string[]; values: number[]; valueLabel?: string; insight?: string }
  | { kind: "bars2"; id: string; title: string; labels: string[]; values: number[]; values2: number[]; labelOk: string; labelWait: string; insight?: string }
  | { kind: "line"; id: string; title: string; labels: string[]; series: { name: string; values: number[]; color?: string }[]; insight?: string };

export const PALETTE = ["#a83a54", "#c99a5b", "#5c4a6e", "#3a7ca5", "#4d7c0f", "#b45309", "#0f766e", "#7c3aed"];

/** donut با برچسب «سایر» برای ردیف‌های کم‌تعداد */
export function donut(id: string, title: string, rows: [string, number][], top = 8, insightText?: string): Chart | null {
  const agg = new Map<string, number>();
  for (const [k, v] of rows) {
    if (k === null || k === undefined || k === "") continue;
    agg.set(k, (agg.get(k) ?? 0) + (Number(v) || 0));
  }
  const items = [...agg.entries()].sort((a, b) => b[1] - a[1]);
  if (!items.length) return null;
  const head = items.slice(0, top);
  const rest = items.slice(top).reduce((s, [, v]) => s + v, 0);
  const labels = head.map(([k]) => k);
  const values = head.map(([, v]) => v);
  if (rest > 0) { labels.push("سایر"); values.push(rest); }
  return { kind: "donut", id, title, labels, values, total: values.reduce((s, v) => s + v, 0), ...(insightText ? { insight: insightText } : {}) };
}

export function bars(id: string, title: string, rows: [string, number][], top = 12, valueLabel = "تعداد"): Chart | null {
  const agg = new Map<string, number>();
  for (const [k, v] of rows) {
    if (k === null || k === undefined || k === "") continue;
    agg.set(k, (agg.get(k) ?? 0) + (Number(v) || 0));
  }
  const items = [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, top);
  if (!items.length) return null;
  return { kind: "bars", id, title, labels: items.map(([k]) => k), values: items.map(([, v]) => v), valueLabel };
}

/** نمودار خطی از ماه‌های شمسی — سری‌های «کل» و اختیاری «انجام‌شده» */
export function lineChart(id: string, title: string, months: MonthBucket[], withExtra = true, extraName = "انجام‌شده"): Chart | null {
  if (!months.length) return null;
  const series: { name: string; values: number[]; color?: string }[] = [
    { name: "کل", values: months.map((m) => m.count), color: PALETTE[0] },
  ];
  if (withExtra) series.push({ name: extraName, values: months.map((m) => m.extra), color: PALETTE[2] });
  return { kind: "line", id, title, labels: months.map((m) => m.label), series };
}

const faPct = (x: number) => `${faNum(x.toFixed(1))}٪`;

/** تفسیر خودکار هر نمودار — مطابق منطق read_mysql */
export function addInsights(charts: Chart[], note?: string): void {
  for (const ch of charts) {
    try {
      let ins: string | null = null;
      if ((ch.kind === "donut" || ch.kind === "bars") && ch.values.length) {
        const vals = ch.values, labels = ch.labels;
        const total = vals.reduce((s, v) => s + v, 0) || 1;
        const topI = vals.indexOf(Math.max(...vals));
        let txt = `بیشترین سهم با «${labels[topI]}» و ${faPct((vals[topI] * 100) / total)} از کل است`;
        const sorted = [...vals].sort((a, b) => b - a);
        if (vals.length > 1 && sorted[1] > 0) {
          const ratio = vals[topI] / sorted[1];
          if (ratio >= 2) txt += ` (حدود ${faNum(String(Math.round(ratio * 10) / 10))} برابر مورد بعدی)`;
        }
        ins = txt + ".";
      } else if (ch.kind === "line" && ch.series.length) {
        const s0 = ch.series[0];
        const vals = s0.values, labels = ch.labels;
        if (vals.length >= 2) {
          const first = vals[0], last = vals[vals.length - 1];
          const peakI = vals.indexOf(Math.max(...vals));
          const trend = last > first ? "صعودی" : last < first ? "نزولی" : "ثابت";
          const chg = first ? faNum((((last - first) * 100) / first).toFixed(0)) : "—";
          ins = `روند ${trend} — از ${faNum(String(first))} به ${faNum(String(last))}`
            + (chg !== "—" ? ` (${chg}٪ تغییر)` : "")
            + `؛ اوج در «${labels[peakI] ?? "—"}» با ${faNum(String(vals[peakI]))}.`;
          if (s0.name === "کل" && ch.series.length > 1) {
            const rate = (ch.series[1].values.reduce((s, v) => s + v, 0) * 100) / (vals.reduce((s, v) => s + v, 0) || 1);
            ins += ` نرخ انجام کل: ${faPct(rate)}.`;
          }
        }
      }
      if (note) ins = ins ? `${ins} ${note}` : note;
      if (ins) (ch as { insight?: string }).insight = ins;
    } catch { /* تفسیر اختیاری است */ }
  }
}

// ------------------------------------------------------------- CSV
export function csvFromChart(ch: Chart): string {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines: string[] = [];
  if (ch.kind === "donut" || ch.kind === "bars") {
    lines.push("عنوان,تعداد");
    ch.labels.forEach((lb, i) => lines.push(`${esc(lb)},${ch.values[i]}`));
  } else if (ch.kind === "bars2") {
    lines.push("عنوان,تاییدشده,در انتظار");
    ch.labels.forEach((lb, i) => lines.push(`${esc(lb)},${ch.values[i]},${ch.values2[i]}`));
  } else {
    lines.push(`ماه,${ch.series.map((s) => s.name).join(",")}`);
    ch.labels.forEach((lb, i) => lines.push(`${esc(lb)},${ch.series.map((s) => s.values[i]).join(",")}`));
  }
  return "\uFEFF" + lines.join("\r\n");
}
