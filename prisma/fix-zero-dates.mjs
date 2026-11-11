// =====================================================================
// پاک‌ساز تاریخ‌های نامعتبر legacy در MySQL — نسخهٔ ۶.۱۵
// ---------------------------------------------------------------
// چرا لازم است؟
//   سامانهٔ قدیمی برای «تاریخ ثبت‌نشده» مقدار صفر («0000-00-00 00:00:00»)
//   می‌نوشت. این مقادیر با حالت strict سرورهای MySQL جدید ناسازگارند:
//   • «prisma db push» هنگام بازسازی جدول (ALTER برای تبدیل ستون‌های متنی
//     به TEXT یا DATETIME(0)→DATETIME(3)) همهٔ ردیف‌ها را بازنویسی می‌کند و
//     با خطای  «Incorrect datetime value: '0000-00-00 00:00:00.000'»
//     متوقف می‌شود — استقرار (deploy -Mode update) شکست می‌خورد.
//   • Prisma Client هم هنگام خواندن همان ردیف‌ها خطای Invalid Date می‌دهد.
//
// چه می‌کند؟
//   در همهٔ جدول‌های دیتابیس جاری، همهٔ ستون‌های DATE/DATETIME/TIMESTAMP را
//   می‌گردد و مقدارهای پیش از «1000-01-01» (شامل تاریخ صفر) را:
//   • در ستون‌های nullable  →  NULL        (یعنی «ثبت‌نشده» — دقیقاً همان معنا)
//   • در ستون‌های NOT NULL  →  پیش‌فرض امن (DATETIME: 1970-01-01 00:00:00،
//     TIMESTAMP: 2000-01-01 00:00:00، DATE: 1970-01-01)
//   ستون‌های محاسباتی (GENERATED) و VIEWها دست‌نخورده می‌مانند.
//
// اجرا (deploy.ps1 خودش قبل از prisma db push و بعد از import صدا می‌زند):
//   node prisma/fix-zero-dates.mjs --mysql "mysql://user:pass@localhost:3306/rahe_zendegi"
// =====================================================================

