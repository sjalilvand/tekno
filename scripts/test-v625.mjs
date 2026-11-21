#!/usr/bin/env node
// =====================================================================
//  تست دود نسخهٔ ۶.۲۵ — ستون APICode از Int به BigInt
// ---------------------------------------------------------------------
//  باگ واقعی سرور: پشتیبان واقعی (app2) در Cities.APICode کدهایی مثل
//  2165064084 دارد که از بازهٔ Int32 بیرون می‌زند؛ Prisma هنگام خواندن
//  هر ردیف City خطای «Inconsistent column data: does not fit in an INT
//  column» می‌داد و صفحهٔ اطلس رز از کار می‌افتاد.
//  این تست سه چیز را تضمین می‌کند:
//    ۱) db push روی دیتابیسِ قدیمیِ با ستون INTEGER — ستون را BIGINT می‌کند
//       و دادهٔ موجود سرِ جایش می‌ماند (سناریوی واقعی سرور بدون درون‌ریزی مجدد)
//    ۲) درون‌ریز پشتیبان مقدارهای بزرگ APICode را دقیق ذخیره می‌کند و برای
//       ستون‌های Intِ سرریزشده هشدار می‌دهد
//    ۳) prisma.city.findFirst بدون select روی دادهٔ واقعی بدون خطا می‌خواند
//       و مقدار BigInt به‌درستی به JSON تبدیل می‌شود (safeJson)
// =====================================================================
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const TMP = "/tmp/rz-v625-test";

let passed = 0, failed = 0;
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; console.log(`  ✘ ${name} ${extra}`); }
}

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

function dbPush(dbFile) {
  const r = spawnSync("npx", ["prisma", "db", "push", "--accept-data-loss", "--skip-generate"], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: "file:" + dbFile },
    encoding: "utf8",
  });
  return r;
}
const colType = (db, table, col) => {
  const info = db.prepare(`PRAGMA table_info("${table}")`).all();
  const c = info.find((x) => x.name.toLowerCase() === col.toLowerCase());
  return c ? (c.type || "").toUpperCase() : null;
};

// ---------- ۱) سناریوی سرور: دیتابیس legacy با APICode INTEGER + دادهٔ سرریز
console.log("۱) دیتابیس legacy با ستون APICode از نوع INTEGER (شبیه‌سازی سرور)…");
const DB2 = path.join(TMP, "legacy.sqlite");
{
  const d = new DatabaseSync(DB2);
  d.exec(`CREATE TABLE "Provinces" ("id" INTEGER NOT NULL PRIMARY KEY, "title" TEXT NOT NULL, "API" INTEGER, "DetailCode" INTEGER);
          CREATE TABLE "Cities" ("id" INTEGER NOT NULL PRIMARY KEY, "provinceId" INTEGER NOT NULL, "title" TEXT NOT NULL, "APICode" INTEGER);`);
  const p = d.prepare(`INSERT INTO "Provinces" (id, title, API, DetailCode) VALUES (?,?,?,?)`);
  p.run(8, "آذربایجان شرقی", 8, 1);
  p.run(3, "اردبیل", 3, 1);
  const c = d.prepare(`INSERT INTO "Cities" (id, provinceId, title, APICode) VALUES (?,?,?,?)`);
  c.run(113, 8, "تبریز", 2165064084);
  c.run(114, 8, "ارومیه", 2165063849);
  c.run(115, 3, "اردبیل", 2165063720);
  d.close();
}
console.log("  db push روی دیتابیس موجود (باید ستون را BIGINT کند و داده بماند)…");
const push2 = dbPush(DB2);
if (push2.status !== 0) { console.error(push2.stdout + "\n" + push2.stderr); process.exit(1); }
{
  const d = new DatabaseSync(DB2);
  check("مهاجرت ستون: APICode → BIGINT", colType(d, "Cities", "APICode") === "BIGINT", `→ ${colType(d, "Cities", "APICode")}`);
  const rows = d.prepare(`SELECT id, title, APICode FROM Cities ORDER BY id`).all();
  check("دادهٔ legacy حفظ شد (۳ شهر)", rows.length === 3, `→ ${rows.length}`);
  const tab = rows.find((r) => r.title === "تبریز");
  check("APICode تبریز دقیق: 2165064084", tab && Number(tab.APICode) === 2165064084, `→ ${tab?.APICode}`);
  d.close();
}

