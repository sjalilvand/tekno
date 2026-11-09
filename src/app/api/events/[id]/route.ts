import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, resolveAccess, guardAction } from "@/lib/server";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const acc = await resolveAccess(req);
  if (!acc) return fail("UNAUTHORIZED", 401);
  const { id } = await ctx.params;
  const eid = Number(id);

  const event = await db.event.findUnique({
    where: { id: eid },
    include: {
      user: { select: { id: true, name: true, family: true, nid: true, mobile: true, avatarColor: true, gender: true, education: { select: { name: true } } } },
      acceptor: { select: { id: true, name: true, family: true, consultantLevel: true, avatarColor: true } },
      supervisor: { select: { name: true, family: true } },
      centerAdmin: { select: { name: true, family: true } },
      service: true,
      center: { select: { id: true, title: true, cityTitle: true, provinceTitle: true, tel: true } },
      comments: { orderBy: { dateTime: "desc" } },
      psychology: true,
      neuroFeedback: true,
      medicines: true,
      disorders: true,
      reserves: { include: { event: false } },
    },
  });
  if (!event) return fail("جلسه یافت نشد", 404);

  // اسکوپ مشاور — فقط جلسات خودش
  if (!acc.seeAllData && event.acceptorId !== acc.uid && event.supervisorId !== acc.uid && event.userId !== acc.uid)
    return fail("این جلسه در پروندهٔ شما نیست", 403);

  // findFirst — eventId دیگر یونیک نیست (در دادهٔ legacy چند فرم EMS برای یک جلسه ثبت شده)
  const ems = await db.eventsEms.findFirst({ where: { eventId: eid }, include: { comments: true } });
  // روابط نوروفیدبک/نقشهٔ سر یک‌به‌چند شدند — برای حفظ شکل پاسخ، اولین فرم برگردانده می‌شود
  const { neuroFeedback: nfList, headMap: hmList, ...eventRest } = event;
  const eventSingle = { ...eventRest, neuroFeedback: nfList?.[0] ?? null, headMap: hmList?.[0] ?? null };
  return ok({ event: eventSingle, ems });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const eid = Number(id);
  const body = await req.json().catch(() => ({}));
  const { action, comment } = body;
  const now = new Date();

  // سطح دسترسی عملیاتی — یادداشت = ثبت، تایید/رد = ویرایش (نسخهٔ ۶.۵)
  const g = await guardAction(req, "events", action === "comment" ? "create" : "edit", "جلسات مشاوره");
  if (g.error) return g.error;
  const user = g.acc.user;
  const acc = g.acc;

  const event = await db.event.findUnique({ where: { id: eid } });
  if (!event) return fail("جلسه یافت نشد", 404);

  if (action === "comment") {
    if (!comment?.trim()) return fail("متن یادداشت الزامی است");
    await db.eventComment.create({
      data: { eventId: eid, consultantNID: user.nid, comment: comment.trim(), dateTime: now },
    });
    return ok({ ok: true });
  }

  // ثبت انجام شدن جلسه (نسخهٔ ۶.۱۱) — پایان جلسه + ورود به چرخهٔ تایید + یادداشت اختیاری
  if (action === "complete") {
    // فقط پذیرنده/ناظر جلسه، خودِ مراجع یا مدیر
    if (!acc.seeAllData && event.acceptorId !== acc.uid && event.supervisorId !== acc.uid && event.userId !== acc.uid)
      return fail("این جلسه در پروندهٔ شما نیست", 403);
    if (event.status === "تایید نهایی") return fail("این جلسه قبلاً تایید نهایی شده است");
    const doneAt = body.date ? new Date(body.date) : now;
    if (isNaN(doneAt.getTime())) return fail("تاریخ انجام نامعتبر است");
    await db.event.update({
      where: { id: eid },
      data: {
        endDate: doneAt,
        startDate: event.startDate ?? doneAt,
        status: "در انتظار تایید مدیر مرکز",
      },
    });
    if (comment?.trim()) {
      await db.eventComment.create({
        data: { eventId: eid, consultantNID: user.nid, comment: `ثبت انجام جلسه: ${comment.trim().slice(0, 1000)}`, dateTime: now },
      });
    }
    await db.log.create({ data: { userId: user.id, category: "جلسات", description: `ثبت انجام جلسه #${eid}`, level: 2, ip: req.headers.get("x-forwarded-for") ?? "-" } });
    return ok({ ok: true });
  }

  if (action === "reject") {
    if (!comment?.trim()) return fail("دلیل رد الزامی است");
    await db.event.update({
      where: { id: eid },
      data: { status: "رد شده", rejectedByUserId: user.id, rejectedAt: now, rejectedComment: comment.trim() },
    });
    await db.log.create({ data: { userId: user.id, category: "تایید جلسه", description: `رد جلسه #${eid}`, level: 2, ip: req.headers.get("x-forwarded-for") ?? "-" } });
    return ok({ ok: true });
  }

  if (action === "confirm") {
    // طی کردن مرحله بعدی زنجیره تایید بر اساس نقش کاربر جاری
    const isAdmin = acc.isAdmin;
    const titles = acc.roles;
    const data: Record<string, unknown> = {};
    if (isAdmin) {
      data.centerAdminConfirmUserId = user.id;
      data.centerAdminConfirmDateTime = now;
      data.centerTechConfirmUserId = user.id;
      data.centerTechConfirmDateTime = now;
      data.operatorConfirmUserId = user.id;
      data.operatorConfirmDateTime = now;
      data.provinceSupervisorConfirmUserId = user.id;
      data.provinceSupervisorConfirmDateTime = now;
      data.supervisorConfirmUserId = user.id;
      data.supervisorConfirmDateTime = now;
      data.status = "تایید نهایی";
      data.budgetUsed = true;
    } else if (titles.includes("مدیر کلینیک")) {
      data.centerAdminConfirmUserId = user.id;
      data.centerAdminConfirmDateTime = now;
      data.status = "در انتظار تایید مسئول فنی";
    } else if (titles.includes("مسئول فنی")) {
      data.centerTechConfirmUserId = user.id;
      data.centerTechConfirmDateTime = now;
      data.status = "در انتظار تایید نظارت حرفه‌ای";
    } else if (titles.includes("نظارت حرفه‌ای")) {
      data.operatorConfirmUserId = user.id;
      data.operatorConfirmDateTime = now;
      data.status = "در انتظار تایید ناظر استان";
    } else if (titles.includes("ناظر استان")) {
      data.provinceSupervisorConfirmUserId = user.id;
      data.provinceSupervisorConfirmDateTime = now;
      data.status = "تایید نهایی";
      data.supervisorConfirmUserId = user.id;
      data.supervisorConfirmDateTime = now;
      data.budgetUsed = true;
    } else {
      return fail("دسترسی تایید جلسه را ندارید", 403);
    }
    await db.event.update({ where: { id: eid }, data });
    await db.log.create({ data: { userId: user.id, category: "تایید جلسه", description: `تایید جلسه #${eid}`, level: 2, ip: req.headers.get("x-forwarded-for") ?? "-" } });
    return ok({ ok: true });
  }

  return fail("عملیات نامعتبر");
}
