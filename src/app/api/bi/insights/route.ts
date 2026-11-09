// =====================================================================
// موتور تحلیل و کشف خطا — بازنویسی کامل برای سرعت
// ---------------------------------------------------------------
// نسخهٔ قبلی تا ۲۰۰٬۰۰۰ ردیف را در JS پردازش می‌کرد (بار سنگین روی ۴.۵ میلیون ردیف).
// اکنون همهٔ تجمیع‌ها با GROUP BY داخل دیتابیس انجام می‌شود:
//   • روند روزانه/ماهانه (شمسی) از bucket روزانهٔ SQL
//   • روز هفته/ساعت از توابع تاریخ همان دیتابیس
//   • کیفیت داده با شمارش‌های مستقیم SQL
// خروجی دقیقاً همان شکل قبلی است تا نمای bi بدون تغییر کار کند.
// ---------------------------------------------------------------
// نسخهٔ ۶.۹ — اسکوپ داده: مشاور فقط جلسات خودش را می‌بیند
// (به‌عنوان پذیرنده یا ناظر)؛ مدیر و کاربران با دسترسی کل همهٔ داده را می‌بینند.
// =====================================================================
import { NextRequest } from "next/server";
import { ok, fail, resolveAccess } from "@/lib/server";
import {
  cacheGet, cacheSet, rawRows, rawScalar, sqlLocalDate, sqlLocalHour, parseWindow, jalaliMonthly,
  windowKey, dbProvider, num,
} from "@/lib/analytics";
import { jMonths } from "@/lib/jdate";
import { faNum } from "@/lib/jalali";

export const dynamic = "force-dynamic";

const n = num;

const WEEK_FA = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"]; // getUTCDay order

function weekdayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return WEEK_FA[d.getUTCDay()];
}

/** تاریخِ امروز منهای n روز — قابل حمل بین دو دیتابیس */
function sqlDaysAgo(nDays: number): string {
  if (dbProvider() === "mysql") return `DATE(DATE_SUB(NOW(), INTERVAL ${nDays} DAY))`;
  return `DATE('now', '-${nDays} days')`;
}

