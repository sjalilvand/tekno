import { NextRequest } from "next/server";
import { getCurrentUser, ok, fail } from "@/lib/server";
import { getChainStats, getCustomProcessStats } from "@/lib/monitoring";

// =====================================================================
// مانیتورینگ فرایندها — شناسایی گلوگاه‌ها
// • آمار مرحله‌به‌مرحلهٔ زنجیرهٔ تایید واقعی (از مهر زمانی تاییدها)
// • آمار فرایندهای سفارشی تعریف‌شده (از ProcessStepLog)
// • گلوگاه = مرحله‌ای با بیشترین نسبت میانگین انتظار به حد مجاز (SLA)
// =====================================================================

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const [chain, custom] = await Promise.all([getChainStats(180), getCustomProcessStats()]);
  return ok({ chain, custom });
}
