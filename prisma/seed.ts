// =====================================================================
//  Seed داده اولیه — بر اساس ساختار واقعی سامانه «راه زندگی»
//  اجرا: bun prisma/seed.ts
// =====================================================================
import { PrismaClient } from "@prisma/client";
import { scryptSync, randomBytes } from "crypto";

const db = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

const rnd = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// ---------- استان‌ها و شهرهای واقعی ----------
const PROVINCES = [
  "آذربایجان شرقی", "آذربایجان غربی", "اردبیل", "اصفهان", "البرز", "ایلام", "بوشهر",
  "تهران", "چهارمحال و بختیاری", "خراسان جنوبی", "خراسان رضوی", "خراسان شمالی",
  "خوزستان", "زنجان", "سمنان", "سیستان و بلوچستان", "فارس", "قزوین", "قم",
  "کردستان", "کرمان", "کرمانشاه", "کهگیلویه و بویراحمد", "گلستان", "گیلان",
  "لرستان", "مازندران", "مرکزی", "هرمزگان", "همدان", "یزد",
];
const PROV_CITIES: Record<string, string[]> = {
  "تهران": ["تهران", "اسلامشهر", "شهریار", "پاکدشت", "لواسان", "ورامین"],
  "اصفهان": ["اصفهان", "کاشان", "نجف‌آباد", "خمینی‌شهر", "زرندیه", "مامونیه"],
  "فارس": ["شیراز", "مرودشت", "جهرم", "لالی", "اقلید"],
  "خراسان رضوی": ["مشهد", "نیشابور", "تربت حیدریه", "سبزوار"],
  "خوزستان": ["اهواز", "آبادان", "دزفول", "بهبهان"],
  "هرمزگان": ["بندرعباس", "رودان", "میناب", "قشم"],
  "مازندران": ["ساری", "آمل", "بابل", "تنکابن"],
  "آذربایجان شرقی": ["تبریز", "مراغه", "مرند", "اهر"],
  "گیلان": ["رشت", "انزلی", "لاهیجان", "رودسر"],
  "کرمان": ["کرمان", "رفسنجان", "سیرجان", "جیرفت"],
  "بوشهر": ["بوشهر", "آب پخش", "برازجان", "گناوه"],
  "البرز": ["کرج", "هشتگرد", "نظرآباد"],
};

const FIRST_M = ["علی", "محمد", "رضا", "حسین", "امیر", "مهدی", "سعید", "فرشاد", "کریم", "بهنام", "آرش", "نوید", "سامان", "یاسر", "بهزاد"];
const FIRST_F = ["زهرا", "فاطمه", "مریم", "سارا", "نرگس", "الهام", "سمیه", "اسما", "شادی", "مینا", "لیلا", "نگار", "هانیه", "پریسا", "شیما"];
const FAMILY = ["احمدی", "محمدی", "حسینی", "زارعی جغین", "سعیدی", "کریمی", "موسوی", "رضایی", "حسین‌زاده", "زیبای شیرازی", "اکثیری", "یزدان‌پناه", "رامشگر", "سالاری", "نوروزی", "قاسمی", "شریفی", "علی‌پور", "صادقی", "مرادی", "جعفری", "نیک‌پور", "فتحی", "طاهری"];

const ROLE_DEFS = [
  "مدیر سیستم", "مدیر کل", "مدیر استان", "مدیر کلینیک",
  "مسئول فنی", "نظارت حرفه‌ای", "ناظر استان", "ناظر کشور",
  "مشاور", "روانپزشک", "دبیر", "کارشناس", "مراجع", "معرف اداری",
];

const SERVICES: [string, string, number][] = [
  ["مشاوره فردی (حضوری)", "فردی حضوری", 1],
  ["مشاوره فردی (تلفنی)", "فردی تلفنی", 0.8],
  ["مشاوره فردی (آنلاین)", "فردی آنلاین", 0.8],
  ["مشاوره گروهی", "گروهی", 0.5],
  ["مشاوره شغلی", "شغلی", 1],
  ["روان‌درمانی", "روان‌درمانی", 1.2],
  ["نوروفیدبک", "نوروفیدبک", 1.5],
  ["نقشه مغزی (QEEG)", "نقشه مغزی", 1.5],
  ["روانپزشکی و دارودرمانی", "روانپزشکی", 1.3],
  ["ارزیابی روانشناسی کودک", "کودک", 1.1],
  ["آزمون‌های روانشناسی", "آزمون", 0.6],
  ["مشاوره ازدواج", "ازدواج", 1],
  ["مداخله در بحران", "بحران", 1.4],
  ["مشاوره خانواده", "خانواده", 1],
  ["مایندفولنس و مدیتیشن", "مایندفولنس", 0.7],
];

