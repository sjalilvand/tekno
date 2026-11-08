// =====================================================================
// پیامک واقعی — لایهٔ سرویس
// • پیکربندی از جدول Settings (گروه «پیامک») با مقادیر پیش‌فرض محیطی
// • dispatchQueue: پردازش صف پیامک‌های جدول SMS (وضعیت «در صف»)
//   و به‌روزرسانی وضعیت/پاسخ/تعداد تلاش — جایگزین کرون جاب PHP
// =====================================================================
import { db } from "@/lib/db";
import type { Sms, User } from "@prisma/client";
import { resolveProvider } from "./providers";
import {
  SMS_SETTING_KEYS, normalizeMobile,
  type SmsConfig, type SmsProviderName, type SmsSendResult,
} from "./types";

export * from "./types";

const MAX_EFFORTS = 3;

// خواندن پیکربندی پیامک از جدول Settings با fallback به متغیرهای محیطی
export async function getSmsConfig(): Promise<SmsConfig> {
  const rows = await db.setting.findMany({
    where: { name: { startsWith: "sms." } },
  });
  const map = new Map(rows.map((r) => [r.name, r.value ?? ""]));
  const pick = (key: string, env: string, dflt = "") => {
    const v = map.get(key);
    return v !== undefined && v !== "" ? v : (process.env[env] || dflt);
  };
  const provider = (pick(SMS_SETTING_KEYS.provider, "SMS_PROVIDER", "mock") || "mock") as SmsProviderName;
  const enabledRaw = pick(SMS_SETTING_KEYS.enabled, "SMS_ENABLED", "false");
  return {
    provider,
    apiKey: pick(SMS_SETTING_KEYS.apiKey, "SMS_API_KEY"),
    sender: pick(SMS_SETTING_KEYS.sender, "SMS_SENDER"),
    username: pick(SMS_SETTING_KEYS.username, "SMS_USERNAME"),
    password: pick(SMS_SETTING_KEYS.password, "SMS_PASSWORD"),
    baseUrl: pick(SMS_SETTING_KEYS.baseUrl, "SMS_BASE_URL"),
    enabled: enabledRaw === "true" || enabledRaw === "1",
  };
}

// ذخیرهٔ گروهی تنظیمات پیامک
export async function saveSmsConfig(values: Partial<Record<keyof typeof SMS_SETTING_KEYS, string>>) {
  const entries = Object.entries(values).filter(([, v]) => v !== undefined) as [string, string][];
  for (const [key, value] of entries) {
    const name = SMS_SETTING_KEYS[key as keyof typeof SMS_SETTING_KEYS];
    if (!name) continue;
    await db.setting.upsert({ where: { name }, update: { value }, create: { name, value, group: "پیامک" } });
  }
}

export type DispatchSummary = {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  provider: string;
  enabled: boolean;
};

// پردازش صف پیامک — وضعیت «در صف» را می‌فرستد و نتیجه را ثبت می‌کند.
// با retry=true پیامک‌های ناموفقی که کمتر از MAX_EFFORTS تلاش دارند هم دوباره ارسال می‌شوند.
export async function dispatchQueue(opts: { limit?: number; retry?: boolean } = {}): Promise<DispatchSummary> {
  const cfg = await getSmsConfig();
  const summary: DispatchSummary = {
    processed: 0, sent: 0, failed: 0, skipped: 0,
    provider: cfg.provider, enabled: cfg.enabled,
  };
  if (!cfg.enabled) return summary; // کلید خاموش — فقط صف می‌ماند

  const statusFilter = opts.retry
    ? { in: ["در صف", "ناموفق"] }
    : "در صف";
  const rows = await db.sms.findMany({
    where: { status: statusFilter, efforts: { lt: MAX_EFFORTS } },
    include: { receiver: { select: { id: true, name: true, family: true, mobile: true } } },
    orderBy: { createTime: "asc" },
    take: Math.min(Math.max(opts.limit ?? 100, 1), 500),
  }) as (Sms & { receiver: { id: number; name: string; family: string; mobile: bigint } })[];

  const provider = resolveProvider(cfg);
  for (const row of rows) {
    summary.processed++;
    const mobile = normalizeMobile(row.receiver?.mobile as unknown as string);
    if (!mobile) {
      await db.sms.update({
        where: { id: row.id },
        data: { status: "ناموفق", response: "شماره موبایل گیرنده معتبر نیست", efforts: { increment: 1 }, updateTime: new Date() },
      });
      summary.failed++;
      continue;
    }
    let result: SmsSendResult;
    try {
      result = await provider.send({ to: mobile, text: row.message, sender: cfg.sender });
    } catch (e: any) {
      result = { ok: false, error: e?.message ?? "خطای ناشناخته" };
    }
    await db.sms.update({
      where: { id: row.id },
      data: {
        status: result.ok ? "ارسال شده" : "ناموفق",
        response: (result.raw ?? result.error ?? "").slice(0, 900),
        efforts: { increment: 1 },
        updateTime: new Date(),
      },
    });
    if (result.ok) summary.sent++; else summary.failed++;
  }
  return summary;
}
