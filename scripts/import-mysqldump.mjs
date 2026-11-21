#!/usr/bin/env node
// =====================================================================
//  درون‌ریز پشتیبان MySQL (خروجی mysqldump) → دیتابیس SQLite سامانه
// ---------------------------------------------------------------------
//  چرا؟  سرور مقصد نه MySQL دارد و نه اجازهٔ دانلود بستهٔ آن را
//  (خطای 403 Oracle Export برای IPهای ایران). این اسکریپت با Node
//  خالص فایل پشتیبان را جریانی (streaming) می‌خواند، دستورهای INSERT
//  را تجزیه می‌کند و مستقیماً در SQLite سامانه می‌نویسد — بدون هیچ
//  سرور دیتابیس، بدون کلاینت mysql و بدون ماژول native.
//
//  • موتور: node:sqlite (داخلی Node 22.5+)؛ اگر نبود better-sqlite3
//  • جریانی: فایل ۱.۵ گیگابایتی هم داخل حافظه نمی‌آید
//  • نگاشت جدول: نام جدول dump ↔ نام جدول SQLite (همان اسکیمای Prisma)
//  • ستون‌ها بر اساس نوع اعلام‌شدهٔ SQLite تبدیل می‌شوند:
//      DATETIME → عدد epoch میلی‌ثانیه (Prisma SQLite همین‌طور ذخیره می‌کند)
//      BIGINT   → عدد صحیح ۶۴بیتی (BigInt-safe)
//      BOOLEAN  → 0/1
//      INTEGER/REAL → عدد
//      بقیه (TEXT و…) → رشتهٔ دست‌نخورده
//  • تاریخ صفر legacy («0000-00-00») → ستون nullable: NULL | NOT NULL: 1970-01-01
//  • تاریخ‌ها با منطقهٔ زمانی Asia/Tehran تفسیر می‌شوند (--tz برای تغییر)
//  • حالت پیش‌فرض truncate: دادهٔ قبلی همان جدول‌ها پاک و با پشتیبان جایگزین می‌شود
//  • ردیف‌های خراب (مثلاً نقض کلید یکتا) کل کار را نمی‌اندازند — شمرده و گزارش می‌شوند
//  • نسخهٔ ۶.۲۵: ستون‌های INTEGER که مقدارشان از بازهٔ Int32 بیرون می‌زند در گزارش
//    هشدار می‌گیرند («باید BigInt شوند») — وگرنه Prisma هنگام خواندن ردیف خطا می‌دهد
//
//  اجرا:
//    node scripts/import-mysqldump.mjs --sql "C:\rahe_zendegi\app2_backup_202611031659.sql" --db "C:\rahe_zendegi\data\app.sqlite"
//    node scripts/import-mysqldump.mjs --sql dump.sql --db app.sqlite --dry-run
//    node scripts/import-mysqldump.mjs --sql dump.sql --db app.sqlite --report report.json --tz Asia/Tehran
// =====================================================================

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

// ---------------------------------------------------------------- CLI
function parseArgs(argv) {
  const out = { sql: "", db: "", tz: "Asia/Tehran", mode: "truncate", dryRun: false, report: "", quiet: false, tables: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "");
    if (a === "--sql") out.sql = val();
    else if (a === "--db") out.db = val();
    else if (a === "--tz") out.tz = val();
    else if (a === "--report") out.report = val();
    else if (a === "--tables") out.tables = val();
    else if (a === "--append") out.mode = "append";
    else if (a === "--truncate") out.mode = "truncate";
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--quiet") out.quiet = true;
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

const ARGS = parseArgs(process.argv.slice(2));
if (ARGS.help || !ARGS.sql || (!ARGS.db && !ARGS.dryRun)) {
  console.log("استفاده: node scripts/import-mysqldump.mjs --sql <dump.sql> --db <app.sqlite> [--tz Asia/Tehran] [--append] [--dry-run] [--report report.json] [--tables T1,T2]");
  process.exit(ARGS.help ? 0 : 2);
}

const SQL_PATH = path.resolve(ARGS.sql);
if (!fs.existsSync(SQL_PATH)) {
  console.error("✘ فایل پشتیبان پیدا نشد: " + SQL_PATH);
  process.exit(2);
}
const SQL_SIZE = fs.statSync(SQL_PATH).size;

// ---------------------------------------------------------------- دیتابیس
async function openDatabase(file) {
  try {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(file);
    return { db, driver: "node:sqlite" };
  } catch (e1) {
    try {
      const mod = await import("better-sqlite3");
      const Database = mod.default ?? mod;
      const db = new Database(file);
      return { db, driver: "better-sqlite3" };
    } catch (e2) {
      console.error("✘ هیچ موتور SQLite در دسترس نیست (node:sqlite یا better-sqlite3)");
      console.error("  node:sqlite: " + (e1?.message ?? e1));
      console.error("  better-sqlite3: " + (e2?.message ?? e2));
      process.exit(2);
    }
  }
}

const { db, driver } = ARGS.dryRun ? { db: null, driver: "dry-run" } : await openDatabase(path.resolve(ARGS.db));
if (!ARGS.quiet) console.log(`  موتور SQLite: ${driver}`);

// ---------------------------------------------------------------- منطقهٔ زمانی برای تبدیل تاریخ
// پشتیبان legacy با تاریخ‌های محلی ایران نوشته شده؛ Prisma برای SQLite تاریخ را
// به‌صورت epoch میلی‌ثانیه نگه می‌دارد. پیش‌فرض: Asia/Tehran (با پشتیبانی از
// ساعت تابستانی تاریخی) — با --tz=UTC یا --tz=local یا --tz=+03:30 قابل تغییر.
const TZ_NAME = (ARGS.tz || "Asia/Tehran").trim();
let TZ_MODE = "iana";
if (/^utc$/i.test(TZ_NAME)) TZ_MODE = "utc";
else if (/^local$/i.test(TZ_NAME)) TZ_MODE = "local";
else if (/^[+-]\d{2}:\d{2}$/.test(TZ_NAME)) TZ_MODE = "fixed";

let fixedOffsetMin = 0;
if (TZ_MODE === "fixed") {
  const m = TZ_NAME.match(/^([+-])(\d{2}):(\d{2})$/);
  fixedOffsetMin = (m[1] === "-" ? -1 : 1) * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10));
}

