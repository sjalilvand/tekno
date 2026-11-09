import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail, guardAction } from "@/lib/server";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const box = req.nextUrl.searchParams.get("box") ?? "inbox"; // inbox | sent | all

  const where = box === "sent" ? { fromUserId: user.id } : box === "inbox" ? { toUserId: user.id } : {};
  const [messages, unread] = await Promise.all([
    db.message.findMany({
      where,
      include: {
        fromUser: { select: { id: true, name: true, family: true, avatarColor: true } },
        toUser: { select: { id: true, name: true, family: true } },
      },
      orderBy: { timestamp: "desc" },
      take: 60,
    }),
    db.message.count({ where: { toUserId: user.id, isRead: false } }),
  ]);
  return ok({ messages, unread });
}

export async function POST(req: NextRequest) {
  // سطح دسترسی عملیاتی — ارسال پیام = ثبت (نسخهٔ ۶.۵)
  const g = await guardAction(req, "messages", "create", "پیام‌های داخلی");
  if (g.error) return g.error;
  const user = g.acc.user;
  const { toUserId, subject, text } = await req.json();
  if (!text?.trim() || !toUserId) return fail("گیرنده و متن پیام الزامی است");
  const msg = await db.message.create({
    data: { fromUserId: user.id, toUserId: Number(toUserId), subject: subject?.trim() || "بدون موضوع", text: text.trim() },
  });
  return ok(msg);
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const { id, star, isRead } = await req.json();
  if (!id) return fail("شناسه پیام الزامی است");
  const data: Record<string, unknown> = {};
  if (typeof star === "boolean") data.star = star;
  if (isRead) data.isRead = true;
  await db.message.update({ where: { id: Number(id) }, data });
  return ok();
}
