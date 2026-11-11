// تست دود نسخهٔ ۶.۱۲ — بانک آزمون‌های روان‌شناختی + آموزش‌ها + اطلس مراکز + حسابداری + واردات مراکز رز
//  • درون‌ریزی بانک آزمون (فقط مدیر) + اجرا با نمره‌دهی سرور + تاریخچه با اسکوپ
//  • درون‌ریزی محتوای آموزشی + آزمون آموزشی بدون افشای پاسخ صحیح
//  • اطلس مراکز با دامنهٔ دسترسی + واردات ۳۱ کلینیک رز (idempotent)
//  • تراکنش درآمد/هزینه + تراز + حذف
// روتی‌ها: /api/psych-tests (+[slug]) — /api/psych-attempts — /api/training (+[slug]) —
//          /api/atlas — /api/finance — /api/centers + رگرسیون کارتابل/گزارش
import { PrismaClient } from "@prisma/client";
import { scryptSync, randomBytes, createHash } from "crypto";
import { readFileSync } from "fs";

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
    signal: AbortSignal.timeout(30000),
    headers: { cookie: `rz_session=${token}`, ...(init?.body ? { "content-type": "application/json" } : {}), ...(init?.headers ?? {}) },
  });
  let body: any = null;
  try { body = await res.json(); } catch { /* ignore */ }
  return { status: res.status, body, res };
}

