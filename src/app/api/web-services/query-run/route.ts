// =====================================================================
// استودیوی پرس‌وجو — اجرای آزمایشی SELECT روی دیتابیس (مدیر سامانه)
// POST /api/web-services/query-run  { sql: "SELECT ..." }
// فقط SELECT — سقف ۵۰۰ ردیف — بدون امکان تغییر داده
// =====================================================================
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail } from "@/lib/server";
import { runSelect } from "@/lib/ws/schema";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const full = await db.user.findUnique({ where: { id: user.id }, include: { roles: { include: { role: true } } } });
  const roles = full?.roles.map((r) => r.role.title).join("|") ?? "";
  if (!/مدیر سامانه|مدیر سیستم|admin/i.test(roles)) return fail("UNAUTHORIZED", 401);
  try {
    const { sql } = await req.json();
    if (!sql || typeof sql !== "string") return fail("متن پرس‌وجو الزامی است");
    const result = await runSelect(sql);
    return ok(result);
  } catch (e) {
    return fail((e as Error).message ?? "خطای اجرای پرس‌وجو");
  }
}