let tzFmt = null;
if (TZ_MODE === "iana") {
  try {
    tzFmt = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ_NAME, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch {
    console.error(`✘ منطقهٔ زمانی نامعتبر: ${TZ_NAME}`);
    process.exit(2);
  }
}

/** اختلاف منطقهٔ زمانی (دقیقه، شرقی مثبت) در لحظهٔ utcMs */
function tzOffsetMin(utcMs) {
  if (TZ_MODE === "utc") return 0;
  if (TZ_MODE === "fixed") return fixedOffsetMin;
  if (TZ_MODE === "local") return -new Date(utcMs).getTimezoneOffset();
  const parts = tzFmt.formatToParts(new Date(utcMs));
  const p = {};
  for (const x of parts) p[x.type] = x.value;
  const asUTC = Date.UTC(
    parseInt(p.year, 10), parseInt(p.month, 10) - 1, parseInt(p.day, 10),
    (p.hour === "24" ? 0 : parseInt(p.hour, 10)), parseInt(p.minute, 10), parseInt(p.second, 10)
  );
  return Math.round((asUTC - utcMs) / 60000);
}

/** «YYYY-MM-DD HH:MM:SS» محلیِ منطقهٔ TZ → epoch ms (دو گذر برای مرزهای DST) */
function epochFromParts(y, mo, d, h, mi, s, ms) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s, ms || 0);
  const t1 = guess - tzOffsetMin(guess) * 60000;
  const t2 = guess - tzOffsetMin(t1) * 60000;
  return t2;
}

const DT_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?)?$/;
const ZERO_DT_RE = /^0{4}-0{2}-0{2}(?:[ T]0{1,2}:0{2}(?::0{2})?(?:\.0+)?)?$/;

// تاریخ صفر در ستون NOT NULL — هماهنگ با سیاست prisma/fix-zero-dates.mjs
const SENTINEL_MS = epochFromParts(1970, 1, 1, 0, 0, 0, 0);

// ---------------------------------------------------------------- ساختار هدف (SQLite)
const targetTables = new Map();   // name → { cols: Map(lower→{name,type,notnull,dflt}), order: [names] }
function loadTargetSchema() {
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  for (const r of rows) {
    const name = r.name ?? r.NAME;
    if (!name || /^(sqlite_|_prisma|prisma_)/i.test(name)) continue;
    const info = db.prepare(`PRAGMA table_info("${name.replace(/"/g, '""')}")`).all();
    const cols = new Map();
    const order = [];
    for (const c of info) {
      const col = {
        name: c.name, type: (c.type || "TEXT").toUpperCase(), notnull: !!c.notnull, dflt: c.dflt_value,
        // NOT-NULL بدون مقدار پیش‌فرض و بدون کلید اصلی — اگر dump ستون متناظر نداشته باشد
        // ردیف‌ها شکست می‌خورند؛ در importRows مقدار امن پر می‌شود (۶.۲۴)
        notNullNoDefault: !!c.notnull && (c.dflt_value === null || c.dflt_value === undefined) && !c.pk,
      };
      cols.set(c.name.toLowerCase(), col);
      order.push(c.name);
    }
    targetTables.set(name, { cols, order });
  }
}
if (!ARGS.dryRun) loadTargetSchema();

// نام‌هایی که در پشتیبان واقعی (app2) جمع/تفریط متفاوتی با اسکیمای Prisma دارند
const TABLE_ALIASES = new Map([
  ["eventreferrs", "EventReferral"],
  ["corporatecontractcoupons", "CorporateContractCoupon"],
  ["equipmentitems", "EquipmentItem"],
  ["centercategories", "CenterCategory"],
]);

