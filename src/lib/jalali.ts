// قالب‌بندی تاریخ شمسی و اعداد فارسی — بدون وابستگی خارجی

const jalaliDateFmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const jalaliLongFmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  year: "numeric",
  month: "long",
  day: "numeric",
});
const jalaliMonthYearFmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  year: "numeric",
  month: "long",
});
const timeFmt = new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" });

/** تاریخ شمسی کوتاه: ۱۴۰۵/۰۸/۱۶ */
export function jDate(value: string | number | Date | null | undefined): string {
  if (!value) return "—";
  try {
    return jalaliDateFmt.format(new Date(value));
  } catch {
    return "—";
  }
}

/** تاریخ شمسی بلند: ۱۶ آبان ۱۴۰۵ */
export function jLong(value: string | number | Date | null | undefined): string {
  if (!value) return "—";
  try {
    return jalaliLongFmt.format(new Date(value));
  } catch {
    return "—";
  }
}

/** ماه و سال شمسی: آبان ۱۴۰۵ */
export function jMonthYear(value: string | number | Date): string {
  try {
    return jalaliMonthYearFmt.format(new Date(value));
  } catch {
    return "—";
  }
}

/** ساعت: ۱۴:۳۰ */
export function jTime(value: string | number | Date | null | undefined): string {
  if (!value) return "—";
  try {
    return timeFmt.format(new Date(value));
  } catch {
    return "—";
  }
}

/** تاریخ و ساعت شمسی */
export function jDateTime(value: string | number | Date | null | undefined): string {
  if (!value) return "—";
  return `${jDate(value)} - ${jTime(value)}`;
}

/** عدد با جداکننده و ارقام فارسی */
export function faNum(value: number | bigint | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "bigint" ? Number(value) : Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString("fa-IR");
}

/** مبلغ ریالی خوانا */
export function faMoney(value: number | bigint | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} میلیارد`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} میلیون`;
  if (n >= 1000) return `${(n / 1000).toLocaleString("fa-IR", { maximumFractionDigits: 0 })} هزار`;
  return n.toLocaleString("fa-IR");
}

/** کد ملی/موبایل با ارقام فارسی */
export function faDigits(value: string | number | bigint | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return String(value).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

const MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
export const faMonths = MONTHS;

/** برچسب ماه شمسی از تاریخ میلادی */
export function monthLabel(value: string | number | Date): string {
  const d = new Date(value);
  try {
    const parts = new Intl.DateTimeFormat("en-u-ca-persian", { month: "numeric", year: "numeric" }).formatToParts(d);
    const m = Number(parts.find((p) => p.type === "month")?.value ?? 1);
    const y = parts.find((p) => p.type === "year")?.value ?? "";
    return `${MONTHS[(m - 1 + 12) % 12]} ${y.replace(/\D/g, "").slice(-2) !== "" ? y : ""}`;
  } catch {
    return "";
  }
}
