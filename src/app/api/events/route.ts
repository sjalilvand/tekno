import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail, params } from "@/lib/server";
import type { Prisma } from "@prisma/client";

const selectEvent = {
  id: true, trackingCode: true, startDate: true, endDate: true, status: true,
  weight: true, userTariff: true, topic: true, isGroup: true,
  user: { select: { id: true, name: true, family: true, avatarColor: true } },
  acceptor: { select: { id: true, name: true, family: true, consultantLevel: true } },
  service: { select: { id: true, short: true, name: true } },
  center: { select: { id: true, title: true, cityTitle: true, provinceTitle: true } },
} as const;

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const { q, status, serviceId, centerId, page, pageSize } = params(req);
  const view = req.nextUrl.searchParams.get("view") ?? "all"; // all | pending | done | rejected | undone

  const where: Prisma.EventWhereInput = {};
  if (status) where.status = status;
  else if (view === "pending") where.status = { contains: "در انتظار" };
  else if (view === "done") where.status = "تایید نهایی";
  else if (view === "rejected") where.status = "رد شده";
  else if (view === "undone") where.status = "ناتمام";
  if (serviceId) where.serviceId = Number(serviceId);
  if (centerId) where.centerId = Number(centerId);
  if (q) {
    where.OR = [
      { topic: { contains: q } },
      { trackingCode: { equals: Number(q) || -1 } },
      { user: { OR: [{ name: { contains: q } }, { family: { contains: q } }] } },
      { nid: { equals: Number(q) || -1 } },
    ];
  }

  const [total, events, statusAgg] = await Promise.all([
    db.event.count({ where }),
    db.event.findMany({
      where, orderBy: { startDate: "desc" },
      skip: (page - 1) * pageSize, take: pageSize,
      select: selectEvent,
    }),
    db.event.groupBy({ by: ["status"], _count: true }),
  ]);

  return ok({
    total, page, totalPages: Math.ceil(total / pageSize), events,
    statusAgg: statusAgg.map((s) => ({ status: s.status, count: s._count })),
  });
}
