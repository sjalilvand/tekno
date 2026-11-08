import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail } from "@/lib/server";
import { dbProvider } from "@/lib/analytics";

// =====================================================================
// اتصال پایگاه داده — نمایش وضعیت، تست اتصال جدید و ذخیره در .env
// • GET:  اطلاعات اتصال فعلی (رمز پوشانده می‌شود) + تست زنده + نسخهٔ سرور
// • POST {action:"test"}  : تست اتصال با پارامترهای داده‌شده (بدون ذخیره)
// • POST {action:"save"}  : نوشتن DATABASE_URL در فایل .env + راهنمای اجرای مجدد
// فقط مدیر سامانه مجاز است.
// =====================================================================

type ParsedUrl = { engine: string; host: string; port: string; database: string; user: string; password: string };

function parseDbUrl(url: string): ParsedUrl | null {
  try {
    const u = new URL(url);
    return {
      engine: u.protocol.replace(":", "").replace("mariadb", "mysql"),
      host: u.hostname || "127.0.0.1",
      port: u.port || (u.protocol.startsWith("mysql") || u.protocol.startsWith("mariadb") ? "3306" : "—"),
      database: u.pathname.replace(/^\//, ""),
      user: decodeURIComponent(u.username || ""),
      password: decodeURIComponent(u.password || ""),
    };
  } catch {
    return null;
  }
}

function mask(v: string): string {
  if (!v) return "";
  return v.length <= 2 ? "••" : v.slice(0, 2) + "••••••";
}

async function isAdmin(req: NextRequest): Promise<boolean> {
  const user = await getCurrentUser(req);
  if (!user) return false;
  // نقش‌ها از جدول UserRole — نقش‌های مدیریتی: مدیر سامانه / مدیر / ادمین
  const urs = await db.userRole.findMany({ where: { userId: user.id }, include: { role: { select: { title: true } } } });
  const titles = urs.map((ur) => ur.role?.title ?? "");
  return titles.some((t) => t.includes("مدیر سامانه") || t.includes("مدیر سیستم") || t === "ادمین" || t.includes("admin"));
}

async function testMysql(host: string, port: string | number, user: string, password: string, database: string): Promise<{ ok: boolean; message: string; version?: string; latencyMs?: number; tablesCount?: number }> {
  const started = Date.now();
  try {
    const mysql = await import("mysql2/promise");
    const conn = await mysql.createConnection({
      host, port: Number(port) || 3306, user, password, database: database || undefined,
      connectTimeout: 5000,
    });
    try {
      const [rows] = await conn.query("SELECT VERSION() AS v, COUNT(*) AS tablesCount FROM information_schema.tables WHERE table_schema = DATABASE()");
      const r = rows[0] as { v: string; tablesCount: number };
      return { ok: true, message: "اتصال موفق بود", version: String(r.v), latencyMs: Date.now() - started, tablesCount: Number(r.tablesCount) };
    } finally {
      await conn.end();
    }
  } catch (e: any) {
    const code = e?.code ?? "";
    const map: Record<string, string> = {
      ER_ACCESS_DENIED_ERROR: "نام کاربری یا رمز عبور اشتباه است",
      ER_BAD_DB_ERROR: "پایگاه دادهٔ موردنظر وجود ندارد",
      ECONNREFUSED: "اتصال به سرور رد شد — MySQL اجرا نیست یا پورت/آدرس اشتباه است",
      ETIMEDOUT: "زمان اتصال به پایان رسید — فایروال یا آدرس اشتباه",
      ENOTFOUND: "نام میزبان یافت نشد",
    };
    return { ok: false, message: map[code] ?? String(e?.message ?? "خطای نامشخص در اتصال"), latencyMs: Date.now() - started };
  }
}

export async function GET(req: NextRequest) {
  if (!(await isAdmin(req))) return fail("فقط مدیر سامانه به این بخش دسترسی دارد", 403);
  const url = process.env.DATABASE_URL ?? "";
  const parsed = parseDbUrl(url);
  const provider = dbProvider();
  let live: { ok: boolean; message: string; version?: string; latencyMs?: number; tablesCount?: number };
  if (provider === "mysql" && parsed) {
    live = await testMysql(parsed.host, parsed.port, parsed.user, parsed.password, parsed.database);
  } else {
    // SQLite — تست سادهٔ وجود فایل
    const file = url.replace("file:", "");
    const abs = file.startsWith(".") ? path.join(process.cwd(), file) : file;
    const exists = fs.existsSync(abs);
    live = { ok: exists, message: exists ? "فایل پایگاه دادهٔ SQLite یافت شد" : "فایل SQLite یافت نشد" };
  }
  return ok({
    engine: provider,
    current: parsed ? { ...parsed, password: mask(parsed.password) } : null,
    urlMasked: parsed ? `${parsed.engine}://${parsed.user}:${mask(parsed.password)}@${parsed.host}:${parsed.port}/${parsed.database}` : url ? "(نامعتبر)" : "(تنظیم نشده)",
    live,
    envFile: fs.existsSync(path.join(process.cwd(), ".env")),
  });
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin(req))) return fail("فقط مدیر سامانه به این بخش دسترسی دارد", 403);
  let body: { action?: string; engine?: string; host?: string; port?: string; database?: string; user?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return fail("BAD_REQUEST");
  }

  const host = String(body.host ?? "127.0.0.1").trim();
  const port = String(body.port ?? "3306").trim();
  const database = String(body.database ?? "").trim();
  const user = String(body.user ?? "").trim();
  const password = String(body.password ?? "");

  if (body.action === "test") {
    const result = await testMysql(host, port, user, password, database);
    return ok(result);
  }

  if (body.action === "save") {
    if (!user || !database) return fail("نام کاربری و نام پایگاه داده الزامی است");
    const auth = /[\/@]/.test(user) ? encodeURIComponent(user) : user;
    const passEnc = password ? encodeURIComponent(password) + "@" : "";
    const url = `mysql://${auth}:${passEnc}${host}:${port}/${database}`;
    const envPath = path.join(process.cwd(), ".env");
    let content = "";
    if (fs.existsSync(envPath)) content = fs.readFileSync(envPath, "utf8");
    const re = /^DATABASE_URL\s*=.*$/m;
    const line = `DATABASE_URL="${url}"`;
    if (re.test(content)) content = content.replace(re, line);
    else content += (content.endsWith("\n") || !content ? "" : "\n") + line + "\n";
    try {
      fs.writeFileSync(envPath, content, "utf8");
    } catch (e: any) {
      return fail("نوشتن فایل .env ناموفق بود: " + String(e?.message ?? e), 500);
    }
    return ok({
      saved: true,
      urlMasked: `mysql://${user}:${mask(password)}@${host}:${port}/${database}`,
      nextStep: 'برای اعمال اتصال جدید، دستور ".\\deploy.ps1 -Mode update -DbEngine mysql" را در PowerShell اجرا کنید — ساختار پایگاه داده هم خودکار همگام می‌شود.',
    });
  }

  return fail("عملیات نامعتبر");
}
