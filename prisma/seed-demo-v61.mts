// =====================================================================
//  دادهٔ نمایشی نسخهٔ ۶.۱ — کارتابل/شبیه‌سازی/مانیتورینگ/چت/تیک هوشمند
//  Idempotent (upsert) — برای محیط دمو/توسعه؛ در تولید اجرا نشود.
//  اجرا:  npx tsx prisma/seed-demo-v61.mts
// =====================================================================
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

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
const DAY = 86400000;
const ago = (d: number) => new Date(Date.now() - d * DAY);
const plus = (base: Date, hours: number) => new Date(base.getTime() + hours * 3600000);

async function main() {
  console.log("— دادهٔ نمایشی ۶.۱ —");
  // جغرافیا
  await db.province.upsert({ where: { id: 1 }, update: {}, create: { id: 1, title: "تهران" } });
  await db.city.upsert({ where: { id: 1 }, update: {}, create: { id: 1, provinceId: 1, title: "تهران" } });

  // مرکز
  await db.center.upsert({
    where: { id: 1 }, update: {},
    create: {
      id: 1, title: "مرکز مشاوره رز — شعبهٔ مرکزی", isEnabled: true,
      address: "تهران، خیابان ولیعصر", tel: "02100000000",
      cityId: 1, cityTitle: "تهران", provinceId: 1, provinceTitle: "تهران",
    },
  });

  // مشاور + متقاضیان
  const consultant = await db.user.upsert({
    where: { username: "rezaei" }, update: {},
    create: {
      username: "rezaei", passwordHash: "x", name: "رضا", family: "رضایی",
      nid: BigInt("0012987654"), mobile: BigInt("09121112233"), gender: "مرد",
      provinceId: 1, consultantLevel: 2, signupDate: ago(400),
    },
  });
  const client1 = await db.user.upsert({
    where: { username: "maryam.ahmadi" }, update: {},
    create: {
      username: "maryam.ahmadi", passwordHash: "x", name: "مریم", family: "احمدی",
      nid: BigInt("0012345678"), mobile: BigInt("09123334455"), gender: "زن",
      educationId: null, provinceId: 1, signupDate: ago(200),
    },
  });
  const client2 = await db.user.upsert({
    where: { username: "ali.karimi" }, update: {},
    create: {
      username: "ali.karimi", passwordHash: "x", name: "علی", family: "کریمی",
      nid: BigInt("0019876543"), mobile: BigInt("09355556677"), gender: "مرد",
      provinceId: 1, signupDate: ago(90),
    },
  });

  // نقش مشاور برای مشاور
  const consultRole = await db.role.findFirst({ where: { OR: [{ title: "مشاور" }, { codeName: { contains: "consult" } }] } });
  if (consultRole) {
    await db.userRole.upsert({
      where: { id: 900001 }, update: {},
      create: { id: 900001, userId: consultant.id, roleId: consultRole.id, level: 2 },
    });
  }

  let service = await db.service.findFirst();
  if (!service) {
    service = await db.service.upsert({
      where: { id: 1 }, update: {},
      create: { id: 1, name: "مشاوره فردی", short: "فردی", sohaId: 1 },
    });
  }
  if (!service) throw new Error("خدمتی یافت نشد — seed اصلی اجرا شود");

  // ---------- جلسهٔ ۱: تایید نهایی کامل (۴۰ روز پیش) ----------
  const s1 = ago(40);
  await db.event.upsert({
    where: { id: 901 }, update: {},
    create: {
      id: 901, userId: client1.id, nid: client1.nid, trackingCode: 1001,
      centerId: 1, serviceId: service.id, level: 2, userTariff: 500000,
      acceptorId: consultant.id, acceptorFee: 300000, centerFee: 100000,
      startDate: s1, endDate: plus(s1, 2),
      centerAdminConfirmDateTime: plus(s1, 20), centerTechConfirmDateTime: plus(s1, 30),
      operatorConfirmDateTime: plus(s1, 70), provinceSupervisorConfirmDateTime: plus(s1, 90),
      supervisorConfirmDateTime: plus(s1, 110),
      status: "تایید نهایی", topic: "اضطراب عمومی", description: "جلسهٔ ششم درمان شناختی-رفتاری",
    },
  });
  await db.eventReserve.upsert({
    where: { id: 901 }, update: {},
    create: { id: 901, eventId: 901, userId: client1.id, acceptorId: consultant.id, date: ago(45) },
  });
  await db.eventPsychology.upsert({
    where: { id: 901 }, update: {},
    create: {
      id: 901, eventId: 901, userId: client1.id, acceptorId: consultant.id,
      job: "کارمند", children: 1, mood: "کم‌انگیزه", clinicalObservation: "نشانه‌های اضطراب متوسط",
      problemStart: "حدود یک سال پیش", problemDuration: "۱۰ ماه",
    },
  });
  await db.eventComment.create({
    data: { eventId: 901, consultantNID: consultant.nid, comment: "روند درمان مناسب است؛ تمرین‌های خانگی انجام می‌شود.", dateTime: ago(39) },
  });

  // ---------- جلسهٔ ۲: معلق در ناظر استان (۲۰ روز خارج از مهلت) ----------
  const s2 = ago(30);
  await db.event.upsert({
    where: { id: 902 }, update: {},
    create: {
      id: 902, userId: client1.id, nid: client1.nid, trackingCode: 1002,
      centerId: 1, serviceId: service.id, level: 2, userTariff: 600000,
      acceptorId: consultant.id,
      startDate: s2, endDate: plus(s2, 2),
      centerAdminConfirmDateTime: plus(s2, 18), centerTechConfirmDateTime: plus(s2, 26),
      operatorConfirmDateTime: plus(s2, 50),
      status: "در انتظار تایید ناظر استان", topic: "مشاوره زوج‌درمانی",
    },
  });

  // ---------- جلسهٔ ۳: در انتظار پذیرش (۵ روز — خارج از مهلت) ----------
  const s3 = ago(5);
  await db.event.upsert({
    where: { id: 903 }, update: {},
    create: {
      id: 903, userId: client2.id, nid: client2.nid, trackingCode: 1003,
      centerId: 1, serviceId: service.id, level: 1, userTariff: 400000,
      acceptorId: consultant.id,
      startDate: s3, endDate: null,
      status: "در انتظار پذیرش", topic: "مشاوره فردی — استرس شغلی",
    },
  });
  await db.eventReserve.upsert({
    where: { id: 903 }, update: {},
    create: { id: 903, eventId: 903, userId: client2.id, acceptorId: consultant.id, date: ago(6) },
  });
  await db.eventPsychology.upsert({
    where: { id: 903 }, update: {},
    create: { id: 903, eventId: 903, mood: "نگران", clinicalObservation: "تنش شغلی", problemDuration: "۳ ماه" },
  });

  // ---------- جلسهٔ ۴: رد شده ----------
  const s4 = ago(10);
  await db.event.upsert({
    where: { id: 904 }, update: {},
    create: {
      id: 904, userId: client2.id, nid: client2.nid, trackingCode: 1004,
      centerId: 1, serviceId: service.id, level: 1, userTariff: 350000,
      startDate: s4, endDate: plus(s4, 1), rejectedAt: ago(9),
      rejectedComment: "خدمت با قرارداد سازمانی ناهمخوان بود",
      status: "رد شده", topic: "مشاوره خانواده",
    },
  });

  // ---------- جلسهٔ ۵: مورد حاد شدت بالا + کمک مالی معلق ----------
  const s5 = ago(3);
  await db.event.upsert({
    where: { id: 905 }, update: {},
    create: {
      id: 905, userId: client1.id, nid: client1.nid, trackingCode: 1005,
      centerId: 1, serviceId: service.id, level: 2, userTariff: 700000,
      acceptorId: consultant.id, isEms: true,
      startDate: s5, endDate: plus(s5, 2),
      status: "در انتظار تایید مدیر مرکز", topic: "بحران حاد — خودزنی", description: "مورد حاد نیازمند مداخلهٔ فوری",
    },
  });
  await db.eventsEms.create({
    data: {
      eventId: 905, severity: "بالا", emsType: "[\"خودزنی\"]",
      suggestedActions: "[\"مداخله فوری\",\"پیگیری روان‌پزشک\"]",
      actionsTaken: "تماس فوری با خانواده و ارجاع به روان‌پزشک",
      financialAssistanceRequest: 1, hadPaymentAmount: BigInt(2000000),
      hadPaymentStatus: "در انتظار بررسی", hadPaymentDescription: "درخواست کمک هزینهٔ درمان",
      dateTime: ago(3),
    },
  });

  // یک مورد حاد قدیمی (۶۰ روز پیش) — برای پیگیری
  await db.eventsEms.create({
    data: {
      eventId: 901, severity: "بالا", emsType: "[\"خودکشی\"]",
      actionsTaken: "بستری موقت و مراقبت خانوادگی",
      financialAssistanceRequest: 1, hadPaymentAmount: BigInt(1500000),
      hadPaymentStatus: "پرداخت شده", dateTime: ago(60),
    },
  });

  // ---------- سند ----------
  await db.file.create({
    data: { userNID: client1.nid, name: "کارت ملی — مریم احمدی.jpg", location: "/uploads/scan.jpg", uploadDateTime: ago(35) },
  });

  const counts = await Promise.all([
    db.user.count(), db.event.count(), db.eventsEms.count(), db.eventPsychology.count(),
    db.eventReserve.count(), db.center.count(),
  ]);
  console.log("✓ آماده شد:", { users: counts[0], events: counts[1], ems: counts[2], psy: counts[3], reserves: counts[4], centers: counts[5] });
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
