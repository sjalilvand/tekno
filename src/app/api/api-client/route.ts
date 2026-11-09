// =====================================================================
// تستر وب‌سرویس (محیطی مثل Postman) — پراکسی سمت سرور برای فراخوانی
// وب‌سرویس‌های بیرونی و داخلی بدون محدودیت CORS (مدیر سامانه)
// POST /api/api-client  { method, url, headers, body }
// =====================================================================
import { NextRequest } from "next/server";
import { ok, fail, guardAction } from "@/lib/server";

const MAX_BODY = 300_000; // سقف متن پاسخ — ۳۰۰ کیلوبایت
const TIMEOUT_MS = 30_000;

export async function POST(req: NextRequest) {
  const g = await guardAction(req, "webservices", "view", "وب‌سرویس‌ساز");
  if (g.error) return g.error;

  let method: string, url: string, headers: Record<string, string>, body: string | undefined;
  try {
    ({ method = "GET", url = "", headers = {}, body } = await req.json());
  } catch {
    return fail("درخواست نامعتبر");
  }
  url = String(url ?? "").trim();
  if (!url) return fail("آدرس وب‌سرویس الزامی است");
  // آدرس نسبی سرویس‌های داخلی (مثل /api/ws/users) — به آدرس مطلق همین سرور تبدیل می‌شود
  if (url.startsWith("/")) {
    const host = req.headers.get("host") ?? "localhost:3000";
    const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
    url = `${proto}://${host}${url}`;
  }
  if (!/^https?:\/\//i.test(url)) return fail("آدرس باید با http:// یا https:// شروع شود");
  const m = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].includes(String(method).toUpperCase())
    ? String(method).toUpperCase() : "GET";

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const cleanHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers ?? {})) {
      if (!k?.trim() || v == null) continue;
      if (/^(host|content-length|connection)$/i.test(k)) continue;
      cleanHeaders[k.trim()] = String(v);
    }
    const init: RequestInit = {
      method: m,
      headers: cleanHeaders,
      signal: ctrl.signal,
      redirect: "follow",
    };
    if (body !== undefined && body !== "" && !["GET", "HEAD"].includes(m)) init.body = body;

    const res = await fetch(url, init);
    const timeMs = Date.now() - t0;
    const resHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => { resHeaders[k] = v; });
    let text = await res.text();
    if (text.length > MAX_BODY) text = text.slice(0, MAX_BODY) + `\n… (قطع شد — طول واقعی ${text.length} کاراکتر)`;
    return ok({
      status: res.status,
      statusText: res.statusText,
      timeMs,
      size: text.length,
      headers: resHeaders,
      contentType: res.headers.get("content-type") ?? "",
      body: text,
    });
  } catch (e) {
    const err = e as Error;
    const msg = err.name === "AbortError" ? `پاسخی در ${TIMEOUT_MS / 1000} ثانیه دریافت نشد (timeout)` : err.message;
    return fail(`خطای فراخوانی: ${msg}`);
  } finally {
    clearTimeout(timer);
  }
}