const TOPICS = ["مشاوره ازدواج", "تعارض خانوادگی", "اضطراب و استرس", "افسردگی", "مشکلات تحصیلی", "مشاوره شغلی", "طلاق عاطفی", "فرزندپروری", "اختلال خواب", "وسواس", "بحران نوجوانی", "مشاوره فردی"];
const OCCASIONS = ["هفته سلامت روان", "روز جهانی مبارزه با افسردگی", "هفته مشاوره", "روز جهانی خودکشی‌شناسی"];
const SETTING_DEFS: [string, string, string][] = [
  ["site_title", "سامانه مراکز خدمات روانشناسی و مشاوره راه زندگی", "عمومی"],
  ["version", "5.0.0", "عمومی"],
  ["sms_number_ems", "1000606", "پیامک"],
  ["sms_provider", "کاوه‌نگار", "پیامک"],
  ["individual_session_confirm", "true", "جلسات فردی"],
  ["individual_auto_confirm", "false", "جلسات فردی"],
  ["group_session_confirm", "true", "جلسات گروهی"],
  ["career_session_confirm", "false", "جلسات شغلی"],
  ["ems_auto_sms", "true", "موارد حاد"],
  ["ems_payment_enabled", "true", "موارد حاد"],
  ["province_detail_codes", "فعال", "استان‌ها"],
  ["backup_schedule", "روزانه - ساعت ۲:۰۰", "پشتیبان‌گیری"],
  ["session_confirm_stats", "فعال", "تایید جلسات"],
  ["access_date_overlap_check", "true", "دسترسی‌ها"],
];

let nidSeed = 1200000000;
const nextNid = () => ++nidSeed;
let mobileSeed = 9120000000;
const nextMobile = () => ++mobileSeed;