// تغییرنام ستون‌ها بین پشتیبان قدیمی و اسکیمای جدید — کلید: "جدول.ستون_dump" (lowercase)
// بدون این، ستون‌های NOT NULL بی‌مصدر کل جدول را می‌شکنند (Users/SMS/Sessions/Messages/Centers)
const COLUMN_ALIASES = new Map([
  ["users.password", "passwordHash"],
  ["sms.smssender", "senderId"],
  ["sms.smsreceiver", "receiverId"],
  ["sessions.key", "token"],
  ["centers.centertitle", "title"],
  ["messages.fromuid", "fromUserId"],
  ["messages.touid", "toUserId"],
  ["log.uid", "userId"],
  ["events.corporatecontractserviceid", "contractServiceId"],
  ["events.ems", "isEms"],
  ["helps.file_1", "fileUrl"],
  ["consultanteducation.univesity", "university"],
]);

// مقدار امن برای ستون NOT-NULL بدون منبع در dump
function fillValueFor(col) {
  const t = col.type || "";
  if (t.includes("DATETIME") || t.includes("TIMESTAMP") || t === "DATE") return SENTINEL_MS;
  if (t === "BOOLEAN" || t === "BOOL") return 0;
  if (t === "BIGINT" || t.includes("INTEGER")) return 0;
  if (t === "REAL" || t.includes("REAL") || t.includes("FLOA") || t.includes("DOUB")) return 0;
  return "";
}

function mapDumpTable(dumpName) {
  if (ARGS.dryRun) return dumpName; // در dry-run همهٔ جدول‌ها به خودشان نگاشت می‌شوند
  if (targetTables.has(dumpName)) return dumpName;
  const ci = dumpName.toLowerCase();
  for (const [t] of targetTables) if (t.toLowerCase() === ci) return t;
  if (TABLE_ALIASES.has(ci)) {
    const alias = TABLE_ALIASES.get(ci);
    if (targetTables.has(alias)) return alias;
  }
  return null;
}

// ---------------------------------------------------------------- ساختار مبدأ (dump)
const dumpTables = new Map();   // dump name → { cols: [names], notNull: Set }
const dumpToTarget = new Map(); // dump name → target name
const tableStats = new Map();   // target name → { dump, rows, inserted, failed, errors:[], skippedCols:Set, insertedShown }

