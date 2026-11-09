import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, safeJson, resolveAccess, getSessionUser, isAdminUser, ACTAS_COOKIE } from "@/lib/server";

// =====================================================================
// ورود نیابتی مدیر — بدون نام کاربری/رمز، وارد حساب هر کاربر شوید
// POST   { userId }  → ورود به حساب کاربر (فقط مدیر سامانه)
// DELETE             → بازگشت به حساب مدیر
// GET                → وضعیت فعلی نیابت
// کوکی rz_actas فقط وقتی معتبر است که نشستِ اصلی متعلق به مدیر باشد؛
// بنابراین هیچ کاربر دیگری نمی‌تواند خودش را جای کسی جا بزند.
// =====================================================================

export async function POST(req: NextRequest) {
  // getSessionUser — کاربرِ واقعی نشست (حتی اگر در حال نیابت باشیم، باز هم مدیرِ پایه چک می‌شود)
  const base = await getSessionUser(req);
  if (!base) return fail("UNAUTHORIZED", 401);
  if (!(await isAdminUser(base.id))) return fail("فقط مدیر سامانه می‌تواند وارد حساب کاربران دیگر شود", 403);

  const { userId } = await req.json().catch(() => ({ userId: 0 }));
  const uid = Number(userId);
  if (!uid) return fail("شناسه کاربر الزامی است");
  const target = await db.user.findUnique({
    where: { id: uid },
    select: { id: true, name: true, family: true, avatarColor: true, username: true, blocked: true },
  });
  if (!target) return fail("کاربر یافت نشد", 404);
  if (target.blocked) return fail("حساب این کاربر مسدود است");

  const res = NextResponse.json(safeJson({ user: target }));
  res.cookies.set(ACTAS_COOKIE, String(uid), {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 2, // نیابت حداکثر ۲ ساعت
  });
  await db.log.create({
    data: { userId: base.id, category: "ورود نیابتی", description: `ورود مدیر به حساب کاربر #${uid} (${target.name} ${target.family})`, level: 2, ip: req.headers.get("x-forwarded-for") ?? "-" },
  }).catch(() => {});
  return res;
}

export async function DELETE(req: NextRequest) {
  const res = NextResponse.json(safeJson({ ok: true }));
  res.cookies.set(ACTAS_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: false, path: "/", maxAge: 0 });
  return res;
}

export async function GET(req: NextRequest) {
  const acc = await resolveAccess(req);
  if (!acc) return fail("UNAUTHORIZED", 401);
  return ok({
    acting: acc.acting,
    user: { id: acc.user.id, name: acc.user.name, family: acc.user.family, avatarColor: acc.user.avatarColor, username: acc.user.username },
    actor: acc.actor ? { id: acc.actor.id, name: acc.actor.name, family: acc.actor.family } : null,
  });
}
