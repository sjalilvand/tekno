import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail, params, guardAdmin, hashPassword } from "@/lib/server";
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

// =====================================================================
// تعریف کاربر جدید (نسخهٔ ۶.۱۱) — فقط مدیر سامانه
// POST /api/users
//   { nid, name, family, mobile, username?, password?, gender?, email?,
//     provinceId?, consultantLevel?, bio?, roleId?, centerIds?, isCounselor? }
// =====================================================================

export async function POST(req: NextRequest) {
  const g = await guardAdmin(req);
  if (g.error) return g.error;
  const admin = g.acc;
  const body = await req.json().catch(() => null);
  if (!body) return fail("BAD_REQUEST");

  const nidDigits = String(body.nid ?? "").replace(/\D/g, "");
  const name = String(body.name ?? "").trim();
  const family = String(body.family ?? "").trim();
  const mobileDigits = String(body.mobile ?? "").replace(/\D/g, "");
  if (nidDigits.length < 8) return fail("کد ملی باید حداقل ۸ رقم باشد");
  if (!name || !family) return fail("نام و نام خانوادگی الزامی است");
  if (mobileDigits.length < 10) return fail("شماره موبایل نامعتبر است");

  const nid = BigInt(nidDigits);
  if (await db.user.findUnique({ where: { nid }, select: { id: true } }))
    return fail("این کد ملی قبلاً در سامانه ثبت شده است");

  let username = String(body.username ?? "").trim() || nidDigits;
  let suffix = 0;
  while (await db.user.findUnique({ where: { username }, select: { id: true } })) {
    if (body.username) return fail("این نام کاربری قبلاً استفاده شده است");
    suffix += 1;
    username = `${nidDigits}${suffix}`;
  }

  const password = String(body.password ?? "").trim() || "123456";
  if (password.length < 5) return fail("رمز عبور باید حداقل ۵ نویسه باشد");

  const roleId = body.roleId ? Number(body.roleId) : null;
  if (roleId) {
    const role = await db.role.findUnique({ where: { id: roleId }, select: { id: true } });
    if (!role) return fail("نقش انتخاب‌شده یافت نشد");
  }
  const centerIds: number[] = Array.isArray(body.centerIds) ? body.centerIds.map(Number).filter(Boolean) : [];
  if (centerIds.length) {
    const found = await db.center.count({ where: { id: { in: centerIds } } });
    if (found !== centerIds.length) return fail("یکی از مراکز انتخاب‌شده یافت نشد");
  }

  const created = await db.user.create({
    data: {
      nid, username,
      passwordHash: hashPassword(password),
      name, family,
      gender: body.gender === "مرد" || body.gender === "زن" ? body.gender : null,
      mobile: BigInt(mobileDigits),
      email: body.email ? String(body.email).slice(0, 120) : null,
      provinceId: body.provinceId ? Number(body.provinceId) : null,
      consultantLevel: body.consultantLevel ? Number(body.consultantLevel) : null,
      bio: body.bio ? String(body.bio).slice(0, 1000) : null,
      roles: roleId ? { create: { roleId, addedBy: admin.uid } } : undefined,
      centerLinks: centerIds.length ? { create: centerIds.map((cid) => ({ centerId: cid })) } : undefined,
    },
    select: { id: true, username: true, name: true, family: true },
  });
  await db.log.create({
    data: { userId: admin.uid, category: "کاربران", description: `تعریف کاربر جدید «${name} ${family}» (${username})`, level: 2 },
  });
  return ok({ user: created });
}