// ---------- ۲) خواندن Prisma از دیتابیس مهاجرت‌شده — بدون خطا
console.log("۲) خواندن Prisma (همان کوئری صفحهٔ اطلس رز)…");
{
  const prisma = new PrismaClient({ datasourceUrl: "file:" + DB2 });
  let city = null, threw = null;
  try {
    city = await prisma.city.findFirst({ where: { title: "تبریز" } }); // بدون select — کل ردیف
  } catch (e) { threw = e; }
  check("city.findFirst بدون خطای «does not fit in INT»", !threw, threw ? `→ ${String(threw.message).slice(0, 160)}` : "");
  check("apiCode از نوع BigInt با مقدار درست", typeof city?.apiCode === "bigint" && city.apiCode === 2165064084n, `→ ${String(city?.apiCode)}`);
  // تبدیل safeJson — همان مسیر ok() در src/lib/server.ts
  const json = JSON.parse(JSON.stringify(city, (_k, v) => (typeof v === "bigint" ? Number(v) : v)));
  check("safeJson: apiCode → عدد JSON 2165064084", json?.apiCode === 2165064084, `→ ${json?.apiCode}`);
  const up = await prisma.city.update({ where: { id: 113 }, data: { apiCode: 2165064090n } }).catch((e) => null);
  check("نوشتن BigInt روی همان ستون هم کار می‌کند", up?.apiCode === 2165064090n, `→ ${String(up?.apiCode)}`);
  await prisma.$disconnect();
}

