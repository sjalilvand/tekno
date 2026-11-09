// تست دود نسخهٔ ۶.۹ — اسکوپ دادهٔ BI: هر مشاور فقط جلسات خودش را می‌بیند
//  • مشاور A با نقش «مشاور» → فقط جلساتِ پذیرفته/ناظر خودش
//  • ادمین بدون نقش (masa) → همهٔ داده
//  • روتی‌ها: /api/bi — /api/bi/insights — /api/bi/coverage — /api/bi/csv
import { PrismaClient } from "@prisma/client";
import { scryptSync, randomBytes, createHash } from "crypto";

// ⚠️ این اسکریپت همهٔ کاربران را پاک می‌کند — فقط برای پایگاه آزمایشی
if (process.env.RZ_ALLOW_WIPE !== "yes") {
  console.error("این اسکریپت فقط برای پایگاه آزمایشی است. با RZ_ALLOW_WIPE=yes اجرا کنید.");
  process.exit(1);
}

const db = new PrismaClient();
const BASE = process.env.RZ_BASE ?? "http://127.0.0.1:3210";
function hashPassword(p: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(p, salt, 32).toString("hex")}`;
}

let pass = 0, failCnt = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { failCnt++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

async function get(path: string, token: string) {
  const res = await fetch(`${BASE}${path}`, { headers: { cookie: `rz_session=${token}` } });
  let body: any = null;
  try { body = await res.json(); } catch { /* ignore */ }
  return { status: res.status, body };
}

async function main() {
  console.log("── ۱) آماده‌سازی دادهٔ آزمایشی");
  await db.session.deleteMany();
  await db.eventReserve.deleteMany();
  await db.event.deleteMany();
  await db.center.deleteMany();
  await db.service.deleteMany();
  await db.city.deleteMany();
  await db.province.deleteMany();
  await db.userRole.deleteMany();
  await db.role.deleteMany();
  await db.user.deleteMany();

  const prov = await db.province.create({ data: { id: 1, title: "تهران" } });
  const city = await db.city.create({ data: { id: 1, provinceId: prov.id, title: "تهران" } });
  const center = await db.center.create({ data: { id: 1, title: "مرکز تست", isEnabled: true, cityId: city.id, cityTitle: "تهران", provinceId: prov.id, provinceTitle: "تهران" } });
  const service = await db.service.create({ data: { id: 1, name: "مشاوره فردی", short: "فردی", sohaId: 1, weight: 1 } });

  // ادمین بدون هیچ رکورد نقش — دقیقاً مثل حساب کاربر واقعی
  const admin = await db.user.create({
    data: { nid: 1234567890n, username: "masa", passwordHash: hashPassword("admin123"), name: "مسا", family: "مدیر سامانه", mobile: 9120000000n },
  });

  // نقش مشاور — بدون دسترسی scope:all
  const counsRole = await db.role.create({ data: { id: 1, codeName: "counselor", title: "مشاور", permissions: null } });
  const mkCouns = (nid: bigint, username: string, name: string, family: string, mobile: bigint) =>
    db.user.create({ data: { nid, username, passwordHash: hashPassword("c12345"), name, family, mobile, roles: { create: { roleId: counsRole.id } } } });
  const counsA = await mkCouns(9876543210n, "couns1", "سارا", "محمدی", 9130000000n);
  const counsB = await mkCouns(9876543211n, "couns2", "رضا", "کریمی", 9130000001n);

  // سه مراجع
  const client1 = await db.user.create({ data: { nid: 5289710752n, username: "app1", passwordHash: hashPassword("app123"), name: "حمیرا", family: "بداق", mobile: 9166603729n } });
  const client2 = await db.user.create({ data: { nid: 1111111111n, username: "app2", passwordHash: hashPassword("app123"), name: "علی", family: "رضایی", mobile: 9166603730n } });
  const client3 = await db.user.create({ data: { nid: 2222222222n, username: "app3", passwordHash: hashPassword("app123"), name: "مریم", family: "احمدی", mobile: 9166603731n } });

  const now = new Date();
  const mkEvent = (client: { id: number; nid: bigint }, acceptorId: number | null, fee: number) =>
    db.event.create({
      data: {
        userId: client.id, nid: client.nid, centerId: center.id, serviceId: service.id,
        status: "در انتظار تایید", startDate: now, acceptorId, acceptorFee: fee, userTariff: fee,
      },
    });

  // مشاور A: ۳ جلسه (حق‌الزحمه ۱۰۰۰) — مشاور B: ۲ جلسه (حق‌الزحمه ۵۰۰) — ۱ جلسه بدون پذیرنده
  const aEvents = await Promise.all([client1, client2, client3].map((c) => mkEvent(c, counsA.id, 1000)));
  const bEvents = await Promise.all([client1, client2].map((c) => mkEvent(c, counsB.id, 500)));
  await mkEvent(client3, null, 0);

  // مورد حاد برای هر مشاور — برای تست اسکوپ نمودارهای EMS
  await db.eventsEms.create({ data: { eventId: aEvents[0].id, severity: "بالا", hadPaymentStatus: "در انتظار بررسی" } });
  await db.eventsEms.create({ data: { eventId: bEvents[0].id, severity: "کم", hadPaymentStatus: "تایید شده" } });

  await db.eventReserve.create({ data: { eventId: aEvents[0].id, userId: client1.id, acceptorId: counsA.id, date: now } });
  await db.eventReserve.create({ data: { eventId: bEvents[0].id, userId: client1.id, acceptorId: counsB.id, date: now } });

  const mkSession = (userId: number) => {
    const t = createHash("sha256").update(`rz:${userId}:${Date.now()}:${Math.random()}`).digest("hex");
    return db.session.create({ data: { userId, token: t, ip: "-", browser: "test" } }).then(() => t);
  };
  const adminT = await mkSession(admin.id);
  const aT = await mkSession(counsA.id);
  const bT = await mkSession(counsB.id);

  const fa = (v: number) => v.toLocaleString("fa-IR");
  console.log("── ۲) داشبورد توصیفی /api/bi");
  const biA = await get("/api/bi", aT);
  check("پاسخ ۲۰۰ برای مشاور", biA.status === 200, `status=${biA.status}`);
  const evA = biA.body?.kpis?.find((k: any) => k.key === "events");
  check("مشاور فقط ۳ جلسهٔ خودش را می‌بیند (نبود: ۶)", evA?.value === fa(3), `value=${evA?.value}`);
  check("پرچم اسکوپ فعال", biA.body?.scoped === true);
  const feeA = biA.body?.kpis?.find((k: any) => k.key === "fee");
  check("حق‌الزحمهٔ مشاور فقط مال خودش (۳۰۰۰ نه ۵۰۰۰)", feeA?.value === fa(3000), `value=${feeA?.value}`);
  const chartIdsA = (biA.body?.charts ?? []).map((c: any) => c.id);
  check("نمودار سیستمی «رشد ثبت‌نام کاربران» حذف", !chartIdsA.includes("users_trend"));
  check("نمودار سیستمی «مشاوران پرکار» حذف", !chartIdsA.includes("ev_advisers"));
  check("نمودار سیستمی «پیامک‌ها» حذف", !chartIdsA.includes("sms_status"));
  const emsSevA = (biA.body?.charts ?? []).find((c: any) => c.id === "ems_severity");
  check("نمودار موارد حاد مشاور فقط کیس خودش (۱ نه ۲)", JSON.stringify(emsSevA?.values) === JSON.stringify([1]), `values=${JSON.stringify(emsSevA?.values)}`);
  check("جدول بودجه برای مشاور خالی", (biA.body?.budgetTable?.rows ?? []).length === 0);

  const biAdmin = await get("/api/bi", adminT);
  const evAdmin = biAdmin.body?.kpis?.find((k: any) => k.key === "events");
  check("ادمین هر ۶ جلسه را می‌بیند", evAdmin?.value === fa(6), `value=${evAdmin?.value}`);
  check("پرچم اسکوپ برای ادمین خاموش", !biAdmin.body?.scoped);
  const chartIdsAdmin = (biAdmin.body?.charts ?? []).map((c: any) => c.id);
  check("نمودار «مشاوران پرکار» برای ادمین هست", chartIdsAdmin.includes("ev_advisers"));
  const emsSevAdmin = (biAdmin.body?.charts ?? []).find((c: any) => c.id === "ems_severity");
  check("نمودار موارد حاد ادمین هر ۲ کیس", JSON.stringify(emsSevAdmin?.values) === JSON.stringify([1, 1]), `values=${JSON.stringify(emsSevAdmin?.values)}`);

  console.log("── ۳) موتور تحلیل /api/bi/insights");
  const insA = await get("/api/bi/insights", aT);
  check("پاسخ ۲۰۰ برای مشاور", insA.status === 200, `status=${insA.status}`);
  check("جلسات بازهٔ مشاور ۳ است", insA.body?.kpis?.events365 === 3, `=${insA.body?.kpis?.events365}`);
  check("مراجعان یکتای مشاور ۳ است", insA.body?.kpis?.usersTotal === 3, `=${insA.body?.kpis?.usersTotal}`);
  check("پرچم اسکوپ فعال", insA.body?.scoped === true);
  const insB = await get("/api/bi/insights", bT);
  check("مشاور B فقط ۲ جلسهٔ خودش را می‌بیند", insB.body?.kpis?.events365 === 2, `=${insB.body?.kpis?.events365}`);
  const insAdmin = await get("/api/bi/insights", adminT);
  check("ادمین همه را می‌بیند (۶)", insAdmin.body?.kpis?.events365 === 6, `=${insAdmin.body?.kpis?.events365}`);

  console.log("── ۴) پوشش داده /api/bi/coverage");
  const covA = await get("/api/bi/coverage", aT);
  const srcA = (covA.body?.sources ?? []).find((s: any) => s.key === "events");
  check("پوشش جلسات مشاور = ۳", srcA?.count === 3, `=${srcA?.count}`);
  const covAdmin = await get("/api/bi/coverage", adminT);
  const srcAdmin = (covAdmin.body?.sources ?? []).find((s: any) => s.key === "events");
  check("پوشش جلسات ادمین = ۶", srcAdmin?.count === 6, `=${srcAdmin?.count}`);

  console.log("── ۵) خروجی CSV /api/bi/csv");
  const csvA = await fetch(`${BASE}/api/bi/csv?chart=ev_service`, { headers: { cookie: `rz_session=${aT}` } });
  check("CSV مشاور ۲۰۰", csvA.status === 200, `status=${csvA.status}`);

  console.log(`\nنتیجه: ${pass} موفق / ${failCnt} ناموفق`);
  if (failCnt > 0) process.exit(1);
}
main().finally(() => db.$disconnect());