async function main() {
  console.log("🌱 شروع Seed...");

  // ---------- لیست‌های پایه ----------
  const provinces: Record<string, number> = {};
  let cityRows: { id: number; provinceId: number; title: string; apiCode: number }[] = [];
  let pid = 1, cid = 1;
  for (const p of PROVINCES) {
    provinces[p] = pid;
    const cities = PROV_CITIES[p] ?? [p];
    for (const c of cities) {
      cityRows.push({ id: cid++, provinceId: pid, title: c, apiCode: rnd(100000, 999999) });
    }
    pid++;
  }
  await db.province.createMany({ data: PROVINCES.map((p, i) => ({ id: i + 1, title: p, apiCode: i + 101, detailCode: rnd(1, 99) })) });
  await db.city.createMany({ data: cityRows });
  console.log("✓ استان‌ها و شهرها");

  const eduDefs = ["بی سواد", "زیر دیپلم", "دیپلم", "کاردانی", "لیسانس", "فوق لیسانس", "دکتری", "حوزه علمیه", "دانشجویان"];
  await db.education.createMany({ data: eduDefs.map((n, i) => ({ id: i + 1, name: n })) });
  const marDefs = ["مجرد", "متاهل", "مطلقه", "جدا شده", "همسر فوت شده", "نامشخص"];
  await db.marriage.createMany({ data: marDefs.map((n, i) => ({ id: i + 1, name: n })) });
  await db.religion.createMany({ data: ["اسلام", "مسیحیت", "زرتشت", "کلیمی", "سایر", "نامشخص"].map((n, i) => ({ id: i + 1, name: n })) });

  // ---------- خدمات ----------
  await db.service.createMany({
    data: SERVICES.map((s, i) => ({ id: i + 1, name: s[0], short: s[1], sohaId: 100 + i, weight: s[2] })),
  });

  // ---------- نقش‌ها ----------
  await db.role.createMany({
    data: ROLE_DEFS.map((r, i) => ({ id: i + 1, title: r, codeName: `role_${i + 1}` })),
  });

  // ---------- دسته‌بندی مراکز ----------
  const cats = ["مستقر در اداره", "مستقل", "درمانگاه شبانه‌روزی", "موسسه خصوصی", "دانشگاه"];
  for (let i = 0; i < cats.length; i++) {
    await db.centerCategory.create({ data: { id: i + 1, title: cats[i] } });
  }

  // ---------- مراکز ----------
  const centerIds: number[] = [];
  let centerId = 1;
  const centerProvinces = ["تهران", "اصفهان", "فارس", "خراسان رضوی", "خوزستان", "هرمزگان", "مازندران", "آذربایجان شرقی", "گیلان", "کرمان", "بوشهر", "البرز"];
  for (const prov of centerProvinces) {
    const cities = PROV_CITIES[prov];
    const count = rnd(1, 3);
    for (let i = 0; i < count; i++) {
      const city = pick(cities);
      const name = city === "زرندیه" || city === "مامونیه" ? `(اداره ${city})` : `مرکز مشاوره راه زندگی ${city}`;
      await db.center.create({
        data: {
          id: centerId, title: name, isEnabled: Math.random() > 0.08,
          address: `${city}، خیابان ${pick(["ولیعصر", "آزادی", "انقلاب", "شریعتی", "معلم", "سجاد"])}، پلاک ${rnd(1, 120)}`,
          tel: `0${rnd(21, 79)}${rnd(1000000, 9999999)}`,
          catId: rnd(1, 5), cityId: cityRows.find((c) => c.title === city)!.id, cityTitle: city,
          provinceId: provinces[prov], provinceTitle: prov,
        },
      });
      centerIds.push(centerId);
      centerId++;
    }
  }
  console.log("✓ مراکز");

  // ---------- کاربران ----------
  const password = hashPassword("123456");
  const users: { id: number; name: string; family: string; nid: bigint; mobile: bigint; gender: string; provinceId: number; roleId: number; level?: number }[] = [];
  let uid = 1;

  const createUser = async (roleId: number, gender: string, provId: number, level?: number, fixedName?: [string, string]) => {
    const first = fixedName ? fixedName[0] : (gender === "مرد" ? pick(FIRST_M) : pick(FIRST_F));
    const fam = fixedName ? fixedName[1] : pick(FAMILY);
    const nid = BigInt(nextNid());
    const id = uid++;
    await db.user.create({
      data: {
        id, nid, username: String(nid), passwordHash: password,
        name: first, family: fam, father: pick(FIRST_M),
        gender, birthday: new Date(rnd(1340, 1385), rnd(0, 11), rnd(1, 28)),
        marriageId: rnd(1, 6), educationId: roleId >= 9 && roleId <= 12 ? rnd(5, 9) : rnd(3, 7),
        religion: "اسلام", mobile: BigInt(nextMobile()),
        provinceId: provId, cityId: cityRows.filter((c) => c.provinceId === provId)[0]?.id,
        signupDate: new Date(rnd(1402, 1405) - 621, rnd(0, 11), rnd(1, 28)),
        lastLogin: Math.random() > 0.2 ? new Date(2025, rnd(7, 10), rnd(1, 29), rnd(8, 20)) : null,
        blocked: Math.random() > 0.95, confirm: 1,
        avatarColor: pick(["teal", "rose", "amber", "violet", "cyan", "emerald", "orange"]),
        consultantLevel: roleId === 9 ? (level ?? rnd(1, 5)) : null,
        bio: roleId === 9 || roleId === 10 ? `مشاور با ${rnd(3, 15)} سال سابقه همکاری` : null,
      },
    });
    await db.userRole.create({
      data: { userId: id, roleId, level: level ?? 0, startDate: new Date(1403 - 621, rnd(0, 11), rnd(1, 28)), confirmDate: new Date() },
    });
    users.push({ id, name: first, family: fam, nid, mobile: BigInt(0), gender, provinceId: provId, roleId, level });
    if (roleId === 9 || roleId === 10) {
      await db.consultantEducation.create({
        data: { userId: id, consultantNID: nid, field: pick(["روانشناسی", "مشاوره خانواده", "روانشناسی بالینی", "مشاوره شغلی", "روانشناسی کودک"]), orientation: pick(["بالینی", "سلامت", "خانواده", "تحصیلی"]), grade: pick(["لیسانس", "فوق لیسانس", "دکتری"]), university: pick(["دانشگاه تهران", "دانشگاه شیراز", "دانشگاه علامه طباطبایی", "دانشگاه فردوسی مشهد", "دانشگاه اصفهان"]), graduationDate: String(rnd(1390, 1402)) },
      });
    }
    return id;
  };

  // مدیر سیستم و مدیر کل
  const adminId = await createUser(1, "مرد", 8, undefined, ["محمدعلی", "علیمرادی"]);
  await db.user.update({ where: { id: adminId }, data: { username: "admin" } });
  await createUser(2, "زن", 8, undefined, ["فاطمه", "رحیمی"]);
  // مدیران استان
  for (let i = 0; i < 6; i++) await createUser(3, pick(["مرد", "زن"]), rnd(1, 31));
  // مدیران کلینیک
  for (let i = 0; i < 12; i++) await createUser(4, pick(["مرد", "زن"]), rnd(1, 31));
  // مسئول فنی، نظارت حرفه‌ای، ناظر استان/کشور
  for (const r of [5, 6, 7, 8]) for (let i = 0; i < 3; i++) await createUser(r, pick(["مرد", "زن"]), rnd(1, 31));
  // مشاوران
  for (let i = 0; i < 28; i++) await createUser(9, pick(["مرد", "زن"]), rnd(1, 31));
  // روانپزشک‌ها
  for (let i = 0; i < 4; i++) await createUser(10, pick(["مرد", "زن"]), rnd(1, 31));
  // دبیرها، کارشناس‌ها، معرف اداری
  for (const r of [11, 12, 14]) for (let i = 0; i < 4; i++) await createUser(r, pick(["مرد", "زن"]), rnd(1, 31));
  // مراجعان
  for (let i = 0; i < 40; i++) await createUser(13, pick(["مرد", "زن"]), rnd(1, 31));

  const consultants = users.filter((u) => u.roleId === 9 || u.roleId === 10);
  const clients = users.filter((u) => u.roleId === 13);
  const centerAdmins = users.filter((u) => u.roleId === 4);
  const supervisors = users.filter((u) => [6, 7, 8].includes(u.roleId));
  const techs = users.filter((u) => u.roleId === 5);
  const allCenters = await db.center.findMany();
  console.log(`✓ کاربران (${users.length})`);

  // ---------- قراردادهای سازمانی ----------
  const customers = ["اداره کل بهزیستی", "سازمان نظام پزشکی", "شهرداری تهران", "دانشگاه علوم پزشکی", "اداره کار و رفاه اجتماعی", "آموزش و پرورش"];
  for (let i = 0; i < customers.length; i++) {
    const cust = await db.corporateCustomer.create({
      data: { title: customers[i], discount: pick([0, 10, 15, 20]), phone: `02${rnd(1, 9)}${rnd(10000000, 99999999)}` },
    });
    const contract = await db.corporateContract.create({
      data: { corporateCustomerId: cust.id, appDefault: i === 0, startDate: new Date(1404 - 621, 0, 1), endDate: new Date(1406 - 621, 3, 31) },
    });
    for (const [idx] of SERVICES.slice(0, 6).entries()) {
      const tariff = rnd(80, 400) * 1000;
      await db.corporateContractService.create({
        data: {
          corporateContractId: contract.id, serviceId: idx + 1, userTariff: tariff,
          consultantLevel1: Math.round(tariff * 0.45), consultantLevel2: Math.round(tariff * 0.5),
          consultantLevel3: Math.round(tariff * 0.55), consultantLevel4: Math.round(tariff * 0.62),
          consultantLevel5: Math.round(tariff * 0.7), consultantDR: Math.round(tariff * 0.75),
          secretaryFee: Math.round(tariff * 0.05), supervisorFee: Math.round(tariff * 0.08),
          centerFee: Math.round(tariff * 0.1), adminFee: Math.round(tariff * 0.05),
        },
      });
    }
  }
  console.log("✓ قراردادهای سازمانی");

  // ---------- سهمیه‌ها ----------
  const budgetTitles: [string, string][] = [
    ["سهمیه خدمات فردی ۱۴۰۵", "فردی"], ["سهمیه خدمات گروهی ۱۴۰۵", "گروهی"],
    ["سهمیه مشاوره شغلی ۱۴۰۵", "شغلی"], ["سهمیه خدمات تلفنی و آنلاین", "فردی"],
    ["سهمیه مداخله در بحران", "بحران"], ["سهمیه نوروفیدبک و نقشه مغزی", "فردی"],
  ];
  for (let i = 0; i < budgetTitles.length; i++) {
    const [title, kind] = budgetTitles[i];
    const amount = [50000, 10000, 8000, 15000, 3000, 1200][i];
    const used = Math.round(amount * (0.2 + Math.random() * 0.6));
    const reserved = Math.round(amount * Math.random() * 0.15);
    const b = await db.budget.create({
      data: {
        title, kind, amount, used, reserved, remained: amount - used - reserved,
        startDate: new Date(1405 - 621, 4, 1), endDate: new Date(1406 - 621, 3, 31),
        isActive: true, assigned: Math.round(amount * 0.8),
      },
    });
    for (const prov of centerProvinces) {
      const pAmount = Math.round((amount / centerProvinces.length) * (0.6 + Math.random() * 0.8));
      const pUsed = Math.round(pAmount * (0.2 + Math.random() * 0.6));
      const pReserved = Math.round(pAmount * Math.random() * 0.1);
      await db.budgetProvince.create({
        data: { budgetId: b.id, provinceId: provinces[prov], amount: pAmount, used: pUsed, reserved: pReserved, remained: pAmount - pUsed - pReserved, assigned: pAmount },
      });
    }
  }
  console.log("✓ سهمیه‌ها");

  // ---------- جلسات مشاوره ----------
  const statuses = ["تایید نهایی", "تایید نهایی", "تایید نهایی", "در انتظار تایید مدیر مرکز", "در انتظار تایید مسئول فنی", "در انتظار تایید نظارت حرفه‌ای", "در انتظار تایید ناظر استان", "رد شده", "ناتمام"];
  const now = new Date();
  const eventCount = 220;
  for (let i = 0; i < eventCount; i++) {
    const client = pick(clients);
    const consultant = pick(consultants);
    const center = pick(allCenters);
    const service = await db.service.findUnique({ where: { id: rnd(1, SERVICES.length) } })!;
    const status = pick(statuses);
    const daysAgo = rnd(0, 330);
    const start = new Date(now.getTime() - daysAgo * 86400000);
    start.setHours(rnd(8, 18), pick([0, 30]));
    const end = new Date(start.getTime() + pick([45, 60, 90]) * 60000);
    const tariff = rnd(80, 350) * 1000;
    const finalConfirmed = status === "تایید نهایی";
    const isRejected = status === "رد شده";
    const cAdmin = pick(centerAdmins);
    const sup = pick(supervisors);
    const tech = pick(techs);
    const ev = await db.event.create({
      data: {
        userId: client.id, nid: client.nid, trackingCode: 900000 + i,
        centerId: center.id, serviceId: service!.id, refId: Math.random() > 0.5 ? BigInt(100153197000 + i) : null,
        userTariff: tariff, level: consultant.level ?? 1,
        centerAdminId: cAdmin.id, supervisorId: sup.id, acceptorId: consultant.id,
        acceptorFee: Math.round(tariff * 0.5), secretaryFee: Math.round(tariff * 0.05),
        acceptorCodeName: `ث ${rnd(1000, 9999)}`, acceptorLevel: consultant.level ?? 1,
        supervisorFee: Math.round(tariff * 0.08), centerFee: Math.round(tariff * 0.1), adminFee: Math.round(tariff * 0.05),
        centerAdminConfirmUserId: cAdmin.id, centerAdminConfirmDateTime: finalConfirmed || Math.random() > 0.4 ? end : null,
        centerTechConfirmUserId: tech.id, centerTechConfirmDateTime: finalConfirmed ? end : null,
        operatorConfirmUserId: sup.id, operatorConfirmDateTime: finalConfirmed ? end : null,
        supervisorConfirmUserId: finalConfirmed ? sup.id : null,
        supervisorConfirmDateTime: finalConfirmed ? end : null,
        startDate: start, endDate: end, weight: service!.weight,
        budgetUsed: finalConfirmed, budgetReserved: !isRejected,
        status, rejectedAt: isRejected ? end : null,
        rejectedComment: isRejected ? pick(["تطابق ارجاع با خدمت وجود ندارد", "اطلاعات جلسه ناقص است", "خارج از سهمیه استان", "عدم تطابق کد پذیرنده"]) : null,
        topic: pick(TOPICS),
        description: `جلسه ${pick(TOPICS)} با حضور مراجع انجام شد.`,
      },
    });
    if (finalConfirmed && Math.random() > 0.3) {
      await db.eventComment.create({
        data: { eventId: ev.id, consultantNID: consultant.nid, dateTime: end, comment: pick([
          "مراجع انگیزه خوبی برای ادامه درمان داشت و تمرینات جلسه قبل انجام داده است.",
          "روی مهارت‌های ارتباطی کار شد؛ تمرین خانه داده شد.",
          "بازسازی شناختی انجام شد و پاسخ‌دهی مراجع مناسب بود.",
          "جلسه ارزیابی اولیه انجام و پرونده بالینی تکمیل شد.",
          "به دلیل عدم همکاری مراجع، جلسه بعدی به مشاور دیگری ارجاع شد.",
        ]) },
      });
    }
    if (service!.name.includes("نوروفیدبک") && finalConfirmed) {
      await db.eventNeuroFeedback.create({
        data: { eventId: ev.id, protocol: pick(["Beta/SMR", "Alpha/Theta", "Beta Training"]), target: pick(["بهبود تمرکز", "کاهش اضطراب", "بهبود خواب"]),
          ezterabOld: rnd(4, 8), ezterabNew: rnd(2, 5), afsorOld: rnd(5, 9), afsorNew: rnd(3, 6), focusOld: rnd(3, 6), focusNew: rnd(5, 9), dateTime: end },
      });
    }
    if (service!.name.includes("روانپزشکی") && finalConfirmed && Math.random() > 0.4) {
      await db.eventMedicine.create({ data: { eventId: ev.id, name: pick(["سرترالین", "فلوکستین", "اسیتالوپرام", "ونلافاکسین"]), dosage: `${rnd(25, 100)} میلی‌گرم`, duration: `${rnd(2, 8)} هفته` } });
    }
    if (finalConfirmed && Math.random() > 0.75) {
      await db.eventPsychology.create({
        data: { eventId: ev.id, userId: client.id, acceptorId: consultant.id, job: pick(["کارمند", "دانشجو", "خانه‌دار", "آزاد", "معلم"]), children: rnd(0, 4),
          mood: pick(["کمی افسرده", "اضطرابی", "نسبتا پایدار", "موج زده"]), speech: pick(["روان", "کند", "منظم"]), memory: "نرمال", insight: pick(["خوب", "متوسط"]), dateTime: end },
      });
    }
  }
  console.log("✓ جلسات مشاوره");

  // ---------- جلسات گروهی ----------
  for (let gi = 0; gi < 10; gi++) {
    const center = pick(allCenters);
    const consultant = pick(consultants);
    const g = await db.group.create({
      data: { title: `گروه ${pick(["خانواده", "ازدواج", "اضطراب", "مهارت‌های زندگی", "فرزندپروری", "شغلی"])} ${gi + 1}`, centerId: center.id, acceptorId: consultant.id, creatorId: adminId, tel: `091${rnd(10000000, 99999999)}`, address: `${center.cityTitle}، ${center.address?.slice(0, 30)}` },
    });
    const memberCount = rnd(8, 20);
    for (let m = 0; m < memberCount; m++) {
      const c = pick(clients);
      await db.groupMember.create({ data: { groupId: g.id, userId: c.id, nid: c.nid } });
    }
    const sessionsCount = rnd(2, 6);
    for (let s = 1; s <= sessionsCount; s++) {
      const start = new Date(now.getTime() - rnd(0, 200) * 86400000);
      const ge = await db.groupEvent.create({
        data: { groupId: g.id, topic: pick(TOPICS), description: `جلسه ${s} گروه`, startDate: start, endDate: new Date(start.getTime() + 90 * 60000), sessionNumber: s, acceptorId: consultant.id, acceptorCodeName: `ث ${rnd(1000, 9999)}`, supervisorId: pick(supervisors).id, centerAdminId: pick(centerAdmins).id, acceptorFee: rnd(200, 600) * 1000, secretaryFee: 25000, serviceId: 4, userTariff: rnd(50, 120) * 1000, weight: 0.5, centerId: center.id, status: pick(["تایید نهایی", "در انتظار تایید نظارت حرفه‌ای", "در انتظار تایید ناظر استان"]) },
      });
      const attendees = Math.max(3, memberCount - rnd(0, 6));
      for (let a = 0; a < attendees; a++) {
        await db.groupEventMember.create({ data: { userId: pick(clients).id, groupId: g.id, groupEventId: ge.id, serviceId: 4, trackingCode: 900000 + rnd(0, 999) } });
      }
    }
  }
  console.log("✓ جلسات گروهی");

  // ---------- ارجاعات سها ----------
  for (let i = 0; i < 60; i++) {
    const client = pick(clients);
    const center = Math.random() > 0.3 ? pick(allCenters) : null;
    const status = pick(["در انتظار", "در انتظار", "پذیرش‌شده", "پذیرش‌شده", "ارجاع‌شده", "منقضی"]);
    await db.referr.create({
      data: {
        refId: BigInt(100153197608 + i * 32), userId: client.id, userName: `${client.name} ${client.family}`,
        userNid: client.nid, userMobile: BigInt(nextMobile()), serviceId: rnd(1, 5),
        description: `مشاوره ${pick(["خانواده", "فردی", "ازدواج", "شغلی"])} - اداره ${pick(["رودان", "بندرعباس", "تهران", "شیراز", "اهواز", "کرج"])}`,
        isReferr: status !== "در انتظار", provinceId: provinces[pick(centerProvinces)],
        centerId: center?.id, acceptorId: status !== "در انتظار" ? pick(consultants).id : null,
        sessionsCount: status === "در انتظار" ? 0 : rnd(1, 6), status,
        creationDate: new Date(now.getTime() - rnd(0, 180) * 86400000),
      },
    });
  }
  // درخواست‌های رزرو
  for (let i = 0; i < 18; i++) {
    const client = pick(clients);
    const center = Math.random() > 0.5 ? pick(allCenters) : null;
    await db.referrRequest.create({
      data: { userId: client.id, userName: `${client.name} ${client.family}`, description: pick(["درخواست رزرو جلسه حضوری برای مشاوره ازدواج", "نیاز فوری به جلسه آنلاین دارم", "درخواست تغییر مرکز", "درخواست جلسه تلفنی به دلیل سفر"]), provinceId: provinces[pick(centerProvinces)], centerId: center?.id, status: pick(["در انتظار بررسی", "در انتظار بررسی", "تایید شده", "رد شده"]), creationDate: new Date(now.getTime() - rnd(0, 90) * 86400000) },
    });
  }
  console.log("✓ ارجاعات و درخواست‌ها");

  // ---------- موارد حاد ----------
  const usedEmsEvents = new Set<number>();
  for (let i = 0; i < 14; i++) {
    const ev = await db.event.findFirst({ where: { status: "تایید نهایی" }, skip: rnd(0, 50) });
    if (!ev || usedEmsEvents.has(ev.id)) continue;
    usedEmsEvents.add(ev.id);
    const payStatus = pick(["بدون درخواست", "در انتظار بررسی", "تایید شده", "پرداخت شده"]);
    const ems = await db.eventsEms.create({
      data: {
        eventId: ev.id, secretaryNID: BigInt(nextNid()),
        emsType: JSON.stringify([pick(["خودکشی کامل", "خودکشی ناموفق", "خودزنی", "فکر خودکشی", "آسیب به دیگران"])]),
        suicidalFrom: JSON.stringify([pick(["شکست عاطفی", "مشکلات مالی", "تعارض خانوادگی", "شکست تحصیلی"])]),
        psychiatricDisorders: JSON.stringify([pick(["افسردگی اساسی", "اختلال دوقطبی", "اختلال شخصیت مرزی", "اضطراب فراگیر"])]),
        socialFactors: JSON.stringify([pick(["انزوای اجتماعی", "بیکاری", "طلاق والدین", "خشونت خانگی"])]),
        protectiveFactors: JSON.stringify([pick(["حمایت خانواده", "درون‌کاوی مذهبی", "مسئولیت فرزند", "رابطه درمانی خوب"])]),
        suggestedActions: JSON.stringify([pick(["بستری بیمارستانی", "جلسات پیگیری فوری", "ارجاع روانپزشک", "مشاوره خانواده"])]),
        actionsTaken: pick(["در جلسه اولیه اقدامات حمایتی انجام و خانواده مطلع شد.", "ارجاع فوری به روانپزشک انجام شد.", "پرونده به کمیسیون موارد حاد ارسال شد."]),
        financialAssistanceRequest: payStatus === "بدون درخواست" ? 0 : 1,
        dateTime: new Date(now.getTime() - rnd(0, 120) * 86400000),
        hadPaymentAmount: payStatus === "پرداخت شده" ? rnd(20, 80) * 1000000 : 0,
        hadPaymentStatus: payStatus,
        severity: pick(["کم", "متوسط", "متوسط", "بالا"]),
      },
    });
    if (Math.random() > 0.5) {
      await db.eventEmsComment.create({ data: { eventEmsId: ems.id, userId: adminId, comment: pick(["گزارش کمیسیون بررسی شد؛ نیاز به تکمیل مدارک دارد.", "پرداخت مورد تایید قرار گرفت.", "نیاز به جلسه پیگیری فوری است."]) } });
    }
  }
  console.log("✓ موارد حاد");

  // ---------- مالیات مشاوران ----------
  for (const c of consultants) {
    for (const ym of [[1404, 10], [1404, 11], [1404, 12], [1405, 1], [1405, 2], [1405, 3]]) {
      const payment = rnd(10, 120) * 1000000;
      const tax = Math.round(payment * pick([0, 0.05, 0.07, 0.1]));
      await db.consultantTax.create({ data: { userId: c.id, nid: c.nid, year: ym[0], month: ym[1], taxAmount: BigInt(tax), exemptionMonths: pick([0, 0, 7]), multiEmployerMonth: pick([0, 0, 3]), totalPayment: BigInt(payment), createdByUserId: adminId, createdAt: new Date() } });
    }
  }
  console.log("✓ مالیات");

  // ---------- پیامک‌ها، پیام‌ها، لاگ‌ها ----------
  for (let i = 0; i < 50; i++) {
    const s = pick(users); const r = pick(users);
    await db.sms.create({
      data: { senderId: s.id, receiverId: r.id, number: BigInt(nextMobile()), message: pick([
        "کاربر گرامی، جلسه مشاوره شما با موفقیت ثبت شد.",
        "یادآوری: جلسه مشاوره شما فردا ساعت ۱۰ برگزار می‌شود.",
        "کد تایید ورود شما: ۴۸۳۲",
        "ارجاع جدید از سامانه سها برای مرکز شما ثبت شد.",
        "سهمیه جلسات استان شما به پایان نزدیک می‌شود.",
      ]), status: pick(["ارسال شده", "ارسال شده", "ارسال شده", "در صف", "ناموفق"]), createTime: new Date(now.getTime() - rnd(0, 60) * 86400000) },
    });
  }
  for (let i = 0; i < 16; i++) {
    const s = pick(users);
    await db.message.create({
      data: { fromUserId: s.id, toUserId: Math.random() > 0.4 ? pick(users).id : null, subject: pick(["اطلاعیه تغییر تعرفه‌ها", "دوره آموزشی جدید", "یادآوری ثبت جلسات", "گزارش ماهانه", "بروزرسانی سامانه"]), text: pick(["لطفا تا پایان هفته جلسات ثبت‌نشده را تکمیل کنید.", "دوره آموزشی نوروفیدبک از تاریخ ۱۵ آبان برگزار می‌شود.", "تعرفه‌های خدمات گروهی بروزرسانی شد.", "گزارش عملکرد ماهانه استان‌ها منتشر شد."]), targetRole: Math.random() > 0.6 ? pick(["مشاور", "مدیر کلینیک", "ناظر"]) : null, star: Math.random() > 0.7, isRead: Math.random() > 0.4, timestamp: new Date(now.getTime() - rnd(0, 30) * 86400000) },
    });
  }
  for (let i = 0; i < 90; i++) {
    const u = pick(users);
    await db.log.create({
      data: { userId: u.id, category: pick(["ورود", "پذیرش", "API", "تایید جلسه", "ثبت جلسه", "خروج", "ویرایش کاربر", "ارسال پیامک"]), description: pick(["ورود موفق به سامانه", "ثبت جلسه جدید", "تایید جلسه توسط مدیر", "فراخوانی وب‌سرویس سها", "ویرایش اطلاعات پرونده", "خطای اعتبارسنجی ارجاع"]), level: pick([1, 1, 1, 2, 3]), ip: `10.10.${rnd(0, 255)}.${rnd(1, 254)}`, timestamp: new Date(now.getTime() - rnd(0, 30) * 86400000) },
    });
  }
  console.log("✓ پیامک، پیام، لاگ");

  // ---------- تنظیمات، مناسبت‌ها، تیکت‌ها، راهنماها ----------
  for (const [name, value, group] of SETTING_DEFS) {
    await db.setting.create({ data: { name, value, group } });
  }
  for (let i = 0; i < 4; i++) {
    await db.specialOccasion.create({ data: { title: OCCASIONS[i], displayDate: new Date(1405 - 621, rnd(0, 11), rnd(1, 28)), isActive: i < 2, createdByUserId: adminId } });
  }
  const ticketSubjects: [string, string, string][] = [
    ["عدم نمایش ارجاعات جدید", "ارجاعات امروز سها در سامانه نمایش داده نمی‌شود.", "باز"],
    ["درخواست تغییر سطح مشاور", "لطفا سطح مشاور کد ۴۸۴۴ به سطح ۳ ارتقا یابد.", "در حال بررسی"],
    ["خطا در ثبت جلسه گروهی", "هنگام ثبت جلسه گروهی خطای ۵۰۰ دریافت می‌کنم.", "بسته"],
    ["یادآوری پیامک ارسال نمی‌شود", "پیامک‌های یادآوری برای مراجعان ارسال نمی‌شود.", "باز"],
  ];
  for (const [subject, text, status] of ticketSubjects) {
    await db.userTicket.create({ data: { userId: pick(users).id, subject, text, status, priority: pick(["کم", "متوسط", "بالا"]) } });
  }
  for (const r of ROLE_DEFS.slice(0, 8)) {
    await db.help.create({ data: { title: `راهنمای ${r[0]}`, fileUrl: `/helps/${r[0]}.pdf` } });
  }
  console.log("✓ تنظیمات، مناسبت‌ها، تیکت‌ها");

  console.log("🎉 Seed کامل شد!");
  console.log("👤 ورود مدیر: admin / 123456 — بقیه کاربران: کد ملی (username) / 123456");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
