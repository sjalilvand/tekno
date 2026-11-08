// =====================================================================
// GET /api/bi — داشبورد توصیفی مدیریتی (کش ۵ دقیقه‌ای)
// محاسبات سنگین در src/lib/bi-build.ts انجام می‌شود
// =====================================================================
import { NextRequest } from "next/server";
import { getCurrentUser, ok, fail } from "@/lib/server";
import { buildBiPayload } from "@/lib/bi-build";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const sp = req.nextUrl.searchParams;
  try {
    const payload = await buildBiPayload(sp.get("provinceId"), sp.get("from"), sp.get("to"));
    return ok(payload);
  } catch {
    return fail("خطا در محاسبهٔ داشبورد توصیفی", 500);
  }
}
