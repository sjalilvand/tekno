import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail } from "@/lib/server";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const { q, page, pageSize } = { q: req.nextUrl.searchParams.get("q") ?? "", page: 1, pageSize: 40 };

  const where = q ? { OR: [{ name: { contains: q } }, { family: { contains: q } }] } : {};

  const [roleList, userRoles, total] = await Promise.all([
    db.role.findMany({ include: { _count: { select: { users: true } } }, orderBy: { id: "asc" } }),
    db.userRole.findMany({
      where: { user: where as never },
      include: {
        user: { select: { id: true, name: true, family: true, nid: true, avatarColor: true, mobile: true, consultantLevel: true } },
        role: { select: { title: true, id: true } },
      },
      orderBy: { id: "desc" },
      skip: (page - 1) * 40,
      take: 40,
    }),
    db.userRole.count({ where: { user: where as never } }),
  ]);
  return ok({ roleList, userRoles, total });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const { userId, roleId, level, startDate, endDate } = await req.json();
  if (!userId || !roleId) return fail("کاربر و نقش الزامی است");
  const ur = await db.userRole.create({
    data: {
      userId: Number(userId), roleId: Number(roleId), level: Number(level ?? 0),
      startDate: startDate ? new Date(startDate) : new Date(),
      endDate: endDate ? new Date(endDate) : null,
      addedBy: user.id,
    },
  });
  return ok(ur);
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const { id, isSuspended } = await req.json();
  if (!id) return fail("شناسه الزامی است");
  await db.userRole.update({ where: { id: Number(id) }, data: { isSuspended: Boolean(isSuspended) } });
  return ok();
}