// ---------------------------- آرگومان‌ها ----------------------------
function parseArgs() {
  const args = {};
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
const MYSQL_URL = String(args.mysql ?? process.env.MYSQL_URL ?? process.env.DATABASE_URL ?? "");
const DRY_RUN = Boolean(args["dry-run"]);

if (!MYSQL_URL || !(MYSQL_URL.includes("mysql://") || MYSQL_URL.includes("mariadb://"))) {
  console.error("خطا: رشتهٔ اتصال MySQL را با --mysql مشخص کنید");
  process.exit(1);
}

const bt = (id) => "`" + String(id).replace(/`/g, "``") + "`";

// تاریخ‌ها قبل از این مرز «نامعتبر legacy» تلقی می‌شوند (تاریخ صفر و مشابه)
const CUTOFF_DATE = "1000-01-01";
const CUTOFF_DATETIME = "1000-01-01 00:00:00";
// پیش‌فرض امن برای ستون‌های NOT NULL
const SENTINEL = { date: "'1970-01-01'", datetime: "'1970-01-01 00:00:00'", timestamp: "'2000-01-01 00:00:00'" };

let mysql;
try {
  mysql = await import("mysql2/promise");
} catch {
  console.error("خطا: بستهٔ mysql2 نصب نیست — دستور «npm install --include=dev» را در پوشهٔ سامانه اجرا کنید");
  process.exit(1);
}

let conn;
try {
  conn = await mysql.createConnection({
    uri: MYSQL_URL,
    charset: "utf8mb4",
    multipleStatements: false,
    connectTimeout: 20_000,
  });
} catch (e) {
  console.error(`خطا: اتصال MySQL برقرار نشد — ${e?.message ?? e}`);
  process.exit(1);
}

try {
  // نام دیتابیس از URI — آخرین قطعهٔ مسیر (مقاوم در برابر رمز با اسلش)؛ به‌عنوان محافظ USE هم اجرا می‌شود
  const m = MYSQL_URL.match(/\/([^/?#]+)(\?.*)?$/);
  if (m) { await conn.query(`USE ${bt(m[1])}`); }
  const [dbRow] = await conn.query("SELECT DATABASE() AS db");
  const dbName = dbRow?.[0]?.db;
  if (!dbName) {
    console.error("خطا: دیتابیس پیش‌فرض در رشتهٔ اتصال مشخص نیست");
    process.exit(1);
  }

  // همهٔ ستون‌های تاریخ/ساعت جدول‌های واقعی (نه VIEW) و غیرمحاسباتی
  // (ستون‌های GENERATED/محاسباتی قابل UPDATE نیستند؛ DEFAULT_GENERATED معمولی است و باید بماند)
  const [cols] = await conn.query(
    `SELECT c.TABLE_NAME AS tbl, c.COLUMN_NAME AS col, c.IS_NULLABLE AS nul, c.DATA_TYPE AS dt
       FROM information_schema.COLUMNS c
       JOIN information_schema.TABLES t
         ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
      WHERE c.TABLE_SCHEMA = DATABASE()
        AND t.TABLE_TYPE = 'BASE TABLE'
        AND c.DATA_TYPE IN ('date','datetime','timestamp')
        AND (c.EXTRA IS NULL OR c.EXTRA NOT REGEXP 'VIRTUAL GENERATED|STORED GENERATED|GENERATED ALWAYS|VIRTUAL|PERSISTENT')
      ORDER BY c.TABLE_NAME, c.COLUMN_NAME`
  );

  if (!cols.length) {
    console.log(`✔ دیتابیس «${dbName}»: هیچ ستون تاریخ/ساعت پیدا نشد — کاری لازم نیست`);
    process.exit(0);
  }

  console.log(`✔ دیتابیس «${dbName}»: بررسی ${cols.length} ستون تاریخ/ساعت…`);
  if (DRY_RUN) {
    // فقط شمارش — بدون تغییر
    let total = 0;
    for (const c of cols) {
      const cutoff = c.dt === "date" ? CUTOFF_DATE : CUTOFF_DATETIME;
      const [rows] = await conn.query(
        `SELECT COUNT(*) AS n FROM ${bt(c.tbl)} WHERE ${bt(c.col)} IS NOT NULL AND ${bt(c.col)} < ?`,
        [cutoff]
      );
      if (rows[0].n > 0) { console.log(`  • ${c.tbl}.${c.col}: ${Number(rows[0].n).toLocaleString("en-US")} مقدار نامعتبر`); total += Number(rows[0].n); }
    }
    console.log(total ? `⚠ اجرای آزمایشی: ${total.toLocaleString("en-US")} مقدار نامعتبر پیدا شد (بدون تغییر)` : "✔ هیچ مقدار نامعتبری پیدا نشد");
    process.exit(0);
  }

  let totalFixed = 0;
  let touchedCols = 0;
  for (const c of cols) {
    const nullable = c.nul === "YES";
    const cutoff = c.dt === "date" ? CUTOFF_DATE : CUTOFF_DATETIME;
    const target = nullable
      ? "NULL"
      : SENTINEL[c.dt] ?? SENTINEL.datetime;
    const [res] = await conn.query(
      `UPDATE ${bt(c.tbl)} SET ${bt(c.col)} = ${target} WHERE ${bt(c.col)} IS NOT NULL AND ${bt(c.col)} < ?`,
      [cutoff]
    );
    const n = Number(res.affectedRows ?? 0);
    if (n > 0) {
      totalFixed += n;
      touchedCols++;
      console.log(`  • ${c.tbl}.${c.col}${nullable ? "" : " (NOT NULL)"}: ${n.toLocaleString("en-US")} مقدار → ${nullable ? "NULL" : target}`);
    }
  }

  if (totalFixed === 0) {
    console.log("✔ هیچ تاریخ نامعتبری پیدا نشد — داده تمیز است");
  } else {
    console.log(`✔ پاک‌سازی کامل شد: ${totalFixed.toLocaleString("en-US")} مقدار در ${touchedCols} ستون اصلاح شد`);
  }
} finally {
  await conn.end().catch(() => {});
}