function parseCreateTable(stmt) {
  // CREATE TABLE `Name` ( ... ) ENGINE=... ;
  // mysqldump هر ستون را در یک خط می‌نویسد — خط‌هایی که با «`» شروع می‌شوند
  // تعریف ستون‌اند؛ کلیدها با PRIMARY/UNIQUE/KEY/CONSTRAINT شروع می‌شوند.
  const m = stmt.match(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([^`\s(]+)`?\s*\(/i);
  if (!m) return null;
  const name = m[1];
  const cols = [];
  const notNull = new Set();
  for (const rawLine of stmt.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith("`")) continue;
    const cm = line.match(/^`([^`]+)`/);
    if (!cm) continue;
    cols.push(cm[1]);
    if (/\bNOT\s+NULL\b/i.test(line)) notNull.add(cm[1]);
  }
  return { name, cols, notNull };
}

// ---------------------------------------------------------------- تجزیهٔ VALUES
// ورودی: بدنهٔ دستور INSERT بعد از VALUES — خروجی: آرایهٔ ردیف‌ها
// هر ردیف آرایهٔ مقادیر است: null | string | number | bigint | Uint8Array
function parseValues(body) {
  const rows = [];
  let i = 0;
  const n = body.length;
  let cur = [];
  let inRow = false;
  while (i < n) {
    const ch = body[i];
    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") { i++; continue; }
    if (ch === "(") {
      inRow = true; cur = []; i++;
      continue;
    }
    if (ch === ")") {
      if (inRow) { rows.push(cur); cur = []; inRow = false; }
      i++;
      continue;
    }
    if (ch === ",") { i++; continue; }
    if (ch === ";" && !inRow) { break; }
    if (ch === "'" || ch === '"') {
      // رشته با escapeهای MySQL («\'» و «\\» و …) و همچنین «''»
      const q = ch;
      let j = i + 1;
      let out = "";
      for (; ; ) {
        const nb = body.indexOf("\\", j);
        const nq = body.indexOf(q, j);
        if (nq === -1) {
          // رشتهٔ بسته‌نشده — تا انتها بخوان
          out += body.slice(j);
          j = n;
          break;
        }
        if (nb !== -1 && nb < nq) {
          out += body.slice(j, nb);
          const e = body[nb + 1];
          switch (e) {
            case "0": out += "\0"; break;
            case "n": out += "\n"; break;
            case "r": out += "\r"; break;
            case "t": out += "\t"; break;
            case "b": out += "\b"; break;
            case "Z": out += "\x1a"; break;
            case "'": out += "'"; break;
            case '"': out += '"'; break;
            case "\\": out += "\\"; break;
            case "%": out += "\\%"; break;
            case "_": out += "\\_"; break;
            case undefined: out += "\\"; break;
            default: out += e ?? "";
          }
          j = nb + 2;
          continue;
        }
        // نقل‌قول بسته‌شده — بررسی «''» (دو نقل‌قول پشت‌سرهم داخل رشته)
        if (body[nq + 1] === q) {
          out += body.slice(j, nq) + q;
          j = nq + 2;
          continue;
        }
        out += body.slice(j, nq);
        j = nq + 1;
        break;
      }
      // رشته هم فقط داخل ردیف مقدار است — رشتهٔ غریبهٔ بین دستورها نادیده (۶.۲۴)
      if (inRow) cur.push(out);
      i = j;
      continue;
    }
    // مقدار بدون نقل‌قول: NULL / عدد / 0x hex / X'hex' / معرفی‌ستِ _charset
    // نکتهٔ ۶.۲۴: اسکن توکن در فاصله هم متوقف می‌شود — تا معرفی‌ستِ «_binary '...'»
    // کل رشتهٔ بعدی را قورت ندهد (باگ مقدارهای blob در پشتیبان واقعی)
    let j = i;
    while (j < n && body[j] !== "," && body[j] !== ")" && body[j] !== ";" && body[j] !== "\n" && body[j] !== " " && body[j] !== "\t" && body[j] !== "\r") j++;
    const tok = body.slice(i, j).trim();
    // فقط داخل پرانتزِ ردیف مقدار جمع می‌شود — متنِ غریبه میان دستورها (ادغام دستورهای
    // بدون «;») به‌عنوان مقدار ذخیره نمی‌شود (سخت‌گیری ۶.۲۴)
    if (tok.length && inRow) {
      if (/^NULL$/i.test(tok)) cur.push(null);
      else if (/^_[A-Za-z0-9]+$/.test(tok)) { /* معرفی‌ستِ charset مثل _binary — رشتهٔ بعدی مقدار است؛ حلقهٔ اصلی می‌خواند */ }
      else if (/^[Xx]'([0-9a-fA-F]*)'$/.test(tok)) {
        const hex = tok.slice(2, -1);
        const bytes = new Uint8Array(hex.length >> 1);
        for (let b = 0; b < bytes.length; b++) bytes[b] = parseInt(hex.substr(b * 2, 2), 16);
        cur.push(bytes);
      }
      else if (/^0x[0-9a-fA-F]+$/.test(tok)) {
        const hex = tok.slice(2);
        const bytes = new Uint8Array(hex.length >> 1);
        for (let b = 0; b < bytes.length; b++) bytes[b] = parseInt(hex.substr(b * 2, 2), 16);
        cur.push(bytes);
      } else if (/^[+-]?\d+$/.test(tok)) {
        const num = Number(tok);
        cur.push(Number.isSafeInteger(num) ? num : BigInt(tok));
      } else if (/^[+-]?(\d+\.\d*|\.\d+)([eE][+-]?\d+)?$|^[+-]?\d+[eE][+-]?\d+$/.test(tok)) {
        const f = parseFloat(tok);
        cur.push(Number.isFinite(f) ? f : tok);
      } else {
        cur.push(tok);
      }
    }
    i = j;
  }
  return rows;
}

// ---------------------------------------------------------------- تبدیل مقدار بر اساس نوع ستون هدف
function convertValue(v, col) {
  if (v === null || v === undefined) return null;
  const t = col.type;
  if (t.includes("DATETIME") || t.includes("TIMESTAMP") || t === "DATE") {
    if (typeof v === "number") return v; // از قبل epoch
    if (v instanceof Uint8Array) return null;
    let s = String(v).trim();
    if (!s) return col.notnull ? SENTINEL_MS : null;
    if (ZERO_DT_RE.test(s)) return col.notnull ? SENTINEL_MS : null;
    const m = s.match(DT_RE);
    if (!m) {
      // قالب‌های دیگر مثل «1402/07/15» — دست‌نخورده بماند
      return col.notnull ? SENTINEL_MS : (Number.isFinite(Date.parse(s)) ? Date.parse(s) : null);
    }
    return epochFromParts(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0), +(m[7] || 0));
  }
  if (t === "BOOLEAN" || t === "BOOL") {
    if (typeof v === "boolean") return v ? 1 : 0;
    if (typeof v === "number") return v ? 1 : 0;
    if (v instanceof Uint8Array) return v.length && v[0] ? 1 : 0;
    const s = String(v).trim();
    if (!s) return col.notnull ? 0 : null;
    return (s === "1" || /^true$/i.test(s)) ? 1 : 0;
  }
  if (t === "BIGINT") {
    if (typeof v === "bigint") return v;
    if (typeof v === "number") return Number.isSafeInteger(v) ? v : BigInt(Math.trunc(v));
    if (v instanceof Uint8Array) return null;
    const s = String(v).trim();
    if (/^[+-]?\d+$/.test(s)) {
      const num = Number(s);
      return Number.isSafeInteger(num) ? num : BigInt(s);
    }
    const f = parseFloat(s);
    return Number.isFinite(f) && Number.isSafeInteger(f) ? f : null;
  }
  if (t === "INTEGER" || t === "INT" || t.includes("INTEGER")) {
    if (typeof v === "number") return Math.trunc(v);
    if (typeof v === "bigint") return Number(v);
    if (v instanceof Uint8Array) return null;
    const s = String(v).trim();
    if (!s) return col.notnull ? 0 : null;
    if (/^[+-]?\d+$/.test(s)) {
      const num = Number(s);
      return Number.isSafeInteger(num) ? num : BigInt(s); // خارج از بازهٔ امن → BigInt (SQLite 64بیتی)
    }
    const f = parseFloat(s);
    return Number.isFinite(f) ? Math.trunc(f) : (col.notnull ? 0 : null);
  }
  if (t === "REAL" || t === "FLOAT" || t === "DOUBLE" || t.includes("REAL") || t.includes("FLOA") || t.includes("DOUB")) {
    if (typeof v === "number") return v;
    if (v instanceof Uint8Array) return null;
    const s = String(v).trim();
    if (!s) return col.notnull ? 0 : null;
    const f = parseFloat(s);
    return Number.isFinite(f) ? f : (col.notnull ? 0 : null);
  }
  // TEXT و هر چیز دیگر
  if (v instanceof Uint8Array) return v;
  if (typeof v === "string") return v;
  return String(v);
}

// ---------------------------------------------------------------- درج
function escIdent(s) { return '"' + String(s).replace(/"/g, '""') + '"'; }

function ensureTableEntry(dumpName, targetName, dumpCols) {
  let st = tableStats.get(targetName);
  if (!st) {
    st = { dump: dumpName, rows: 0, inserted: 0, failed: 0, errors: [], skippedCols: new Set(), stmt: null, truncated: false, inTxn: false };
    tableStats.set(targetName, st);
  }
  return st;
}

function truncateTarget(targetName, st) {
  if (ARGS.mode !== "truncate" || st.truncated) return;
  db.exec(`DELETE FROM ${escIdent(targetName)}`);
  try { db.exec(`DELETE FROM sqlite_sequence WHERE name='${targetName.replace(/'/g, "''")}'`); } catch {}
  st.truncated = true;
}

