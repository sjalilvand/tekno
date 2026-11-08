import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail } from "@/lib/server";
import { monthLabel } from "@/lib/jalali";
import { normalizeDateInput } from "@/lib/jdate";

// =====================================================================
// موتور داشبوردهای مدیریتی — توصیفی / تحلیلی / تفسیری / کشف خطا / پیشنهادی
// همهٔ بخش‌ها مستقل محاسبه می‌شوند (settled) تا خطای یک بخش،
// کل داشبورد را نبندد؛ با داده‌های ناقص میراث PHP هم سازگار است.
// =====================================================================

const WEEK_NAMES = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"]; // getDay(): 0=Sunday

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);

  const now = new Date();

  // پارامترهای اختیاری فیلتر: from/to (شمسی یا میلادی) و centerId
  const sp = req.nextUrl.searchParams;
  const fromIso = normalizeDateInput(sp.get("from"));
  const winFrom = fromIso ? new Date(fromIso + "T00:00:00.000Z") : new Date(now.getTime() - 365 * 86400000);
  const winToIso = normalizeDateInput(sp.get("to"));
  const winTo = winToIso ? new Date(winToIso + "T23:59:59.999Z") : now;
  const centerId = Number(sp.get("centerId")) || null;
  const evWhere: any = {
    startDate: { gte: winFrom, lte: winTo, not: null },
    ...(centerId ? { centerId } : {}),
  };

  const yearAgo = winFrom;
  const d60 = new Date(winTo.getTime() - 60 * 86400000);
  const d14 = new Date(winTo.getTime() - 14 * 86400000);
  const d7 = new Date(winTo.getTime() - 7 * 86400000);

  async function settled<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      console.error("[bi/insights] section failed:", e?.message ?? e);
      return fallback;
    }
  }

  // ----------------------- محاسبات اصلی -----------------------
  const yearEvents = await settled(
    () =>
      db.event.findMany({
        where: evWhere,
        select: { startDate: true, status: true, serviceId: true, centerId: true, userId: true, userTariff: true, isEms: true },
        take: 200000,
      }),
    [] as { startDate: Date | null; status: string; serviceId: number; centerId: number; userId: number; userTariff: number; isEms: boolean }[]
  );

  const [
    statusDist, usersTotal, consultants, centersTotal,
    reserves365, repeatGroups, centers, services,
    noStartDate, noTopicConfirmed, zeroTariff, dupTracking, dupNid,
    futureConfirmed, stalePending, failedSms, orphanReserves, usersNoMobile,
  ] = await Promise.all([
    settled(() => db.event.groupBy({ by: ["status"], _count: true }), [] as { status: string | null; _count: number }[]),
    settled(() => db.user.count(), 0),
    settled(() => db.user.count({ where: { roles: { some: { role: { title: { in: ["مشاور", "روانپزشک"] } } } } } }), 0),
    settled(() => db.center.count({ where: { isEnabled: true } }), 0),
    settled(() => db.eventReserve.count({ where: { date: { gte: winFrom, lte: winTo }, ...(centerId ? { event: { centerId } } : {}) } }), 0),
    settled(
      () => db.event.groupBy({ by: ["userId"], where: { status: "تایید نهایی", ...evWhere }, _count: true }),
      [] as { userId: number; _count: number }[]
    ),
    settled(() => db.center.findMany({ select: { id: true, title: true } }), []),
    settled(() => db.service.findMany({ select: { id: true, short: true, name: true } }), []),
    settled(() => db.event.count({ where: { startDate: null } }), 0),
    settled(() => db.event.count({ where: { status: "تایید نهایی", topic: null } }), 0),
    settled(() => db.event.count({ where: { status: "تایید نهایی", userTariff: 0 } }), 0),
    settled(
      () => db.event.groupBy({ by: ["trackingCode"], where: { trackingCode: { not: null }, ...evWhere }, _count: true }),
      [] as { trackingCode: number | null; _count: number }[]
    ),
    settled(() => db.user.groupBy({ by: ["nid"], where: { nid: { gte: 0 } }, _count: true }), [] as { nid: bigint; _count: number }[]),
    settled(() => db.event.count({ where: { status: "تایید نهایی", startDate: { gt: new Date(now.getTime() + 2 * 86400000) } } }), 0),
    settled(() => db.event.count({ where: { status: { contains: "در انتظار" }, startDate: { lt: d14, not: null } } }), 0),
    settled(() => db.sms.count({ where: { status: "ناموفق", updateTime: { gte: new Date(now.getTime() - 90 * 86400000) } } }), 0),
    settled(() => db.eventReserve.count({ where: { event: { status: "رد شده" } } }), 0),
    settled(() => db.user.count({ where: { mobile: null } }), 0),
  ]);

  // ----------------------- سری‌های زمانی -----------------------
  const daily = new Map<string, { date: Date; count: number; income: number }>();
  for (let i = 59; i >= 0; i--) {
    const d = new Date(winTo.getFullYear(), winTo.getMonth(), winTo.getDate() - i);
    daily.set(d.toISOString().slice(0, 10), { date: d, count: 0, income: 0 });
  }
  const monthly = new Map<string, { count: number; income: number; sample: Date }>();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(winTo.getFullYear(), winTo.getMonth() - i, 1);
    monthly.set(`${d.getFullYear()}-${d.getMonth()}`, { count: 0, income: 0, sample: d });
  }
  const weekday = new Array(7).fill(0) as number[];
  const hourly = new Array(24).fill(0) as number[];
  let confirmed365 = 0, income365 = 0, ems365 = 0;

  for (const ev of yearEvents) {
    const dt = ev.startDate ? new Date(ev.startDate) : null;
    const confirmed = ev.status === "تایید نهایی";
    const income = ev.userTariff ?? 0;
    if (confirmed) {
      confirmed365++;
      income365 += income;
    }
    if (ev.isEms) ems365++;
    if (!dt) continue;
    const key = dt.toISOString().slice(0, 10);
    if (dt >= d60 && daily.has(key)) {
      const p = daily.get(key)!;
      p.count += 1;
      p.income += income;
    }
    const mk = `${dt.getFullYear()}-${dt.getMonth()}`;
    if (monthly.has(mk)) {
      const m = monthly.get(mk)!;
      m.count += 1;
      m.income += income;
    }
    if (confirmed) {
      weekday[dt.getDay()]++;
      hourly[dt.getHours()]++;
    }
  }

  const dailySeries = Array.from(daily.entries()).map(([k, v]) => ({ key: k, label: jShort(v.date), count: v.count, income: v.income }));
  const monthlySeries = Array.from(monthly.entries()).map(([k, v]) => ({ key: k, label: monthLabel(v.sample), count: v.count, income: v.income }));
  const weekdaySeries = WEEK_NAMES.map((name, i) => ({ name, count: weekday[i] }));
  const hourlySeries = hourly.map((count, h) => ({ h, label: `${String(h).padStart(2, "0")}:00`, count }));

  // ----------------------- روند -----------------------
  const thisMonth = monthlySeries[monthlySeries.length - 1]?.count ?? 0;
  const prevMonth = monthlySeries[monthlySeries.length - 2]?.count ?? 0;
  const monthPct = prevMonth > 0 ? Math.round(((thisMonth - prevMonth) / prevMonth) * 100) : 0;
  const weekEvents = (from: Date) => yearEvents.filter((e) => e.startDate && new Date(e.startDate) >= from).length;
  const thisWeek = weekEvents(d7);
  const prevWeek = weekEvents(d14) - thisWeek;
  const weekPct = prevWeek > 0 ? Math.round(((thisWeek - prevWeek) / prevWeek) * 100) : 0;

  // ----------------------- توزیع‌ها -----------------------
  const svcAgg = new Map<number, { value: number; income: number }>();
  for (const ev of yearEvents) {
    if (ev.status !== "تایید نهایی") continue;
    const a = svcAgg.get(ev.serviceId) ?? { value: 0, income: 0 };
    a.value++;
    a.income += ev.userTariff ?? 0;
    svcAgg.set(ev.serviceId, a);
  }
  const serviceStats = Array.from(svcAgg.entries())
    .map(([id, a]) => ({ name: services.find((s) => s.id === id)?.short || services.find((s) => s.id === id)?.name || "سایر", value: a.value, income: a.income }))
    .sort((x, y) => y.value - x.value)
    .slice(0, 10);

  const ctrAgg = new Map<number, { value: number; income: number }>();
  for (const ev of yearEvents) {
    if (ev.status !== "تایید نهایی") continue;
    const a = ctrAgg.get(ev.centerId) ?? { value: 0, income: 0 };
    a.value++;
    a.income += ev.userTariff ?? 0;
    ctrAgg.set(ev.centerId, a);
  }
  const centerStats = Array.from(ctrAgg.entries())
    .map(([id, a]) => ({ name: centers.find((c) => c.id === id)?.title ?? "نامشخص", value: a.value, income: a.income }))
    .sort((x, y) => y.value - x.value)
    .slice(0, 10);

  // بار مشاوران (groupBy سبک — بدون واکشی همهٔ جلسات)
  const consultantAgg = await settled(
    () =>
      db.event.groupBy({
        by: ["acceptorId"],
        where: { status: "تایید نهایی", ...evWhere, acceptorId: { not: null } },
        _count: true,
        _sum: { acceptorFee: true },
      }),
    [] as { acceptorId: number | null; _count: number; _sum: { acceptorFee: number | null } }[]
  );
  const consultantIds = consultantAgg.map((c) => c.acceptorId!).filter((x) => Boolean(x));
  const consultantUsers = await settled(
    () => db.user.findMany({ where: { id: { in: consultantIds } }, select: { id: true, name: true, family: true } }),
    [] as { id: number; name: string; family: string }[]
  );
  const consultantStats = consultantAgg
    .map((c) => {
      const u = consultantUsers.find((x) => x.id === c.acceptorId);
      return { name: u ? `${u.name} ${u.family}` : "نامشخص", sessions: c._count, income: c._sum.acceptorFee ?? 0 };
    })
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 10);

  // مراجع تکراری
  const repeatClients = repeatGroups.filter((g) => g._count >= 2).length;
  const newClients = repeatGroups.filter((g) => g._count === 1).length;
  const repeatRate = repeatGroups.length ? Math.round((repeatClients / repeatGroups.length) * 100) : 0;

  const conversion = {
    reserves: reserves365,
    confirmed: confirmed365,
    pct: reserves365 > 0 ? Math.min(100, Math.round((confirmed365 / reserves365) * 100)) : 0,
  };

  // ----------------------- کشف ناهنجاری (سری روزانه) -----------------------
  const active = dailySeries.filter((d) => d.count > 0);
  const mean = active.length ? active.reduce((s, d) => s + d.count, 0) / active.length : 0;
  const std = active.length ? Math.sqrt(active.reduce((s, d) => s + (d.count - mean) ** 2, 0) / active.length) : 0;
  const anomalies: { id: string; kind: string; severity: number; date: string; title: string; detail: string }[] = [];
  if (mean > 0 && std > 0) {
    for (const d of dailySeries) {
      const z = (d.count - mean) / std;
      if (z >= 2.5) {
        anomalies.push({ id: `spike-${d.key}`, kind: "spike", severity: z >= 4 ? 3 : 2, date: d.label, title: "جهش ناگهانی پذیرش", detail: `تعداد جلسات این روز ${Math.round(z)} انحراف معیار از میانگین بالاتر است (${d.count} جلسه در برابر میانگین ${Math.round(mean)}).` });
      } else if (z <= -2.5 && d.count === 0) {
        anomalies.push({ id: `drop-${d.key}`, kind: "drop", severity: 2, date: d.label, title: "روز بدون پذیرش", detail: `با وجود میانگین ${Math.round(mean)} جلسه در روزهای فعال، این روز هیچ جلسه‌ای ثبت نشده است.` });
      }
    }
  }
  anomalies.sort((a, b) => b.severity - a.severity);

  // ----------------------- سلامت داده -----------------------
  const dupTrackingCount = dupTracking.filter((g) => g._count > 1).length;
  const dupNidCount = dupNid.filter((g) => g._count > 1).length;
  const checks = [
    { id: "no-start", name: "جلسات بدون تاریخ شروع", ok: noStartDate === 0, count: noStartDate, hint: "این رکوردها در نمودارهای زمانی دیده نمی‌شوند.", route: "events" },
    { id: "no-topic", name: "جلسات تاییدشده بدون موضوع", ok: noTopicConfirmed === 0, count: noTopicConfirmed, hint: "موضوع جلسه برای گزارش‌های تحلیلی لازم است.", route: "events" },
    { id: "zero-tariff", name: "جلسات تاییدشده با تعرفهٔ صفر", ok: zeroTariff === 0, count: zeroTariff, hint: "یا خطای ثبت است یا خدمت رایگان — بررسی شود.", route: "events" },
    { id: "dup-tracking", name: "کد رهگیری تکراری", ok: dupTrackingCount === 0, count: dupTrackingCount, hint: "هر جلسه باید کد رهگیری یکتا داشته باشد.", route: "events" },
    { id: "dup-nid", name: "کد ملی تکراری بین کاربران", ok: dupNidCount === 0, count: dupNidCount, hint: "احتمال حساب تکراری برای یک نفر.", route: "users" },
    { id: "future-confirmed", name: "جلسهٔ تاییدشده با تاریخ آینده", ok: futureConfirmed === 0, count: futureConfirmed, hint: "تاریخ‌ب نخورد یا خطای ورود داده است.", route: "events" },
    { id: "stale-pending", name: "جلسهٔ بیش از ۱۴ روز معلق در تایید", ok: stalePending === 0, count: stalePending, hint: "زنجیرهٔ تایید متوقف مانده است.", route: "events" },
    { id: "failed-sms", name: "پیامک ناموفق (۹۰ روز اخیر)", ok: failedSms === 0, count: failedSms, hint: "اعداد/اپراتور/اعتبار پنل بررسی شود.", route: "sms" },
    { id: "orphan-reserve", name: "رزرو متصل به جلسهٔ ردشده", ok: orphanReserves === 0, count: orphanReserves, hint: "رزرو باید لغو یا منتقل شود.", route: "reserves" },
    { id: "no-mobile", name: "کاربران بدون شماره موبایل", ok: usersNoMobile === 0, count: usersNoMobile, hint: "امکان پیامک و پیگیری برای آن‌ها نیست.", route: "users" },
  ];
  const passed = checks.filter((c) => c.ok).length;
  const qualityScore = Math.round((passed / checks.length) * 100);

  // ----------------------- تفسیر (بینش‌ها) -----------------------
  const insights: { id: string; icon: string; tone: string; title: string; text: string }[] = [];
  const topService = serviceStats[0];
  const topCenter = centerStats[0];
  const peakDay = [...weekdaySeries].sort((a, b) => b.count - a.count)[0];
  const peakHour = [...hourlySeries].sort((a, b) => b.count - a.count)[0];
  const totalConfirmed = serviceStats.reduce((s, x) => s + x.value, 0);

  insights.push({
    id: "trend",
    icon: monthPct >= 0 ? "TrendingUp" : "TrendingDown",
    tone: monthPct >= 0 ? "positive" : "warning",
    title: monthPct >= 0 ? "روند صعودی پذیرش" : "روند نزولی پذیرش",
    text:
      prevMonth > 0
        ? `جلسات این ماه ${Math.abs(monthPct)}٪ ${monthPct >= 0 ? "بیشتر" : "کمتر"} از ماه گذشته است (${thisMonth} در برابر ${prevMonth}).`
        : `در ماه جاری ${thisMonth} جلسه ثبت شده و مقایسه با ماه قبل ممکن نیست.`,
  });
  if (topService && totalConfirmed > 0) {
    const share = Math.round((topService.value / totalConfirmed) * 100);
    insights.push({
      id: "service-share",
      icon: "Sparkles",
      tone: share > 45 ? "warning" : "info",
      title: `پرتقاضاترین خدمت: ${topService.name}`,
      text: `${share}٪ از جلسات تاییدشدهٔ یک سال اخیر مربوط به «${topService.name}» است${share > 45 ? " — تمرکز بالا می‌تواند در نبود این خدمت، درآمد مرکز را آسیب‌پذیر کند" : ""}.`,
    });
  }
  if (topCenter && totalConfirmed > 0) {
    const share = Math.round((topCenter.value / totalConfirmed) * 100);
    insights.push({
      id: "center-share",
      icon: "Building2",
      tone: "info",
      title: "تمرکز جغرافیایی خدمات",
      text: `مرکز «${topCenter.name}» با ${share}٪ از جلسات، پرکارترین مرکز است (درآمد ثبت‌شده: ${topCenter.income.toLocaleString("fa-IR")} ریال).`,
    });
  }
  if (peakDay && peakDay.count > 0) {
    insights.push({
      id: "peak-day",
      icon: "CalendarClock",
      tone: "info",
      title: "روز و ساعت اوج پذیرش",
      text: `بیشترین جلسات در روزهای «${peakDay.name}» ثبت می‌شود و ساعت اوج پذیرش ${peakHour.label} است — برای این بازه ظرفیت بیشتری در نظر بگیرید.`,
    });
  }
  if (repeatGroups.length > 0) {
    insights.push({
      id: "repeat",
      icon: "UserRoundCheck",
      tone: repeatRate >= 40 ? "positive" : "warning",
      title: "بازگشت مراجعان",
      text: `${repeatRate}٪ مراجعان یک سال اخیر بیش از یک جلسه داشته‌اند (${repeatClients} نفر بازگشته از ${repeatGroups.length} نفر). ${repeatRate >= 40 ? "نشانهٔ رضایت خوب است." : "برنامهٔ پیگیری بعد از جلسه می‌تواند این نرخ را بالا ببرد."}`,
    });
  }
  insights.push({
    id: "conversion",
    icon: "CalendarCheck",
    tone: conversion.pct >= 60 ? "positive" : "warning",
    title: "نرخ تبدیل رزرو به جلسه",
    text:
      conversion.reserves > 0
        ? `از ${conversion.reserves} رزروِ یک سال اخیر، ${conversion.confirmed} جلسه به تایید نهایی رسیده است (${conversion.pct}٪).`
        : "در یک سال اخیر رزروی ثبت نشده؛ امکان رزرو آنلاین را بررسی کنید.",
  });
  insights.push({
    id: "quality",
    icon: "ShieldCheck",
    tone: qualityScore >= 80 ? "positive" : qualityScore >= 50 ? "warning" : "danger",
    title: `سلامت داده‌ها: ${qualityScore} از ۱۰۰`,
    text: `${passed} از ${checks.length} کنترل کیفیت داده بی‌نقص است. ${qualityScore < 80 ? "بخش «کشف خطا» را برای فهرست موارد نیازمند اصلاح ببینید." : "کیفیت ثبت داده‌ها در سطح مطلوبی است."}`,
  });
  if (consultantStats.length >= 2) {
    const top = consultantStats[0];
    const bottom = consultantStats[consultantStats.length - 1];
    const ratio = bottom.sessions > 0 ? Math.round(top.sessions / bottom.sessions) : 0;
    insights.push({
      id: "load",
      icon: "Scale",
      tone: ratio > 4 ? "warning" : "info",
      title: "توزیع بار مشاوران",
      text: `پرکارترین مشاور (${top.name}) ${top.sessions} جلسه و کم‌بارترین (${bottom.name}) ${bottom.sessions} جلسه داشته‌اند${ratio > 4 ? ` — اختلاف ${ratio} برابری نشان از توزیع نامتوازن مراجعان دارد` : ""}.`,
    });
  }

  // ----------------------- پیشنهادها -----------------------
  const recommendations: { id: string; icon: string; tone: string; title: string; text: string; route?: string }[] = [];
  if (stalePending > 0) recommendations.push({ id: "rec-pending", icon: "Clock", tone: "danger", title: "پیگیری جلسات معلق", text: `${stalePending} جلسه بیش از دو هفته در وضعیت «در انتظار» مانده است — پیش از تجمیع گزارش ماهانه تکلیف آن‌ها روشن شود.`, route: "events" });
  if (failedSms > 0) recommendations.push({ id: "rec-sms", icon: "MessageSquareText", tone: "warning", title: "بررسی پیامک‌های ناموفق", text: `${failedSms} پیامک در ۹۰ روز اخیر ارسال نشده؛ ممکن است اطلاع‌رسانی رزرو و یادآوری جلسه مختل شده باشد.`, route: "sms" });
  if (noStartDate > 0) recommendations.push({ id: "rec-nodate", icon: "CalendarX", tone: "warning", title: "اصلاح جلسات بدون تاریخ", text: `${noStartDate} جلسه بدون تاریخ شروع ثبت شده و از تحلیل‌های زمانی حذف می‌شوند — تاریخ‌گذاری شود.`, route: "events" });
  if (dupNidCount > 0) recommendations.push({ id: "rec-dupnid", icon: "Users", tone: "warning", title: "ادغام حساب‌های تکراری", text: "برخی کاربران با یک کد ملی چند حساب دارند؛ آمار مراجعان را بیش از واقع نشان می‌دهد.", route: "users" });
  if (conversion.reserves > 0 && conversion.pct < 60) recommendations.push({ id: "rec-conv", icon: "TrendingDown", tone: "warning", title: "بهبود نرخ تبدیل رزرو", text: `تنها ${conversion.pct}٪ رزروها به جلسهٔ قطعی رسیده — تماس پیگیری ۲۴ ساعته پس از رزرو پیشنهاد می‌شود.`, route: "reserves" });
  if (repeatRate > 0 && repeatRate < 30) recommendations.push({ id: "rec-repeat", icon: "HeartHandshake", tone: "info", title: "برنامهٔ حفظ مراجع", text: `نرخ بازگشت مراجعان ${repeatRate}٪ است؛ ارسال پیامک پیگیری پس از جلسه و پیشنهاد دورهٔ بعدی، این نرخ را افزایش می‌دهد.` });
  if (peakHour && mean > 0 && peakHour.count > mean * 2) recommendations.push({ id: "rec-capacity", icon: "Clock", tone: "info", title: "ظرفیت‌گذاری ساعات اوج", text: `ساعت ${peakHour.label} اوج پذیرش است؛ پیشنهاد می‌شود مشاور جانشین در این بازه مستقر شود.` });
  if (qualityScore < 80) recommendations.push({ id: "rec-quality", icon: "ShieldAlert", tone: "danger", title: "ارتقای کیفیت داده", text: `امتیاز سلامت داده‌ها ${qualityScore} است؛ اصلاح موارد بخش «کشف خطا» دقت همهٔ گزارش‌ها را بالا می‌برد.` });
  if (recommendations.length === 0) recommendations.push({ id: "rec-ok", icon: "CheckCircle2", tone: "positive", title: "وضعیت مطلوب", text: "هیچ اقدام فوری‌ای یافت نشد؛ داشبوردها را به‌صورت هفتگی پایش کنید." });

  return ok({
    generatedAt: now.toISOString(),
    window: { from: winFrom.toISOString(), to: winTo.toISOString(), centerId },
    kpis: {
      events365: yearEvents.length,
      confirmed365,
      pending: statusDist.filter((s) => (s.status ?? "").includes("در انتظار")).reduce((s, x) => s + x._count, 0),
      rejected: statusDist.find((s) => s.status === "رد شده")?._count ?? 0,
      undone: statusDist.find((s) => s.status === "ناتمام")?._count ?? 0,
      usersTotal,
      consultants,
      centersTotal,
      income365,
      ems365,
    },
    daily: dailySeries,
    monthly: monthlySeries,
    weekday: weekdaySeries,
    hourly: hourlySeries,
    serviceStats,
    centerStats,
    consultantStats,
    statusDist: statusDist.map((s) => ({ name: s.status ?? "نامشخص", value: s._count })),
    repeat: { newClients, repeatClients, repeatRate },
    conversion,
    trend: { monthPct, weekPct, thisMonth, prevMonth, thisWeek, prevWeek },
    insights,
    anomalies: anomalies.slice(0, 8),
    quality: { score: qualityScore, checks },
    recommendations,
  });
}

/** برچسب کوتاه شمسی برای نمودار روزانه: ۱۶ آبان */
function jShort(d: Date): string {
  try {
    return new Intl.DateTimeFormat("fa-IR-u-ca-persian", { month: "short", day: "numeric" }).format(d);
  } catch {
    return d.toISOString().slice(5, 10);
  }
}
