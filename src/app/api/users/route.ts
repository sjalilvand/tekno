import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail, params } from "@/lib/server";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const { q, roleId, provinceId, page, pageSize } = params(req);

  const where: Prisma.UserWhereInput = {};
  if (q) {
    where.OR = [
      { name: { contains: q } }, { family: { contains: q } },
      { username: { contains: q } }, { mobile: { equals: Number(q) || -1 } },
      { nid: { equals: Number(q) || -1 } },
    ];
  }
  if (roleId) where.roles = { some: { roleId: Number(roleId) } };
  if (provinceId) where.provinceId = Number(provinceId);

  const [total, users] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      include: {
        roles: { include: { role: true } },
        province: { select: { title: true } },
        education: { select: { name: true } },
      },
      orderBy: { id: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return ok({
    total,
    page,
    totalPages: Math.ceil(total / pageSize),
    users: users.map((u) => ({
      id: u.id, nid: u.nid, username: u.username, name: u.name, family: u.family,
      gender: u.gender, mobile: u.mobile, province: u.province?.title, education: u.education?.name,
      roles: u.roles.map((r) => ({ title: r.role.title, level: r.level, isSuspended: r.isSuspended })),
      signupDate: u.signupDate, lastLogin: u.lastLogin, blocked: u.blocked, avatarColor: u.avatarColor,
    })),
  });
}