function buildInsert(targetName, colNames) {
  const cols = colNames.map(escIdent).join(",");
  const ph = colNames.map(() => "?").join(",");
  return db.prepare(`INSERT INTO ${escIdent(targetName)} (${cols}) VALUES (${ph})`);
}

function importRows(dumpName, targetName, dumpColNames, rows) {
  const st = ensureTableEntry(dumpName, targetName, dumpColNames);
  if (!st.truncated && ARGS.mode === "truncate") truncateTarget(targetName, st);

  // نگاشت ستون‌های dump → ستون‌های هدف (cache per table)
  const tt = targetTables.get(targetName);
  let colMap = st.colMap;
  if (!colMap || st.colMapKey !== dumpColNames.join("|")) {
    colMap = [];
    const useNames = [];
    const usedLower = new Set();
    // نسخهٔ ۶.۲۵ — ستون‌های INTEGER هدف (نوع Prisma Int) برای آشکارسازی سرریز Int32
    let kPos = 0;
    const intCheck = [];
    for (const dc of dumpColNames) {
      let tc = tt.cols.get(dc.toLowerCase());
      if (!tc) {
        const aliasName = COLUMN_ALIASES.get(targetName.toLowerCase() + "." + dc.toLowerCase());
        if (aliasName) tc = tt.cols.get(aliasName.toLowerCase());
      }
      if (tc) {
        colMap.push(tc); useNames.push(tc.name); usedLower.add(tc.name.toLowerCase());
        const t = tc.type || "";
        if ((t === "INTEGER" || t === "INT" || t.includes("INTEGER")) && !t.includes("BIGINT")) {
          intCheck.push({ k: kPos, name: tc.name });
        }
        kPos++;
      }
      else { colMap.push(null); st.skippedCols.add(dumpName + "." + dc); }
    }
    st.intCheck = intCheck;
    // ستون‌های NOT-NULL بدون منبع در dump — مقدار ثابت امن (۶.۲۴)
    st.fillCols = [];
    for (const tc of tt.cols.values()) {
      if (tc.notNullNoDefault && !usedLower.has(tc.name.toLowerCase())) {
        st.fillCols.push(fillValueFor(tc));
        useNames.push(tc.name);
      }
    }
    st.colMap = colMap;
    st.useNames = useNames;
    st.colMapKey = dumpColNames.join("|");
    if (useNames.length) st.stmt = buildInsert(targetName, useNames);
    else st.stmt = null;
  }
  if (!st.stmt) return;

  const stmt = st.stmt;
  const intCheck = st.intCheck || [];
  // درج داخل تراکنش — سرعت + چسبندگی؛ خطای سطح ردیف تراکنش را نمی‌شکند
  const inTxn = st.inTxn;
  if (!inTxn) { db.exec("BEGIN"); st.inTxn = true; }
  try {
    const fillCols = st.fillCols || [];
    for (const row of rows) {
      st.rows++;
      // ستون‌های نگاشت‌شده + ستون‌های fill — طول آرایه باید با placeholderها برابر باشد
      const vals = new Array(colMap.length + fillCols.length);
      let k = 0;
      for (let c = 0; c < colMap.length; c++) {
        const cm = colMap[c];
        if (!cm) continue;
        vals[k++] = convertValue(row[c], cm);
      }
      for (let f = 0; f < fillCols.length; f++) vals[k++] = fillCols[f];
      // نسخهٔ ۶.۲۵ — سرریز Int32 در ستون‌های Intِ Prisma → هشدار گزارش
      for (let ci = 0; ci < intCheck.length; ci++) {
        const v = vals[intCheck[ci].k];
        if (v === null || v === undefined) continue;
        const over = typeof v === "bigint"
          ? (v > 2147483647n || v < -2147483648n)
          : (v > 2147483647 || v < -2147483648);
        if (!over) continue;
        const absN = typeof v === "bigint" ? Number(v < 0n ? -v : v) : Math.abs(v);
        const key = targetName + "\u0000" + intCheck[ci].name;
        const prev = int32Overflow.get(key);
        if (!prev || absN > prev.max) int32Overflow.set(key, { table: targetName, column: intCheck[ci].name, max: absN });
      }
      try {
        stmt.run(...vals.slice(0, k));
        st.inserted++;
      } catch (e) {
        st.failed++;
        if (st.errors.length < 3) st.errors.push(String(e?.message ?? e).slice(0, 200));
      }
    }
  } finally {
    if (!inTxn) { try { db.exec("COMMIT"); } catch {} st.inTxn = false; }
  }
}

