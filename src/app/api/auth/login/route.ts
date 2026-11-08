import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword, isLegacyHash, hashPassword, createSession, sessionCookieOptions, SESSION_COOKIE_NAME, safeJson } from "@/lib/server";

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();
    if (!username || !password) {
      return Response.json({ error: "نام کاربری و رمز عبور الزامی است" }, { status: 400 });
    }
    const user = await db.user.findFirst({
      where: {
        OR: [{ username: String(username).trim() }, { nid: { equals: Number(username) || -1 } }],
      },
      include: { roles: { include: { role: true } } },
    });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return Response.json({ error: "نام کاربری یا رمز عبور نادرست است" }, { status: 401 });
    }
    if (user.blocked) {
      return Response.json({ error: "حساب کاربری شما مسدود شده است" }, { status: 403 });
    }
    // مهاجرت تدریجی: اگر رمز با هش قدیمی PHP درست بود، بی‌درنگ به قالب امن scrypt ارتقا می‌یابد
    if (isLegacyHash(user.passwordHash)) {
      await db.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(password) } }).catch(() => {});
    }
    const ip = req.headers.get("x-forwarded-for") ?? "local";
    const browser = req.headers.get("user-agent")?.slice(0, 200) ?? "-";
    const token = await createSession(user.id, ip, browser);
    await db.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
    await db.log.create({
      data: { userId: user.id, category: "ورود", description: "ورود موفق به سامانه", level: 1, ip, timestamp: new Date() },
    });
    const res = NextResponse.json(
      safeJson({
        user: { id: user.id, name: user.name, family: user.family, username: user.username, avatarColor: user.avatarColor, roles: user.roles.map((r) => r.role.title) },
      })
    );
    res.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
    return res;
  } catch {
    return Response.json({ error: "خطای پردازش درخواست" }, { status: 500 });
  }
}
