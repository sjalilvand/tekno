import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, resolveAccess, eventScopeWhere } from "@/lib/server";
import { buildRecommendations } from "@/lib/recommend";
import { chainSpans } from "@/lib/monitoring";
import { jDate } from "@/lib/jalali";

// =====================================================================
// کارتابل کامل یک متقاضی — همهٔ اطلاعات + سوابق اجرایی + توصیه‌های هوشمند
// GET /api/cartable/[id] — نسخهٔ ۶.۵ با دسترسی مؤثر و اسکوپ مشاور
// =====================================================================

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const acc = await resolveAccess(req);
  if (!acc) return fail("UNAUTHORIZED", 401);
  const { id } = await ctx.params;
  const uid = Number(id);
  if (!uid) return fail("شناسهٔ نامعتبر");

  // مجوز (نسخهٔ ۶.۱۰): مدیر → همه؛ مدیر استان → متقاضیان استان؛ مدیر کلینیک → متقاضیان کلینیک؛
  // مشاور → فقط مراجعان خودش؛ سایر → فقط خودشان
  const allowed =
    acc.seeAllData ||
    acc.uid === uid ||
    (await db.event.findFirst({
      where: { userId: uid, AND: [eventScopeWhere(acc)] },
      select: { id: true },
    }));
  if (!allowed) return fail("دسترسی به کارتابل این متقاضی برای شما باز نیست", 403);

  const person = await db.user.findUnique({
    where: { id: uid },
    select: {
      id: true, nid: true, username: true, name: true, family: true, father: true,
      gender: true, birthday: true, marriage: { select: { name: true } },
      education: { select: { name: true } }, religion: true, mobile: true, mobile2: true,
      phone: true, email: true, address: true, zipCode: true, signupDate: true,
      lastLogin: true, blocked: true, confirm: true, bio: true,
      province: { select: { title: true } }, cityId: true,
      roles: { include: { role: { select: { title: true } } } },
    },
  });
  if (!person) return fail("متقاضی یافت نشد", 404);

  // کد ملی — اگر در جدول کاربر صفر است (دادهٔ قدیمی)، از جلسات بازیابی می‌شود
  let personNid = person.nid;
  if (!personNid || personNid === 0n) {
    const ev = await db.event.findFirst({
      where: { userId: uid, nid: { not: 0 } },
      orderBy: { id: "desc" },
      select: { nid: true },
    });
    if (ev?.nid) personNid = ev.nid;
  }

  const events = await db.event.findMany({
    // دامنهٔ داده — مشاور/مدیر محدود فقط جلسات در محدودهٔ خودش را در پرونده می‌بیند
    where: acc.seeAllData ? { userId: uid } : { userId: uid, AND: [eventScopeWhere(acc)] },
    orderBy: { startDate: "desc" },
    select: {
      id: true, trackingCode: true, status: true, isEms: true, isGroup: true,
      level: true, userTariff: true, topic: true, startDate: true, endDate: true,
      service: { select: { id: true, name: true, short: true } },
      center: { select: { id: true, title: true, cityTitle: true, provinceTitle: true } },
      acceptor: { select: { id: true, name: true, family: true, consultantLevel: true } },
      supervisor: { select: { name: true, family: true } },
      centerAdminConfirmDateTime: true, centerTechConfirmDateTime: true,
      operatorConfirmDateTime: true, provinceSupervisorConfirmDateTime: true,
      supervisorConfirmDateTime: true, rejectedAt: true, rejectedComment: true,
      comments: { select: { id: true, comment: true, dateTime: true, consultantNID: true }, orderBy: { dateTime: "desc" } },
      reserves: { select: { id: true, date: true, acceptorId: true }, orderBy: { date: "asc" } },
      psychology: { select: { id: true, dateTime: true, mood: true, clinicalObservation: true, problemDuration: true } },
      neuroFeedback: { select: { id: true, dateTime: true, protocol: true } },
      headMap: { select: { id: true, dateTime: true, description: true } },
      medicines: { select: { id: true, name: true, dosage: true, duration: true } },
      disorders: { select: { id: true, title: true } },
      ems: { select: { id: true, severity: true, dateTime: true, hadPaymentStatus: true, hadPaymentAmount: true, actionsTaken: true } },
    },
  });

  // اسناد و پیام‌ها و پیامک‌ها — سوابق اجرایی
  // هر بخش جداگانه در try/catch — خطا در یک بخش، کل پرونده را نمی‌شکند
  type FileRow = { id: number; name: string; uploadDateTime: Date };
  type MsgRow = { id: number; fromUserId: number; toUserId: number; subject: string | null; text: string | null; timestamp: Date; isRead: boolean };
  type SmsRow = { id: number; senderId: number | null; receiverId: number | null; message: string | null; createTime: Date; status: string | null };
  let files: FileRow[] = [];
  let messages: MsgRow[] = [];
  let sms: SmsRow[] = [];
  try {
    files = await db.file.findMany({ where: { userNID: personNid }, orderBy: { uploadDateTime: "desc" }, take: 50 });
  } catch { /* بخش اسناد در دسترس نیست */ }
  try {
    messages = await db.message.findMany({
      where: { OR: [{ fromUserId: uid }, { toUserId: uid }] },
      orderBy: { timestamp: "desc" }, take: 30,
      select: { id: true, fromUserId: true, toUserId: true, subject: true, text: true, timestamp: true, isRead: true },
    });
  } catch { /* بخش پیام‌ها در دسترس نیست */ }
  try {
    sms = await db.sms.findMany({
      where: { OR: [{ senderId: uid }, { receiverId: uid }] },
      orderBy: { createTime: "desc" }, take: 30,
      select: { id: true, senderId: true, receiverId: true, message: true, createTime: true, status: true },
    });
  } catch { /* بخش پیامک‌ها در دسترس نیست */ }

  // خط زمانی سوابق اجرایی — ادغام همهٔ رخدادها و مرتب‌سازی
  type TimelineItem = { at: string; kind: string; title: string; detail?: string; ref?: string };
  const timeline: TimelineItem[] = [];
  for (const e of events) {
    if (e.startDate) timeline.push({ at: e.startDate.toISOString(), kind: "جلسه", title: `جلسهٔ ${e.service?.short ?? e.service?.name ?? ""} (#${e.id})`, detail: e.status, ref: `#/events?focus=${e.id}` });
    for (const r of e.reserves) timeline.push({ at: r.date.toISOString(), kind: "رزرو", title: `رزرو وقت جلسهٔ #${e.id}` });
    for (const c of e.comments) timeline.push({ at: c.dateTime.toISOString(), kind: "یادداشت", title: `یادداشت جلسهٔ #${e.id}`, detail: (c.comment ?? "").slice(0, 120) });
    for (const m of e.ems) {
      timeline.push({ at: m.dateTime.toISOString(), kind: "مورد حاد", title: `فرم EMS با شدت «${m.severity}»`, detail: `وضعیت کمک: ${m.hadPaymentStatus ?? "—"}`, ref: "#/ems" });
    }
    for (const p of e.psychology ? [e.psychology] : []) timeline.push({ at: p.dateTime.toISOString(), kind: "فرم", title: `ارزیابی روان‌شناختی جلسهٔ #${e.id}` });
    for (const n of e.neuroFeedback) timeline.push({ at: n.dateTime.toISOString(), kind: "فرم", title: `نوروفیدبک (${n.protocol ?? "—"})` });
    for (const h of e.headMap) timeline.push({ at: h.dateTime.toISOString(), kind: "آزمون", title: "نقشهٔ سر (HeadMap)" });
    if (e.status === "تایید نهایی" && e.supervisorConfirmDateTime) timeline.push({ at: e.supervisorConfirmDateTime.toISOString(), kind: "تایید", title: `تایید نهایی جلسهٔ #${e.id}` });
    if (e.status === "رد شده" && e.rejectedAt) timeline.push({ at: e.rejectedAt.toISOString(), kind: "رد", title: `رد جلسهٔ #${e.id}`, detail: e.rejectedComment ?? undefined });
  }
  for (const f of files) timeline.push({ at: f.uploadDateTime.toISOString(), kind: "سند", title: `بارگذاری سند: ${f.name}` });
  for (const m of messages) timeline.push({ at: m.timestamp.toISOString(), kind: "پیام", title: `پیام: ${m.subject ?? "(بدون عنوان)"}`, detail: (m.text ?? "").slice(0, 100) });
  for (const s of sms) timeline.push({ at: s.createTime.toISOString(), kind: "پیامک", title: `پیامک (${s.status})`, detail: (s.message ?? "").slice(0, 100) });
  timeline.sort((a, b) => (a.at < b.at ? 1 : -1));

  // توصیه‌های هوشمند
  const recs = buildRecommendations({
    events: events.map((e) => ({
      ...e,
      psychology: e.psychology ? [e.psychology] : [],
      ems: e.ems.map((m) => ({ ...m, hadPaymentAmount: Number(m.hadPaymentAmount) })),
    })),
    reserves: events.flatMap((e) => e.reserves.map((r) => ({ id: r.id, date: r.date }))),
    now: new Date(),
  });

  // آمار خلاصه
  const confirmed = events.filter((e) => e.status === "تایید نهایی");
  const acute = events.flatMap((e) => e.ems);
  const totalTariff = confirmed.reduce((a, e) => a + e.userTariff, 0);
  const lastSession = events.map((e) => e.startDate).filter(Boolean).sort((a, b) => (b as Date).getTime() - (a as Date).getTime())[0] ?? null;

  // وضعیت چرخهٔ تایید آخرین جلسات (برای نوار پیشرفت در کارتابل)
  const chainStatus = events.slice(0, 5).map((e) => ({
    eventId: e.id, status: e.status, spans: chainSpans(e),
  }));

  // تیک‌های هوشمند مرتبط با متقاضی
  let checklists: { id: number; title: string; status: string; items: { id: number; title: string; done: boolean; auto: boolean }[]; template: { title: string } | null }[] = [];
  try {
    checklists = await db.checklistRun.findMany({
      where: { userId: uid },
      include: { items: true, template: { select: { title: true } } },
      orderBy: { createdAt: "desc" }, take: 10,
    });
  } catch { /* بخش چک‌لیست‌ها در دسترس نیست */ }

  return ok({
    person: {
      ...person,
      nid: Number(personNid), mobile: Number(person.mobile),
      nidMissing: !personNid || personNid === 0n,
      mobile2: person.mobile2 ? Number(person.mobile2) : null,
      zipCode: person.zipCode ? Number(person.zipCode) : null,
      birthday: person.birthday ? jDate(person.birthday) : null,
      signupDate: jDate(person.signupDate),
      lastLogin: person.lastLogin ? jDate(person.lastLogin) : null,
      roleTitles: person.roles.map((r) => r.role?.title).filter(Boolean),
    },
    stats: {
      sessions: events.length, confirmed: confirmed.length,
      pending: events.filter((e) => e.status.includes("در انتظار")).length,
      rejected: events.filter((e) => e.status === "رد شده").length,
      acute: acute.length, acuteHigh: acute.filter((m) => m.severity === "بالا").length,
      totalTariff, lastSession: lastSession ? jDate(lastSession) : null,
    },
    events: events.map((e) => ({
      ...e,
      startDate: e.startDate ? jDate(e.startDate) : null,
      endDate: e.endDate ? jDate(e.endDate) : null,
    })),
    chainStatus,
    timeline: timeline.slice(0, 120),
    files: files.map((f) => ({ ...f, uploadDateTime: jDate(f.uploadDateTime) })),
    recommendations: recs,
    checklists: checklists.map((r) => ({
      id: r.id, title: r.template?.title ?? r.title ?? "چک‌لیست", status: r.status,
      done: r.items.filter((i) => i.done).length, total: r.items.length,
      items: r.items,
    })),
  });
}
