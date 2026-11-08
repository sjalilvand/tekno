// =====================================================================
// پیامک واقعی — پیاده‌سازی سرویس‌دهنده‌های ایرانی
// منطق ارسال واقعی جایگزین ارسال شبیه‌سازی‌شدهٔ کد PHP قبلی می‌شود.
// هر سرویس‌دهنده فقط به fetch استاندارد نیاز دارد (سازگار با Node 18+ و ویندوز).
// =====================================================================
import type { SmsConfig, SmsProvider, SmsSendInput, SmsSendResult } from "./types";

const TIMEOUT_MS = 15_000;

async function httpJson(url: string, init: RequestInit): Promise<{ status: number; body: any }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let body: any = text;
    try { body = JSON.parse(text); } catch { /* پاسخ غیر JSON — همان متن خام */ }
    return { status: res.status, body };
  } finally {
    clearTimeout(t);
  }
}

function fail(error: string, raw?: string): SmsSendResult {
  return { ok: false, error, raw };
}

// --------------------------------------------------------------- کاوه‌نگار
export function kavenegarProvider(cfg: SmsConfig): SmsProvider {
  return {
    name: "kavenegar",
    async send({ to, text }: SmsSendInput): Promise<SmsSendResult> {
      if (!cfg.apiKey) return fail("کلید API کاوه‌نگار تنظیم نشده است (sms.apiKey)");
      const sender = cfg.sender || "";
      const url =
        `https://api.kavenegar.com/v1/${encodeURIComponent(cfg.apiKey)}/sms/send.json` +
        `?receptor=${encodeURIComponent(to)}&message=${encodeURIComponent(text)}` +
        (sender ? `&sender=${encodeURIComponent(sender)}` : "");
      const { status, body } = await httpJson(url, { method: "GET" });
      if (status === 200 && body?.return?.status === 200) {
        const msgid = body?.entries?.[0]?.messageid;
        return { ok: true, messageId: String(msgid ?? ""), raw: JSON.stringify(body) };
      }
      return fail(body?.return?.message ?? `خطای کاوه‌نگار (HTTP ${status})`, JSON.stringify(body));
    },
  };
}

// --------------------------------------------------------------- SMS.ir
export function smsirProvider(cfg: SmsConfig): SmsProvider {
  return {
    name: "smsir",
    async send({ to, text }: SmsSendInput): Promise<SmsSendResult> {
      if (!cfg.apiKey) return fail("کلید API سرویس SMS.ir تنظیم نشده است (sms.apiKey)");
      const { status, body } = await httpJson("https://api.sms.ir/v1/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": cfg.apiKey, Accept: "application/json" },
        body: JSON.stringify({ lineNumber: cfg.sender, messageText: text, mobiles: [to] }),
      });
      if (status === 200 && (body?.status === 1 || body?.status === "1")) {
        return { ok: true, messageId: String(body?.data?.packId ?? body?.data?.messageId ?? ""), raw: JSON.stringify(body) };
      }
      return fail(body?.message ?? `خطای SMS.ir (HTTP ${status})`, JSON.stringify(body));
    },
  };
}

// --------------------------------------------------------------- ملی پیامک
export function mellipayamakProvider(cfg: SmsConfig): SmsProvider {
  return {
    name: "mellipayamak",
    async send({ to, text }: SmsSendInput): Promise<SmsSendResult> {
      if (!cfg.username || !cfg.password) return fail("نام کاربری/رمز ملی پیامک تنظیم نشده است");
      const { status, body } = await httpJson("https://rest.payamak-panel.com/api/SendSMS/SendSMS", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: cfg.username, password: cfg.password,
          to, from: cfg.sender, text, isFlash: false,
        }),
      });
      const ret = String(body?.Value ?? body?.value ?? "");
      const code = Number(body?.RetStatus ?? body?.retStatus ?? -1);
      if (status === 200 && code === 1) return { ok: true, messageId: ret, raw: JSON.stringify(body) };
      return fail(body?.DescText ?? `خطای ملی پیامک (RetStatus=${code})`, JSON.stringify(body));
    },
  };
}

// --------------------------------------------------------------- پنل سها
// در سامانهٔ قبلی (PHP) ارسال از طریق پنل سها انجام می‌شد؛ این ارائه‌دهنده
// همان رفتار را بازتولید می‌کند. آدرس پایه پنل و کلید احراز هویت از
// تنظیمات (sms.baseUrl / sms.apiKey) خوانده می‌شود. در صورت تفاوت قرارداد
// واقعی پنل، فقط این متد را متناسب با مستندات پنل سها تنظیم کنید.
export function sohaProvider(cfg: SmsConfig): SmsProvider {
  return {
    name: "soha",
    async send({ to, text }: SmsSendInput): Promise<SmsSendResult> {
      const base = cfg.baseUrl;
      if (!base) return fail("آدرس پایه پنل سها تنظیم نشده است (sms.baseUrl)");
      const url = `${base.replace(/\/+$/, "")}/api/sms/send`;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (cfg.apiKey) headers["Authorization"] = `Bearer ${cfg.apiKey}`;
      else if (cfg.username && cfg.password) headers["Authorization"] = "Basic " + Buffer.from(`${cfg.username}:${cfg.password}`).toString("base64");
      const { status, body } = await httpJson(url, {
        method: "POST", headers,
        body: JSON.stringify({ sender: cfg.sender, receptor: to, message: text }),
      });
      if (status >= 200 && status < 300) {
        const okFlag = body?.success ?? body?.ok ?? true;
        if (okFlag) return { ok: true, messageId: String(body?.id ?? body?.messageId ?? ""), raw: JSON.stringify(body) };
      }
      return fail(body?.message ?? `خطای پنل سها (HTTP ${status})`, JSON.stringify(body));
    },
  };
}

// --------------------------------------------------------------- شبیه‌ساز (توسعه/دمو)
export function mockProvider(): SmsProvider {
  return {
    name: "mock",
    async send({ to, text }: SmsSendInput): Promise<SmsSendResult> {
      return { ok: true, messageId: `mock-${Date.now()}`, raw: `MOCK → ${to}: ${text.slice(0, 40)}…` };
    },
  };
}

export function resolveProvider(cfg: SmsConfig): SmsProvider {
  switch (cfg.provider) {
    case "kavenegar": return kavenegarProvider(cfg);
    case "smsir": return smsirProvider(cfg);
    case "mellipayamak": return mellipayamakProvider(cfg);
    case "soha": return sohaProvider(cfg);
    default: return mockProvider();
  }
}