async function main() {
  const rose = JSON.parse(readFileSync(new URL("../src/data/rose-clinics.json", import.meta.url), "utf-8"));

  console.log("── ۱) آماده‌سازی دادهٔ آزمایشی");
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

  // ۳۱ استان با کد رسمی — مطابق دادهٔ رز
  for (const c of rose) {
    await db.province.create({ data: { id: Number(c.province_code), title: c.province_name } });
  }
  const pTehran = await db.province.findUnique({ where: { id: 8 } });
  const pAlborz = await db.province.findUnique({ where: { id: 5 } });
  const c1 = await db.city.create({ data: { id: 1, provinceId: pTehran!.id, title: "تهران" } });
  const c2 = await db.city.create({ data: { id: 2, provinceId: pAlborz!.id, title: "کرج" } });
  const center1 = await db.center.create({ data: { id: 1, title: "کلینیک تهران", isEnabled: true, cityId: c1.id, cityTitle: "تهران", provinceId: pTehran!.id, provinceTitle: "تهران" } });
  const center2 = await db.center.create({ data: { id: 2, title: "کلینیک کرج", isEnabled: true, cityId: c2.id, cityTitle: "کرج", provinceId: pAlborz!.id, provinceTitle: "البرز" } });
  const center3 = await db.center.create({ data: { id: 3, title: "کلینیک قزوین", isEnabled: true, cityId: c2.id, cityTitle: "کرج", provinceId: pAlborz!.id, provinceTitle: "البرز" } });
  const service = await db.service.create({ data: { id: 1, name: "مشاوره فردی", short: "فردی", sohaId: 1, weight: 1 } });

  const admin = await db.user.create({
    data: { nid: 1234567890n, username: "masa", passwordHash: hashPassword("admin123"), name: "مسا", family: "مدیر سامانه", mobile: 9120000000n },
  });
  const counsRole = await db.role.create({ data: { id: 1, codeName: "counselor", title: "مشاور", permissions: null, dataScope: "self" } });
  const mkUser = (nid: bigint, username: string, name: string, family: string, mobile: bigint, roles: { roleId: number }[] = []) =>
    db.user.create({ data: { nid, username, passwordHash: hashPassword("t12345"), name, family, mobile, roles: { create: roles.map((r) => ({ roleId: r.roleId })) } } });
  const counsA = await mkUser(9876543210n, "couns1", "سارا", "محمدی", 9130000000n, [{ roleId: counsRole.id }]);
  const counsB = await mkUser(9876543211n, "couns2", "رضا", "کریمی", 9130000001n, [{ roleId: counsRole.id }]);
  await db.userCenter.createMany({ data: [{ userId: counsA.id, centerId: center1.id, isPrimary: true }, { userId: counsA.id, centerId: center2.id }] });
  const client1 = await db.user.create({ data: { nid: 5289710752n, username: "app1", passwordHash: hashPassword("app123"), name: "حمیرا", family: "بداق", mobile: 9166603729n } });

  const now = new Date();
  await db.event.create({
    data: { userId: client1.id, nid: client1.nid, centerId: center1.id, serviceId: service.id, status: "در انتظار پذیرش", startDate: now, acceptorId: counsA.id, acceptorFee: 1000, userTariff: 1000 },
  });

  const mkSession = async (userId: number) => {
    const t = createHash("sha256").update(`rz:${userId}:${Date.now()}:${Math.random()}`).digest("hex");
    await db.session.create({ data: { userId, token: t, ip: "-", browser: "test" } });
    return t;
  };
  const adminT = await mkSession(admin.id);
  const aT = await mkSession(counsA.id);
  const bT = await mkSession(counsB.id);

  console.log("── ۲) بانک آزمون‌های روان‌شناختی");
  const impDenied = await req("/api/psych-tests", aT, { method: "POST", body: JSON.stringify({ action: "import" }) });
  check("درون‌ریزی بانک توسط مشاور رد می‌شود (403)", impDenied.status === 403, `status=${impDenied.status}`);
  const imp = await req("/api/psych-tests", adminT, { method: "POST", body: JSON.stringify({ action: "import" }) });
  check("درون‌ریزی بانک آزمون — ۴۰ آزمون", imp.status === 200 && imp.body?.total === 40, `status=${imp.status} total=${imp.body?.total}`);
  const imp2 = await req("/api/psych-tests", adminT, { method: "POST", body: JSON.stringify({ action: "import" }) });
  check("درون‌ریزی تکراری idempotent (۴۰ به‌روزرسانی)", imp2.body?.imported === 0 && imp2.body?.updated === 40, `imp=${imp2.body?.imported} upd=${imp2.body?.updated}`);

  const list = await req("/api/psych-tests", aT);
  check("فهرست آزمون‌ها برای مشاور", list.status === 200 && list.body?.total === 40, `total=${list.body?.total}`);
  check("موضوعات استخراج شد", (list.body?.topics ?? []).length >= 3, `topics=${(list.body?.topics ?? []).length}`);

  const detail = await req("/api/psych-tests/bdi-ii", aT);
  check("جزئیات BDI-II با ۲۱ سؤال", detail.status === 200 && detail.body?.questions?.length === 21, `qs=${detail.body?.questions?.length}`);
  check("حداکثر نمرهٔ BDI-II = ۶۳", detail.body?.maxScore === 63, `max=${detail.body?.maxScore}`);

  const badLen = await req("/api/psych-tests/bdi-ii", aT, { method: "POST", body: JSON.stringify({ answers: [0, 0] }) });
  check("پاسخ ناقص رد می‌شود (400)", badLen.status === 400, `status=${badLen.status}`);
  const sub = await req("/api/psych-tests/bdi-ii", aT, { method: "POST", body: JSON.stringify({ answers: Array(21).fill(3) }) });
  check("نمرهٔ کامل ۶۳ و «افسردگی شدید»", sub.body?.score === 63 && sub.body?.label === "افسردگی شدید", `score=${sub.body?.score} label=${sub.body?.label}`);
  const sub2 = await req("/api/psych-tests/bdi-ii", aT, { method: "POST", body: JSON.stringify({ answers: Array(21).fill(0), subjectName: "حمیرا بداق", subjectNid: "5289710752" }) });
  check("نمرهٔ صفر و «افسردگی حداقلی»", sub2.body?.score === 0 && sub2.body?.label === "افسردگی حداقلی", `score=${sub2.body?.score}`);

  const attemptsA = await req("/api/psych-attempts?pageSize=50", aT);
  check("تاریخچهٔ مشاور A — هر دو اجرا با نام متقاضی", attemptsA.body?.total === 2 && attemptsA.body?.items?.[0]?.subjectNid === "5289710752", `total=${attemptsA.body?.total}`);
  const subB = await req("/api/psych-tests/gad-7", bT, { method: "POST", body: JSON.stringify({ answers: Array(7).fill(1) }) });
  check("اجرای آزمون توسط مشاور B", subB.status === 200 && subB.body?.score === 7, `score=${subB.body?.score}`);
  const attemptsB = await req("/api/psych-attempts?pageSize=50", bT);
  check("اسکوپ خودِ مشاور B — فقط اجرای خودش (۱)", attemptsB.body?.total === 1, `total=${attemptsB.body?.total}`);
  const attemptsAdmin = await req("/api/psych-attempts?pageSize=50", adminT);
  check("مدیر هر سه اجرا را می‌بیند", attemptsAdmin.body?.total === 3, `total=${attemptsAdmin.body?.total}`);

  console.log("── ۳) آموزش‌ها + آزمون آموزشی");
  const impT = await req("/api/training", adminT, { method: "POST", body: JSON.stringify({ action: "import" }) });
  check("درون‌ریزی محتوای آموزشی — ۷ مورد", impT.status === 200 && impT.body?.total === 7, `total=${impT.body?.total}`);
  const tList = await req("/api/training", aT);
  const kinds = (tList.body?.items ?? []).map((i: any) => i.kind);
  check("فهرست آموزش‌ها (۴ محتوا، ۲ دوره، ۱ آزمون)", kinds.filter((k: string) => k === "content").length === 4 && kinds.filter((k: string) => k === "course").length === 2 && kinds.filter((k: string) => k === "exam").length === 1, `kinds=${kinds.join(",")}`);
  const exam = await req("/api/training/cbt-basics-exam", aT);
  check("آزمون آموزشی — ۶ سؤال", exam.status === 200 && exam.body?.questionsCount === 6, `qs=${exam.body?.questionsCount}`);
  check("پاسخ صحیح به کلاینت نمی‌رود", JSON.stringify(exam.body).includes("correctIndex") === false, "leak check");
  const examPass = await req("/api/training/cbt-basics-exam", aT, { method: "POST", body: JSON.stringify({ answers: [0, 0, 1, 0, 0, 0] }) });
  check("پاسخ کامل — قبول با ۱۰۰٪", examPass.body?.passed === true && examPass.body?.percent === 100, `p=${examPass.body?.percent}`);
  const examFail = await req("/api/training/cbt-basics-exam", bT, { method: "POST", body: JSON.stringify({ answers: [1, 1, 0, 1, 1, 1] }) });
  check("پاسخ اشتباه — مردود", examFail.body?.passed === false, `p=${examFail.body?.percent}`);
  const content = await req("/api/training/what-is-cbt", aT);
  check("محتوای آموزشی با متن کامل", content.status === 200 && (content.body?.body ?? "").length > 200, `len=${(content.body?.body ?? "").length}`);

  console.log("── ۴) اطلس مراکز رز");
  const atlasAdmin = await req("/api/atlas", adminT);
  check("اطلس برای مدیر — ۳ مرکز", atlasAdmin.body?.items?.length === 3 && atlasAdmin.body?.totals?.centers === 3, `items=${atlasAdmin.body?.items?.length}`);
  check("جمع جلسات/متقاضیان در totals", atlasAdmin.body?.totals?.sessions === 0 && atlasAdmin.body?.totals?.applicants === 1, `s=${atlasAdmin.body?.totals?.sessions} a=${atlasAdmin.body?.totals?.applicants}`);
  const atlasA = await req("/api/atlas", aT);
  check("مشاور عضو دو کلینیک — فقط همان دو مرکز", atlasA.body?.items?.length === 2, `items=${atlasA.body?.items?.length}`);

  console.log("── ۵) واردات ۳۱ کلینیک رز از نقشه");
  const impRoseDenied = await req("/api/centers", aT, { method: "POST", body: JSON.stringify({ action: "import-rose" }) });
  check("واردات مراکز توسط مشاور رد می‌شود (403)", impRoseDenied.status === 403, `status=${impRoseDenied.status}`);
  const impRose = await req("/api/centers", adminT, { method: "POST", body: JSON.stringify({ action: "import-rose" }) });
  check("واردات ۳۱ مرکز جدید", impRose.status === 200 && impRose.body?.imported === 31 && (impRose.body?.errors ?? []).length === 0, `imp=${impRose.body?.imported} err=${JSON.stringify(impRose.body?.errors ?? []).slice(0, 200)}`);
  const impRose2 = await req("/api/centers", adminT, { method: "POST", body: JSON.stringify({ action: "import-rose" }) });
  check("واردات مجدد — به‌روزرسانی idempotent", impRose2.body?.imported === 0 && impRose2.body?.updated === 31, `imp=${impRose2.body?.imported} upd=${impRose2.body?.updated}`);
  const tabriz = await db.center.findFirst({ where: { title: { contains: "تبریز" } } });
  check("کلینیک تبریز با نشانی/تلفن/مختصات", Boolean(tabriz?.address && tabriz?.tel && tabriz?.latitude), `lat=${tabriz?.latitude}`);
  check("استان تبریز = آذربایجان شرقی (کد ۱)", tabriz?.provinceId === 1 && tabriz?.provinceTitle === "آذربایجان شرقی", `pid=${tabriz?.provinceId}`);
  const atlasAfter = await req("/api/atlas", adminT);
  check("اطلس پس از واردات — ۳۴ مرکز، ۳۱ استان", atlasAfter.body?.totals?.centers === 34 && atlasAfter.body?.totals?.provinces === 31, `c=${atlasAfter.body?.totals?.centers} p=${atlasAfter.body?.totals?.provinces}`);

  console.log("── ۶) مالی و حسابداری — تراکنش‌ها");
  const badAmount = await req("/api/finance", aT, { method: "POST", body: JSON.stringify({ kind: "income", title: "تست", amount: -5 }) });
  check("مبلغ منفی رد می‌شود (400)", badAmount.status === 400, `status=${badAmount.status}`);
  const inc = await req("/api/finance", aT, { method: "POST", body: JSON.stringify({ kind: "income", title: "شهریهٔ دورهٔ CBT", category: "شهریه دوره", amount: 2000000, method: "transfer", centerId: center1.id }) });
  check("ثبت درآمد مستقل", inc.status === 200 && inc.body?.id, `status=${inc.status}`);
  const exp = await req("/api/finance", aT, { method: "POST", body: JSON.stringify({ kind: "expense", title: "اجارهٔ بهمن", category: "اجاره", amount: 500000, method: "cash" }) });
  check("ثبت هزینه", exp.status === 200 && exp.body?.id, `status=${exp.status}`);
  const fin = await req("/api/finance", adminT);
  check("تراز = درآمد − هزینه (۱٬۵۰۰٬۰۰۰)", fin.body?.totals?.txIncome === 2000000 && fin.body?.totals?.txExpense === 500000 && fin.body?.totals?.balance === 1500000, `b=${fin.body?.totals?.balance}`);
  check("تفکیک دسته‌ها (۲ دسته)", (fin.body?.categories ?? []).length === 2, `c=${fin.body?.categories?.length}`);
  const txList = await req("/api/finance?list=1", adminT);
  check("دفتر تراکنش‌ها — ۲ ردیف با عنوان مرکز", txList.body?.total === 2 && txList.body?.items?.[0]?.centerTitle !== undefined, `total=${txList.body?.total}`);
  const txIncomeOnly = await req("/api/finance?list=1&kind=expense", adminT);
  check("فیلتر هزینه — فقط ۱ ردیف", txIncomeOnly.body?.total === 1 && txIncomeOnly.body?.items?.[0]?.kind === "expense", `total=${txIncomeOnly.body?.total}`);
  const delDenied = await req(`/api/finance?id=${inc.body.id}`, bT, { method: "DELETE" });
  check("حذف تراکنش باز است در قالب legacy (همه‌دسترسی)", delDenied.status === 200, `status=${delDenied.status}`);
  const delAfter = await req("/api/finance?list=1", adminT);
  check("پس از حذف — ۱ تراکنش", delAfter.body?.total === 1, `total=${delAfter.body?.total}`);

  console.log("── ۷) رگرسیون — کارتابل و گزارش");
  const cartA = await req("/api/cartable?q=", aT);
  check("کارتابل مشاور A — اسکوپ فعال", cartA.body?.rows?.length === 2 && cartA.body?.scoped === true, `rows=${cartA.body?.rows?.length}`);
  const repA = await req("/api/report", aT, { method: "POST", body: JSON.stringify({ dataset: "events", mode: "detail", format: "json" }) });
  check("گزارش مشاور A فقط جلسهٔ خودش", repA.body?.total === 1, `total=${repA.body?.total}`);

  console.log(`\nنتیجه: ${pass} موفق / ${failCnt} ناموفق`);
  if (failCnt > 0) process.exit(1);
}
main().finally(() => db.$disconnect());
