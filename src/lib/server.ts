// ابزارهای سمت سرور — احراز هویت با نشست امن و تبدیل امن JSON
import { db } from "@/lib/db";
import { scryptSync, randomBytes, timingSafeEqual, createHash } from "crypto";
import { NextRequest } from "next/server";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

const SESSION_COOKIE = "rz_session";

export function tokenFor(userId: number): string {
  return createHash("sha256").update(`rz:${userId}:${Date.now()}:${randomBytes(8)}`).digest("hex");
}

export async function createSession(userId: number, ip?: string, browser?: string) {
  const token = tokenFor(userId);
  await db.session.create({ data: { userId, token, ip: ip ?? "-", browser: browser ?? "-" } });
  return token;
}

export function getSessionToken(req: NextRequest): string | null {
  return req.cookies.get(SESSION_COOKIE)?.value ?? null;
}

export async function getCurrentUser(req: NextRequest) {
  const token = getSessionToken(req);
  if (!token) return null;
  const session = await db.session.findUnique({ where: { token }, include: { user: true } });
  if (!session) return null;
  return session.user;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  };
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;

/** تبدیل امن به JSON — BigInt و Date به نوع قابل سریال‌شدن تبدیل می‌شوند */
 
export function safeJson(data: any): any {
  return JSON.parse(
    JSON.stringify(data, (_k, v) => {
      if (typeof v === "bigint") return Number(v);
      return v;
    })
  );
}

/** پاسخ استاندارد موفق */
 
export function ok(data: any = true) {
  return Response.json(safeJson(data));
}

/** پاسخ خطا */
export function fail(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

/** خواندن پارامترهای جستجو */
export function params(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  return {
    q: sp.get("q")?.trim() ?? "",
    status: sp.get("status") ?? "",
    serviceId: sp.get("serviceId") ?? "",
    centerId: sp.get("centerId") ?? "",
    provinceId: sp.get("provinceId") ?? "",
    roleId: sp.get("roleId") ?? "",
    level: sp.get("level") ?? "",
    year: sp.get("year") ?? "",
    from: sp.get("from") ?? "",
    to: sp.get("to") ?? "",
    page: Math.max(1, Number(sp.get("page") ?? 1)),
    pageSize: Math.min(100, Math.max(5, Number(sp.get("pageSize") ?? 20))),
  };
}
