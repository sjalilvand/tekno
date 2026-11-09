// =====================================================================
// شِمای زندهٔ دیتابیس برای وب‌سرویس‌ساز و استودیوی پرس‌وجو (مدیر سامانه)
// GET /api/web-services/schema — همهٔ جدول‌ها + ستون‌ها + تعداد ردیف تقریبی
// نسخهٔ ۶.۶ — تشخیص مدیر با موتور یکپارچهٔ سامانه (guardAdmin)
// =====================================================================
import { NextRequest } from "next/server";
import { ok, fail, guardAction } from "@/lib/server";
import { listDbSchema } from "@/lib/ws/schema";

export async function GET(req: NextRequest) {
  // نسخهٔ ۶.۶ — گارد ماتریس دسترسی؛ مدیر همیشه باز (مشکل جدول‌های خالی رفع شد)
  const g = await guardAction(req, "webservices", "view", "وب‌سرویس‌ساز");
  if (g.error) return g.error;
  const force = req.nextUrl.searchParams.get("force") === "1";
  const tables = await listDbSchema(force);
  return ok({ tables });
}
