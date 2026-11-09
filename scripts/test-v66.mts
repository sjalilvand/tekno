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
  await db.event.deleteMany();
  await db.center.deleteMany();
  await db.service.deleteMany();
  await db.city.deleteMany();
  await db.province.deleteMany();
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
  const couns = await db.user.create({
    data: {
      nid: 9876543210n, username: "couns1", passwordHash: hashPassword("couns123"),
      name: "سارا", family: "محمدی", mobile: 9130000000n,
    },
  });

  // متقاضی واقعی + یک جلسه به‌عنوان مراجع (برای تست فهرست کارتابل ۶.۸)
  const prov = await db.province.create({ data: { id: 1, title: "تهران" } });
  const city = await db.city.create({ data: { id: 1, provinceId: prov.id, title: "تهران" } });
  const center = await db.center.create({ data: { id: 1, title: "مرکز تست", isEnabled: true, cityId: city.id, cityTitle: "تهران", provinceId: prov.id, provinceTitle: "تهران" } });
  const service = await db.service.create({ data: { id: 1, name: "مشاوره فردی", short: "فردی", sohaId: 1, weight: 1 } });
  const applicant = await db.user.create({
    data: {
      nid: 5289710752n, username: "app1", passwordHash: hashPassword("app123"),
      name: "حمیرا", family: "بداق", mobile: 9166603729n,
    },
  });
  await db.event.create({
    data: { userId: applicant.id, nid: applicant.nid, centerId: center.id, serviceId: service.id, status: "در انتظار تایید", startDate: new Date() },
  });

  const token = createHash("sha256").update(`rz:${admin.id}:${Date.now()}:test`).digest("hex");
  await db.session.create({ data: { userId: admin.id, token, ip: "-", browser: "test" } });
  console.log("ADMIN_TOKEN=" + token);

  const couns2 = await db.user.findUnique({ where: { username: "couns1" } });
  const ctoken = createHash("sha256").update(`rz:${couns2!.id}:${Date.now()}:test`).digest("hex");
  await db.session.create({ data: { userId: couns2!.id, token: ctoken, ip: "-", browser: "test" } });
  console.log("COUNS_TOKEN=" + ctoken);
}
main().finally(() => db.$disconnect());
