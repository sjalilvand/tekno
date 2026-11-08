// دادهٔ آزمایشی برای نمایش داشبوردها — فقط محیط توسعه سندباکس
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const existing = await db.event.count();
  if (existing > 0) {
    console.log("داده از قبل موجود است — رد شد");
    return;
  }

  // خدمات
  const serviceDefs = [
    { name: "روان‌درمانی فردی", short: "فردی" },
    { name: "زوج‌درمانی", short: "زوج" },
    { name: "مشاوره کودک", short: "کودک" },
    { name: "مشاوره خانواده", short: "خانواده" },
    { name: "نوروفیدبک", short: "نورو" },
  ];
  const services = [];
  for (let i = 0; i < serviceDefs.length; i++) {
    const s = await db.service.upsert({
      where: { id: i + 1 },
      update: {},
      create: { id: i + 1, sohaId: i + 1, ...serviceDefs[i] },
    });
    services.push(s);
  }

  // مراکز
  const centers = [];
  const centerDefs = [
    { title: "مرکز رز — شعبه مرکزی", provinceTitle: "تهران", cityTitle: "تهران" },
    { title: "مرکز رز — شعبه غرب", provinceTitle: "تهران", cityTitle: "تهران" },
    { title: "کلینیک رز کرج", provinceTitle: "البرز", cityTitle: "کرج" },
  ];
  await db.province.upsert({ where: { id: 1 }, update: {}, create: { id: 1, title: "تهران" } });
  await db.city.upsert({ where: { id: 1 }, update: {}, create: { id: 1, title: "تهران", provinceId: 1 } });
  for (let i = 0; i < centerDefs.length; i++) {
    const c = await db.center.upsert({
      where: { id: i + 1 },
      update: {},
      create: { id: i + 1, cityId: 1, provinceId: 1, ...centerDefs[i], isEnabled: true },
    });
    centers.push(c);
  }

  // کاربران مراجع
  const clients = [];
  for (let i = 0; i < 12; i++) {
    const u = await db.user.upsert({
      where: { id: 100 + i },
      update: {},
      create: {
        id: 100 + i,
        nid: BigInt(1000000000 + i),
        username: `client${i + 1}`,
        passwordHash: "x:y",
        name: `مراجع${i + 1}`,
        family: "نمونه",
        mobile: BigInt(9120000000 + i),
        gender: i % 2 ? "زن" : "مرد",
        signupDate: new Date(Date.now() - Math.random() * 300 * 86400000),
        confirm: 1,
      },
    });
    clients.push(u);
  }

  const statuses = ["تایید نهایی", "تایید نهایی", "تایید نهایی", "در انتظار تایید مدیر مرکز", "ناتمام", "رد شده"];
  let created = 0;
  const now = Date.now();
  for (let d = 0; d < 120; d++) {
    const dayCount = Math.floor(Math.random() * 4);
    for (let j = 0; j < dayCount; j++) {
      const dt = new Date(now - d * 86400000);
      dt.setHours(9 + Math.floor(Math.random() * 11), [0, 30][Math.floor(Math.random() * 2)], 0, 0);
      const svc = services[Math.floor(Math.random() * services.length)];
      const ctr = centers[Math.floor(Math.random() * centers.length)];
      const cl = clients[Math.floor(Math.random() * clients.length)];
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      await db.event.create({
        data: {
          userId: cl.id,
          nid: cl.nid,
          centerId: ctr.id,
          serviceId: svc.id,
          status,
          topic: ["اضطراب", "افسردگی", "زوج‌درمانی", "مشکل تحصیلی", "خواب"][Math.floor(Math.random() * 5)],
          startDate: dt,
          endDate: new Date(dt.getTime() + 3600000),
          userTariff: [450000, 600000, 800000, 1000000][Math.floor(Math.random() * 4)],
          acceptorFee: 300000,
          centerFee: 150000,
          adminFee: 50000,
          supervisorFee: 30000,
          isEms: Math.random() < 0.05,
        },
      });
      created++;
    }
  }

  // رزروهای آینده
  for (let i = 0; i < 5; i++) {
    const ev = await db.event.create({
      data: {
        userId: clients[i].id,
        nid: clients[i].nid,
        centerId: centers[0].id,
        serviceId: services[0].id,
        status: "در انتظار پذیرش",
        topic: "رزرو آزمایشی",
        startDate: new Date(now + (i + 1) * 2 * 86400000),
        userTariff: 600000,
      },
    });
    await db.eventReserve.create({
      data: { eventId: ev.id, userId: clients[i].id, acceptorId: 1, date: new Date(now + (i + 1) * 2 * 86400000) },
    });
  }

  // پیامک‌ها
  for (let i = 0; i < 8; i++) {
    await db.sms.create({
      data: {
        senderId: 1,
        receiverId: clients[i].id,
        number: clients[i].mobile,
        message: "یادآوری جلسه فردا",
        status: i < 6 ? "ارسال شده" : i === 6 ? "ناموفق" : "در صف",
        createTime: new Date(now - i * 86400000),
        updateTime: new Date(now - i * 86400000),
      },
    });
  }

  console.log(`ساخته شد: ${created} جلسه + ۵ رزرو + ۸ پیامک`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
