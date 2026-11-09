// =====================================================================
// بررسی سلامت اتصال پایگاه داده — GET /api/health
// بدون احراز هویت — برای نمایش وضعیت اتصال در نوار سامانه
// =====================================================================
import { db } from "@/lib/db";
import { isSqlite } from "@/lib/ws/schema";

type HealthResult = { ok: boolean; latencyMs: number; engine: string; error: string | null };

let lastCheck: { at: number; result: HealthResult } | null = null;

export async function GET() {
  // کش ۱۰ ثانیه‌ای — برای جلوگیری از فشار مکرر روی دیتابیس
  if (lastCheck && Date.now() - lastCheck.at < 10_000) {
    return Response.json(lastCheck.result);
  }
  const t0 = Date.now();
  let result: HealthResult;
  try {
    await db.$queryRawUnsafe("SELECT 1");
    result = { ok: true, latencyMs: Date.now() - t0, engine: isSqlite() ? "SQLite" : "MySQL", error: null };
  } catch (e) {
    const msg = (e as Error)?.message ?? "خطای نامشخص";
    result = {
      ok: false,
      latencyMs: Date.now() - t0,
      engine: isSqlite() ? "SQLite" : "MySQL",
      error: translateDbError(msg),
    };
  }
  lastCheck = { at: Date.now(), result };
  return Response.json(result);
}

function translateDbError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("econnrefused") || m.includes("can't reach database server"))
    return "سرویس پایگاه داده در دسترس نیست — مطمئن شوید MySQL اجرا است و پورت آن باز است";
  if (m.includes("access denied") || m.includes("authentication"))
    return "نام کاربری/رمز پایگاه داده اشتباه است — فایل .env را بررسی کنید";
  if (m.includes("unknown database"))
    return "نام پایگاه داده وجود ندارد — دستور prisma db push را اجرا کنید";
  if (m.includes("etimedout") || m.includes("timeout") || m.includes("pool"))
    return "پاسخی از پایگاه داده دریافت نشد (timeout) — اتصال شبکه یا سرور را بررسی کنید";
  if (m.includes("enotfound"))
    return "آدرس سرور پایگاه داده پیدا نشد — مقدار DATABASE_URL را بررسی کنید";
  return raw.slice(0, 200);
}
