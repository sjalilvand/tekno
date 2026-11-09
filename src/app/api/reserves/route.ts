import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, params, resolveAccess, childEventScopeWhere, eventScopeWhere, guardAction } from "@/lib/server";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const acc = await resolveAccess(req);
  if (!acc) return fail("UNAUTHORIZED", 401);
  const { q, page, pageSize } = params(req);

  // اسکوپ داده (نسخهٔ ۶.۱۱) — رزروهای جلسات در محدودهٔ مجاز
  // از رابطهٔ «event» — ستون‌های Event مستقیم روی EventReserve وجود ندارند
  const where: Prisma.EventReserveWhereInput = childEventScopeWhere(acc);
  if (q) {
    where.OR = [
      { event: { user: { name: { contains: q } } } },
      { event: { user: { family: { contains: q } } } },
      { event: { trackingCode: { equals: Number(q) || -1 } } },
    ];
  }

  const [total, reserves, byConsultant] = await Promise.all([
    db.eventReserve.count({ where }),
    db.eventReserve.findMany({
      where,
      include: {
        event: {
          select: {
            id: true, trackingCode: true, status: true, topic: true,
            user: { select: { id: true, name: true, family: true, avatarColor: true, nid: true, mobile: true } },
            service: { select: { short: true } },
          },
        },
      },
      orderBy: { date: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.eventReserve.groupBy({ by: ["acceptorId"], _count: true, orderBy: { _count: { acceptorId: "desc" } }, take: 8 }),
  ]);
  const consultants = await db.user.findMany({
    where: { id: { in: byConsultant.map((b) => b.acceptorId) } },
    select: { id: true, name: true, family: true, avatarColor: true },
  });
  return ok({
    total, page, totalPages: Math.ceil(total / pageSize), reserves,
    byConsultant: byConsultant.map((b) => ({
      ...consultants.find((c) => c.id === b.acceptorId),
      count: b._count,
    })),
  });
}

// =====================================================================
// ثبت رزرو وقت مشاوره (نسخهٔ ۶.۱۱)
// POST /api/reserves  { eventId, date (ISO), time?, note? }
// • جلسه باید در محدودهٔ دادهٔ کاربر باشد
// • مشاور: پذیرنده خودِ جلسه؛ مدیر: انتخاب پذیرنده آزاد در محدوده
// =====================================================================

export async function POST(req: NextRequest) {
  const g = await guardAction(req, "reserves", "create", "رزرو مشاوره");
  if (g.error) return g.error;
  const acc = g.acc;
  const body = await req.json().catch(() => null);
  if (!body) return fail("BAD_REQUEST");

  const eventId = Number(body.eventId);
  if (!eventId) return fail("انتخاب جلسه الزامی است");
  const event = await db.event.findFirst({
    where: { id: eventId, ...eventScopeWhere(acc) },
    select: { id: true, userId: true, acceptorId: true, status: true },
  });
  if (!event) return fail("این جلسه در محدودهٔ دسترسی شما نیست", 403);

  const d = body.date ? new Date(body.date) : null;
  if (!d || isNaN(d.getTime())) return fail("تاریخ رزرو نامعتبر است");
  // اگر ساعت همراه تاریخ آمده باشد اعمال می‌شود — قالب «HH:mm»
  const time = String(body.time ?? "").trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  let date = d;
  if (m) {
    date = new Date(d);
    date.setHours(Math.min(23, Number(m[1])), Number(m[2]), 0, 0);
  }

  const acceptorId = acc.seeAllData && body.acceptorId ? Number(body.acceptorId) : (event.acceptorId ?? acc.uid);

  const reserve = await db.eventReserve.create({
    data: { eventId: event.id, userId: event.userId, acceptorId, date },
    select: { id: true, date: true },
  });
  await db.log.create({
    data: { userId: acc.uid, category: "رزرو", description: `ثبت رزرو #${reserve.id} برای جلسه #${event.id}`, level: 2 },
  });
  return ok({ reserve });
}
