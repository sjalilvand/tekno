// تست دود نسخهٔ ۶.۱۳ — درون‌ریزی خودکار بانک‌ها + رفع خطای ساخت + اطلس بی‌دردسر
//  • نخستین بازدید صفحهٔ آزمون‌ها ← ۴۰ آزمون خودکار وارد می‌شود (بدون دکمهٔ مدیر)
//  • نخستین بازدید آموزش‌ها ← ۷ مورد آکادمی رز خودکار وارد می‌شود
//  • نخستین بازدید اطلس/مراکز ← ۳۱ کلینیک رز با مختصات خودکار وارد می‌شود
//  • idempotent بودن درون‌ریزی خودکار + رگرسیون نمره‌دهی/آزمون آموزشی/مالی/اسکوپ
import { PrismaClient } from "@prisma/client";
import { scryptSync, randomBytes, createHash } from "crypto";

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

async function req(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    signal: AbortSignal.timeout(60000),
    headers: { cookie: `rz_session=${token}`, ...(init?.body ? { "content-type": "application/json" } : {}), ...(init?.headers ?? {}) },
  });
  let body: any = null;
  try { body = await res.json(); } catch { /* ignore */ }
  return { status: res.status, body, res };
}

async function main() {
  console.log("── ۱) آماده‌سازی پایگاه آزمایشی (بدون هیچ بانک آماده)");
  await db.psychTestAttempt.deleteMany();
  await db.psychTest.deleteMany();
  await db.trainingAttempt.deleteMany();
  await db.trainingItem.deleteMany();
  await db.financeTransaction.deleteMany();
  await db.session.deleteMany();
  await db.eventReserve.deleteMany();
  await db.eventsEms.deleteMany();
  await db.eventComment.deleteMany();
  await db.formSubmission.deleteMany();
  await db.formDefinition.deleteMany();
  await db.event.deleteMany();
  await db.userCenter.deleteMany();
  await db.userRole.deleteMany();
  await db.role.deleteMany();
  await db.user.deleteMany();
  await db.center.deleteMany();
  await db.service.deleteMany();
  await db.city.deleteMany();
  await db.province.deleteMany();
  await db.log.deleteMany();

  // سناریوی واقعی کاربر: سه مرکز دمو بدون مختصات نقشه — بانک‌های آزمون/آموزش خالی
  const pTehran = await db.province.create({ data: { id: 8, title: "تهران" } });
  const pAlborz = await db.province.create({ data: { id: 5, title: "البرز" } });
  const c1 = await db.city.create({ data: { id: 1, provinceId: pTehran.id, title: "تهران" } });
  const c2 = await db.city.create({ data: { id: 2, provinceId: pAlborz.id, title: "کرج" } });
  const center1 = await db.center.create({ data: { id: 1, title: "کلینیک تهران", isEnabled: true, cityId: c1.id, cityTitle: "تهران", provinceId: pTehran.id, provinceTitle: "تهران" } });
  const center2 = await db.center.create({ data: { id: 2, title: "کلینیک کرج", isEnabled: true, cityId: c2.id, cityTitle: "کرج", provinceId: pAlborz.id, provinceTitle: "البرز" } });
  const service = await db.service.create({ data: { id: 1, name: "مشاوره فردی", short: "فردی", sohaId: 1, weight: 1 } });

  const admin = await db.user.create({
    data: { nid: 1234567890n, username: "masa", passwordHash: hashPassword("admin123"), name: "مسا", family: "مدیر سامانه", mobile: 9120000000n },
  });
  const counsRole = await db.role.create({ data: { id: 1, codeName: "counselor", title: "مشاور", permissions: null, dataScope: "self" } });
  const counsA = await db.user.create({
    data: { nid: 9876543210n, username: "couns1", passwordHash: hashPassword("t12345"), name: "سارا", family: "محمدی", mobile: 9130000000n, roles: { create: [{ roleId: counsRole.id }] } },
  });
  const counsB = await db.user.create({
    data: { nid: 9876543211n, username: "couns2", passwordHash: hashPassword("t12345"), name: "رضا", family: "کریمی", mobile: 9130000001n, roles: { create: [{ roleId: counsRole.id }] } },
  });
  await db.userCenter.createMany({ data: [{ userId: counsA.id, centerId: center1.id, isPrimary: true }, { userId: counsA.id, centerId: center2.id }] });
  const client1 = await db.user.create({ data: { nid: 5289710752n, username: "app1", passwordHash: hashPassword("app123"), name: "حمیرا", family: "بداق", mobile: 9166603729n } });

  await db.event.create({
    data: { userId: client1.id, nid: client1.nid, centerId: center1.id, serviceId: service.id, status: "در انتظار پذیرش", startDate: new Date(), acceptorId: counsA.id, acceptorFee: 1000, userTariff: 1000 },
  });

  const mkSession = async (userId: number) => {
    const t = createHash("sha256").update(`rz:${userId}:${Date.now()}:${Math.random()}`).digest("hex");
    await db.session.create({ data: { userId, token: t, ip: "-", browser: "test" } });
    return t;
  };
  const adminT = await mkSession(admin.id);
  const aT = await mkSession(counsA.id);
  const bT = await mkSession(counsB.id);

  console.log("── ۲) درون‌ریزی خودکار بانک آزمون — بدون هیچ دکمه‌ای");
  const psychBefore = await db.psychTest.count();
  check("بانک آزمون پیش از بازدید خالی است", psychBefore === 0, `n=${psychBefore}`);
  const list = await req("/api/psych-tests", aT);
  check("نخستین بازدید مشاور ← ۴۰ آزمون خودکار", list.status === 200 && list.body?.total === 40, `total=${list.body?.total}`);
  check("موضوعات استخراج شد", (list.body?.topics ?? []).length >= 3, `topics=${(list.body?.topics ?? []).length}`);
  const listAgain = await req("/api/psych-tests", aT);
  check("بازدید مجدد — همچنان ۴۰ (بدون تکرار)", listAgain.body?.total === 40, `total=${listAgain.body?.total}`);
  const detail = await req("/api/psych-tests/bdi-ii", aT);
  check("جزئیات BDI-II با ۲۱ سؤال", detail.status === 200 && detail.body?.questions?.length === 21, `qs=${detail.body?.questions?.length}`);
  const sub = await req("/api/psych-tests/bdi-ii", aT, { method: "POST", body: JSON.stringify({ answers: Array(21).fill(3), subjectName: "حمیرا بداق", subjectNid: "5289710752" }) });
  check("نمره‌دهی سرور — ۶۳ و «افسردگی شدید»", sub.body?.score === 63 && sub.body?.label === "افسردگی شدید", `score=${sub.body?.score}`);
  const attemptsAdmin = await req("/api/psych-attempts?pageSize=50", adminT);
  check("تاریخچهٔ اجرا برای مدیر — ۱ مورد", attemptsAdmin.body?.total === 1, `total=${attemptsAdmin.body?.total}`);

  console.log("── ۳) درون‌ریزی خودکار آموزش‌ها — بدون هیچ دکمه‌ای");
  const tList = await req("/api/training", aT);
  const kinds = (tList.body?.items ?? []).map((i: any) => i.kind);
  check("نخستین بازدید ← ۷ مورد (۴ محتوا، ۲ دوره، ۱ آزمون)",
    kinds.filter((k: string) => k === "content").length === 4 && kinds.filter((k: string) => k === "course").length === 2 && kinds.filter((k: string) => k === "exam").length === 1,
    `kinds=${kinds.join(",")}`);
  const tList2 = await req("/api/training", aT);
  check("بازدید مجدد — بدون تکرار", (tList2.body?.items ?? []).length === 7, `n=${(tList2.body?.items ?? []).length}`);
  const exam = await req("/api/training/cbt-basics-exam", aT);
  check("آزمون آموزشی — ۶ سؤال بدون افشای پاسخ", exam.status === 200 && exam.body?.questionsCount === 6 && !JSON.stringify(exam.body).includes("correctIndex"), `qs=${exam.body?.questionsCount}`);
  const examPass = await req("/api/training/cbt-basics-exam", aT, { method: "POST", body: JSON.stringify({ answers: [0, 0, 1, 0, 0, 0] }) });
  check("قبولی با ۱۰۰٪", examPass.body?.passed === true && examPass.body?.percent === 100, `p=${examPass.body?.percent}`);

  console.log("── ۴) درون‌ریزی خودکار ۳۱ کلینیک رز در اطلس — بدون هیچ دکمه‌ای");
  const atlas = await req("/api/atlas", adminT);
  check("نخستین بازدید اطلس ← ۳۳ مرکز (۲ دمو + ۳۱ رز)", atlas.body?.totals?.centers === 33, `c=${atlas.body?.totals?.centers}`);
  check("۳۱ استان تحت پوشش", atlas.body?.totals?.provinces === 31, `p=${atlas.body?.totals?.provinces}`);
  const tabriz = await db.center.findFirst({ where: { title: { contains: "تبریز" } } });
  check("کلینیک تبریز با نشانی/تلفن/مختصات", Boolean(tabriz?.address && tabriz?.tel && tabriz?.latitude), `lat=${tabriz?.latitude}`);
  check("استان تبریز = آذربایجان شرقی (کد ۱)", tabriz?.provinceId === 1 && tabriz?.provinceTitle === "آذربایجان شرقی", `pid=${tabriz?.provinceId}`);
  const atlas2 = await req("/api/atlas", adminT);
  check("بازدید مجدد — بدون تکرار واردات", atlas2.body?.totals?.centers === 33, `c=${atlas2.body?.totals?.centers}`);
  const atlasA = await req("/api/atlas", aT);
  check("اسکوپ مشاور — فقط دو کلینیک عضو", atlasA.body?.items?.length === 2, `items=${atlasA.body?.items?.length}`);
  const centersList = await req("/api/centers?page=1&pageSize=50", aT);
  check("نمای مراکز هم ۳۳ مرکز را می‌بیند", centersList.body?.total === 33, `total=${centersList.body?.total}`);

  console.log("── ۵) رگرسیون — مالی، کارتابل و گزارش");
  const inc = await req("/api/finance", aT, { method: "POST", body: JSON.stringify({ kind: "income", title: "شهریهٔ دورهٔ CBT", category: "شهریه دوره", amount: 2000000, method: "transfer", centerId: center1.id }) });
  check("ثبت درآمد", inc.status === 200 && inc.body?.id, `status=${inc.status}`);
  await req("/api/finance", aT, { method: "POST", body: JSON.stringify({ kind: "expense", title: "اجارهٔ بهمن", category: "اجاره", amount: 500000, method: "cash" }) });
  const fin = await req("/api/finance", adminT);
  check("تراز = ۱٬۵۰۰٬۰۰۰", fin.body?.totals?.balance === 1500000, `b=${fin.body?.totals?.balance}`);
  const cartA = await req("/api/cartable?q=", aT);
  check("کارتابل مشاور A — اسکوپ فعال", cartA.body?.rows?.length === 2 && cartA.body?.scoped === true, `rows=${cartA.body?.rows?.length}`);
  const repA = await req("/api/report", aT, { method: "POST", body: JSON.stringify({ dataset: "events", mode: "detail", format: "json" }) });
  check("گزارش مشاور A فقط جلسهٔ خودش", repA.body?.total === 1, `total=${repA.body?.total}`);

  console.log(`\nنتیجه: ${pass} موفق / ${failCnt} ناموفق`);
  if (failCnt > 0) process.exit(1);
}
main().finally(() => db.$disconnect());
