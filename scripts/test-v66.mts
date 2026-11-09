// تست دود نسخهٔ ۶.۶ — ادمینِ بدون نقش (نام‌خانوادگی «مدیر سامانه») باید دسترسی کامل داشته باشد
import { PrismaClient } from "@prisma/client";
import { scryptSync, randomBytes, createHash } from "crypto";

// ⚠️ این اسکریپت همهٔ کاربران را پاک می‌کند — فقط برای پایگاه آزمایشی
if (process.env.RZ_ALLOW_WIPE !== "yes") {
  console.error("این اسکریپت فقط برای پایگاه آزمایشی است. با RZ_ALLOW_WIPE=yes اجرا کنید.");
  process.exit(1);
}

const db = new PrismaClient();
function hashPassword(p: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(p, salt, 32).toString("hex")}`;
}

async function main() {
  await db.session.deleteMany();
  await db.userRole.deleteMany();
  await db.role.deleteMany();
  await db.user.deleteMany();

  // ادمین بدون هیچ رکورد نقش — دقیقاً مثل حساب کاربر واقعی
  const admin = await db.user.create({
    data: {
      nid: 1234567890n, username: "masa", passwordHash: hashPassword("admin123"),
      name: "مسا", family: "مدیر سامانه", mobile: 9120000000n,
    },
  });
  // یک مشاور عادی برای کنترل منفی
  await db.user.create({
    data: {
      nid: 9876543210n, username: "couns1", passwordHash: hashPassword("couns123"),
      name: "سارا", family: "محمدی", mobile: 9130000000n,
    },
  });

  const token = createHash("sha256").update(`rz:${admin.id}:${Date.now()}:test`).digest("hex");
  await db.session.create({ data: { userId: admin.id, token, ip: "-", browser: "test" } });
  console.log("ADMIN_TOKEN=" + token);

  const couns = await db.user.findUnique({ where: { username: "couns1" } });
  const ctoken = createHash("sha256").update(`rz:${couns!.id}:${Date.now()}:test`).digest("hex");
  await db.session.create({ data: { userId: couns!.id, token: ctoken, ip: "-", browser: "test" } });
  console.log("COUNS_TOKEN=" + ctoken);
}
main().finally(() => db.$disconnect());
