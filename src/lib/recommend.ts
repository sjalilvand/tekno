// =====================================================================
//  موتور توصیه‌ها و پیشنهادهای هوشمند کارتابل — نسخهٔ ۶.۱
//  ورودی: پروندهٔ کامل متقاضی؛ خروجی: فهرست توصیه مرتب‌شده بر اساس شدت
//  همهٔ قواعد قابل توضیح‌اند (روی دادهٔ واقعی) — جعبهٔ سیاه نیستند.
// =====================================================================

export type Recommendation = {
  severity: "بالا" | "متوسط" | "کم";
  title: string;
  reason: string;
  action: string;
};

export type DossierInput = {
  events: {
    id: number; status: string; startDate: Date | null; endDate: Date | null;
    centerAdminConfirmDateTime: Date | null; centerTechConfirmDateTime: Date | null;
    operatorConfirmDateTime: Date | null; provinceSupervisorConfirmDateTime: Date | null;
    supervisorConfirmDateTime: Date | null;
    isEms: boolean; userTariff: number;
    psychology: { id: number }[];
    ems: { id: number; severity: string; dateTime: Date; hadPaymentStatus: string | null }[];
  }[];
  reserves: { id: number; date: Date }[];
  now: Date;
};

const DAY = 86400000;

export function buildRecommendations(input: DossierInput): Recommendation[] {
  const recs: Recommendation[] = [];
  const { events, reserves, now } = input;
  if (!events.length) {
    recs.push({
      severity: "کم",
      title: "متقاضی بدون سابقهٔ جلسه",
      reason: "هیچ جلسهٔ مشاوره‌ای برای این متقاضی ثبت نشده است.",
      action: "در صورت نیاز، رزرو وقت و ثبت اولین جلسه انجام شود.",
    });
    return recs;
  }

  const confirmed = events.filter((e) => e.status === "تایید نهایی");
  const pending = events.filter((e) => e.status.includes("در انتظار"));
  const rejected = events.filter((e) => e.status === "رد شده");

  // ۱) فاصلهٔ آخرین جلسه — پیگیری مراجع
  const lastSession = events
    .map((e) => e.startDate)
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => b.getTime() - a.getTime())[0];
  if (lastSession) {
    const days = Math.floor((now.getTime() - lastSession.getTime()) / DAY);
    if (days > 90) {
      recs.push({
        severity: days > 180 ? "بالا" : "متوسط",
        title: "پیگیری مراجع — قطع طولانی روند درمان",
        reason: `آخرین جلسه ${days} روز پیش برگزار شده است.`,
        action: "تماس پیگیری و بررسی دلیل قطع روند درمان؛ در صورت تمایل، رزرو وقت جدید.",
      });
    }
  }

  // ۲) مورد حاد اخیر
  const acute = events.flatMap((e) => e.ems);
  const acuteHigh = acute.filter((m) => m.severity === "بالا");
  const acuteRecent = acute.filter((m) => now.getTime() - m.dateTime.getTime() < 30 * DAY);
  if (acuteHigh.length) {
    recs.push({
      severity: "بالا",
      title: "مورد حاد با شدت بالا در پرونده",
      reason: `${acuteHigh.length} فرم مورد حاد (EMS) با شدت «بالا» ثبت شده${acuteRecent.length ? ` و ${acuteRecent.length} مورد در ۳۰ روز اخیر است` : ""}.`,
      action: "بررسی آخرین اقدامات، پیگیری وضعیت مراجع و در صورت نیاز ارجاع به روان‌پزشک.",
    });
  }

  // ۳) درخواست کمک مالی معلق
  const pendingPay = acute.filter((m) => m.hadPaymentStatus === "در انتظار بررسی");
  if (pendingPay.length) {
    const oldest = pendingPay.sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime())[0];
    const days = Math.floor((now.getTime() - oldest.dateTime.getTime()) / DAY);
    recs.push({
      severity: days > 30 ? "بالا" : "متوسط",
      title: "درخواست کمک مالی معلق",
      reason: `${pendingPay.length} درخواست کمک مالی در انتظار بررسی است (قدیمی‌ترین: ${days} روز).`,
      action: "ورود به بخش «موارد حاد» و نهایی‌سازی بررسی درخواست پرداخت.",
    });
  }

  // ۴) گیر کردن در زنجیرهٔ تایید
  for (const e of pending) {
    const lastConfirm = [e.centerAdminConfirmDateTime, e.centerTechConfirmDateTime, e.operatorConfirmDateTime, e.provinceSupervisorConfirmDateTime]
      .filter((d): d is Date => Boolean(d))
      .sort((a, b) => b.getTime() - a.getTime())[0];
    const anchor = lastConfirm ?? e.startDate;
    if (!anchor) continue;
    const days = Math.floor((now.getTime() - anchor.getTime()) / DAY);
    if (days >= 7) {
      recs.push({
        severity: days >= 14 ? "بالا" : "متوسط",
        title: "توقف طولانی در چرخهٔ تایید",
        reason: `جلسهٔ #${e.id} با وضعیت «${e.status}»، ${days} روز است که تایید بعدی ثبت نشده.`,
        action: "اطلاع به تاییدکنندهٔ بعدی یا ابطال و ثبت مجدد جلسه.",
      });
    }
  }

  // ۵) پروندهٔ روان‌شناختی ناقص
  const withoutPsy = confirmed.filter((e) => e.psychology.length === 0);
  if (withoutPsy.length >= 2) {
    recs.push({
      severity: "متوسط",
      title: "پروندهٔ بالینی ناقص",
      reason: `${withoutPsy.length} جلسهٔ تایید‌شده بدون فرم ارزیابی روان‌شناختی است.`,
      action: "تکمیل فرم ارزیابی (EventPsychology) برای جلسات مربوطه.",
    });
  }

  // ۶) الگوی رد شدن
  if (rejected.length >= 2) {
    recs.push({
      severity: "کم",
      title: "الگوی تکرار رد شدن جلسات",
      reason: `${rejected.length} جلسهٔ این متقاضی رد شده است.`,
      action: "بررسی دلایل رد در لاگ‌ها و اصلاح روند ثبت جلسه (خدمت/تعرفه/مرکز).",
    });
  }

  // ۷) رزرو بی‌نتیجه
  if (reserves.length >= 2 && confirmed.length === 0) {
    recs.push({
      severity: "کم",
      title: "رزروهای متعدد بدون تبدیل به جلسه",
      reason: `${reserves.length} رزرو ثبت شده اما هیچ جلسهٔ تایید‌شده‌ای وجود ندارد.`,
      action: "تماس پیگیری برای رفع موانع حضور (مسیر، هزینه، انگیزه).",
    });
  }

  // ۸) جلسهٔ بدون تاریخ پایان (احتمال ناقص بودن ثبت)
  const openSessions = events.filter((e) => e.startDate && !e.endDate && e.status !== "رد شده");
  if (openSessions.length) {
    recs.push({
      severity: "کم",
      title: "ثبت ناقص زمان جلسات",
      reason: `${openSessions.length} جلسه بدون تاریخ پایان ثبت شده است.`,
      action: "اصلاح اطلاعات جلسات در بخش جلسات مشاوره.",
    });
  }

  const order = { "بالا": 0, "متوسط": 1, "کم": 2 } as const;
  return recs.sort((a, b) => order[a.severity] - order[b.severity]);
}
