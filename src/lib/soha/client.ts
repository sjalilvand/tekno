// =====================================================================
// وب‌سرویس سها — کلاینت HTTP با احراز هویت، مهلت زمانی و تلاش مجدد
// =====================================================================
import type { SohaConfig } from "./types";

const TIMEOUT_MS = 20_000;
const RETRIES = 2;

export class SohaError extends Error {
  constructor(message: string, readonly status?: number, readonly raw?: string) {
    super(message);
    this.name = "SohaError";
  }
}

export class SohaClient {
  constructor(private cfg: SohaConfig) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
    if (this.cfg.apiKey) {
      h["Authorization"] = `Bearer ${this.cfg.apiKey}`;
      h["X-API-Key"] = this.cfg.apiKey;
    } else if (this.cfg.username && this.cfg.password) {
      h["Authorization"] = "Basic " + Buffer.from(`${this.cfg.username}:${this.cfg.password}`).toString("base64");
    }
    if (this.cfg.centerCode) h["X-Center-Code"] = this.cfg.centerCode;
    return h;
  }

  private url(path: string): string {
    if (/^https?:\/\//i.test(path)) return path;
    const base = this.cfg.baseUrl.replace(/\/+$/, "");
    return `${base}/${path.replace(/^\/+/, "")}`;
  }

  // درخواست عمومی — تمام متدهای اختصاصی (که از PHP منتقل می‌شوند) از این عبور می‌کنند
  async request<T = any>(method: "GET" | "POST" | "PUT", path: string, params?: Record<string, any>): Promise<T> {
    if (!this.cfg.baseUrl) throw new SohaError("آدرس پایه وب‌سرویس سها تنظیم نشده است (soha.baseUrl)");
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const qs = method === "GET" && params ? "?" + new URLSearchParams(
          Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
            .map(([k, v]) => [k, String(v)])
        ).toString() : "";
        const res = await fetch(this.url(path) + qs, {
          method,
          headers: this.headers(),
          body: method !== "GET" ? JSON.stringify(params ?? {}) : undefined,
          signal: ctrl.signal,
        });
        const text = await res.text();
        let body: any = text;
        try { body = JSON.parse(text); } catch { /* پاسخ غیر JSON */ }
        if (res.status === 401) throw new SohaError("احراز هویت سها ناموفق بود — نام کاربری/رمز یا کلید را بررسی کنید", 401, text);
        if (res.status === 404) throw new SohaError(`مسیر ${path} در وب‌سرویس سها یافت نشد — مسیر واقعی را مطابق مستندات تنظیم کنید`, 404, text);
        if (!res.ok) throw new SohaError(`خطای سها (HTTP ${res.status})`, res.status, text);
        // برخی وب‌سرویس‌ها داخل بدنه کد وضعیت دارند
        if (body && typeof body === "object" && "success" in body && body.success === false) {
          throw new SohaError(body?.message ?? "وب‌سرویس سها خطای منطقی برگرداند", res.status, text);
        }
        return body as T;
      } catch (e: any) {
        lastErr = e instanceof SohaError ? e : new SohaError(e?.message === "This operation was aborted" ? "مهلت زمانی اتصال به سها به پایان رسید" : (e?.message ?? "خطای شبکه در اتصال به سها"));
        if (attempt < RETRIES) {
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
          continue;
        }
      } finally {
        clearTimeout(t);
      }
    }
    throw lastErr ?? new SohaError("خطای ناشناخته در اتصال به سها");
  }
}
