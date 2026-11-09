import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, resolveAccess, hasModuleAccess } from "@/lib/server";

// =====================================================================
// کارتابل متقاضیان — جستجوی هوشمند بر اساس نام، نام خانوادگی، کد ملی، همراه
// نسخهٔ ۶.۵ — دسترسی بر پایهٔ resolveAccess:
//   مدیر/مجاز با ماتریس «cartable» → همهٔ متقاضیان
//   مشاور → فقط مراجعان خودش (جلساتی که مشاور یا ناظرش بوده)
//   کاربر عادی → فقط پروندهٔ شخصی خودش
// کد ملی از جدول کاربر؛ اگر صفر بود از جلسات (Events.nid) بازیابی می‌شود
// =====================================================================

export async function GET(req: NextRequest) {
  const acc = await resolveAccess(req);
  if (!acc) return fail("UNAUTHORIZED", 401);
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const digits = q.replace(/\D/g, "");

  const privileged = acc.isAdmin || hasModuleAccess(acc, "cartable");

  if (!privileged) {
    // کاربر عادی — فقط کارتابل شخصی
    const rows = await db.user.findMany({
      where: { id: acc.uid },
      select: userSelect,
    });
    return ok({ privileged: false, rows: rows.map(toRow) });
  }

  // اسکوپ مشاور — فقط مراجعان خودش
  let scopeIds: number[] | null = null;
  if (!acc.seeAllData) {
    const mine = await db.event.findMany({
      where: { OR: [{ acceptorId: acc.uid }, { supervisorId: acc.uid }] },
      select: { userId: true },
      distinct: ["userId"],
    });
    scopeIds = [...new Set([...mine.map((e) => e.userId), acc.uid])];
    if (scopeIds.length === 0) return ok({ privileged: true, scoped: true, rows: [] });
  }

  const scopeWhere = scopeIds ? { id: { in: scopeIds } } : {};

  if (!q) {
    // فهرست همهٔ متقاضیان مجاز — جدیدترین‌ها اول
    const rows = await db.user.findMany({
      where: scopeWhere,
      select: userSelect,
      orderBy: [{ signupDate: "desc" }],
      take: 60,
    });
    return ok({ privileged: true, scoped: Boolean(scopeIds), rows: rows.map(toRow) });
  }

  const rows = await db.user.findMany({
    where: {
      AND: [
        scopeWhere,
        {
          OR: [
            { name: { contains: q } },
            { family: { contains: q } },
            { username: { contains: q } },
            ...(digits.length >= 4 ? [{ nid: BigInt(digits) }] : []),
            ...(digits.length >= 4 ? [{ mobile: BigInt(digits) }] : []),
          ],
        },
      ],
    },
    select: userSelect,
    take: 30,
  });
  return ok({ privileged: true, scoped: Boolean(scopeIds), rows: rows.map(toRow) });
}

const userSelect = {
  id: true, name: true, family: true, nid: true, mobile: true, avatarColor: true, gender: true,
  eventsAsClient: { select: { id: true, status: true, startDate: true, nid: true }, orderBy: { startDate: "desc" as const } },
} as const;

type UserRow = {
  id: number; name: string; family: string; nid: bigint; mobile: bigint; avatarColor: string | null; gender: string | null;
  eventsAsClient: { id: number; status: string; startDate: Date | null; nid: bigint }[];
};

function toRow(u: UserRow) {
  const evs = u.eventsAsClient;
  const last = evs.map((e) => e.startDate).filter(Boolean).sort((a, b) => (b as Date).getTime() - (a as Date).getTime())[0] ?? null;
  // کد ملی — اول از جدول کاربر، اگر صفر بود از جلسات (دادهٔ قدیمی)
  const nidFromEvent = evs.map((e) => e.nid).find((n) => n && n !== 0n) ?? 0n;
  const nid = Number(u.nid) || Number(nidFromEvent);
  return {
    id: u.id, name: u.name, family: u.family, nid, mobile: Number(u.mobile),
    avatarColor: u.avatarColor, gender: u.gender,
    sessions: evs.length,
    pending: evs.filter((e) => e.status.includes("در انتظار")).length,
    confirmed: evs.filter((e) => e.status === "تایید نهایی").length,
    lastSession: last ? last.toISOString() : null,
  };
}
