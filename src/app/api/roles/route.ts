import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail, safeJson, guardAdmin, isAdminUser } from "@/lib/server";

// =====================================================================
// نقش‌ها و سطوح دسترسی — مدیریت کامل RBAC
// GET    — فهرست نقش‌ها + انتساب‌های کاربران
// POST   — { userId, roleId, ... } انتساب نقش | { name, title, permissions } ساخت نقش
// PUT    — { id, title?, permissions? } ویرایش نقش و ماتریس دسترسی
// PATCH  — { id, isSuspended } تعلیق/رفع تعلیق انتساب
// DELETE — ?roleId= حذف نقش | ?id= حذف انتساب
// =====================================================================

async function isAdmin(req: NextRequest) {
  // نسخهٔ ۶.۶ — موتور یکپارچهٔ تشخیص مدیر (نقش، مشخصات شخصی، اولین کاربر)
  const user = await getCurrentUser(req);
  if (!user) return null;
  return (await isAdminUser(user.id)) ? user : null;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const page = Number(req.nextUrl.searchParams.get("page")) || 1;
  const pageSize = 60;
  const where = q ? { OR: [{ name: { contains: q } }, { family: { contains: q } }, { username: { contains: q } }] } : {};

  const [roleList, userRoles, total, userCount] = await Promise.all([
    db.role.findMany({ include: { _count: { select: { users: true } } }, orderBy: { id: "asc" } }),
    db.userRole.findMany({
      where: { user: where as never },
      include: {
        user: { select: { id: true, name: true, family: true, nid: true, avatarColor: true, mobile: true, username: true, blocked: true, consultantLevel: true, signupDate: true, lastLogin: true } },
        role: { select: { title: true, id: true, codeName: true } },
      },
      orderBy: { id: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.userRole.count({ where: { user: where as never } }),
    db.user.count(),
  ]);
  return ok({ roleList, userRoles, total, userCount, page, pageSize });
}

export async function POST(req: NextRequest) {
  const admin = await isAdmin(req);
  if (!admin) return fail("UNAUTHORIZED", 401);
  try {
    const body = await req.json();

    // --- ساخت نقش جدید با ماتریس دسترسی
    if (body.name !== undefined || body.permissions !== undefined) {
      const title = String(body.title ?? body.name ?? "").trim();
      if (!title) return fail("عنوان نقش الزامی است");
      const codeName = String(body.codeName ?? title)
        .toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || `role_${Date.now()}`;
      const exists = await db.role.findFirst({ where: { title } });
      if (exists) return fail("نقشی با این عنوان قبلاً ساخته شده است");
      const perms = Array.isArray(body.permissions) ? body.permissions.map(String) : null;
      const maxId = await db.role.aggregate({ _max: { id: true } });
      const role = await db.role.create({
        data: {
          id: (maxId._max.id ?? 0) + 1,
          title, codeName,
          permissions: perms ? JSON.stringify(perms) : null,
        },
      });
      return ok(safeJson(role));
    }

    // --- انتساب نقش به کاربر
    const { userId, roleId, level, startDate, endDate } = body;
    if (!userId || !roleId) return fail("کاربر و نقش الزامی است");
    const dup = await db.userRole.findFirst({ where: { userId: Number(userId), roleId: Number(roleId), OR: [{ endDate: null }, { endDate: { gt: new Date() } }] } });
    if (dup) return fail("این نقش قبلاً به کاربر داده شده است");
    const ur = await db.userRole.create({
      data: {
        userId: Number(userId), roleId: Number(roleId), level: Number(level ?? 0),
        startDate: startDate ? new Date(startDate) : new Date(),
        endDate: endDate ? new Date(endDate) : null,
        addedBy: admin.id,
      },
    });
    return ok(safeJson(ur));
  } catch (e) {
    return fail((e as Error).message ?? "خطا در ذخیره");
  }
}

export async function PUT(req: NextRequest) {
  const admin = await isAdmin(req);
  if (!admin) return fail("UNAUTHORIZED", 401);
  try {
    const { id, title, permissions } = await req.json();
    if (!id) return fail("شناسهٔ نقش الزامی است");
    const data: { title?: string; permissions?: string } = {};
    if (title !== undefined) data.title = String(title).trim();
    if (permissions !== undefined) data.permissions = JSON.stringify(Array.isArray(permissions) ? permissions.map(String) : []);
    const role = await db.role.update({ where: { id: Number(id) }, data });
    return ok(safeJson(role));
  } catch (e) {
    return fail((e as Error).message ?? "خطا در ویرایش نقش");
  }
}

export async function PATCH(req: NextRequest) {
  // تعلیق/رفع تعلیق انتساب نقش — فقط مدیر (نسخهٔ ۶.۵)
  const g = await guardAdmin(req);
  if (g.error) return g.error;
  const { id, isSuspended } = await req.json();
  if (!id) return fail("شناسه الزامی است");
  await db.userRole.update({ where: { id: Number(id) }, data: { isSuspended: Boolean(isSuspended) } });
  return ok();
}

export async function DELETE(req: NextRequest) {
  const admin = await isAdmin(req);
  if (!admin) return fail("UNAUTHORIZED", 401);
  const roleId = Number(req.nextUrl.searchParams.get("roleId"));
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (roleId) {
    const count = await db.userRole.count({ where: { roleId } });
    if (count > 0) return fail(`این نقش به ${count} کاربر اختصاص دارد — ابتدا انتساب‌ها را حذف کنید`);
    await db.role.delete({ where: { id: roleId } });
    return ok();
  }
  if (id) {
    await db.userRole.delete({ where: { id } });
    return ok();
  }
  return fail("شناسه لازم است");
}
