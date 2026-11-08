// =====================================================================
//  ایجاد/به‌روزرسانی حساب‌های مدیریتی سامانه — قابل اجرای مکرر (idempotent)
// ---------------------------------------------------------------------
//  بعد از انتقال دادهٔ قدیمی به MySQL اجرا می‌شود تا حساب‌های ورود پیش‌فرض
//  قطعاً وجود داشته باشند. اگر کاربری با همین نام کاربری از قبل باشد
//  (مثلاً از داده‌های قدیمی)، فقط رمز آن با «123456» بازنشانی می‌شود.
//
//  اجرا:  npm run seed:admin      (یا npx tsx prisma/seed-admin.ts)
//  دیتابیس مقصد از DATABASE_URL در فایل .env خوانده می‌شود
//  (هم SQLite و هم MySQL — چون نام مدل‌ها یکسان است).
// =====================================================================
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { scryptSync, randomBytes } from "crypto";

// --- بارگذاری دستی .env (بدون وابستگی اضافه) ---
(function loadEnv() {
  for (const dir of [process.cwd(), path.join(process.cwd(), "prisma")]) {
    const p = path.join(dir, ".env");
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?(.*?)"?\s*$/);
      if (m && process.env[m[1]] === undefined && m[2] !== "") process.env[m[1]] = m[2];
    }
  }
})();

const db = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

const DEFAULT_PASSWORD = process.argv.find((a) => a.startsWith("--password="))?.split("=")[1] ?? "123456";

type AccountDef = {
  username: string;
  password: string;
  name: string;
  family: string;
  roleTitle: string;
  roleCode: string;
  roleKeywords: string[];
};

const ACCOUNTS: AccountDef[] = [
  {
    username: "admin",
    password: DEFAULT_PASSWORD,
    name: "مدیر",
    family: "سامانه",
    roleTitle: "مدیر سامانه",
    roleCode: "admin",
    roleKeywords: ["مدیر سامانه", "مدیر سیستم", "مدیر کل", "superadmin", "admin"],
  },
  {
    username: "manager",
    password: DEFAULT_PASSWORD,
    name: "مدیر",
    family: "کلینیک",
    roleTitle: "مدیر کلینیک",
    roleCode: "manager",
    roleKeywords: ["مدیر کلینیک", "مدیر مرکز", "manager"],
  },
  {
    username: "consultant",
    password: DEFAULT_PASSWORD,
    name: "مشاور",
    family: "نمونه",
    roleTitle: "مشاور",
    roleCode: "consultant",
    roleKeywords: ["مشاور", "consultant"],
  },
];

// کد ملی/موبایل فرضی برای حساب‌های جدید — بازهٔ 999… با کدملی‌های واقعی تداخل ندارد
const SYNTHETIC_NID = [9990000001, 9990000002, 9990000003];
const SYNTHETIC_MOBILE = [9990000001, 9990000002, 9990000003];

async function ensureRole(def: AccountDef) {
  const roles = await db.role.findMany({ select: { id: true, title: true, codeName: true } });
  const byCode = roles.find((r) => (r.codeName ?? "").trim().toLowerCase() === def.roleCode);
  if (byCode) return byCode.id;
  const byKeyword = roles.find(
    (r) => def.roleKeywords.some((k) => (r.title ?? "").includes(k)) ||
      def.roleKeywords.some((k) => (r.codeName ?? "").toLowerCase().includes(k.toLowerCase()))
  );
  if (byKeyword) return byKeyword.id;
  const nextId = roles.reduce((m, r) => Math.max(m, r.id), 0) + 1;
  const created = await db.role.create({ data: { id: nextId, title: def.roleTitle, codeName: def.roleCode } });
  console.log(`  + نقش جدید ساخته شد: «${def.roleTitle}» (id=${created.id})`);
  return created.id;
}

async function ensureAccount(def: AccountDef, index: number) {
  const roleId = await ensureRole(def);
  const existing = await db.user.findFirst({ where: { username: def.username } });

  if (existing) {
    await db.user.update({
      where: { id: existing.id },
      data: { passwordHash: hashPassword(def.password), blocked: false, confirm: 1 },
    });
    console.log(`  ✔ ${def.username.padEnd(12)} موجود بود — رمز بازنشانی شد (id=${existing.id})`);
  } else {
    let created = false;
    for (let attempt = 0; attempt < 5 && !created; attempt++) {
      const nid = BigInt(SYNTHETIC_NID[index] + attempt);
      try {
        const user = await db.user.create({
          data: {
            nid,
            username: def.username,
            passwordHash: hashPassword(def.password),
            name: def.name,
            family: def.family,
            mobile: BigInt(SYNTHETIC_MOBILE[index] + attempt),
            signupDate: new Date(),
            confirm: 1,
            blocked: false,
            checked: true,
          },
        });
        console.log(`  + ${def.username.padEnd(12)} ساخته شد (id=${user.id})`);
        created = true;
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        if (msg.includes("nid") || msg.includes("mobile") || msg.includes("Unique")) continue;
        throw e;
      }
    }
    if (!created) throw new Error(`ساخت حساب ${def.username} پس از چند تلاش ناموفق بود`);
  }

  // اتصال نقش (در صورت نبود)
  const user = await db.user.findFirstOrThrow({ where: { username: def.username }, select: { id: true } });
  const hasRole = await db.userRole.findFirst({ where: { userId: user.id, roleId } });
  if (!hasRole) {
    await db.userRole.create({ data: { userId: user.id, roleId, startDate: new Date() } });
    console.log(`    ↳ نقش «${def.roleTitle}» متصل شد`);
  }
}

async function main() {
  console.log("ایجاد/به‌روزرسانی حساب‌های مدیریتی…");
  for (let i = 0; i < ACCOUNTS.length; i++) {
    await ensureAccount(ACCOUNTS[i], i);
  }
  console.log("");
  console.log("═══════════════════════════════════════════");
  console.log(`  حساب‌های ورود (رمز همه: ${DEFAULT_PASSWORD}):`);
  console.log("    admin       → مدیر سامانه");
  console.log("    manager     → مدیر کلینیک");
  console.log("    consultant  → مشاور");
  console.log("  ⚠ پس از اولین ورود، رمز عبور را تغییر دهید.");
  console.log("═══════════════════════════════════════════");
}

main()
  .catch((e) => {
    console.error("✘ خطا در ایجاد حساب‌ها:", e?.message ?? e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
