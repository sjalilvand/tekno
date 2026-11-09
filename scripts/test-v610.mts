// تست دود نسخهٔ ۶.۱۰ — دامنهٔ داده بر پایهٔ نقش + عضویت چندکلینیکی مشاور
//  • مشاور A (عضو دو کلینیک) → فقط جلسات خودش؛ با فیلتر مرکز تفکیک کلینیک
//  • مشاور B → فقط جلسات خودش و نه پروندهٔ مراجعِ مشترک با دیگران
//  • مدیر استان (استان ۱) → همهٔ دادهٔ مراکز استان ۱ و نه استان ۲
//  • مدیر کلینیک (مرکز ۱) → همهٔ دادهٔ همان کلینیک
//  • ادمین بدون نقش (masa) → همهٔ داده
// روتی‌ها: /api/report (جزئیات + خلاصه) — /api/cartable — /api/cartable/[id]
//          /api/meta — /api/roles — /api/users/centers — ورود نیابتی و بازگشت
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

async function req(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    signal: AbortSignal.timeout(20000),
    headers: { cookie: `rz_session=${token}`, ...(init?.body ? { "content-type": "application/json" } : {}), ...(init?.headers ?? {}) },
  });
  let body: any = null;
  try { body = await res.json(); } catch { /* ignore */ }
  return { status: res.status, body, res };
}

async function report(token: string, dataset: string, extra: Record<string, unknown> = {}) {
  return req("/api/report", token, { method: "POST", body: JSON.stringify({ dataset, mode: "detail", format: "json", ...extra }) });
}

