// =====================================================================
// استودیوی پرس‌وجو — شِمای زندهٔ دیتابیس + گارد امنیتی SQL + اجراکننده
// ---------------------------------------------------------------
//  فقط SELECT — هر دستوری غیر از SELECT/WITH رد می‌شود و خروجی همیشه
//  با LIMIT سقف‌دار اجرا می‌گردد. شِما از information_schema (MySQL) یا
//  sqlite_master (SQLite) خوانده می‌شود و ۶۰ ثانیه کش می‌شود.
// =====================================================================
import { db } from "@/lib/db";
import { CATALOG } from "@/lib/ws/catalog";

export type SchemaTable = { name: string; label: string | null; columns: string[]; rowCount: number | null };

let cache: { at: number; tables: SchemaTable[] } | null = null;
const TTL = 60_000;

/** آیا دیتابیس فعلی SQLite است؟ */
export function isSqlite(): boolean {
  const url = process.env.DATABASE_URL ?? "";
  return url.startsWith("file:") || url.includes(".db");
}

async function mysqlTables(): Promise<SchemaTable[]> {
  const rows = await db.$queryRawUnsafe<Record<string, unknown>>(
    `SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
     ORDER BY TABLE_NAME, ORDINAL_POSITION`
  );
  const counts = await db.$queryRawUnsafe<Record<string, unknown>>(
    `SELECT TABLE_NAME AS t, TABLE_ROWS AS n FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`
  );
  const countMap = new Map(counts.map((r) => [String(r.t), Number(r.n)]));
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const t = String(r.t);
    if (!map.has(t)) map.set(t, []);
    map.get(t)!.push(String(r.c));
  }
  return [...map.entries()].map(([name, columns]) => ({
    name, columns, label: null, rowCount: countMap.get(name) ?? null,
  }));
}

async function sqliteTables(): Promise<SchemaTable[]> {
  const rows = await db.$queryRawUnsafe<Record<string, unknown>>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%' ORDER BY name`
  );
  const out: SchemaTable[] = [];
  for (const r of rows) {
    const name = String(r.name);
    try {
      const cols = await db.$queryRawUnsafe<Record<string, unknown>>(`PRAGMA table_info(\`${name}\`)`);
      out.push({ name, columns: cols.map((c) => String(c.name)), label: null, rowCount: null });
    } catch { /* skip */ }
  }
  return out;
}

/** برچسب فارسی از کاتالوگ داخلی (اگر جدول در کاتالوگ باشد) */
function labelFor(name: string): string | null {
  return CATALOG.find((t) => t.name.toLowerCase() === name.toLowerCase())?.label ?? null;
}

