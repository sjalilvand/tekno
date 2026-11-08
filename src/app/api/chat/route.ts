import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail } from "@/lib/server";
import { askAssistant, welcome, scopeForUser, type ChatPayload, type ChatUser } from "@/lib/assistant";

// =====================================================================
// چت آنلاین هوشمند — گوشهٔ پایین سامانه
// • GET  ?history=1 : آخرین پیام‌های گفتگوی کاربر  | بدون پارامتر: خوش‌آمد
// • POST {message}  : پرسش کاربر → پاسخ ساختاریافته (متن + نمودار/کارت)
// • DELETE          : پاک‌سازی تاریخچهٔ گفتگوی کاربر
// تاریخچه در جدول ChatMessages ذخیره می‌شود تا گفتگو بین ورودها ادامه یابد.
// =====================================================================

type SessionUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

function toChatUser(u: SessionUser): ChatUser {
  return { id: u.id, name: u.name, family: u.family, username: u.username, provinceId: u.provinceId, mobile: u.mobile };
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const chatUser = toChatUser(user);
  const history = req.nextUrl.searchParams.get("history");

  if (history) {
    const rows = await db.chatMessage.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 40,
    });
    const messages = rows.reverse().map((r) => ({
      id: r.id, role: r.role, text: r.text,
      payload: r.payload ? safeParse(r.payload) : undefined,
      createdAt: r.createdAt,
    }));
    return ok({ messages });
  }

  const scope = await scopeForUser(chatUser);
  const w = await welcome(chatUser, scope);
  return ok({ scope: scope.kind, acuteUnread: await countOpenAcute(scope), reply: w });
}

async function countOpenAcute(scope: { kind: string; userId: number }): Promise<number> {
  try {
    const rows = await db.eventsEms.findMany({
      where: { severity: "بالا", hadPaymentStatus: "در انتظار بررسی" },
      select: { event: { select: { userId: true, acceptorId: true, centerAdminId: true } } },
      take: 100,
    });
    return rows.filter((r) => {
      if (scope.kind === "all") return true;
      if (scope.kind === "center") return r.event.centerAdminId === scope.userId;
      if (scope.kind === "consultant") return r.event.acceptorId === scope.userId;
      return r.event.userId === scope.userId;
    }).length;
  } catch {
    return 0;
  }
}

function safeParse(s: string): ChatPayload | undefined {
  try { return JSON.parse(s); } catch { return undefined; }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  let body: { message?: string };
  try { body = await req.json(); } catch { return fail("BAD_REQUEST"); }
  const message = String(body.message ?? "").trim().slice(0, 500);
  if (!message) return fail("متن پرسش خالی است");

  const chatUser = toChatUser(user);
  const reply = await askAssistant(message, chatUser);

  // ذخیرهٔ گفتگو (بی‌صدا — خطای ذخیره نباید پاسخ را ببندد)
  try {
    await db.chatMessage.create({ data: { userId: user.id, role: "user", text: message } });
    await db.chatMessage.create({
      data: {
        userId: user.id, role: "assistant", text: reply.text,
        payload: reply.payload ? JSON.stringify(reply.payload) : null,
      },
    });
  } catch (e) {
    console.error("[chat] save failed:", (e as Error).message);
  }
  return ok(reply);
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const chatUser = toChatUser(user);
  await db.chatMessage.deleteMany({ where: { userId: user.id } });
  const scope = await scopeForUser(chatUser);
  return ok({ reply: await welcome(chatUser, scope) });
}