// ---------------------------------------------------------------- پیمایش فایل
let bytesSeen = 0;
let lastProgress = 0;
const totalRowsCounter = () => { let s = 0; for (const [, v] of tableStats) s += v.rows; return s; };

function processStatement(stmt) {
  const first = stmt.charCodeAt(0);
  // سریع‌ترین فیلتر — فقط INSERT/REPLACE/CREATE TABLE مهم‌اند
  if (first === 73 /* I */ || first === 82 /* R */) {
    if (/^(INSERT(?:\s+IGNORE)?|REPLACE)\s+INTO\s+/i.test(stmt)) processInsert(stmt);
    return;
  }
  if (first === 67 /* C */) {
    if (/^CREATE\s+TABLE\s+/i.test(stmt)) processCreate(stmt);
    return;
  }
}

function processCreate(stmt) {
  const def = parseCreateTable(stmt);
  if (!def) return;
  dumpTables.set(def.name, def);
  const target = mapDumpTable(def.name);
  if (!target) { skippedTables.set(def.name, "در اسکیمای SQLite نیست"); return; }
  dumpToTarget.set(def.name, target);
  if (ARGS.dryRun) return;
  const st = ensureTableEntry(def.name, target, def.cols);
  if (ARGS.mode === "truncate" && !st.truncated) truncateTarget(target, st);
}

function processInsert(stmt) {
  // INSERT [IGNORE] INTO `T` VALUES ... | INSERT [IGNORE] INTO `T` (`a`,`b`) VALUES ...
  const m = stmt.match(/^(?:INSERT(?:\s+IGNORE)?|REPLACE)\s+INTO\s+`?([^`\s]+)`?\s*(\(([^)]*)\)\s*)?VALUES?\s*[\r\n]?\s*/i);
  if (!m) return;
  const dumpName = m[1];
  let dumpCols = null;
  if (m[3]) {
    dumpCols = [];
    const re = /`([^`]+)`|([A-Za-z0-9_]+)/g;
    let cm;
    const list = m[3];
    while ((cm = re.exec(list)) !== null) dumpCols.push(cm[1] || cm[2]);
  }
  const body = stmt.slice(m.index + m[0].length);
  if (dumpCols === null) {
    const def = dumpTables.get(dumpName);
    if (def) dumpCols = def.cols;
  }
  if (!dumpCols) {
    skippedTables.set(dumpName, "تعریف CREATE TABLE یافت نشد و فهرست ستون هم ندارد");
    return;
  }
  const target = dumpToTarget.get(dumpName) ?? mapDumpTable(dumpName);
  if (!target) { skippedTables.set(dumpName, "در اسکیمای SQLite نیست"); return; }
  dumpToTarget.set(dumpName, target);
  const rows = parseValues(body);
  if (ARGS.dryRun) {
    const st = ensureTableEntry(dumpName, target, dumpCols);
    st.rows += rows.length;
    return;
  }
  importRows(dumpName, target, dumpCols, rows);
}

const skippedTables = new Map();
// نسخهٔ ۶.۲۵ — ستون‌های Int با مقدار خارج از بازهٔ Int32 (باید در اسکیما BigInt شوند)
const int32Overflow = new Map();

