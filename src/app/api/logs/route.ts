import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail, params } from "@/lib/server";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const { q, page, pageSize } = params(req);
  const level = req.nextUrl.searchParams.get("level");

  const where: Prisma.LogWhereInput = {};
  if (level) where.level = Number(level);
  if (q) {
    where.OR = [
      { description: { contains: q } },
      { category: { contains: q } },
      { user: { name: { contains: q } } },
      { user: { family: { contains: q } } },
    ];
  }

  const [total, logs, categories, levelAgg] = await Promise.all([
    db.log.count({ where }),
    db.log.findMany({
      where,
      include: { user: { select: { name: true, family: true, avatarColor: true } } },
      orderBy: { timestamp: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.log.findMany({ select: { category: true }, distinct: ["category"] }),
    db.log.groupBy({ by: ["level"], _count: true }),
  ]);
  return ok({
    total, page, totalPages: Math.ceil(total / pageSize), logs,
    categories: categories.map((c) => c.category),
    levelAgg,
  });
}
