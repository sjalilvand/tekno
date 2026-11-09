// =====================================================================
// به‌روزرسانی داده با پشتیبان جدید — صف کار ایمپورت در پس‌زمینه
// ---------------------------------------------------------------
//  POST { source, mode } → ساخت ImportJob و اجرای اسکریپت انتقال
//  (prisma/import-sqlite-to-mysql.mts) در پس‌زمینه با child_process
//  GET → وضعیت اتصال دیتابیس، کارهای اخیر و پیشرفت لحظه‌ای
//  نکته: پشتیبان واقعی ۱.۵ گیگابایتی از طریق مسیر سرور خوانده می‌شود
//  (آپلود مرورگر برای این حجم مناسب نیست) — فایل باید روی همان سرور باشد.
// =====================================================================
import { NextRequest } from "next/server";
import { spawn } from "child_process";
import fs from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail, safeJson } from "@/lib/server";
import { dbProvider } from "@/lib/analytics";

function mysqlUrlFromEnv(): string {
  return process.env.DATABASE_URL_MYSQL ?? process.env.MYSQL_URL ?? process.env.DATABASE_URL ?? "";
}

function maskedUrl(url: string): { engine: string; target: string } {
  try {
    const u = new URL(url);
    const engine = u.protocol.replace(":", "");
    return { engine, target: `${u.hostname}:${u.port ?? ""}/${u.pathname.replace("/", "")} (کاربر: ${u.username || "—"})` };
  } catch {
    return { engine: "نامشخص", target: "—" };
  }
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const jobs = await db.importJob.findMany({ orderBy: { startedAt: "desc" }, take: 10 });
  const { engine, target } = maskedUrl(mysqlUrlFromEnv());
  // فایل‌های پشتیبان محتمل در DataDir — پیشنهاد مسیر
  const cwd = process.cwd();
  const candidates = ["D:\\Projects\\rahe_zendegi\\data", path.join(cwd, "..", "data"), path.join(cwd, "data")]
    .map((d) => {
      try {
        return fs.readdirSync(d).filter((f) => /\.(sqlite|db|sql)$/i.test(f)).map((f) => path.join(d, f));
      } catch { return []; }
    })
    .flat()
    .slice(0, 10)
    .map((p) => ({ path: p, sizeMb: Math.round((fs.statSync(p).size / 1048576) * 10) / 10 }));
  return ok({ jobs, db: { engine, target, provider: dbProvider() }, candidates });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  try {
    const body = await req.json();
    const source = String(body.source ?? "").trim();
    const mode = body.mode === "truncate" ? "truncate" : "append";
    if (!source) return fail("مسیر فایل پشتیبان لازم است");
    if (!/\.(sqlite|db|sql)$/i.test(source)) return fail("فقط فایل SQLite/DB پشتیبانی می‌شود (پشتیبان سامانهٔ قبلی app.sqlite)");
    if (!fs.existsSync(source)) return fail(`فایل در سرور پیدا نشد: ${source}`);
    const mysqlUrl = mysqlUrlFromEnv();
    if (!mysqlUrl) return fail("رشتهٔ اتصال MySQL در تنظیمات سامانه یافت نشد");
    const job = await db.importJob.create({ data: { source, mode, status: "running", byUserId: user.id } });
    // اجرای پس‌زمینه — خروجی اسکریپت به فایل لاگ کنار پشتیبان نوشته می‌شود
    const logFile = path.join(path.dirname(source), `import_job_${job.id}.log`);
    const child = spawn(process.execPath, [
      path.join(process.cwd(), "prisma", "import-sqlite-to-mysql.mts"),
      "--source", source,
      "--mysql", mysqlUrl,
      "--mode", mode,
      "--resume",
    ], { cwd: process.cwd(), detached: true, stdio: ["ignore", fs.openSync(logFile, "a"), fs.openSync(logFile, "a")] });
    child.unref();
    return ok(safeJson({ job, logFile }));
  } catch (e) {
    return fail((e as Error).message ?? "خطا در شروع به‌روزرسانی");
  }
}