function showProgress(force) {
  if (ARGS.quiet) return;
  const now = Date.now();
  if (!force && now - lastProgress < 15000) return;
  lastProgress = now;
  const mb = Math.round(bytesSeen / 1048576);
  const rows = totalRowsCounter();
  const ins = [...tableStats.values()].reduce((s, v) => s + v.inserted, 0);
  const pct = SQL_SIZE ? Math.min(100, Math.floor((bytesSeen / SQL_SIZE) * 100)) : 0;
  process.stdout.write(`  … ${pct}٪ فایل خوانده شد (${mb} MB) — ردیف‌های خوانده‌شده: ${rows.toLocaleString("en-US")} — درج‌شده: ${ins.toLocaleString("en-US")}\n`);
}

// ---------------------------------------------------------------- اجرای اصلی
const startedAt = new Date();
if (!ARGS.quiet) {
  console.log(`  فایل پشتیبان: ${SQL_PATH} (${(SQL_SIZE / 1073741824).toFixed(2)} GB)${ARGS.dryRun ? " (آزمایشی — چیزی نوشته نمی‌شود)" : ""}`);
  if (!ARGS.dryRun) console.log(`  دیتابیس هدف: ${path.resolve(ARGS.db)} | حالت: ${ARGS.mode === "truncate" ? "پاک و جایگزینی" : "افزودن"}`);
  console.log(`  منطقهٔ زمانی تاریخ‌ها: ${TZ_NAME}`);
}

if (!ARGS.dryRun) {
  db.exec("PRAGMA foreign_keys=OFF");
  db.exec("PRAGMA synchronous=OFF");
  db.exec("PRAGMA journal_mode=WAL");
}

const filterTables = ARGS.tables ? new Set(ARGS.tables.split(",").map((s) => s.trim()).filter(Boolean)) : null;

let acc = "";
let seenFirstLine = false;
const MAX_ACC = 2 * 1024 * 1024 * 1024;
const STMT_START_RE = /^(INSERT(?:\s+IGNORE)?\s+INTO|REPLACE\s+INTO|CREATE\s+TABLE)\b/i;

const rl = readline.createInterface({
  input: fs.createReadStream(SQL_PATH, { encoding: "utf8" }),
  crlfDelay: Infinity,
});

rl.on("error", (e) => {
  console.error("✘ خطا در خواندن فایل پشتیبان: " + String(e?.message ?? e));
  process.exit(2);
});

