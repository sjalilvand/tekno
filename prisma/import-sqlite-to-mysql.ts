// =====================================================================
// انتقال داده از پشتیبان SQLite به MySQL واقعی
// ---------------------------------------------------------------
// کاربرد: پشتیبان ۱.۵ گیگابایتی (data/app.sqlite) را به MySQL منتقل می‌کند.
//
// اجرا:
//   npm run db:import:mysql -- --source "D:\Projects\rahe_zendegi\data\app.sqlite" ^
//        --mysql "mysql://user:pass@localhost:3306/rahe_zendegi" --mode truncate --resume
//
// نکات:
//  • جدول‌ها مستقیماً از فایل SQLite خوانده می‌شوند (بدون نیاز به Prisma Client)
//  • نوشتن در MySQL با mysql2 و دسته‌های ۵۰۰ ردیفی (مناسب فایل‌های حجیم)
//  • تبدیل نوع‌ها مطابق ذخیره‌سازی Prisma:
//      DateTime → عدد میلی‌ثانیه epoch  →  'YYYY-MM-DD HH:MM:SS.mmm' (UTC)
//      Boolean  → 0/1 → true/false
//      BigInt   → عدد (در صورت ناامن بودن → BigInt)
//  • import_status.json کنار فایل مبدأ نوشته می‌شود تا با --resume قابل ادامه باشد
// =====================================================================

import fs from "node:fs";
import path from "node:path";

// ---------------------------- آرگومان‌ها ----------------------------
function parseArgs() {
  const args: Record<string, string | boolean> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.replace(/^--/, "");
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) { args[key] = next; i++; }
      else args[key] = true;
    }
  }
  return args;
}

const args = parseArgs();
const SOURCE = String(args.source ?? "");
const MYSQL_URL = String(args.mysql ?? process.env.MYSQL_URL ?? process.env.DATABASE_URL_MYSQL ?? "");
const MODE = args.mode === "truncate" ? "truncate" : "append";
const BATCH = Math.max(50, Math.min(Number(args.batch ?? 500), 5000));
const DRY_RUN = Boolean(args["dry-run"]);
const RESUME = Boolean(args.resume);
const ONLY = typeof args.tables === "string" ? args.tables.split(",").map((s) => s.trim()).filter(Boolean) : null;
const EXCLUDE = typeof args.exclude === "string" ? args.exclude.split(",").map((s) => s.trim()).filter(Boolean) : [];

if (!SOURCE) {
  console.error("خطا: مسیر فایل SQLite مبدأ را با --source مشخص کنید");
  console.error('مثال: npm run db:import:mysql -- --source "D:\\...\\app.sqlite" --mysql "mysql://root:pass@localhost:3306/rahe_zendegi"');
  process.exit(1);
}
if (!MYSQL_URL && !DRY_RUN) {
  console.error("خطا: رشتهٔ اتصال MySQL را با --mysql مشخص کنید");
  process.exit(1);
}
if (!fs.existsSync(SOURCE)) {
  console.error(`خطا: فایل مبدأ پیدا نشد: ${SOURCE}`);
  process.exit(1);
}

// --------------------- تحلیل prisma/schema.prisma ---------------------
// خروجی: جدول SQLite/MySQL → نوع منطقی هر ستون (برای تبدیل امن مقادیر)
type Kind = "Int" | "BigInt" | "Float" | "Boolean" | "DateTime" | "String";
type TableInfo = { model: string; columns: Record<string, Kind> };

function parseSchema(schemaPath: string): Map<string, TableInfo> {
  const text = fs.readFileSync(schemaPath, "utf8");
  const tables = new Map<string, TableInfo>();
  const modelRe = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let m: RegExpExecArray | null;
  while ((m = modelRe.exec(text))) {
    const model = m[1];
    const body = m[2];
    let tableName = model;
    const mapTable = body.match(/@@map\("([^"]+)"\)/);
    if (mapTable) tableName = mapTable[1];
    const columns: Record<string, Kind> = {};
    for (const raw of body.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("//") || line.startsWith("@@")) continue;
      const fm = line.match(/^(\w+)\s+(Int|BigInt|Float|Boolean|DateTime|String)\b/);
      if (!fm) continue;
      const [, field, type] = fm;
      const cm = line.match(/@map\("([^"]+)"\)/);
      const colName = cm ? cm[1] : field;
      columns[colName] = type as Kind;
    }
    if (Object.keys(columns).length) tables.set(tableName, { model, columns });
  }
  return tables;
}

const SCHEMA_PATH = path.join(process.cwd(), "prisma", "schema.prisma");
const schema = parseSchema(SCHEMA_PATH);
console.log(`✔ اسکیما خوانده شد: ${schema.size} مدل از prisma/schema.prisma`);

// ---------------------------- تبدیل مقادیر ----------------------------
function pad(n: number, w = 2) { return String(n).padStart(w, "0"); }

