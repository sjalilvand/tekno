import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail } from "@/lib/server";

// =====================================================================
// کارتابل متقاضیان — جستجوی هوشمند بر اساس نام، نام خانوادگی، کد ملی، همراه
// فقط کاربرانی که در نقش‌های خود واژهٔ «مشاور/ناظر/مدیر» یا مدیر سامانه
// دارند به پروندهٔ دیگران دسترسی دارند؛ کاربر عادی فقط پروندهٔ خودش.
// =====================================================================

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const digits = q.replace(/\D/g, "");

  const urs = await db.userRole.findMany({
    where: { userId: user.id },
    include: { role: { select: { title: true } } },
  });
  const titles = urs.map((ur) => ur.role?.title ?? "");
  const privileged = titles.some((t) =>
    t.includes("مدیر سامانه") || t.includes("مدیر سیستم") || t.includes("مدیر کل") ||
    t.includes("مدیر مرکز") || t.includes("مشاور") || t.includes("روانپزشک") ||
    t.includes("ناظر") || t.includes("نظارت") || t.includes("admin")
  );

  if (!privileged) {
    // کاربر عادی — فقط کارتابل شخصی
    const rows = await db.user.findMany({
      where: { id: user.id },
      select: {
        id: true, name: true, family: true, nid: true, mobile: true, avatarColor: true, gender: true,
        eventsAsClient: { select: { id: true, status: true, startDate: true } },
      },
    });
    return ok({ privileged: false, rows: rows.map(toRow) });
  }

  if (!q) {
    // فهرست همهٔ متقاضیان — حتی کسانی که هنوز جلسه ندارند؛ جدیدترین‌ها اول
    const rows = await db.user.findMany({
      select: {
        id: true, name: true, family: true, nid: true, mobile: true, avatarColor: true, gender: true,
        eventsAsClient: { select: { id: true, status: true, startDate: true }, orderBy: { startDate: "desc" } },
      },
      orderBy: [{ signupDate: "desc" }],
      take: 60,
    });
    return ok({ privileged: true, rows: rows.map(toRow) });
  }

  const rows = await db.user.findMany({
    where: {
      OR: [
        { name: { contains: q } },
        { family: { contains: q } },
        { username: { contains: q } },
        ...(digits.length >= 4 ? [{ nid: BigInt(digits) }] : []),
        ...(digits.length >= 4 ? [{ mobile: BigInt(digits) }] : []),
      ],
    },
    select: {
      id: true, name: true, family: true, nid: true, mobile: true, avatarColor: true, gender: true,
      eventsAsClient: { select: { id: true, status: true, startDate: true }, orderBy: { startDate: "desc" } },
    },
    take: 30,
  });
  return ok({ privileged: true, rows: rows.map(toRow) });
}

function toRow(u: {
  id: number; name: string; family: string; nid: bigint; mobile: bigint; avatarColor: string | null; gender: string | null;
  eventsAsClient: { id: number; status: string; startDate: Date | null }[];
}) {
  const evs = u.eventsAsClient;
  const last = evs.map((e) => e.startDate).filter(Boolean).sort((a, b) => (b as Date).getTime() - (a as Date).getTime())[0] ?? null;
  return {
    id: u.id, name: u.name, family: u.family, nid: Number(u.nid), mobile: Number(u.mobile),
    avatarColor: u.avatarColor, gender: u.gender,
    sessions: evs.length,
    pending: evs.filter((e) => e.status.includes("در انتظار")).length,
    confirmed: evs.filter((e) => e.status === "تایید نهایی").length,
    lastSession: last ? last.toISOString() : null,
  };
}
