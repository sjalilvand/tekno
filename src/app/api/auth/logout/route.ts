import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionToken, SESSION_COOKIE_NAME } from "@/lib/server";

export async function POST(req: NextRequest) {
  const token = getSessionToken(req);
  if (token) {
    await db.session.deleteMany({ where: { token } });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return res;
}
