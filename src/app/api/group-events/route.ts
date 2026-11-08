import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail, params } from "@/lib/server";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const { q, page, pageSize } = params(req);

  const where: Prisma.GroupEventWhereInput = {};
  if (q) where.topic = { contains: q };

  const [total, groups] = await Promise.all([
    db.groupEvent.count({ where }),
    db.groupEvent.findMany({
      where,
      include: {
        group: { select: { id: true, title: true } },
        _count: { select: { members: true } },
      },
      orderBy: { startDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  const groupList = await db.group.findMany({ include: { _count: { select: { members: true, events: true } } }, take: 20 });
  return ok({ total, page, totalPages: Math.ceil(total / pageSize), groups, groupList });
}
