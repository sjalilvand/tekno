import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail } from "@/lib/server";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
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

  const ems = await db.eventsEms.findUnique({ where: { eventId: eid }, include: { comments: true } });
  return ok({ event, ems });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const { id } = await ctx.params;
  const eid = Number(id);
  const { action, comment } = await req.json();
  const now = new Date();

  const event = await db.event.findUnique({ where: { id: eid } });
  if (!event) return fail("جلسه یافت نشد", 404);

  if (action === "comment") {
    if (!comment?.trim()) return fail("متن یادداشت الزامی است");
    await db.eventComment.create({
      data: { eventId: eid, consultantNID: user.nid, comment: comment.trim(), dateTime: now },
    });
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
    const roleTitles = await db.userRole.findMany({ where: { userId: user.id }, include: { role: true } });
    const titles = roleTitles.map((r) => r.role.title);
    const isAdmin = titles.includes("مدیر سیستم") || titles.includes("مدیر کل");
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
