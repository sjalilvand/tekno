import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, safeJson, resolveAccess } from "@/lib/server";

// =====================================================================
// کلینیک‌های همکاری کاربر (نسخهٔ ۶.۱۰) — یک مشاور می‌تواند همزمان در چند
// کلینیک کار کند و دادهٔ هر کلینیک جداگانه قابل مشاهده باشد.
// GET  ?userId=  → فهرست کلینیک‌های همکاری + همهٔ مراکز برای انتخاب
// PUT  { userId, centerIds: number[] } → جایگزینی کامل عضویت‌ها (فقط مدیر)
// =====================================================================

export async function GET(req: NextRequest) {
  const acc = await resolveAccess(req);
  if (!acc) return fail("UNAUTHORIZED", 401);
  const userId = Number(req.nextUrl.searchParams.get("userId"));
  if (!userId) return fail("شناسه کاربر الزامی است");
  // خود کاربر یا مدیر — بقیه نه
  if (acc.uid !== userId && !acc.isAdmin) return fail("دسترسی به کلینیک‌های همکاری این کاربر باز نیست", 403);

  const [links, centers] = await Promise.all([
    db.userCenter.findMany({
      where: { userId },
      include: { center: { select: { id: true, title: true, provinceTitle: true, cityTitle: true } } },
      orderBy: { id: "asc" },
    }),
    db.center.findMany({ select: { id: true, title: true, provinceTitle: true, cityTitle: true }, orderBy: { title: "asc" } }),
  ]);
  return ok({
    centers: links.map((l) => ({ id: l.center.id, title: l.center.title, provinceTitle: l.center.provinceTitle, cityTitle: l.center.cityTitle, isPrimary: l.isPrimary })),
    allCenters: centers,
  });
}

export async function PUT(req: NextRequest) {
  const acc = await resolveAccess(req);
  if (!acc) return fail("UNAUTHORIZED", 401);
  if (!acc.isAdmin) return fail("فقط مدیر سامانه می‌تواند کلینیک‌های همکاری را تعیین کند", 403);
  const { userId, centerIds } = await req.json().catch(() => ({ userId: 0, centerIds: [] }));
  const uid = Number(userId);
  if (!uid) return fail("شناسه کاربر الزامی است");
  const ids = [...new Set((Array.isArray(centerIds) ? centerIds : []).map((x: unknown) => Number(x)).filter((x: number) => Number.isFinite(x) && x > 0))];

  // اعتبارسنجی — کاربر باید وجود داشته باشد
  const user = await db.user.findUnique({ where: { id: uid }, select: { id: true, name: true, family: true } });
  if (!user) return fail("کاربر یافت نشد", 404);

  // جایگزینی کامل در یک تراکنش
  await db.$transaction([
    db.userCenter.deleteMany({ where: { userId: uid } }),
    ...ids.map((centerId: number, i: number) =>
      db.userCenter.create({ data: { userId: uid, centerId, isPrimary: i === 0 } })
    ),
  ]);
  await db.log.create({
    data: { userId: acc.uid, category: "کلینیک‌های همکاری", description: `تعیین ${ids.length} کلینیک همکاری برای کاربر #${uid} (${user.name} ${user.family})`, level: 2, ip: req.headers.get("x-forwarded-for") ?? "-" },
  }).catch(() => {});

  const links = await db.userCenter.findMany({
    where: { userId: uid },
    include: { center: { select: { id: true, title: true, provinceTitle: true, cityTitle: true } } },
    orderBy: { id: "asc" },
  });
  return ok(safeJson({
    centers: links.map((l) => ({ id: l.center.id, title: l.center.title, provinceTitle: l.center.provinceTitle, cityTitle: l.center.cityTitle, isPrimary: l.isPrimary })),
  }));
}
