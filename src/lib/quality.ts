// =====================================================================
// سلامت داده — بررسی‌های خطایابی مشترک داشبورد و دستیار چت
// خروجی: امتیاز ۰ تا ۱۰۰ + فهرست بررسی‌ها با تعداد و تفسیر فارسی
// =====================================================================
import { rawScalar, sqlLocalDate, cacheGet, cacheSet, dbProvider } from "@/lib/analytics";
import { faNum } from "@/lib/jalali";

export type QualityCheck = { id: string; name: string; ok: boolean; count: number; hint: string; route: string; severity: "high" | "medium" | "low" };
export type QualityReport = { score: number; checks: QualityCheck[]; computedAt: string };

/** تاریخ امروز به‌وقت ایران به شکل YYYY-MM-DD */
export function todayIso(): string {
  return new Date(Date.now() + 210 * 60000).toISOString().slice(0, 10);
}

export async function computeQuality(): Promise<QualityReport> {
  const ck = "quality:report";
  const hit = cacheGet<QualityReport>(ck);
  if (hit) return hit;
  const cutoff14 = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const nowFn = dbProvider() === "mysql" ? "CURDATE()" : `DATE('now', '+210 minutes')`;
  const [dupTrackingRaw, dupNidRaw, noMobile, futureStart, noStart, zeroTariff, stalePending, failedSms, orphanReserves, dupUsername] =
    await Promise.all([
      rawScalar(`SELECT COUNT(*) c FROM (SELECT \`trackingCode\` FROM \`Events\` WHERE \`trackingCode\` IS NOT NULL GROUP BY \`trackingCode\` HAVING COUNT(*) > 1) t`),
      rawScalar(`SELECT COUNT(*) c FROM (SELECT \`nid\` FROM \`Users\` GROUP BY \`nid\` HAVING COUNT(*) > 1) t`),
      rawScalar(`SELECT COUNT(*) c FROM \`Users\` WHERE \`mobile\` IS NULL OR \`mobile\` = 0`),
      rawScalar(`SELECT COUNT(*) c FROM \`Events\` WHERE \`startDate\` IS NOT NULL AND ${sqlLocalDate("\`startDate\`")} > ${nowFn}`),
      rawScalar(`SELECT COUNT(*) c FROM \`Events\` WHERE \`startDate\` IS NULL`),
      rawScalar(`SELECT COUNT(*) c FROM \`Events\` WHERE \`status\` = 'تایید نهایی' AND \`userTariff\` = 0`),
      rawScalar(`SELECT COUNT(*) c FROM \`Events\` WHERE \`endDate\` IS NULL AND \`startDate\` IS NOT NULL AND ${sqlLocalDate("\`startDate\`")} < ?`, [cutoff14]),
      rawScalar(`SELECT COUNT(*) c FROM \`SMS\` WHERE \`status\` = 'ناموفق'`),
      rawScalar(`SELECT COUNT(*) c FROM \`EventReserves\` WHERE \`eventId\` NOT IN (SELECT \`id\` FROM \`Events\`)`),
      rawScalar(`SELECT COUNT(*) c FROM (SELECT \`username\` FROM \`Users\` GROUP BY \`username\` HAVING COUNT(*) > 1) t`),
    ]);
  // ردیف‌های درگیر کدهای تکراری
  const dupTracking = dupTrackingRaw ? await rawScalar(`SELECT COUNT(*) c FROM \`Events\` WHERE \`trackingCode\` IN (SELECT \`trackingCode\` FROM \`Events\` WHERE \`trackingCode\` IS NOT NULL GROUP BY \`trackingCode\` HAVING COUNT(*) > 1)`) : 0;
  const dupNid = dupNidRaw ? await rawScalar(`SELECT COUNT(*) c FROM \`Users\` WHERE \`nid\` IN (SELECT \`nid\` FROM \`Users\` GROUP BY \`nid\` HAVING COUNT(*) > 1)`) : 0;

  const checks: QualityCheck[] = [
    { id: "no_start", name: "جلسات بدون تاریخ شروع", ok: noStart === 0, count: noStart, hint: "جلسهٔ بدون تاریخ شروع قابل تحلیل زمانی نیست.", route: "events", severity: noStart > 100 ? "high" : "medium" },
    { id: "zero_tariff", name: "جلسهٔ تاییدشده با تعرفهٔ صفر", ok: zeroTariff === 0, count: zeroTariff, hint: "تعرفهٔ صفر در جلسهٔ تاییدشده یعنی خطای مالی.", route: "finance", severity: "medium" },
    { id: "dup_tracking", name: "کد رهگیری تکراری", ok: dupTracking === 0, count: dupTracking, hint: "در دادهٔ legacy کد رهگیری مشترک رایج است (مثل 0).", route: "events", severity: dupTracking > 1000 ? "high" : "medium" },
    { id: "dup_nid", name: "کد ملی تکراری بین کاربران", ok: dupNid === 0, count: dupNid, hint: "دو کاربر با یک کد ملی در شناسایی مراجع تداخل می‌سازد.", route: "users", severity: "medium" },
    { id: "future_start", name: "تاریخ شروع در آینده", ok: futureStart === 0, count: futureStart, hint: "تاریخ آینده یعنی خطای ثبت.", route: "events", severity: "medium" },
    { id: "stale_pending", name: "جلسهٔ بیش از ۱۴ روز در انتظار", ok: stalePending === 0, count: stalePending, hint: "زنجیرهٔ تایید ۵ مرحله‌ای باید سریع‌تر شود.", route: "events", severity: "high" },
    { id: "failed_sms", name: "پیامک ناموفق", ok: failedSms === 0, count: failedSms, hint: "وضعیت پنل پیامک یا الگوی شماره‌ها بررسی شود.", route: "sms", severity: "low" },
    { id: "orphan_reserves", name: "رزرو بدون جلسهٔ والد", ok: orphanReserves === 0, count: orphanReserves, hint: "دادهٔ یتیم از انتقال‌های ناقص قبلی.", route: "reserves", severity: "low" },
    { id: "no_mobile", name: "کاربران بدون موبایل", ok: noMobile === 0, count: noMobile, hint: "بدون موبایل پیامک اطلاع‌رسانی ارسال نمی‌شود.", route: "users", severity: "low" },
    { id: "dup_username", name: "نام کاربری تکراری", ok: dupUsername === 0, count: dupUsername, hint: "ورود یکتا با نام کاربری تکراری تداخل دارد.", route: "users", severity: "low" },
  ];
  const score = Math.round((checks.filter((c) => c.ok).length * 100) / checks.length);
  const report: QualityReport = { score, checks, computedAt: new Date().toISOString() };
  cacheSet(ck, report);
  return report;
}

