import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, resolveAccess, hashPassword } from "@/lib/server";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const acc = await resolveAccess(req);
  if (!acc) return fail("UNAUTHORIZED", 401);
  const { id } = await ctx.params;
  const uid = Number(id);

  // پروندهٔ کامل کاربر — فقط مدیر یا خودِ کاربر
  if (!acc.isAdmin && acc.uid !== uid) return fail("دسترسی به پروندهٔ این کاربر برای شما باز نیست", 403);

  const target = await db.user.findUnique({
    where: { id: uid },
    include: {
      roles: { include: { role: true } },
      province: true, education: true, marriage: true,
    },
  });
  if (!target) return fail("کاربر یافت نشد", 404);

  const [events, taxes, consultantEdu, courses, logs, sessions] = await Promise.all([
    db.event.findMany({
      where: { OR: [{ userId: uid }, { acceptorId: uid }] },
      orderBy: { startDate: "desc" }, take: 15,
      include: { service: { select: { short: true } }, center: { select: { cityTitle: true } } },
    }),
    db.consultantTax.findMany({ where: { userId: uid }, orderBy: [{ year: "desc" }, { month: "desc" }], take: 12 }),
    db.consultantEducation.findMany({ where: { userId: uid } }),
    db.consultantCourse.findMany({ where: { userId: uid } }),
    db.log.findMany({ where: { userId: uid }, orderBy: { timestamp: "desc" }, take: 10 }),
    db.session.findMany({ where: { userId: uid }, orderBy: { dateTime: "desc" }, take: 5 }),
  ]);

  const { passwordHash: _ph, ...safeUser } = target;
  return ok({ user: safeUser, events, taxes, consultantEdu, courses, logs, sessions });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const acc = await resolveAccess(req);
  if (!acc) return fail("UNAUTHORIZED", 401);
  const { id } = await ctx.params;
  const uid = Number(id);
  const body = await req.json().catch(() => ({}));

  // مسدودسازی/تایید/ویرایش کامل — فقط مدیر؛ ویرایش محدود پروفایل — خودِ کاربر
  const adminOnlyKeys = ["blocked", "confirm", "username", "nid", "password", "roleId", "centerIds", "consultantLevel"];
  const isSensitive = adminOnlyKeys.some((k) => body[k] !== undefined);
  if (!acc.isAdmin && (isSensitive || acc.uid !== uid))
    return fail("برای این تغییر باید مدیر سامانه باشید", 403);

  const target = await db.user.findUnique({ where: { id: uid }, select: { id: true } });
  if (!target) return fail("کاربر یافت نشد", 404);

  const data: Record<string, unknown> = {};
  if (typeof body.blocked === "boolean") data.blocked = body.blocked;
  if (typeof body.confirm === "number") data.confirm = body.confirm;
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body.family === "string" && body.family.trim()) data.family = body.family.trim();
  if (typeof body.email === "string") data.email = body.email;
  if (body.bio !== undefined) data.bio = body.bio ? String(body.bio).slice(0, 1000) : null;
  if (body.mobile) {
    const m = String(body.mobile).replace(/\D/g, "");
    if (m.length < 10) return fail("شماره موبایل نامعتبر است");
    data.mobile = BigInt(m);
  }
  if (body.gender === "مرد" || body.gender === "زن") data.gender = body.gender;
  if (body.provinceId !== undefined) data.provinceId = body.provinceId ? Number(body.provinceId) : null;

  // ---------- بخش‌های مدیریتی ----------
  if (body.username !== undefined) {
    const un = String(body.username ?? "").trim();
    if (!un) return fail("نام کاربری نمی‌تواند خالی باشد");
    const dupe = await db.user.findFirst({ where: { username: un, id: { not: uid } }, select: { id: true } });
    if (dupe) return fail("این نام کاربری قبلاً استفاده شده است");
    data.username = un;
  }
  if (body.nid !== undefined) {
    const nd = String(body.nid ?? "").replace(/\D/g, "");
    if (nd.length < 8) return fail("کد ملی باید حداقل ۸ رقم باشد");
    const dupe = await db.user.findFirst({ where: { nid: BigInt(nd), id: { not: uid } }, select: { id: true } });
    if (dupe) return fail("این کد ملی قبلاً ثبت شده است");
    data.nid = BigInt(nd);
  }
  if (body.password) {
    const p = String(body.password);
    if (p.length < 5) return fail("رمز عبور باید حداقل ۵ نویسه باشد");
    data.passwordHash = hashPassword(p);
    data.lastChangePass = new Date();
  }
  if (body.consultantLevel !== undefined)
    data.consultantLevel = body.consultantLevel ? Number(body.consultantLevel) : null;

  const updated = await db.user.update({ where: { id: uid }, data });

  // جایگزینی نقش — یک نقش فعال همزمان (مدیر)
  if (body.roleId !== undefined) {
    await db.userRole.deleteMany({ where: { userId: uid } });
    if (body.roleId) {
      const role = await db.role.findUnique({ where: { id: Number(body.roleId) }, select: { id: true } });
      if (!role) return fail("نقش انتخاب‌شده یافت نشد");
      await db.userRole.create({ data: { userId: uid, roleId: role.id, addedBy: acc.uid } });
    }
  }
  // جایگزینی کلینیک‌های همکاری (مدیر)
  if (Array.isArray(body.centerIds)) {
    const cids = body.centerIds.map(Number).filter(Boolean);
    await db.userCenter.deleteMany({ where: { userId: uid } });
    if (cids.length) {
      const found = await db.center.count({ where: { id: { in: cids } } });
      if (found !== cids.length) return fail("یکی از مراکز انتخاب‌شده یافت نشد");
      await db.userCenter.createMany({ data: cids.map((cid, i) => ({ userId: uid, centerId: cid, isPrimary: i === 0 })) });
    }
  }

  await db.log.create({
    data: { userId: acc.uid, category: "ویرایش کاربر", description: `ویرایش پرونده کاربر #${uid}`, level: 2, ip: req.headers.get("x-forwarded-for") ?? "-" },
  });
  return ok({ id: updated.id });
}
