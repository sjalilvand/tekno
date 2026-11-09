// =====================================================================
// GET /api/bi — داشبورد توصیفی (کش ۵ دقیقه‌ای)
// محاسبات سنگین در src/lib/bi-build.ts انجام می‌شود
// ---------------------------------------------------------------
// اسکوپ داده — نسخهٔ ۶.۹:
//   • مدیر/کاربران با دسترسی کل → کل دادهٔ سامانه
//   • مشاور → فقط جلسات خودش (پذیرش‌شده یا ناظر)؛ نمودارهای سیستمی حذف می‌شوند
// =====================================================================
import { NextRequest } from "next/server";
import { ok, fail, resolveAccess } from "@/lib/server";
import { buildBiPayload } from "@/lib/bi-build";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const acc = await resolveAccess(req);
  if (!acc) return fail("UNAUTHORIZED", 401);
  const sp = req.nextUrl.searchParams;
  try {
    const payload = await buildBiPayload(sp.get("provinceId"), sp.get("from"), sp.get("to"), acc.seeAllData ? null : acc.uid);
    return ok(payload);
  } catch {
    return fail("خطا در محاسبهٔ داشبورد توصیفی", 500);
  }
}
