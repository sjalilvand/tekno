import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, params, resolveAccess, guardAction, applyEventScope } from "@/lib/server";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const acc = await resolveAccess(req);
  if (!acc) return fail("UNAUTHORIZED", 401);
  const { q, page, pageSize } = params(req);

  // اسکوپ داده (نسخهٔ ۶.۱۰) — موارد حادِ جلسات در محدودهٔ مجاز
  const where: Prisma.EventsEmsWhereInput = applyEventScope({}, acc);
  if (q) {
    where.OR = [
      { event: { user: { name: { contains: q } } } },
      { event: { user: { family: { contains: q } } } },
      { event: { trackingCode: { equals: Number(q) || -1 } } },
    ];
  }

  const [total, ems, sevAgg, payAgg] = await Promise.all([
    db.eventsEms.count({ where }),
    db.eventsEms.findMany({
      where,
      include: {
        event: {
          select: {
            id: true, trackingCode: true, startDate: true,
            user: { select: { name: true, family: true, avatarColor: true, nid: true } },
            center: { select: { title: true, cityTitle: true } },
          },
        },
        comments: { orderBy: { date: "desc" }, take: 3 },
      },
      orderBy: { dateTime: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.eventsEms.groupBy({ by: ["severity"], _count: true }),
    db.eventsEms.groupBy({ by: ["hadPaymentStatus"], _count: true, _sum: { hadPaymentAmount: true } }),
  ]);
  return ok({ total, page, totalPages: Math.ceil(total / pageSize), ems, sevAgg, payAgg });
}

export async function PATCH(req: NextRequest) {
  // سطح دسترسی عملیاتی — بررسی مورد حاد = ویرایش (نسخهٔ ۶.۵)
  const g = await guardAction(req, "ems", "edit", "موارد حاد (EMS)");
  if (g.error) return g.error;
  const user = g.acc.user;
  const { id, status, amount, comment } = await req.json();
  if (!id) return fail("شناسه مورد حاد الزامی است");
  const data: Record<string, unknown> = { confirmedByUserId: user.id };
  if (status) data.hadPaymentStatus = status;
  if (amount !== undefined) data.hadPaymentAmount = Number(amount);
  if (comment) data.hadPaymentDescription = comment;
  await db.eventsEms.update({ where: { id: Number(id) }, data });
  await db.log.create({ data: { userId: user.id, category: "موارد حاد", description: `بررسی مورد حاد #${id}`, level: 3 } });
  return ok();
}
