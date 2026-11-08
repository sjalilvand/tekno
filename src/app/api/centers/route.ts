import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail, params } from "@/lib/server";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const { q, provinceId, page, pageSize } = params(req);

  const where: Prisma.CenterWhereInput = {};
  if (q) where.title = { contains: q };
  if (provinceId) where.provinceId = Number(provinceId);

  const [total, centers] = await Promise.all([
    db.center.count({ where }),
    db.center.findMany({
      where,
      include: { category: true, _count: { select: { events: true } } },
      orderBy: { title: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return ok({ total, page, totalPages: Math.ceil(total / pageSize), centers });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const { id, isEnabled, address, tel } = await req.json();
  if (!id) return fail("شناسه مرکز الزامی است");
  const data: Record<string, unknown> = {};
  if (typeof isEnabled === "boolean") data.isEnabled = isEnabled;
  if (typeof address === "string") data.address = address;
  if (typeof tel === "string") data.tel = tel;
  await db.center.update({ where: { id: Number(id) }, data });
  return ok();
}