rl.on("line", (lineRaw) => {
  bytesSeen += Buffer.byteLength(lineRaw) + 1;
  let line = lineRaw;
  if (!seenFirstLine) {
    seenFirstLine = true;
    if (line.charCodeAt(0) === 0xfeff) line = line.slice(1); // BOM
  }
  if (!acc) {
    const trimmed = line.trimStart();
    const t0 = trimmed.charAt(0);
    // خطوط کامنت/خالی — شروع‌کنندهٔ دستور نیستند
    if (t0 === "-" || t0 === "/" || t0 === "") return;
    if (!STMT_START_RE.test(trimmed)) return;
    acc = trimmed;
  } else {
    acc += "\n" + line;
  }
  if (acc.length > MAX_ACC) { console.error("✘ دستورِ بیش‌ازحد بزرگ در پشتیبان"); process.exit(2); }
  // پایان دستور = خطی که با «;» تمام می‌شود (رشته‌ها newline خام ندارند)
  if (acc.trimEnd().endsWith(";")) {
    const stmt = acc;
    acc = "";
    try {
      if (filterTables) {
        const nm = stmt.match(/^(?:INSERT(?:\s+IGNORE)?|REPLACE)\s+INTO\s+`?([^`\s]+)`?/i)?.[1] ?? stmt.match(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([^`\s(]+)`?/i)?.[1];
        if (!nm || !filterTables.has(nm)) return;
      }
      processStatement(stmt);
    } catch (e) {
      console.error("  ⚠ خطای تجزیهٔ دستور (نادیده گرفته شد): " + String(e?.message ?? e).slice(0, 200));
    }
    showProgress(false);
  }
});

rl.on("close", () => {
  if (acc) {
    try { processStatement(acc); } catch (e) { console.error("  ⚠ دستور پایانی ناتمام: " + String(e?.message ?? e).slice(0, 120)); }
  }
  finish();
});

function finish() {
  // یک تراکنش نهایی برای اطمینان از flush
  if (!ARGS.dryRun) {
    try { db.exec("PRAGMA wal_checkpoint(TRUNCATE)"); } catch {}
    try { db.exec("PRAGMA journal_mode=DELETE"); } catch {}
    try { db.exec("PRAGMA foreign_keys=ON"); } catch {}
  }

  const finishedAt = new Date();
  const durationMs = finishedAt - startedAt;
  const totals = { rows: 0, inserted: 0, failed: 0 };
  const tablesOut = [];
  for (const [target, st] of tableStats) {
    totals.rows += st.rows;
    totals.inserted += st.inserted;
    totals.failed += st.failed;
    tablesOut.push({
      dump: st.dump,
      target,
      rowsRead: st.rows,
      inserted: st.inserted,
      failed: st.failed,
      errors: st.errors,
      skippedColumns: [...st.skippedCols],
    });
  }
  tablesOut.sort((a, b) => b.inserted - a.inserted);

  const report = {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs,
    sqlFile: SQL_PATH,
    sqlBytes: SQL_SIZE,
    database: ARGS.dryRun ? null : path.resolve(ARGS.db),
    driver,
    mode: ARGS.mode,
    timezone: TZ_NAME,
    dryRun: ARGS.dryRun,
    totals,
    tables: tablesOut,
    skippedTables: [...skippedTables].map(([dump, reason]) => ({ dump, reason })),
    int32Overflow: [...int32Overflow.values()].sort((a, b) => b.max - a.max),
  };
  if (ARGS.report) {
    try {
      fs.writeFileSync(path.resolve(ARGS.report), JSON.stringify(report, null, 2), "utf8");
      if (!ARGS.quiet) console.log(`  گزارش کامل: ${path.resolve(ARGS.report)}`);
    } catch (e) {
      console.error("  ⚠ نوشتن گزارش ناموفق بود: " + String(e?.message ?? e));
    }
  }

  // خلاصهٔ فارسی
  const fmt = (x) => Number(x || 0).toLocaleString("en-US");
  const dur = durationMs >= 60000 ? `${Math.floor(durationMs / 60000)}:${String(Math.floor((durationMs % 60000) / 1000)).padStart(2, "0")}` : `${(durationMs / 1000).toFixed(1)}s`;
  console.log("");
  console.log(`✔ پایان درون‌ریزی — زمان: ${dur}`);
  console.log(`  جدول‌ها: ${fmt(tablesOut.length)} | ردیف خوانده‌شده: ${fmt(totals.rows)} | درج‌شده: ${fmt(totals.inserted)} | ناموفق: ${fmt(totals.failed)}`);
  const users = tableStats.get("Users");
  const referrs = tableStats.get("Referrs");
  if (users) console.log(`  کاربران: ${fmt(users.inserted)}`);
  if (referrs) console.log(`  ارجاعات: ${fmt(referrs.inserted)}`);
  const top = tablesOut.slice(0, 12).filter((t) => t.inserted > 0);
  if (top.length) {
    console.log("  بزرگ‌ترین جدول‌ها:");
    for (const t of top) console.log(`    • ${t.target}: ${fmt(t.inserted)} ردیف${t.failed ? ` (${fmt(t.failed)} ناموفق)` : ""}`);
  }
  if (skippedTables.size) {
    console.log(`  ⚠ جدول‌های نادیده‌گرفته (${skippedTables.size}): ${[...skippedTables.keys()].slice(0, 10).join(", ")}${skippedTables.size > 10 ? " …" : ""}`);
  }
  const skippedCols = new Set();
  for (const [, st] of tableStats) for (const c of st.skippedCols) skippedCols.add(c);
  if (skippedCols.size) {
    console.log(`  ⚠ ستون‌های پشتیبان که در ساختار جدید جایی نداشتند (${skippedCols.size}): ${[...skippedCols].slice(0, 10).join(", ")}${skippedCols.size > 10 ? " …" : ""}`);
  }
  if (int32Overflow.size) {
    const list = [...int32Overflow.values()].sort((a, b) => b.max - a.max);
    console.log(`  ⚠ ستون‌های Int با مقدار بزرگ‌تر از بازهٔ Int32 (${list.length}) — Prisma این ستون‌ها را نمی‌خواند؛ در prisma/schema.prisma به BigInt تبدیل شوند:`);
    for (const o of list.slice(0, 10)) console.log(`    • ${o.table}.${o.column} (بیشینهٔ مطلق: ${o.max.toLocaleString("en-US")})`);
    if (list.length > 10) console.log(`    … و ${list.length - 10} مورد دیگر`);
  }
  const errTables = tablesOut.filter((t) => t.failed > 0);
  if (errTables.length) {
    console.log(`  ⚠ جدول‌های با ردیف ناموفق: ${errTables.map((t) => t.target).join(", ")}`);
    for (const t of errTables.slice(0, 5)) if (t.errors.length) console.log(`    • ${t.target}: ${t.errors[0]}`);
  }

  if (!ARGS.dryRun) {
    try { db.close(); } catch {}
    if (totals.inserted === 0 && totals.rows === 0) {
      console.error("✘ هیچ ردیفی وارد نشد — فایل پشتیبان خالی است یا قالب mysqldump نیست");
      process.exit(1);
    }
    if (totals.inserted === 0) {
      console.error("✘ هیچ ردیفی درج نشد — نگاشت جدول/ستون‌ها را در گزارش بررسی کنید");
      process.exit(1);
    }
  }
  process.exit(0);
}