export async function GET(req: NextRequest) {
  const acc = await resolveAccess(req);
  if (!acc) return fail("UNAUTHORIZED", 401);
  // اسکوپ مشاور — فقط جلسات خودش (پذیرش‌شده یا ناظر)
  const counselorId = acc.seeAllData ? null : acc.uid;
  const scoped = Boolean(counselorId);
  const sp = req.nextUrl.searchParams;
  const centerIdRaw = sp.get("centerId");
  const centerId = centerIdRaw ? Number(centerIdRaw) : null;
  const w = parseWindow(sp.get("from"), sp.get("to"));

  const ck = `insights:${windowKey(w, { centerId, c: scoped ? counselorId : "all" })}`;
  const hit = cacheGet<Record<string, unknown>>(ck);
  if (hit) return ok({ ...hit, cached: true });

  try {
    const dailyDate = sqlLocalDate("e.`startDate`");
    const hourlyDate = sqlLocalHour("e.`startDate`");

    // شرط اسکوپ مشاور برای همهٔ کوئری‌های جلسه‌محور
    const SCOPE = scoped ? " AND (e.`acceptorId` = ? OR e.`supervisorId` = ?)" : "";
    const SA = scoped ? [counselorId, counselorId] : [];

    const evArgs: unknown[] = [...SA];
    let evWhere = " WHERE 1=1";
    if (scoped) { evWhere += " AND (e.`acceptorId` = ? OR e.`supervisorId` = ?)"; }
    if (centerId) { evWhere += " AND e.`centerId` = ?"; evArgs.push(centerId); }
    if (w.fromIso) { evWhere += ` AND ${dailyDate} >= ?`; evArgs.push(w.fromIso); }
    if (w.toIso) { evWhere += ` AND ${dailyDate} <= ?`; evArgs.push(w.toIso); }
    const W = evWhere;
    const A = evArgs;

    // ---------------- شمارش‌های پایه — یک کوئری برای همهٔ KPIها ----------------
    const [baseRows, pendingAll, rejectedAll, usersTotal, centersTotal, reserves] =
      await Promise.all([
        rawRows(
          `SELECT
            COUNT(*) AS eventsWin,
            SUM(CASE WHEN e.\`status\` = 'تایید نهایی' THEN 1 ELSE 0 END) AS confirmedWin,
            SUM(CASE WHEN e.\`endDate\` IS NULL THEN 1 ELSE 0 END) AS undoneWin,
            SUM(CASE WHEN e.\`isEms\` = 1 THEN 1 ELSE 0 END) AS emsWin,
            SUM(e.\`userTariff\`) AS incomeWin,
            COUNT(DISTINCT CASE WHEN e.\`acceptorId\` > 0 THEN e.\`acceptorId\` END) AS consultants
          FROM \`Events\` e${W}`,
          A,
        ),
        rawScalar(`SELECT COUNT(*) AS c FROM \`Events\` e WHERE e.\`status\` LIKE 'در انتظار%'${SCOPE}`, SA),
        rawScalar(`SELECT COUNT(*) AS c FROM \`Events\` e WHERE e.\`status\` = 'رد شده'${SCOPE}`, SA),
        scoped
          ? rawScalar(`SELECT COUNT(DISTINCT \`userId\`) AS c FROM \`Events\` WHERE \`acceptorId\` = ? OR \`supervisorId\` = ?`, SA)
          : rawScalar(`SELECT COUNT(*) AS c FROM \`Users\``),
        scoped
          ? rawScalar(`SELECT COUNT(DISTINCT \`centerId\`) AS c FROM \`Events\` WHERE \`acceptorId\` = ? OR \`supervisorId\` = ?`, SA)
          : rawScalar(`SELECT COUNT(*) AS c FROM \`Centers\``),
        scoped
          ? rawScalar(`SELECT COUNT(*) AS c FROM \`EventReserves\` r WHERE r.\`eventId\` IN (SELECT \`id\` FROM \`Events\` WHERE \`acceptorId\` = ? OR \`supervisorId\` = ?${centerId ? " AND \`centerId\` = ?" : ""})`, [...SA, ...(centerId ? [centerId] : [])])
          : rawScalar(`SELECT COUNT(*) AS c FROM \`EventReserves\` r${centerId ? " WHERE r.\`eventId\` IN (SELECT \`id\` FROM \`Events\` WHERE \`centerId\` = ?)" : ""}`, centerId ? [centerId] : []),
      ]);
    const base = baseRows[0] ?? {};
    const eventsWin = n(base.eventsWin);
    const confirmedWin = n(base.confirmedWin);
    const undoneWin = n(base.undoneWin);
    const emsWin = n(base.emsWin);
    const incomeWin = n(base.incomeWin);
    const consultants = n(base.consultants);

    // ---------------- سری‌های روزانه/ماهانه ----------------
    const [dailyRows, hourlyRows] = await Promise.all([
      rawRows(`SELECT ${dailyDate} AS d, COUNT(*) AS c, SUM(e.\`userTariff\`) AS income FROM \`Events\` e${W} AND e.\`startDate\` IS NOT NULL GROUP BY ${dailyDate} ORDER BY 1`, A),
      rawRows(`SELECT ${hourlyDate} AS h, COUNT(*) AS c FROM \`Events\` e${W} AND e.\`startDate\` IS NOT NULL GROUP BY ${hourlyDate} ORDER BY 1`, A),
    ]);
    const daily = dailyRows.map((r: Record<string, unknown>) => {
      const d = String(r.d ?? "").slice(0, 10);
      return { key: d, label: d, count: n(r.c), income: n(r.income) };
    });
    const dailyTail = daily.slice(-60);
    const monthsAll = jalaliMonthly(dailyRows.map((r: Record<string, unknown>) => ({ d: String(r.d ?? "").slice(0, 10), c: n(r.c), extra: n(r.income) })));
    const monthly = monthsAll.slice(-12).map((m) => ({ key: m.key, label: m.label, count: m.count, income: m.extra }));

    // روز هفته از ردیف‌های روزانه (دقیق و بدون تکرار SQL)
    const weekAgg = new Map<string, number>();
    for (const d of daily) {
      const name = weekdayOf(d.key);
      weekAgg.set(name, (weekAgg.get(name) ?? 0) + d.count);
    }
    const weekday = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "پنجشنبه", "جمعه"].map((name) => ({ name, count: weekAgg.get(name) ?? 0 }));
    const hourly = Array.from({ length: 24 }, (_, h) => ({ h, label: `${String(h).padStart(2, "0")}:00`, count: 0 }));
    for (const r of hourlyRows as Record<string, unknown>[]) {
      const h = n(r.h);
      if (h >= 0 && h < 24) hourly[h].count = n(r.c);
    }
    const hourlyBusy = hourly.filter((x) => x.count > 0);

    // ---------------- تفکیک‌ها ----------------
    const [serviceRows, centerRows, consultantRows, statusRows] = await Promise.all([
      rawRows(`SELECT s.\`name\` AS n, COUNT(*) AS c, SUM(e.\`userTariff\`) AS inc FROM \`Events\` e LEFT JOIN \`Services\` s ON e.\`serviceId\` = s.\`id\`${W} GROUP BY s.\`name\` ORDER BY c DESC`, A),
      rawRows(`SELECT c.\`title\` AS n, COUNT(*) AS c, SUM(e.\`userTariff\`) AS inc FROM \`Events\` e LEFT JOIN \`Centers\` c ON e.\`centerId\` = c.\`id\`${W} GROUP BY c.\`title\` ORDER BY c DESC`, A),
      rawRows(`SELECT u.\`name\` AS n, u.\`family\` AS f, COUNT(*) AS c, SUM(e.\`acceptorFee\`) AS inc FROM \`Events\` e LEFT JOIN \`Users\` u ON e.\`acceptorId\` = u.\`id\`${W} AND e.\`acceptorId\` > 0 GROUP BY u.\`id\`, u.\`name\`, u.\`family\` ORDER BY c DESC`, A),
      rawRows(`SELECT e.\`status\` AS s, COUNT(*) AS c FROM \`Events\` e${W} GROUP BY e.\`status\``, A),
    ]);

    // مراجعان تکرارشونده — داخل دیتابیس (اسکوپ‌شده)
    const repeatConds = ["e.\`status\` = 'تایید نهایی'"];
    const repeatArgs: unknown[] = [...SA];
    if (scoped) { repeatConds.push("(e.\`acceptorId\` = ? OR e.\`supervisorId\` = ?)"); }
    if (centerId) { repeatConds.push("e.\`centerId\` = ?"); repeatArgs.push(centerId); }
    const RC = repeatConds.join(" AND ");
    const [repeatClients, onceClients] = await Promise.all([
      rawScalar(`SELECT COUNT(*) AS c FROM (SELECT e.\`userId\` FROM \`Events\` e WHERE ${RC} GROUP BY e.\`userId\` HAVING COUNT(*) > 1) t`, repeatArgs),
      rawScalar(`SELECT COUNT(*) AS c FROM (SELECT e.\`userId\` FROM \`Events\` e WHERE ${RC} GROUP BY e.\`userId\` HAVING COUNT(*) = 1) t`, repeatArgs),
    ]);

    // ---------------- کیفیت داده ----------------
    // در اسکوپ مشاور: چک‌های جلسه‌محور اسکوپ می‌شوند؛ چک‌های سیستمی (کد ملی تکراری، پیامک، لجستیک) خنثی می‌شوند
    const EV_COND = scoped ? "(e.\`acceptorId\` = ? OR e.\`supervisorId\` = ?) AND " : "";
    const EV_ARGS = SA;
    const [noStart, zeroTariff, dupTrackingRaw, dupNidRaw, futureStart, stalePending, failedSms, orphanReserves, noMobile] =
      await Promise.all([
        rawScalar(`SELECT COUNT(*) AS c FROM \`Events\` e WHERE ${EV_COND}e.\`startDate\` IS NULL`, EV_ARGS),
        rawScalar(`SELECT COUNT(*) AS c FROM \`Events\` e WHERE ${EV_COND}e.\`status\` = 'تایید نهایی' AND e.\`userTariff\` = 0`, EV_ARGS),
        scoped ? Promise.resolve(0) : rawScalar(`SELECT COUNT(*) AS c FROM (SELECT \`trackingCode\` FROM \`Events\` WHERE \`trackingCode\` IS NOT NULL GROUP BY \`trackingCode\` HAVING COUNT(*) > 1) t`),
        scoped ? Promise.resolve(0) : rawScalar(`SELECT COUNT(*) AS c FROM (SELECT \`nid\` FROM \`Users\` GROUP BY \`nid\` HAVING COUNT(*) > 1) t`),
        rawScalar(`SELECT COUNT(*) AS c FROM \`Events\` e WHERE ${EV_COND}e.\`startDate\` IS NOT NULL AND ${dailyDate} > ${dbProvider() === "mysql" ? "CURDATE()" : "DATE('now', '+210 minutes')"}`, EV_ARGS),
        rawScalar(`SELECT COUNT(*) AS c FROM \`Events\` e WHERE ${EV_COND}e.\`endDate\` IS NULL AND e.\`startDate\` IS NOT NULL AND ${dailyDate} < ${sqlDaysAgo(14)}`, EV_ARGS),
        scoped ? Promise.resolve(0) : rawScalar(`SELECT COUNT(*) AS c FROM \`SMS\` WHERE \`status\` = 'ناموفق' AND \`createTime\` IS NOT NULL AND ${sqlLocalDate("\`createTime\`")} >= ${sqlDaysAgo(90)}`),
        scoped ? Promise.resolve(0) : rawScalar(`SELECT COUNT(*) AS c FROM \`EventReserves\` r WHERE r.\`eventId\` NOT IN (SELECT \`id\` FROM \`Events\`)`),
        scoped ? Promise.resolve(0) : rawScalar(`SELECT COUNT(*) AS c FROM \`Users\` WHERE \`mobile\` IS NULL OR \`mobile\` = 0`),
      ]);
    // ردیف‌های واقعی کدهای تکراری (برای نمایش تعداد ردیف درگیر)
    const dupTracking = !scoped && dupTrackingRaw ? await rawScalar(`SELECT COUNT(*) AS c FROM \`Events\` WHERE \`trackingCode\` IN (SELECT \`trackingCode\` FROM \`Events\` WHERE \`trackingCode\` IS NOT NULL GROUP BY \`trackingCode\` HAVING COUNT(*) > 1)`) : 0;
    const dupNid = !scoped && dupNidRaw ? await rawScalar(`SELECT COUNT(*) AS c FROM \`Users\` WHERE \`nid\` IN (SELECT \`nid\` FROM \`Users\` GROUP BY \`nid\` HAVING COUNT(*) > 1)`) : 0;

    const checks = [
      { id: "no_start", name: "جلسات بدون تاریخ شروع", ok: noStart === 0, count: noStart, hint: "جلسه‌ای که تاریخ شروع ندارد قابل تحلیل زمانی نیست.", route: "events" },
      { id: "zero_tariff", name: "جلسهٔ تاییدشده با تعرفه صفر", ok: zeroTariff === 0, count: zeroTariff, hint: "تعرفهٔ صفر در جلسهٔ تاییدشده یعنی خطای مالی.", route: "finance" },
      { id: "dup_tracking", name: "کد رهگیری تکراری", ok: dupTracking === 0, count: dupTracking, hint: "در دادهٔ legacy کد رهگیری مشترک رخ می‌دهد (مثل 0).", route: "events" },
      { id: "dup_nid", name: "کد ملی تکراری بین کاربران", ok: dupNid === 0, count: dupNid, hint: "دو کاربر با یک کد ملی در شناسایی مراجع تداخل می‌سازد.", route: "users" },
      { id: "future_start", name: "تاریخ شروع در آینده", ok: futureStart === 0, count: futureStart, hint: "تاریخ آینده یعنی خطای ثبت.", route: "events" },
      { id: "stale_pending", name: "جلسهٔ بیش از ۱۴ روز در انتظار", ok: stalePending === 0, count: stalePending, hint: "روند تایید چندمرحله‌ای باید سرعت گرفته شود.", route: "events" },
      { id: "failed_sms", name: "پیامک ناموفق ۹۰ روز اخیر", ok: failedSms === 0, count: failedSms, hint: "وضعیت پنل پیامک یا شماره‌ها بررسی شود.", route: "sms" },
      { id: "orphan_reserves", name: "رزرو بدون جلسهٔ والد", ok: orphanReserves === 0, count: orphanReserves, hint: "دادهٔ یتیم از انتقال‌های ناقص قبلی.", route: "reserves" },
      { id: "no_mobile", name: "کاربران بدون شمارهٔ موبایل", ok: noMobile === 0, count: noMobile, hint: "بدون موبایل، پیامک اطلاع‌رسانی ارسال نمی‌شود.", route: "users" },
    ];
    const okChecks = checks.filter((c) => c.ok).length;
    const score = Math.round((okChecks * 100) / checks.length);

    // ---------------- کشف ناهنجاری (Z-score) ----------------
    const anomalies: { id: string; kind: string; severity: number; date: string; title: string; detail: string }[] = [];
    {
      const win = daily.slice(-60);
      for (let i = 14; i < win.length; i++) {
        const hist = win.slice(Math.max(0, i - 40), i).map((x) => x.count);
        const mean = hist.reduce((s, v) => s + v, 0) / (hist.length || 1);
        const sd = Math.sqrt(hist.reduce((s, v) => s + (v - mean) ** 2, 0) / (hist.length || 1));
        if (sd < 1) continue;
        const z = (win[i].count - mean) / sd;
        if (Math.abs(z) >= 2.5) {
          anomalies.push({
            id: `anom-${win[i].key}`, kind: z > 0 ? "spike" : "drop", severity: Math.round(Math.abs(z) * 10) / 10,
            date: win[i].key, title: z > 0 ? "افزایش ناگهانی جلسات" : "کاهش ناگهانی جلسات",
            detail: `${faNum(String(win[i].count))} جلسه در مقابل میانگین ${faNum(String(Math.round(mean)))} — انحراف ${faNum(String(Math.abs(z).toFixed(1)))} انحراف معیار`,
          });
        }
      }
      anomalies.sort((a, b) => b.severity - a.severity);
    }

    // ---------------- روند دوره‌ای ----------------
    const last7 = daily.slice(-7).reduce((s, d) => s + d.count, 0);
    const prev7 = daily.slice(-14, -7).reduce((s, d) => s + d.count, 0);
    const thisMonth = monthsAll.length ? monthsAll[monthsAll.length - 1].count : 0;
    const prevMonth = monthsAll.length > 1 ? monthsAll[monthsAll.length - 2].count : 0;
    const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) * 1000) / b) / 10 : 0);

    // ---------------- بینش‌ها ----------------
    const insights: { id: string; icon: string; tone: string; title: string; text: string }[] = [];
    const doneRate = eventsWin ? Math.round((confirmedWin * 1000) / eventsWin) / 10 : 0;
    insights.push({
      id: "confirm-rate", icon: "CheckCircle2", tone: doneRate >= 70 ? "positive" : "warning",
      title: `نرخ تایید نهایی ${faNum(String(doneRate))}٪ است`,
      text: `از ${faNum(eventsWin)} جلسهٔ این بازه، ${faNum(confirmedWin)} جلسه تایید نهایی شده‌اند. زنجیرهٔ تایید ۵ مرحله‌ای گلوگاه اصلی صف است.`,
    });
    const topService = serviceRows[0] as Record<string, unknown> | undefined;
    if (topService) {
      insights.push({
        id: "top-service", icon: "Sparkles", tone: "info",
        title: `پرتقاضاترین خدمت: «${String(topService.n ?? "نامشخص")}»`,
        text: `این خدمت با ${faNum(n(topService.c))} جلسه بیشترین سهم تقاضا را دارد؛ برنامه‌ریزی ظرفیت مشاوران روی همین خدمت اثر مستقیم دارد.`,
      });
    }
    if (stalePending > 0) {
      insights.push({
        id: "stale", icon: "Clock", tone: "danger",
        title: `${faNum(stalePending)} جلسه بیش از ۱۴ روز در انتظار تایید است`,
        text: "این حجم از تایید معطل، تجربهٔ مراجع و تسویهٔ مشاوران را به تعویق می‌اندازد؛ اولویت اول بهبود فرایند است.",
      });
    }
    const repeatRate = (repeatClients + onceClients) ? Math.round((repeatClients * 1000) / (repeatClients + onceClients)) / 10 : 0;
    insights.push({
      id: "repeat", icon: "Repeat2", tone: repeatRate >= 40 ? "positive" : "warning",
      title: `${faNum(String(repeatRate))}٪ مراجعان تکرار مراجعه داشته‌اند`,
      text: `${faNum(repeatClients)} مراجع بیش از یک جلسه تاییدشده داشته‌اند؛ نرخ بازگشت بالاتر از ۴۰٪ نشانهٔ رضایت است.`,
    });
    const money = incomeWin;
    insights.push({
      id: "income", icon: "Scale", tone: money > 0 ? "positive" : "info",
      title: `درآمد ثبت‌شدهٔ بازه: ${faNum(money)} ریال`,
      text: `میانگین تعرفهٔ هر جلسه ${faNum(eventsWin ? Math.round(money / eventsWin) : 0)} ریال است.`,
    });

    // ---------------- پیشنهادها ----------------
    const recommendations: { id: string; icon: string; tone: string; title: string; text: string; route?: string }[] = [];
    if (stalePending > 1000) recommendations.push({ id: "rec-stale", icon: "CalendarCheck", tone: "danger", title: "گلوگاه تایید را باز کنید", text: `${faNum(stalePending)} جلسه معطل مانده‌اند؛ نقش‌های مدیر مرکز و مسئول فنی را توانمندتر کنید یا تایید خودکار زمان‌بندی بگذارید.`, route: "events" });
    if (failedSms > 0) recommendations.push({ id: "rec-sms", icon: "MessageSquareText", tone: "warning", title: "صف پیامک را پایش کنید", text: `${faNum(failedSms)} پیامک در ۹۰ روز اخیر ناموفق بوده است؛ اعتبار پنل و الگوی شماره‌ها را بررسی کنید.`, route: "integrations" });
    if (noStart > 0) recommendations.push({ id: "rec-start", icon: "CalendarX", tone: "warning", title: "جلسات بدون تاریخ شروع را اصلاح کنید", text: "بدون تاریخ شروع، تحلیل روند دقیق نیست؛ از گزارش «جلسات بدون تاریخ شروع» فهرست را بگیرید.", route: "reports" });
    if (score < 100) recommendations.push({ id: "rec-quality", icon: "ShieldCheck", tone: "info", title: `امتیاز سلامت داده ${faNum(String(score))} از ۱۰۰`, text: "با پاکسازی موارد علامت‌خورده، اعتبار گزارش‌های مدیریتی بالا می‌رود.", route: "bi" });
    if (!recommendations.length) recommendations.push({ id: "rec-ok", icon: "Lightbulb", tone: "positive", title: "سامانه در وضعیت سالم است", text: "ناهنجاری ساختاری خاصی یافت نشد؛ می‌توانید تمرکز را روی رشد نرخ بازگشت مراجعان بگذارید." });

    const payload = {
      generatedAt: new Date().toISOString(),
      window: { from: w.fromIso ?? daily[0]?.key ?? "", to: w.toIso ?? daily[daily.length - 1]?.key ?? "", centerId },
      kpis: {
        events365: eventsWin, confirmed365: confirmedWin, pending: pendingAll, rejected: rejectedAll,
        undone: undoneWin, usersTotal, consultants, centersTotal, income365: incomeWin, ems365: emsWin,
      },
      daily: dailyTail,
      monthly,
      weekday,
      hourly: hourlyBusy,
      serviceStats: serviceRows.slice(0, 10).map((r: Record<string, unknown>) => ({ name: String(r.n ?? "نامشخص"), value: n(r.c), income: n(r.inc) })),
      centerStats: centerRows.slice(0, 10).map((r: Record<string, unknown>) => ({ name: String(r.n ?? "نامشخص"), value: n(r.c), income: n(r.inc) })),
      consultantStats: consultantRows.slice(0, 12).map((r: Record<string, unknown>) => ({ name: `${String(r.n ?? "")} ${String(r.f ?? "")}`.trim() || "نامشخص", sessions: n(r.c), income: n(r.inc) })),
      statusDist: statusRows.map((r: Record<string, unknown>) => ({ name: String(r.s ?? "نامشخص"), value: n(r.c) })),
      repeat: { newClients: onceClients, repeatClients, repeatRate },
      conversion: { reserves, confirmed: confirmedWin, pct: reserves ? Math.round((confirmedWin * 100) / reserves) : 0 },
      trend: { monthPct: pct(thisMonth, prevMonth), weekPct: pct(last7, prev7), thisMonth, prevMonth, thisWeek: last7, prevWeek: prev7 },
      insights,
      anomalies: anomalies.slice(0, 10),
      quality: { score, checks },
      recommendations,
      scoped,
      scopeName: acc.seeAllData ? null : `${acc.user.name ?? ""} ${acc.user.family ?? ""}`.trim(),
    };
    cacheSet(ck, payload);
    return ok(payload);
  } catch (e) {
    console.error("insights route error:", e);
    return fail("خطا در محاسبهٔ تحلیل‌ها", 500);
  }
}
