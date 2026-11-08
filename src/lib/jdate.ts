// تبدیل دقیق تاریخ میلادی ↔ شمسی + توابع کمکی برای تقویم فارسی
// مبنای کار UTC است تا در هر منطقهٔ زمانی نتیجه یکسان بماند.
// تبدیل میلادی→شمسی با Intl (دقیق و بومی مرورگر) و شمسی→میلادی با
// جستجوی همسایه دور یک تخمین اولیه + تطبیق round-trip (بدون وابستگی خارجی).

export type JParts = { jy: number; jm: number; jd: number };

const jFmt = new Intl.DateTimeFormat("en-u-ca-persian", {
  year: "numeric", month: "numeric", day: "numeric", timeZone: "UTC",
});

/** میلادی → شمسی (بر پایهٔ UTC) */
export function gToJ(date: Date): JParts {
  const parts = jFmt.formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value?.replace(/\D/g, "") ?? 0);
  return { jy: get("year"), jm: get("month"), jd: get("day") };
}

/** شمسی → میلادی (UTC) — با تطبیق دقیق round-trip */
export function jToG(jy: number, jm: number, jd: number): Date {
  // لنگر: ۱ فروردین معمولاً ۲۰ یا ۲۱ مارس است.
  // روزِ سپری‌شدهٔ شمسی: ماه‌های ۱-۶ = ۳۱ روز، ۷-۱۱ = ۳۰ روز؛ خطای تخمین ±۱۰ روز پوشش داده می‌شود
  const dayOfYear = (jm <= 7 ? (jm - 1) * 31 : 186 + (jm - 7) * 30) + (jd - 1);
  const approx = Date.UTC(jy + 621, 2, 20) + dayOfYear * 86400000;
  let fallback: Date | null = null;
  for (let off = -10; off <= 10; off++) {
    const d = new Date(approx + off * 86400000);
    if (!fallback) fallback = d;
    const p = gToJ(d);
    if (p.jy === jy && p.jm === jm && p.jd === jd) return d;
  }
  // اگر تاریخ وجود ندارد (مثلاً ۳۰ اسفند سال غیرکبیسه) نزدیک‌ترین روز معتبرِ همان ماه برگردد
  for (let off = 10; off >= -35; off--) {
    const d = new Date(approx + off * 86400000);
    const p = gToJ(d);
    if (p.jy === jy && p.jm === jm) return d;
  }
  return fallback ?? new Date(Date.UTC(jy + 621, 2, 20));
}

/** طول ماه شمسی */
export function jMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  // اسفند: ۳۰ در سال کبیسه — با round-trip دقیق بررسی می‌شود
  const g = jToG(jy, 12, 30);
  return gToJ(g).jd === 30 ? 30 : 29;
}

/** ISO (yyyy-mm-dd) → شمسی */
export function isoToJ(iso: string): JParts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return gToJ(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))));
}

/** شمسی → ISO (yyyy-mm-dd) */
export function jToIso(jy: number, jm: number, jd: number): string {
  const d = jToG(jy, jm, jd);
  return d.toISOString().slice(0, 10);
}

const FA_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
export const jMonths = FA_MONTHS;

/** نام روزهای هفته به ترتیب تقویم ایرانی (شنبه اول) */
export const jWeekdays = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

/** ستون تقویم فارسی برای getUTCDay: شنبه=0 ... جمعه=6 */
export function faWeekCol(utcDay: number): number {
  // UTC: 0=Sun 1=Mon ... 5=Fri 6=Sat
  return (utcDay + 1) % 7;
}

function faDigits(s: string): string {
  return s.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

/** نمایش ورودی تقویم: ۱۶ آبان ۱۴۰۴ */
export function jLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const p = isoToJ(iso);
  if (!p) return "";
  return faDigits(`${p.jd} ${FA_MONTHS[p.jm - 1]} ${p.jy}`);
}

/** نمایش عددی کوتاه: ۱۴۰۴/۰۸/۱۶ */
export function jShortLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const p = isoToJ(iso);
  if (!p) return "";
  return faDigits(`${p.jy}/${String(p.jm).padStart(2, "0")}/${String(p.jd).padStart(2, "0")}`);
}

/** ISO امروز (بر پایهٔ زمان محلی مرورگر) */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** پذیرش ورودیهای شمسی یا میلادی برای فیلترهای API — همیشه ISO برمی‌گرداند */
export function normalizeDateInput(v?: string | null): string | null {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(s)) {
    const [jy, jm, jd] = s.split("/").map((x) => Number(x));
    if (jy >= 1200 && jy <= 1600) return jToIso(jy, jm, jd);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
