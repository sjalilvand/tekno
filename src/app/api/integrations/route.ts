// =====================================================================
// یکپارچه‌سازی‌ها — وضعیت، تنظیمات (پیامک واقعی و وب‌سرویس سها) و لاگ‌ها
// =====================================================================
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail } from "@/lib/server";
import { getSmsConfig, saveSmsConfig, SMS_SETTING_KEYS } from "@/lib/sms";
import { getSohaConfig, saveSohaConfig, SOHA_SETTING_KEYS, sohaCursorKey } from "@/lib/soha";

function mask(v: string): string {
  if (!v) return "";
  if (v.length <= 4) return "••••";
  return "••••••" + v.slice(-4);
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);

  const [sms, soha, queueStats, syncLogs, cursors] = await Promise.all([
    getSmsConfig(),
    getSohaConfig(),
    db.sms.groupBy({ by: ["status"], _count: true }),
    db.syncLog.findMany({ orderBy: { createTime: "desc" }, take: 25 }),
    db.setting.findMany({ where: { name: { startsWith: "soha.cursor." } } }),
  ]);

  const statusAgg: Record<string, number> = {};
  for (const q of queueStats) statusAgg[q.status] = q._count;

  return ok({
    sms: {
      ...sms,
      apiKey: mask(sms.apiKey),
      password: mask(sms.password),
      configured: Boolean(sms.apiKey || (sms.username && sms.password)),
    },
    soha: {
      ...soha,
      password: mask(soha.password),
      apiKey: mask(soha.apiKey),
      configured: Boolean(soha.baseUrl && (soha.apiKey || (soha.username && soha.password))),
      cursors: cursors.map((c) => ({ entity: c.name.replace(sohaCursorKey(""), ""), cursor: c.value })),
    },
    queueStats: statusAgg,
    syncLogs,
  });
}

// ذخیرهٔ تنظیمات — مقادیر خالی نادیده گرفته می‌شوند تا رمزها به‌طور تصادفی پاک نشوند
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const body = await req.json().catch(() => null);
  if (!body) return fail("بدنهٔ درخواست نامعتبر است");

  if (body.sms) {
    const s = body.sms;
    await saveSmsConfig({
      provider: s.provider, sender: s.sender, baseUrl: s.baseUrl, username: s.username,
      enabled: s.enabled !== undefined ? String(Boolean(s.enabled)) : undefined,
      apiKey: s.apiKey && !s.apiKey.includes("••") ? s.apiKey : undefined,
      password: s.password && !s.password.includes("••") ? s.password : undefined,
    });
  }
  if (body.soha) {
    const s = body.soha;
    await saveSohaConfig({
      baseUrl: s.baseUrl, username: s.username, centerCode: s.centerCode,
      protocol: s.protocol,
      enabled: s.enabled !== undefined ? String(Boolean(s.enabled)) : undefined,
      apiKey: s.apiKey && !s.apiKey.includes("••") ? s.apiKey : undefined,
      password: s.password && !s.password.includes("••") ? s.password : undefined,
    });
  }
  await db.log.create({
    data: { userId: user.id, category: "یکپارچه‌سازی‌ها", description: "به‌روزرسانی تنظیمات وب‌سرویس سها / پیامک واقعی", level: 2 },
  });
  return ok();
}