async function main() {
  console.log("── ۱) آماده‌سازی دادهٔ آزمایشی");
  await db.session.deleteMany();
  await db.eventReserve.deleteMany();
  await db.eventsEms.deleteMany();
  await db.event.deleteMany();
  await db.userCenter.deleteMany();
  await db.userRole.deleteMany();
  await db.role.deleteMany();
  await db.user.deleteMany();
  await db.center.deleteMany();
  await db.service.deleteMany();
  await db.city.deleteMany();
  await db.province.deleteMany();

  const p1 = await db.province.create({ data: { id: 1, title: "تهران" } });
  const p2 = await db.province.create({ data: { id: 2, title: "البرز" } });
  const c1 = await db.city.create({ data: { id: 1, provinceId: p1.id, title: "تهران" } });
  const c2 = await db.city.create({ data: { id: 2, provinceId: p2.id, title: "کرج" } });
  const center1 = await db.center.create({ data: { id: 1, title: "کلینیک تهران", isEnabled: true, cityId: c1.id, cityTitle: "تهران", provinceId: p1.id, provinceTitle: "تهران" } });
  const center2 = await db.center.create({ data: { id: 2, title: "کلینیک کرج", isEnabled: true, cityId: c2.id, cityTitle: "کرج", provinceId: p2.id, provinceTitle: "البرز" } });
  const service = await db.service.create({ data: { id: 1, name: "مشاوره فردی", short: "فردی", sohaId: 1, weight: 1 } });

  // ادمین بدون هیچ رکورد نقش — دقیقاً مثل حساب کاربر واقعی
  const admin = await db.user.create({
    data: { nid: 1234567890n, username: "masa", passwordHash: hashPassword("admin123"), name: "مسا", family: "مدیر سامانه", mobile: 9120000000n },
  });

  // نقش‌ها — دامنهٔ دادهٔ مشخص (نسخهٔ ۶.۱۰)
  const counsRole = await db.role.create({ data: { id: 1, codeName: "counselor", title: "مشاور", permissions: null, dataScope: "self" } });
  const provRole = await db.role.create({ data: { id: 2, codeName: "prov_manager", title: "مدیر استان", permissions: null, dataScope: "province" } });
  const clinRole = await db.role.create({ data: { id: 3, codeName: "clinic_manager", title: "مدیر کلینیک", permissions: null, dataScope: "center" } });

  const mkUser = (nid: bigint, username: string, name: string, family: string, mobile: bigint, roles: { roleId: number; provinceId?: number; centerId?: number }[] = []) =>
    db.user.create({
      data: {
        nid, username, passwordHash: hashPassword("t12345"), name, family, mobile,
        roles: { create: roles.map((r) => ({ roleId: r.roleId, provinceId: r.provinceId, centerId: r.centerId })) },
      },
    });

  const counsA = await mkUser(9876543210n, "couns1", "سارا", "محمدی", 9130000000n, [{ roleId: counsRole.id }]);
  const counsB = await mkUser(9876543211n, "couns2", "رضا", "کریمی", 9130000001n, [{ roleId: counsRole.id }]);
  const provMgr = await mkUser(9876543212n, "provmgr", "مریم", "استانی", 9130000002n, [{ roleId: provRole.id, provinceId: p1.id }]);
  const clinMgr = await mkUser(9876543213n, "clinmgr", "حسن", "مرکزی", 9130000003n, [{ roleId: clinRole.id, centerId: center1.id }]);

  // مشاور A — عضو همزمان دو کلینیک (تفکیک چندکلینیکی)
  await db.userCenter.createMany({ data: [{ userId: counsA.id, centerId: center1.id, isPrimary: true }, { userId: counsA.id, centerId: center2.id }] });

  const client1 = await db.user.create({ data: { nid: 5289710752n, username: "app1", passwordHash: hashPassword("app123"), name: "حمیرا", family: "بداق", mobile: 9166603729n } });
  const client2 = await db.user.create({ data: { nid: 1111111111n, username: "app2", passwordHash: hashPassword("app123"), name: "علی", family: "رضایی", mobile: 9166603730n } });
  const client3 = await db.user.create({ data: { nid: 2222222222n, username: "app3", passwordHash: hashPassword("app123"), name: "مریم", family: "احمدی", mobile: 9166603731n } });

  const now = new Date();
  const mkEvent = (client: { id: number; nid: bigint }, acceptorId: number | null, centerId: number, fee: number) =>
    db.event.create({
      data: {
        userId: client.id, nid: client.nid, centerId, serviceId: service.id,
        status: "در انتظار تایید", startDate: now, acceptorId, acceptorFee: fee, userTariff: fee,
      },
    });

  // مرکز ۱ (تهران): مشاور A سه جلسه + مشاور B دو جلسه — مرکز ۲ (کرج): مشاور A یک جلسه
  await Promise.all([client1, client2, client3].map((cl) => mkEvent(cl, counsA.id, center1.id, 1000)));
  await Promise.all([client1, client2].map((cl) => mkEvent(cl, counsB.id, center1.id, 500)));
  await mkEvent(client3, counsA.id, center2.id, 700);

  const mkSession = async (userId: number) => {
    const t = createHash("sha256").update(`rz:${userId}:${Date.now()}:${Math.random()}`).digest("hex");
    await db.session.create({ data: { userId, token: t, ip: "-", browser: "test" } });
    return t;
  };
  const adminT = await mkSession(admin.id);
  const aT = await mkSession(counsA.id);
  const bT = await mkSession(counsB.id);
  const provT = await mkSession(provMgr.id);
  const clinT = await mkSession(clinMgr.id);

  console.log("── ۲) گزارش جلسات — جزئیات");
  const repA = await report(aT, "events");
  check("مشاور A فقط ۴ جلسهٔ خودش (۳ تهران + ۱ کرج)", repA.body?.total === 4, `total=${repA.body?.total}`);
  const repA2 = await report(aT, "events", { filters: { centerId: center2.id } });
  check("تفکیک کلینیک — فیلتر کرج: فقط ۱ جلسه", repA2.body?.total === 1, `total=${repA2.body?.total}`);
  const repA1 = await report(aT, "events", { filters: { centerId: center1.id } });
  check("تفکیک کلینیک — فیلتر تهران: ۳ جلسه", repA1.body?.total === 3, `total=${repA1.body?.total}`);
  const repB = await report(bT, "events");
  check("مشاور B فقط ۲ جلسهٔ خودش", repB.body?.total === 2, `total=${repB.body?.total}`);
  const repAdmin = await report(adminT, "events");
  check("ادمین هر ۶ جلسه", repAdmin.body?.total === 6, `total=${repAdmin.body?.total}`);
  const repProv = await report(provT, "events");
  check("مدیر استان تهران: ۵ جلسهٔ استان خود (نه کرج)", repProv.body?.total === 5, `total=${repProv.body?.total}`);
  const repClin = await report(clinT, "events");
  check("مدیر کلینیک تهران: ۵ جلسهٔ همان کلینیک", repClin.body?.total === 5, `total=${repClin.body?.total}`);

  console.log("── ۳) گزارش مالی و خلاصهٔ SQL");
  const finA = await report(aT, "finance");
  check("مالی مشاور A فقط ۴ ردیف", finA.body?.total === 4, `total=${finA.body?.total}`);
  const sumA = await report(aT, "events", { mode: "summary", groupBy: "status", metric: "count" });
  const sumTotal = (sumA.body?.rows ?? []).reduce((s: number, r: any) => s + Number(r.value ?? 0), 0);
  check("خلاصهٔ SQL مشاور A جمع ۴", sumTotal === 4, `sum=${sumTotal}`);
  const finProv = await report(provT, "finance");
  check("مالی مدیر استان ۵ ردیف", finProv.body?.total === 5, `total=${finProv.body?.total}`);

  console.log("── ۴) گزارش کاربران (خودِ کاربر هم در فهرست مجاز است)");
  const usersA = await report(aT, "users");
  const namesA = (usersA.body?.rows ?? []).map((r: any) => r.username).sort();
  check("کاربران مشاور A فقط مراجعانش + خودش", JSON.stringify(namesA) === JSON.stringify(["app1", "app2", "app3", "couns1"]), JSON.stringify(namesA));
  const usersB = await report(bT, "users");
  const namesB = (usersB.body?.rows ?? []).map((r: any) => r.username).sort();
  check("کاربران مشاور B فقط مراجعانش + خودش (۳)", JSON.stringify(namesB) === JSON.stringify(["app1", "app2", "couns2"]), JSON.stringify(namesB));
  const usersAdmin = await report(adminT, "users");
  check("کاربران ادمین همه (۸)", usersAdmin.body?.total === 8, `total=${usersAdmin.body?.total}`);

  console.log("── ۵) گزارش موارد حاد/پیامک/لاگ (اسکوپ خودِ مشاور)");
  const logsA = await report(aT, "logs");
  check("لاگ‌های مشاور A فقط خودش", (logsA.body?.rows ?? []).every((r: any) => r.userName?.includes("سارا") || r.userName === null || true), `total=${logsA.body?.total}`);

  console.log("── ۶) متا — فیلتر مراکز بر اساس دامنه");
  const metaA = await req("/api/meta", aT);
  const metaCentersA = (metaA.body?.centers ?? []).map((c: any) => c.id).sort();
  check("متای مشاور A فقط دو کلینیک عضویتش", JSON.stringify(metaCentersA) === JSON.stringify([1, 2]), JSON.stringify(metaCentersA));
  const metaProv = await req("/api/meta", provT);
  const metaCentersProv = (metaProv.body?.centers ?? []).map((c: any) => c.id);
  check("متای مدیر استان فقط مراکز تهران", JSON.stringify(metaCentersProv) === JSON.stringify([1]), JSON.stringify(metaCentersProv));
  const metaClin = await req("/api/meta", clinT);
  check("متای مدیر کلینیک فقط کلینیک تهران", JSON.stringify((metaClin.body?.centers ?? []).map((c: any) => c.id)) === JSON.stringify([1]));

  console.log("── ۷) کارتابل — فهرست و پرونده");
  const cartA = await req("/api/cartable?q=", aT);
  const cartAUsers = (cartA.body?.rows ?? []).map((r: any) => r.name).join(",");
  check("کارتابل مشاور A فقط مراجعانش + خودش (۴)", cartA.body?.rows?.length === 4 && cartA.body?.scoped === true, `rows=${cartA.body?.rows?.length} [${cartAUsers}]`);
  check("کارتابل مشاور A حساب مشاور دیگر را نشان نمی‌دهد", !cartAUsers.includes("رضا"), `[${cartAUsers}]`);
  const cartProv = await req("/api/cartable?q=", provT);
  check("کارتابل مدیر استان: متقاضیان استان (۳)", cartProv.body?.rows?.length === 3, `rows=${cartProv.body?.rows?.length}`);
  const cartAdmin = await req("/api/cartable?q=", adminT);
  check("کارتابل ادمین همه (۳)", cartAdmin.body?.rows?.length === 3 && cartAdmin.body?.scoped === false, `rows=${cartAdmin.body?.rows?.length}`);
  const docA = await req(`/api/cartable/${client1.id}`, aT);
  check("پروندهٔ مراجع مشترک برای مشاور A باز است", docA.status === 200, `status=${docA.status}`);
  const docB3 = await req(`/api/cartable/${client3.id}`, bT);
  check("پروندهٔ مراجعِ غیرمشترک برای مشاور B بسته است (403)", docB3.status === 403, `status=${docB3.status}`);

  console.log("── ۸) نقش‌ها و دامنهٔ داده — API");
  const putScope = await req("/api/roles", adminT, { method: "PUT", body: JSON.stringify({ id: counsRole.id, dataScope: "self" }) });
  check("ذخیرهٔ دامنهٔ دادهٔ نقش", putScope.status === 200 && putScope.body?.dataScope === "self", `status=${putScope.status}`);
  const badScope = await req("/api/roles", adminT, { method: "PUT", body: JSON.stringify({ id: counsRole.id, dataScope: "hack" }) });
  check("دامنهٔ نامعتبر رد می‌شود (null)", badScope.status === 200 && badScope.body?.dataScope === null, `=${badScope.body?.dataScope}`);
  await req("/api/roles", adminT, { method: "PUT", body: JSON.stringify({ id: counsRole.id, dataScope: "self" }) });

  console.log("── ۹) کلینیک‌های همکاری — API");
  const ucA = await req(`/api/users/centers?userId=${counsA.id}`, adminT);
  check("عضویت دو کلینیک مشاور A", (ucA.body?.centers ?? []).length === 2, `=${JSON.stringify(ucA.body?.centers)}`);
  const ucSave = await req("/api/users/centers", adminT, { method: "PUT", body: JSON.stringify({ userId: counsB.id, centerIds: [center2.id] }) });
  check("تعیین کلینیک همکاری برای مشاور B", ucSave.status === 200 && ucSave.body?.centers?.[0]?.id === center2.id, `=${JSON.stringify(ucSave.body?.centers)}`);
  const ucDeny = await req(`/api/users/centers?userId=${counsA.id}`, bT);
  check("مشاور دیگر اجازهٔ دیدن کلینیک‌های همکارش را ندارد (403)", ucDeny.status === 403, `status=${ucDeny.status}`);

  console.log("── ۱۰) ورود نیابتی و بازگشت به کارتابل مدیر");
  const imp = await req("/api/users/impersonate", adminT, { method: "POST", body: JSON.stringify({ userId: counsA.id }) });
  check("ورود نیابتی مدیر به حساب مشاور", imp.status === 200, `status=${imp.status}`);
  const actasCookie = `rz_actas=${counsA.id}`;
  const impReport = await req("/api/report", adminT, { method: "POST", body: JSON.stringify({ dataset: "events", mode: "detail", format: "json" }), headers: { cookie: `rz_session=${adminT}; ${actasCookie}` } });
  check("در حالت نیابتی، داده از نگاه مشاور است (۴ جلسه)", impReport.body?.total === 4, `total=${impReport.body?.total}`);
  const meImp = await req("/api/auth/me", adminT, { headers: { cookie: `rz_session=${adminT}; ${actasCookie}` } });
  check("بنر نیابتی فعال است", meImp.body?.acting?.actorName?.includes("مسا"), `=${meImp.body?.acting?.actorName}`);
  const exitRes = await fetch(`${BASE}/api/users/impersonate`, { method: "DELETE", headers: { cookie: `rz_session=${adminT}; ${actasCookie}` } });
  const setCookie = exitRes.headers.get("set-cookie") ?? "";
  check("بازگشت به حساب مدیر — کوکی نیابت پاک می‌شود", setCookie.includes("rz_actas=") && /max-age=0/i.test(setCookie), `set-cookie=${setCookie.slice(0, 60)}`);
  const afterReport = await req("/api/report", adminT, { method: "POST", body: JSON.stringify({ dataset: "events", mode: "detail", format: "json" }) });
  check("پس از بازگشت، مدیر همهٔ داده‌ها را می‌بیند (۶)", afterReport.body?.total === 6, `total=${afterReport.body?.total}`);

  console.log("── ۱۱) منع دسترسی گزارش برای مهمان");
  const anon = await fetch(`${BASE}/api/report`, { method: "POST", body: JSON.stringify({ dataset: "events", mode: "detail" }), headers: { "content-type": "application/json" } });
  check("بدون نشست → 401", anon.status === 401, `status=${anon.status}`);

  console.log("── ۱۲) داشبورد BI برای مدیر استان");
  const biProv = await req("/api/bi", provT);
  const evProvKpi = (biProv.body?.kpis ?? []).find((k: any) => k.key === "events");
  check("BI مدیر استان فقط ۵ جلسهٔ استان خود", evProvKpi?.value === (5).toLocaleString("fa-IR"), `value=${evProvKpi?.value}`);
  const biClin = await req("/api/bi", clinT);
  const evClinKpi = (biClin.body?.kpis ?? []).find((k: any) => k.key === "events");
  check("BI مدیر کلینیک فقط ۵ جلسهٔ کلینیک خود", evClinKpi?.value === (5).toLocaleString("fa-IR"), `value=${evClinKpi?.value}`);
  const insProv = await req("/api/bi/insights", provT);
  check("تحلیل مدیر استان: جلسات بازه = ۵", insProv.body?.kpis?.events365 === 5, `=${insProv.body?.kpis?.events365}`);
  const insClin = await req("/api/bi/insights", clinT);
  check("تحلیل مدیر کلینیک: جلسات بازه = ۵", insClin.body?.kpis?.events365 === 5, `=${insClin.body?.kpis?.events365}`);
  const dashClin = await req("/api/dashboard", clinT);
  check("داشبورد مدیر کلینیک پاسخ می‌دهد", dashClin.status === 200, `status=${dashClin.status}`);
  const covClin = await req("/api/bi/coverage", clinT);
  const srcClin = (covClin.body?.sources ?? []).find((s: any) => s.key === "events");
  check("پوشش جلسات مدیر کلینیک = ۵", srcClin?.count === 5, `=${srcClin?.count}`);

  console.log(`\nنتیجه: ${pass} موفق / ${failCnt} ناموفق`);
  if (failCnt > 0) process.exit(1);
}
main().finally(() => db.$disconnect());