// ---------- ۳) درون‌ریزی پشتیبان با APICode بزرگ + هشدار سرریز ستون Int
console.log("۳) درون‌ریزی پشتیبان مصنوعی (Cities.APICode بزرگ + Centers.CatID سرریز)…");
const DB3 = path.join(TMP, "imp.sqlite");
const DUMP = path.join(TMP, "dump.sql");
const REPORT = path.join(TMP, "report.json");
{
  const push3 = dbPush(DB3);
  if (push3.status !== 0) { console.error(push3.stdout + "\n" + push3.stderr); process.exit(1); }
  const L = [];
  L.push("-- MySQL dump 10.13  Distrib 8.0.36");
  L.push("SET NAMES utf8mb4;");
  L.push("CREATE TABLE `Provinces` (");
  L.push("  `id` int NOT NULL,");
  L.push("  `Title` varchar(255) NOT NULL,");
  L.push("  `API` int DEFAULT NULL,");
  L.push("  `DetailCode` int DEFAULT NULL,");
  L.push("  PRIMARY KEY (`id`)");
  L.push(") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
  L.push(
    "INSERT INTO `Provinces` (`id`,`Title`,`API`,`DetailCode`) VALUES " +
    "(8,'آذربایجان شرقی',8,1),(3,'اردبیل',3,1),(1,'تهران',1,1);"
  );
  L.push("CREATE TABLE `Cities` (");
  L.push("  `id` int NOT NULL,");
  L.push("  `ProvinceID` int NOT NULL,");
  L.push("  `Title` varchar(255) NOT NULL,");
  L.push("  `APICode` bigint(20) DEFAULT NULL,");
  L.push("  PRIMARY KEY (`id`)");
  L.push(") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
  L.push(
    "INSERT INTO `Cities` (`id`,`ProvinceID`,`Title`,`APICode`) VALUES " +
    "(113,8,'تبریز',2165064084)," +
    "(114,8,'ارومیه',2165063849)," +
    "(115,3,'اردبیل',2165063720)," +
    "(116,1,'تهران',12345);"
  );
  L.push("CREATE TABLE `Centers` (");
  L.push("  `id` int NOT NULL,");
  L.push("  `CenterTitle` varchar(255) NOT NULL,");
  L.push("  `IsEnabled` tinyint NOT NULL DEFAULT '1',");
  L.push("  `Address` text,");
  L.push("  `Tel` varchar(255) DEFAULT NULL,");
  L.push("  `CatID` int DEFAULT NULL,");
  L.push("  `CityID` int NOT NULL,");
  L.push("  `CityTitle` varchar(255) NOT NULL,");
  L.push("  `ProvinceID` int NOT NULL,");
  L.push("  `ProvinceTitle` varchar(255) NOT NULL,");
  L.push("  PRIMARY KEY (`id`)");
  L.push(") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
  L.push(
    "INSERT INTO `Centers` (`id`,`CenterTitle`,`IsEnabled`,`Address`,`Tel`,`CatID`,`CityID`,`CityTitle`,`ProvinceID`,`ProvinceTitle`) VALUES " +
    "(1,'کلینیک مرکزی رز — تبریز',1,'تبریز، ارگ علیشاه','041-33334455',2165064084,113,'تبریز',8,'آذربایجان شرقی')," +
    "(2,'کلینیک مرکزی رز — ارومیه',1,'ارومیه','044-33334455',NULL,114,'ارومیه',8,'آذربایجان شرقی');"
  );
  fs.writeFileSync(DUMP, L.join("\n") + "\n", "utf8");

  const run = spawnSync("node", [path.join(ROOT, "scripts/import-mysqldump.mjs"), "--sql", DUMP, "--db", DB3, "--report", REPORT], { cwd: ROOT, encoding: "utf8" });
  if (run.status !== 0) { console.error(run.stdout + "\n" + run.stderr); process.exit(1); }
  check("هشدار سرریز Int32 در خروجی درون‌ریز (Centers.catId)", /Centers\.catId/.test(run.stdout));
  check("هشدار ندارد Cities.APICode (الان BigInt است)", !/Cities\.apiCode/.test(run.stdout));

  const rep = JSON.parse(fs.readFileSync(REPORT, "utf8"));
  const ov = rep.int32Overflow ?? [];
  check("گزارش JSON: int32Overflow شامل Centers.catId", ov.some((o) => o.table === "Centers" && o.column === "catId" && o.max === 2165064084), `→ ${JSON.stringify(ov)}`);
  check("گزارش JSON: Cities.APICode در سرریز نیست", !ov.some((o) => o.table === "Cities"));

  const d = new DatabaseSync(DB3);
  check("APICode درون‌ریزی → BIGINT", colType(d, "Cities", "APICode") === "BIGINT");
  const rows = d.prepare(`SELECT title, APICode FROM Cities ORDER BY id`).all();
  check("درون‌ریز: تبریز 2165064084", rows[0]?.APICode === 2165064084, `→ ${rows[0]?.APICode}`);
  check("درون‌ریز: ارومیه 2165063849", rows[1]?.APICode === 2165063849, `→ ${rows[1]?.APICode}`);
  check("درون‌ریز: اردبیل 2165063720", rows[2]?.APICode === 2165063720, `→ ${rows[2]?.APICode}`);
  check("درون‌ریز: تهران 12345 معمولی", rows[3]?.APICode === 12345, `→ ${rows[3]?.APICode}`);
  d.close();
}

// ---------- ۴) خواندن Prisma از دیتابیس درون‌ریزی‌شده + مراکز
console.log("۴) خواندن Prisma از دیتابیس درون‌ریزی‌شده…");
{
  const prisma = new PrismaClient({ datasourceUrl: "file:" + DB3 });
  let city = null, threw = null;
  try {
    city = await prisma.city.findFirst({ where: { provinceId: 8, title: "تبریز" } });
  } catch (e) { threw = e; }
  check("findFirst با فیلتر provinceId+title (مسیر ensureRoseClinics)", !threw && city?.id === 113, threw ? String(threw.message).slice(0, 160) : `→ ${city?.id}`);
  check("apiCode دیتای درون‌ریزی = 2165064084n", city?.apiCode === 2165064084n, `→ ${String(city?.apiCode)}`);
  const center = await prisma.center.findFirst({ where: { title: "کلینیک مرکزی رز — ارومیه" } }).catch(() => null);
  check("مرکز بدون catId سرریزی خوانده شد", center?.cityId === 114 && center?.provinceId === 8, `→ ${center?.cityId}`);
  // ردیفی که ستون Int آن سرریز دارد (CatID=2165064084) — Prisma همان خطای Int را می‌دهد؛
  // این دقیقاً همان چیزی است که هشدار سرریز درون‌ریز درباره‌اش هشدار می‌دهد
  let centerThrew = null;
  try {
    await prisma.center.findFirst({ where: { title: "کلینیک مرکزی رز — تبریز" } });
  } catch (e) { centerThrew = e; }
  check("ردیف با catId سرریزی همچنان خطای Int می‌دهد (دلیل وجود هشدار درون‌ریز)", !!centerThrew && /does not fit in an INT column/.test(String(centerThrew.message)), centerThrew ? String(centerThrew.message).slice(0, 120) : "بدون خطا!");
  await prisma.$disconnect();
}

// ---------- پایان
console.log("");
console.log(`═══ نتیجه: ${passed} موفق / ${failed} شکست ═══`);
process.exit(failed ? 1 : 0);
