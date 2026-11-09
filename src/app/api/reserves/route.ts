import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, params, resolveAccess, applyEventScope } from "@/lib/server";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const acc = await resolveAccess(req);
  if (!acc) return fail("UNAUTHORIZED", 401);
  const { q, page, pageSize } = params(req);

  // اسکوپ داده (نسخهٔ ۶.۱۰) — رزروهای جلسات در محدودهٔ مجاز
  const where: Prisma.EventReserveWhereInput = applyEventScope({}, acc);
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
