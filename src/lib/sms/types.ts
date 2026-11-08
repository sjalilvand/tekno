// =====================================================================
// پیامک واقعی — انواع و قرارداد سرویس‌دهنده‌ها
// =====================================================================

export type SmsSendInput = {
  to: string;      // شماره موبایل (۰۹xxxxxxxxx یا 989xxxxxxxxx)
  text: string;    // متن پیامک
  sender?: string; // خط ارسال (اختیاری — در صورت پشتیبانی سرویس)
};

export type SmsSendResult = {
  ok: boolean;
  messageId?: string;
  raw?: string;    // پاسخ خام سرویس برای ذخیره در ستون response جدول SMS
  error?: string;
};

export interface SmsProvider {
  readonly name: string;
  send(input: SmsSendInput): Promise<SmsSendResult>;
}

export type SmsProviderName = "kavenegar" | "smsir" | "mellipayamak" | "soha" | "mock";

export type SmsConfig = {
  provider: SmsProviderName;
  apiKey: string;
  sender: string;
  username: string;
  password: string;
  baseUrl: string;
  enabled: boolean;
};

// کلیدهای تنظیمات در جدول Settings (گروه «پیامک»)
export const SMS_SETTING_KEYS = {
  provider: "sms.provider",
  apiKey: "sms.apiKey",
  sender: "sms.sender",
  username: "sms.username",
  password: "sms.password",
  baseUrl: "sms.baseUrl",
  enabled: "sms.enabled",
} as const;

// نرمال‌سازی شماره موبایل ایران → 09xxxxxxxxx
export function normalizeMobile(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = String(input).replace(/[^\d+]/g, "");
  if (s.startsWith("+98")) s = "0" + s.slice(3);
  if (s.startsWith("0098")) s = "0" + s.slice(4);
  if (s.startsWith("98") && s.length === 12) s = "0" + s.slice(2);
  if (s.startsWith("9") && s.length === 10) s = "0" + s;
  if (!/^09\d{9}$/.test(s)) return null;
  return s;
}