function epochMsToMysql(v: number): string {
  // نگهداری ساعت دیواری UTC — همان قرارداد Prisma برای MySQL DATETIME(3)
  const d = new Date(v);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}`;
}

function convert(value: unknown, kind: Kind): unknown {
  if (value === null || value === undefined) return null;
  switch (kind) {
    case "DateTime": {
      if (typeof value === "number") return epochMsToMysql(value);
      if (typeof value === "string") {
        if (/^-?\d+$/.test(value)) return epochMsToMysql(Number(value));
        return value.replace("T", " ").replace(/Z$/, "").replace(/\+00:00$/, "");
      }
      return value;
    }
    case "Boolean": {
      if (typeof value === "number") return value !== 0;
      if (typeof value === "string") return value === "1" || value.toLowerCase() === "true";
      return Boolean(value);
    }
    case "BigInt": {
      if (typeof value === "bigint") return value;
      if (Number.isSafeInteger(value)) return value;
      return BigInt(String(value));
    }
    case "String": {
      if (value instanceof Buffer) return value;
      return typeof value === "string" ? value : String(value);
    }
    default:
      return value; // Int / Float — بدون تغییر
  }
}

// ---------------------------- اتصال‌ها ----------------------------
// راه‌اندازی تنبل وابستگی‌ها با پیام خطای راهنما
async function loadDeps() {
  let Database: any, mysql: any;
  try {
    const m = await import("better-sqlite3");
    Database = m.default;
  } catch {
    console.error("خطا: بستهٔ better-sqlite3 نصب نیست — دستور «npm install» را در پوشهٔ پروژه اجرا کنید");
    process.exit(1);
  }
  if (!DRY_RUN) {
    try {
      mysql = await import("mysql2/promise");
    } catch {
      console.error("خطا: بستهٔ mysql2 نصب نیست — دستور «npm install» را در پوشهٔ پروژه اجرا کنید");
      process.exit(1);
    }
  }
  return { Database, mysql };
}

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;
const bt = (id: string) => "`" + id.replace(/`/g, "``") + "`";

async function main() {
const { Database, mysql } = await loadDeps();

const sqlite = new Database(SOURCE, { readonly: true, fileMustExist: true });
try { sqlite.pragma("journal_mode = DELETE"); } catch { /* فایل WAL — فقط خواندنی است و مشکلی ندارد */ }

const tableRows = sqlite.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
).all() as { name: string }[];
const sqliteTables = tableRows.map((r) => r.name);
console.log(`✔ فایل مبدأ باز شد: ${sqliteTables.length} جدول در SQLite`);

let conn: any = null;
if (!DRY_RUN) {
  conn = await mysql.createConnection({
    uri: MYSQL_URL.includes("mysql://") || MYSQL_URL.includes("mariadb://") ? MYSQL_URL : `mysql://${MYSQL_URL}`,
    charset: "utf8mb4",
    multipleStatements: false,
    connectTimeout: 20_000,
  });
  await conn.query("SET SESSION FOREIGN_KEY_CHECKS=0");
  await conn.query("SET SESSION sql_mode='NO_ENGINE_SUBSTITUTION'");
  await conn.query("SET NAMES utf8mb4");
  console.log("✔ اتصال MySQL برقرار شد (FOREIGN_KEY_CHECKS=OFF)");
}

// --------------------------- وضعیت انتقال ---------------------------
const statusFile = path.join(path.dirname(SOURCE), "import_status.json");
type StatusMap = Record<string, { rows: number; done: boolean; ts: string; error?: string }>;
let status: StatusMap = {};
if (fs.existsSync(statusFile)) {
  try { status = JSON.parse(fs.readFileSync(statusFile, "utf8")); } catch { status = {}; }
}
function saveStatus() {
  fs.writeFileSync(statusFile, JSON.stringify(status, null, 2), "utf8");
}

// --------------------------- آمار اولیه ---------------------------
console.log("\n─── شمارش ردیف‌ها ───");
const plan: { table: string; info: TableInfo; count: number; columns: string[] }[] = [];
let totalRows = 0;
for (const table of sqliteTables) {
  if (ONLY && !ONLY.includes(table)) continue;
  if (EXCLUDE.includes(table)) { console.log(`  ⊘ ${table} — مستثنا شده`); continue; }
  const info = schema.get(table);
  if (!info) {
    console.log(`  ؟ ${table} — در اسکیما مدل ندارد (رد شد)`);
    continue;
  }
  const cnt = sqlite.prepare(`SELECT COUNT(*) AS c FROM ${q(table)}`).get() as { c: number };
  // فقط ستون‌های مشترک بین SQLite و اسکیما
  const sqliteCols = (sqlite.prepare(`PRAGMA table_info(${q(table)})`).all() as any[]).map((c) => c.name);
  const columns = sqliteCols.filter((c) => c in info.columns);
  plan.push({ table, info, count: cnt.c, columns });
  totalRows += cnt.c;
}
for (const p of plan) {
  console.log(`  • ${p.table.padEnd(28)} ${p.count.toLocaleString("en-US").padStart(12)} ردیف`);
}
console.log(`  = ${totalRows.toLocaleString("en-US")} ردیف در ${plan.length} جدول\n`);