/** فهرست همهٔ جدول‌ها و ستون‌های واقعی دیتابیس (کش ۶۰ ثانیه‌ای) */
export async function listDbSchema(force = false): Promise<SchemaTable[]> {
  if (!force && cache && Date.now() - cache.at < TTL) return cache.tables;
  let tables = isSqlite() ? await sqliteTables() : await mysqlTables();
  tables = tables
    .filter((t) => !/^(sqlite_|_prisma|__prisma)/i.test(t.name))
    .map((t) => ({ ...t, label: labelFor(t.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  cache = { at: Date.now(), tables };
  return tables;
}

/** اعتبارسنجی نام جدول/ستون در برابر شِمای زنده */
export async function validateIdentifiers(table: string, columns: string[]): Promise<{ ok: boolean; error?: string }> {
  const nameRe = /^[A-Za-z_][A-Za-z0-9_]*$/;
  if (!nameRe.test(table)) return { ok: false, error: "نام جدول نامعتبر است" };
  const tables = await listDbSchema();
  const t = tables.find((x) => x.name.toLowerCase() === table.toLowerCase());
  if (!t) return { ok: false, error: `جدول «${table}» در دیتابیس یافت نشد` };
  for (const c of columns) {
    if (!nameRe.test(c)) return { ok: false, error: `نام ستون «${c}» نامعتبر است` };
    if (!t.columns.includes(c)) return { ok: false, error: `ستون «${c}» در جدول «${table}» وجود ندارد` };
  }
  return { ok: true };
}

// ------------------------------------------------------------------ گارد SELECT
const FORBIDDEN = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|CALL|EXECUTE|SET|USE|LOCK|UNLOCK|RENAME|REPLACE|MERGE|HANDLER|LOAD\s+DATA|LOAD\s+XML|KILL|SHUTDOWN|PREPARE|ATTACH|DETACH|VACUUM|PRAGMA|OUTFILE|DUMPFILE)\b/i;

/** پاکسازی کامنت‌ها و بررسی تک‌دستمانی بودن */
function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/#[^\n]*/g, " ")
    .trim();
}

/**
 * اعتبارسنجی پرس‌وجوی کاربر — فقط SELECT/WITH تک‌دستمانی.
 * در خطا، پیام فارسی برمی‌گرداند؛ در موفقیت null.
 */
export function validateSelect(sqlRaw: string): string | null {
  const sql = stripComments(sqlRaw);
  if (!sql) return "پرس‌وجو خالی است";
  if (/;/.test(sql.replace(/'[^']*'/g, "''").trimEnd().replace(/;$/, ""))) {
    // سمی‌کولن داخل رشته حذف شد؛ اگر هنوز سمی‌کولن مانع = چند دستوری
    const noStrings = sql.replace(/'(?:[^']|'')*'/g, "''").replace(/"(?:[^"]|"")*"/g, '""');
    if (/;/.test(noStrings.replace(/;$/, "").trim())) return "اجرای چند دستور مجاز نیست — فقط یک SELECT";
  }
  if (FORBIDDEN.test(sql)) return "فقط دستور SELECT مجاز است";
  if (!/^\s*(SELECT|WITH)\b/i.test(sql)) return "پرس‌وجو باید با SELECT یا WITH شروع شود";
  if (/\bINTO\b/i.test(sql)) return "SELECT ... INTO مجاز نیست";
  if (/\bFOR\s+UPDATE\b/i.test(sql)) return "FOR UPDATE مجاز نیست";
  return null;
}

export type RunResult = { columns: string[]; rows: Record<string, unknown>[]; total: number; elapsedMs: number; truncated: boolean };

function sanitizeValue(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === "bigint") return Number(v);
  if (v instanceof Date) return v.toISOString();
  if (v instanceof Uint8Array) return `<binary ${v.length} bytes>`;
  if (typeof v === "object") {
    // Decimal و سایر اشیاء — اگر toString معنادار دارد
    const s = String(v);
    return s === "[object Object]" ? v : s;
  }
  return v;
}

function sanitizeRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((r) => {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) o[k] = sanitizeValue(v);
    return o;
  });
}

const HARD_LIMIT = 500;

/**
 * اجرای امن SELECT — خروجی همیشه ≤ HARD_LIMIT ردیف.
 * اگر پرس‌وجو LIMIT نداشته باشد، داخل زیرپرس‌وجو سقف زده می‌شود.
 */
export async function runSelect(sqlRaw: string): Promise<RunResult> {
  const err = validateSelect(sqlRaw);
  if (err) throw new Error(err);
  let sql = stripComments(sqlRaw).replace(/;+\s*$/, "");
  const hasLimit = /\bLIMIT\s+\d+/i.test(sql.replace(/'(?:[^']|'')*'/g, "''"));
  if (!hasLimit) {
    sql = `SELECT * FROM (${sql}) AS _rz_query LIMIT ${HARD_LIMIT + 1}`;
  }
  const t0 = Date.now();
  let rows: Record<string, unknown>[];
  try {
    rows = (await db.$queryRawUnsafe(sql)) as Record<string, unknown>[];
  } catch (e) {
    const msg = (e as Error)?.message ?? "خطای اجرای پرس‌وجو";
    throw new Error("خطای SQL: " + msg.slice(0, 300));
  }
  const elapsedMs = Date.now() - t0;
  const truncated = rows.length > HARD_LIMIT;
  const cut = rows.slice(0, HARD_LIMIT).map((r) => {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) o[k] = sanitizeValue(v);
    return o;
  });
  return {
    columns: cut.length ? Object.keys(cut[0]) : [],
    rows: cut,
    total: cut.length,
    elapsedMs,
    truncated,
  };
}
