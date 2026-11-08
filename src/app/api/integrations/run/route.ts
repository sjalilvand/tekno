// =====================================================================
// یکپارچه‌سازی‌ها — اجرای عملیات
// POST { action: "sms-dispatch", limit?, retry? }  → ارسال صف پیامک
// POST { action: "soha-sync", entity, direction }  → همگام‌سازی سها
// =====================================================================
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail } from "@/lib/server";
import { dispatchQueue } from "@/lib/sms";
import { runSohaSync, getSohaConfig, SOHA_ENTITIES } from "@/lib/soha";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const body = await req.json().catch(() => ({}));

  if (body.action === "sms-dispatch") {
    const summary = await dispatchQueue({ limit: body.limit, retry: Boolean(body.retry) });
    await db.syncLog.create({
      data: {
        service: "SMS", entity: "Queue", direction: "OUT",
        status: summary.processed > 0 && summary.sent === 0 && summary.failed > 0 ? "ناموفق" : "موفق",
        records: summary.sent,
        message: `پردازش ${summary.processed} پیامک در صف (${summary.provider}) — ارسال: ${summary.sent}، ناموفق: ${summary.failed}${summary.enabled ? "" : " — سرویس غیرفعال"}`,
      },
    });
    await db.log.create({
      data: {
        userId: user.id, category: "ارسال پیامک", level: 2,
        description: `اجرای صف پیامک واقعی (${summary.provider}) — ارسال: ${summary.sent}، ناموفق: ${summary.failed}`,
      },
    });
    return ok(summary);
  }

  if (body.action === "soha-sync") {
    const cfg = await getSohaConfig();
    if (!cfg.enabled) return fail("وب‌سرویس سها فعال نیست — ابتدا در تنظیمات فعال کنید");
    if (!cfg.baseUrl) return fail("آدرس پایه وب‌سرویس سها تنظیم نشده است");
    const entity = SOHA_ENTITIES.includes(body.entity) ? body.entity : "Referrals";
    const direction = body.direction === "OUT" ? "OUT" : "IN";
    const result = await runSohaSync(entity, direction);
    await db.log.create({
      data: {
        userId: user.id, category: "یکپارچه‌سازی‌ها", level: 2,
        description: `همگام‌سازی ${entity} ${direction === "IN" ? "از سها" : "به سها"} — ${result.ok ? `موفق (${result.records} رکورد)` : `ناموفق: ${result.message ?? ""}`}`,
      },
    });
    if (!result.ok) return fail(result.message ?? "همگام‌سازی ناموفق بود");
    return ok(result);
  }

  return fail("عملیات نامعتبر است — از sms-dispatch یا soha-sync استفاده کنید");
}
