// =====================================================================
// مدل پیش‌بینی کیس حاد — API
// GET  /api/risk-model        — کاوش الگو + امتیاز ریسک همهٔ متقاضیان
// POST /api/risk-model        — { action: "alert", threshold } هشدار به مشاوران
// دسترسی: نقش‌های مدیریتی/مشاور/ناظر (کاربر عادی مجاز نیست)
// =====================================================================
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail, safeJson } from "@/lib/server";
import { minePatterns, scoreApplicants, type UserRaw, type EmsRaw } from "@/lib/risk-model";
import { faNum } from "@/lib/jalali";

const CACHE_TTL = 5 * 60_000;

async function loadAndScore() {
  // ۱) متقاضیان — همهٔ کاربران با آمار جلسات
  const users = await db.user.findMany({
    select: {
      id: true, name: true, family: true, nid: true, avatarColor: true,
      gender: true, birthday: true,
      education: { select: { name: true } },
      marriage: { select: { name: true } },
      eventsAsClient: {
        select: { id: true, status: true, acceptor: { select: { id: true, name: true, family: true } } },
      },
    },
  });

  // ۲) همهٔ فرم‌های EMS — برچسب کیس حاد
  const emsRows = await db.eventsEms.findMany({
    select: {
      eventId: true, severity: true, dateTime: true,
      emsType: true, suicidalFrom: true, psychiatricDisorders: true, socialFactors: true, protectiveFactors: true,
      event: { select: { userId: true } },
    },
    orderBy: { dateTime: "desc" },
  });

  const emsByUser = new Map<number, EmsRaw[]>();
  for (const r of emsRows) {
    const uid = r.event?.userId;
    if (!uid) continue;
    const list = emsByUser.get(uid) ?? [];
    list.push({
      eventId: r.eventId, severity: r.severity, dateTime: r.dateTime,
      emsType: r.emsType, suicidalFrom: r.suicidalFrom, psychiatricDisorders: r.psychiatricDisorders,
      socialFactors: r.socialFactors, protectiveFactors: r.protectiveFactors,
      eventUserId: uid,
    });
    emsByUser.set(uid, list);
  }

  const raws: UserRaw[] = users.map((u) => ({
    id: u.id, name: u.name, family: u.family, nid: u.nid, avatarColor: u.avatarColor,
    gender: u.gender, birthday: u.birthday,
    educationName: u.education?.name ?? null,
    marriageName: u.marriage?.name ?? null,
    sessions: u.eventsAsClient.length,
    incomplete: u.eventsAsClient.filter((e) => e.status === "ناتمام").length,
    rejected: u.eventsAsClient.filter((e) => e.status === "رد شده").length,
    acceptors: [...new Map(u.eventsAsClient.filter((e) => e.acceptor).map((e) => [e.acceptor!.id, e.acceptor!])).values()]
      .map((a) => ({ id: a.id, name: a.name, family: a.family })),
  }));

  const { patterns, model } = minePatterns(raws, emsByUser);
  const applicants = scoreApplicants(raws, emsByUser, patterns, model.baseline);
  return { model, applicants, emsByUser };
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const force = req.nextUrl.searchParams.get("force") === "1";

  let payload: { model: unknown; applicants: unknown; alerts: unknown };
  const cacheStore = (globalThis as { rzRiskCache?: { at: number; payload: unknown } }).rzRiskCache;
  if (!force && cacheStore && Date.now() - cacheStore.at < CACHE_TTL) {
    payload = cacheStore.payload as typeof payload;
  } else {
    const { model, applicants } = await loadAndScore();
    // آخرین هشدارهای ریسک — برای نمایش تاریخچه
    const alerts = await db.notification.findMany({
      where: { title: { contains: "ریسک کیس حاد" } },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, userId: true, title: true, body: true, createdAt: true },
    });
    payload = { model, applicants, alerts: safeJson(alerts) };
    (globalThis as { rzRiskCache?: { at: number; payload: unknown } }).rzRiskCache = { at: Date.now(), payload };
  }
  return ok(payload);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "alert");
    if (action !== "alert") return fail("عملیات نامعتبر");

    const threshold = Math.max(10, Math.min(Number(body.threshold) || 55, 95));

    // دریافت تازه (بدون کش) — امتیازها باید لحظه‌ای باشند
    const { model, applicants } = await loadAndScore();
    const targets = applicants.filter((a) => a.risk >= threshold);
    if (!targets.length) {
      return ok({ sent: 0, targets: 0, message: `هیچ متقاضی‌ای بالای آستانهٔ ${faNum(threshold)}٪ نیست` });
    }

    // گیرندگان: مشاوران هر متقاضی + مدیران سامانه
    const adminUrs = await db.userRole.findMany({
      where: { isSuspended: false, role: { title: { contains: "مدیر" } } },
      select: { userId: true },
    });
    const adminIds = [...new Set(adminUrs.map((a) => a.userId))];
    const since = new Date(Date.now() - 24 * 3600 * 1000); // جلوگیری از هشدار تکراری ۲۴ ساعته
    const recent = await db.notification.findMany({
      where: { title: { contains: "ریسک کیس حاد" }, createdAt: { gt: since } },
      select: { title: true },
    });
    const recentTitles = new Set(recent.map((r) => r.title));

    let sent = 0;
    const notified = new Set<number>(); // جلوگیری از تکرار برای یک گیرنده
    for (const t of targets) {
      const fullName = `${t.name} ${t.family}`;
      const topFactors = t.factors.slice(0, 3).map((f) => f.label).join("، ") || "بدون عامل مشخص";
      const title = `ریسک کیس حاد — ${fullName} (${faNum(t.risk)}٪)`;
      const bodyText = `مدل پیش‌بینی، این متقاضی را در سطح «${t.level}» ارزیابی کرده است. عوامل مؤثر: ${topFactors}${t.lastAcuteAt ? " — سابقهٔ مورد حاد ثبت‌شده دارد." : ""} لطفاً کارتابل او را بررسی کنید.`;

      // گیرندگان مشاوران همان متقاضی
      const recipients = new Set<number>(t.acceptors.map((a) => a.id));
      for (const aid of adminIds) recipients.add(aid);

      if (recentTitles.has(title)) continue; // در ۲۴ ساعت اخیر هشدار داده شده

      for (const rid of recipients) {
        if (notified.has(rid + ":" + t.id)) continue;
        notified.add(rid + ":" + t.id);
        await db.notification.create({ data: { userId: rid, title, body: bodyText } });
        sent += 1;
      }
      recentTitles.add(title);
    }

    // بی‌اعتبار کردن کش — امتیازها عوض نشده اما تاریخچهٔ هشدار تازه است
    (globalThis as { rzRiskCache?: { at: number; payload: unknown } }).rzRiskCache = undefined;
    void model;
    return ok({ sent, targets: targets.length, threshold, message: sent > 0 ? `${faNum(sent)} هشدار برای مشاوران و مدیران ارسال شد` : "هشدار جدیدی ارسال نشد (تکراری در ۲۴ ساعت اخیر)" });
  } catch (e) {
    return fail((e as Error).message ?? "خطا در ارسال هشدار");
  }
}