/** تفسیر فارسی یک عدد KPI برای دکمهٔ «تفسیر» داشبورد */
export function interpretKpi(key: string, value: number, extra?: Record<string, number>): { title: string; text: string } {
  switch (key) {
    case "dataHealth":
      return {
        title: `امتیاز سلامت داده ${faNum(String(value))} از ۱۰۰`,
        text: value >= 80
          ? "داده‌ها اعتبار بالایی دارند و گزارش‌های مدیریتی قابل اتکا هستند. پایش دوره‌ای کافی است."
          : value >= 50
            ? "برخی رکوردها ناسازگارند؛ توصیه می‌شود موارد بخش خطایابی به‌تدریج پاکسازی شوند تا گزارش‌ها دقیق‌تر شوند."
            : "سلامت داده پایین است — گزارش‌های مالی و عملکردی ممکن است انحراف داشته باشند. اولویت فوری پاکسازی رکوردهای علامت‌خورده است.",
      };
    case "conversion":
      return {
        title: `نرخ تبدیل رزرو به جلسه ${faNum(String(value))}٪`,
        text: value >= 60
          ? "بیشتر رزروها به جلسهٔ واقعی تبدیل می‌شوند؛ فرایند پذیرش روان است."
          : "نرخ تبدیل پایین یعنی رزروهای زیادی به جلسه نمی‌رسند. دلایل رایج: عدم پیگیری تماس، شلوغی تقویم مشاوران یا رهاشدن درخواست‌ها. صفحهٔ درخواست‌های رزرو را بررسی کنید.",
      };
    case "returnRate":
      return {
        title: `نرخ بازگشت مراجع ${faNum(String(value))}٪`,
        text: value >= 40
          ? "بیشتر مراجعان بیش از یک جلسه داشته‌اند — نشانهٔ رضایت و اثربخشی درمان."
          : "نرخ بازگشت پایین است. سنجش رضایت پس از جلسهٔ اول و پیگیری فعال (تماس/پیامک) پیشنهاد می‌شود.",
      };
    case "pendingShare":
      return {
        title: `${faNum(String(value))}٪ جلسات در انتظار تایید`,
        text: value >= 30
          ? "سهم بزرگی از جلسات در زنجیرهٔ تایید معلق است؛ گلوگاه معمولاً تایید مدیر مرکز یا مسئول فنی است. پایش فرایند را ببینید."
          : "صف تایید تحت کنترل است؛ زنجیرهٔ تایید در جریان طبیعی کار می‌کند.",
      };
    case "emsShare":
      return {
        title: `${faNum(String(value))}٪ جلسات، مورد حاد بوده‌اند`,
        text: value > 5
          ? "سهم کیس‌های حاد بالاست؛ آمادگی تیم بحران و ظرفیت جلسات فوری را افزایش دهید."
          : "سهم کیس‌های حاد پایین و در محدودهٔ عادی است؛ آمادگی تیم بحران حفظ شود.",
      };
    case "avgPaymentGrowth":
      return {
        title: `رشد میانگین پرداخت ${faNum(String(value))}٪`,
        text: value >= 0
          ? `میانگین تعرفهٔ هر جلسه نسبت به دورهٔ قبل ${value >= 0 ? "رشد" : "کاهش"} داشته است.`
          : "کاهش میانگین پرداخت معمولاً به دلیل رشد جلسات با تعرفهٔ پایین یا تعرفهٔ صفر است؛ بخش مالی را بررسی کنید.",
      };
    default:
      return { title: "تفسیر شاخص", text: "برای این شاخص تفسیر خودکاری ثبت نشده است." };
  }
}
