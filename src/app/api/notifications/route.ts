// =====================================================================
// اعلان‌ها — هشدارهای مدل ریسک و اطلاعیه‌های سامانه
// GET  /api/notifications        — اعلان‌های من + تعداد خوانده‌نشده
// POST /api/notifications        — { id } یا { all: true } خواندن
// =====================================================================
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail, safeJson } from "@/lib/server";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const [items, unread] = await Promise.all([
    db.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.notification.count({ where: { userId: user.id, isRead: false } }),
  ]);
  return ok({ items: safeJson(items), unread });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const body = await req.json().catch(() => ({}));
  if (body.all) {
    await db.notification.updateMany({ where: { userId: user.id, isRead: false }, data: { isRead: true } });
    return ok();
  }
  if (body.id) {
    await db.notification.updateMany({ where: { id: Number(body.id), userId: user.id }, data: { isRead: true } });
    return ok();
  }
  return fail("پارامتر لازم است");
}
