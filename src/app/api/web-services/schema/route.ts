// =====================================================================
// شِمای زندهٔ دیتابیس برای وب‌سرویس‌ساز و استودیوی پرس‌وجو (مدیر سامانه)
// GET /api/web-services/schema — همهٔ جدول‌ها + ستون‌ها + تعداد ردیف تقریبی
// =====================================================================
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail } from "@/lib/server";
import { listDbSchema } from "@/lib/ws/schema";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const full = await db.user.findUnique({ where: { id: user.id }, include: { roles: { include: { role: true } } } });
  const roles = full?.roles.map((r) => r.role.title).join("|") ?? "";
  if (!/مدیر سامانه|مدیر سیستم|admin/i.test(roles)) return fail("UNAUTHORIZED", 401);
  const force = req.nextUrl.searchParams.get("force") === "1";
  const tables = await listDbSchema(force);
  return ok({ tables });
}
