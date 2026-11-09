// =====================================================================
// استودیوی پرس‌وجو — اجرای آزمایشی SELECT روی دیتابیس (مدیر سامانه)
// POST /api/web-services/query-run  { sql: "SELECT ..." }
// فقط SELECT — سقف ۵۰۰ ردیف — بدون امکان تغییر داده
// =====================================================================
import { NextRequest } from "next/server";
import { ok, fail, guardAction } from "@/lib/server";
import { runSelect } from "@/lib/ws/schema";

export async function POST(req: NextRequest) {
  const g = await guardAction(req, "webservices", "view", "وب‌سرویس‌ساز");
  if (g.error) return g.error;
  try {
    const { sql } = await req.json();
    if (!sql || typeof sql !== "string") return fail("متن پرس‌وجو الزامی است");
    const result = await runSelect(sql);
    return ok(result);
  } catch (e) {
    return fail((e as Error).message ?? "خطای اجرای پرس‌وجو");
  }
}