if (DRY_RUN) {
  // نمایش یک ردیف نمونهٔ تبدیل‌شده برای اطمینان
  const sample = plan.find((p) => p.count > 0);
  if (sample) {
    const row = sqlite.prepare(`SELECT * FROM ${q(sample.table)} LIMIT 1`).get() as Record<string, unknown>;
    console.log(`نمونهٔ تبدیل (${sample.table}):`);
    for (const [col, val] of Object.entries(row)) {
      const kind = sample.info.columns[col];
      if (!kind) continue;
      console.log(`  ${col} [${kind}] ${JSON.stringify(val)?.slice(0, 40)} → ${JSON.stringify(convert(val, kind))?.slice(0, 60)}`);
    }
  }
  console.log("\nاجرای آزمایشی به پایان رسید (بدون نوشتن در MySQL). برای انتقال واقعی --dry-run را حذف کنید.");
  process.exit(0);
}

// --------------------------- انتقال ---------------------------
function hasRowid(table: string): boolean {
  try {
    sqlite.prepare(`SELECT rowid FROM ${q(table)} LIMIT 1`).get();
    return true;
  } catch { return false; }
}

const t0 = Date.now();
let grandTotal = 0;

for (const p of plan) {
  const { table, info, count, columns } = p;
  if (RESUME && status[table]?.done) {
    console.log(`⤼ ${table} — قبلاً کامل منتقل شده (${status[table].rows.toLocaleString("en-US")}) — رد شد`);
    grandTotal += status[table].rows;
    continue;
  }
  const started = Date.now();
  try {
    if (MODE === "truncate") {
      await conn.query(`TRUNCATE TABLE ${bt(table)}`);
    }

    const selectBase = `SELECT ${columns.map(q).join(", ")} FROM ${q(table)}`;
    const insertSql = `INSERT ${MODE === "append" ? "IGNORE " : ""}INTO ${bt(table)} (${columns.map(bt).join(", ")}) VALUES ?`;
    const converters = columns.map((c) => info.columns[c]);

    let inserted = 0;
    if (count === 0) {
      status[table] = { rows: 0, done: true, ts: new Date().toISOString() };
      saveStatus();
      console.log(`  ✔ ${table} — خالی (0)`);
      continue;
    }

    if (hasRowid(table)) {
      let lastRowid = 0;
      for (;;) {
        const rows = sqlite.prepare(`${selectBase.replace(/^SELECT /i, "SELECT rowid AS __rz_rowid, ")} WHERE rowid > ? ORDER BY rowid LIMIT ?`).all(lastRowid, BATCH) as any[];
        if (!rows.length) break;
        lastRowid = rows[rows.length - 1].__rz_rowid ?? lastRowid;
        const values = rows.map((r) => columns.map((c, i) => convert(r[c], converters[i])));
        await conn.query(insertSql, [values]);
        inserted += rows.length;
        const pct = ((inserted / count) * 100).toFixed(1);
        process.stdout.write(`\r  ⏳ ${table} ${inserted.toLocaleString("en-US")}/${count.toLocaleString("en-US")} (${pct}%)   `);
      }
    } else {
      // جدول WITHOUT ROWID — صفحه‌بندی با OFFSET
      for (let offset = 0; offset < count; offset += BATCH) {
        const rows = sqlite.prepare(`${selectBase} LIMIT ? OFFSET ?`).all(BATCH, offset) as any[];
        if (!rows.length) break;
        const values = rows.map((r) => columns.map((c, i) => convert(r[c], converters[i])));
        await conn.query(insertSql, [values]);
        inserted += rows.length;
        const pct = ((inserted / count) * 100).toFixed(1);
        process.stdout.write(`\r  ⏳ ${table} ${inserted.toLocaleString("en-US")}/${count.toLocaleString("en-US")} (${pct}%)   `);
      }
    }

    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`\r  ✔ ${table} — ${inserted.toLocaleString("en-US")} ردیف در ${secs} ثانیه${" ".repeat(10)}`);
    status[table] = { rows: inserted, done: true, ts: new Date().toISOString() };
    saveStatus();
    grandTotal += inserted;
  } catch (e: any) {
    const msg = e?.message ?? "خطای ناشناخته";
    console.error(`\r  ✘ ${table} — خطا: ${msg}${" ".repeat(20)}`);
    status[table] = { rows: 0, done: false, ts: new Date().toISOString(), error: msg.slice(0, 300) };
    saveStatus();
    console.error("انتقال متوقف شد. پس از رفع مشکل، همان دستور را با --resume دوباره اجرا کنید.");
    process.exit(2);
  }
}

await conn.query("SET SESSION FOREIGN_KEY_CHECKS=1");
await conn.end();

const totalSecs = ((Date.now() - t0) / 1000).toFixed(1);
console.log("\n═══════════════════════════════════════════");
console.log(`✔ انتقال کامل شد: ${grandTotal.toLocaleString("en-US")} ردیف در ${totalSecs} ثانیه`);
console.log(`  وضعیت در فایل: ${statusFile}`);
console.log("مرحلهٔ بعد: اجرای سامانه با npm run build و npm run start");
}

main().catch((e) => {
  console.error("خطای غیرمنتظره:", e?.message ?? e);
  process.exit(1);
});
