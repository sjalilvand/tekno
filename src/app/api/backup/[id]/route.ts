// =====================================================================
// وضعیت کار ایمپورت — پیشرفت لحظه‌ای از import_status.json و لاگ
// =====================================================================
import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail } from "@/lib/server";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const { id } = await ctx.params;
  const job = await db.importJob.findUnique({ where: { id: Number(id) } });
  if (!job) return fail("کار یافت نشد", 404);
  // وضعیت جدول‌ها از import_status.json کنار پشتیبان
  let tables: { name: string; rows: number; done: boolean }[] = [];
  let phase = "";
  try {
    const statusFile = path.join(path.dirname(job.source), "import_status.json");
    if (fs.existsSync(statusFile)) {
      const st = JSON.parse(fs.readFileSync(statusFile, "utf8"));
      phase = String(st.phase ?? st.state ?? "");
      tables = Object.entries(st)
        .filter(([k]) => !["state", "phase"].includes(k))
        .map(([name, v]) => ({ name, rows: Number((v as { rows?: number })?.rows ?? 0), done: Boolean((v as { done?: boolean })?.done) }));
    }
  } catch { /* فایل هنوز ساخته نشده */ }
  // دنبالهٔ لاگ
  let logTail = "";
  const logFile = path.join(path.dirname(job.source), `import_job_${job.id}.log`);
  try {
    if (fs.existsSync(logFile)) {
      const lines = fs.readFileSync(logFile, "utf8").split(/\r?\n/).filter(Boolean);
      logTail = lines.slice(-12).join("\n");
    }
  } catch { /* دسترسی لاگ ممکن نشد */ }
  return ok({ job, tables, phase, logTail });
}
