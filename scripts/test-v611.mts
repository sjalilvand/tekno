// تست دود نسخهٔ ۶.۱۱ — ثبت جلسه/رزرو/انجام/مورد حاد/پرسشنامه + تعریف و ویرایش کاربر
//  • همهٔ ثبت‌ها با گارد عملیاتی (module:create) و دامنهٔ دادهٔ نقش کنترل می‌شوند
//  • مشاور فقط در کلینیک‌های عضویتش جلسه ثبت می‌کند و پذیرندهٔ جلسه خودش است
//  • متقاضی جدید همزمان با ثبت جلسه ساخته می‌شود و با رمز پیش‌فرض وارد می‌شود
//  • تعریف/ویرایش کاربر فقط مدیر؛ ویرایش محدود پروفایل توسط خود کاربر
// روتی‌ها: /api/events (+[id] complete) — /api/reserves — /api/ems — /api/forms —
//          /api/users (+[id]) — /api/cartable — /api/report — ورود نیابتی
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

async function login(username: string, password: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    signal: AbortSignal.timeout(20000),
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  let body: any = null;
  try { body = await res.json(); } catch { /* ignore */ }
  const setCookie = res.headers.get("set-cookie") ?? "";
  const m = /rz_session=([a-f0-9]+)/i.exec(setCookie);
  return { status: res.status, body, token: m?.[1] ?? null };
}

async function main() {
  console.log("── ۱) آماده‌سازی دادهٔ آزمایشی");
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

  const p1 = await db.province.create({ data: { id: 1, title: "تهران" } });
  const p2 = await db.province.create({ data: { id: 2, title: "البرز" } });
  const c1 = await db.city.create({ data: { id: 1, provinceId: p1.id, title: "تهران" } });
  const c2 = await db.city.create({ data: { id: 2, provinceId: p2.id, title: "کرج" } });
  const center1 = await db.center.create({ data: { id: 1, title: "کلینیک تهران", isEnabled: true, cityId: c1.id, cityTitle: "تهران", provinceId: p1.id, provinceTitle: "تهران" } });
  const center2 = await db.center.create({ data: { id: 2, title: "کلینیک کرج", isEnabled: true, cityId: c2.id, cityTitle: "کرج", provinceId: p2.id, provinceTitle: "البرز" } });
  const center3 = await db.center.create({ data: { id: 3, title: "کلینیک قزوین", isEnabled: true, cityId: c2.id, cityTitle: "کرج", provinceId: p2.id, provinceTitle: "البرز" } });
  const service = await db.service.create({ data: { id: 1, name: "مشاوره فردی", short: "فردی", sohaId: 1, weight: 1 } });

  // ادمین بدون هیچ رکورد نقش — دقیقاً مثل حساب کاربر واقعی
  const admin = await db.user.create({
    data: { nid: 1234567890n, username: "masa", passwordHash: hashPassword("admin123"), name: "مسا", family: "مدیر سامانه", mobile: 9120000000n },
  });

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

  // مشاور A — عضو همزمان دو کلینیک
  await db.userCenter.createMany({ data: [{ userId: counsA.id, centerId: center1.id, isPrimary: true }, { userId: counsA.id, centerId: center2.id }] });

  const client1 = await db.user.create({ data: { nid: 5289710752n, username: "app1", passwordHash: hashPassword("app123"), name: "حمیرا", family: "بداق", mobile: 9166603729n } });
  const client2 = await db.user.create({ data: { nid: 1111111111n, username: "app2", passwordHash: hashPassword("app123"), name: "علی", family: "رضایی", mobile: 9166603730n } });

  const now = new Date();
  const mkEvent = (client: { id: number; nid: bigint }, acceptorId: number | null, centerId: number, fee: number) =>
    db.event.create({
      data: {
        userId: client.id, nid: client.nid, centerId, serviceId: service.id,
        status: "در انتظار پذیرش", startDate: now, acceptorId, acceptorFee: fee, userTariff: fee,
      },
    });

  await Promise.all([client1, client2].map((cl) => mkEvent(cl, counsA.id, center1.id, 1000)));
  await mkEvent(client1, counsB.id, center1.id, 500);

  const mkSession = async (userId: number) => {
    const t = createHash("sha256").update(`rz:${userId}:${Date.now()}:${Math.random()}`).digest("hex");
    await db.session.create({ data: { userId, token: t, ip: "-", browser: "test" } });
    return t;
  };
  const adminT = await mkSession(admin.id);
  const aT = await mkSession(counsA.id);
  const bT = await mkSession(counsB.id);

  console.log("── ۲) رگرسیون ۶.۱۰ — دامنهٔ داده");
  const repA = await req("/api/report", aT, { method: "POST", body: JSON.stringify({ dataset: "events", mode: "detail", format: "json" }) });
  check("مشاور A فقط ۲ جلسهٔ خودش", repA.body?.total === 2, `total=${repA.body?.total}`);
  const cartA = await req("/api/cartable?q=", aT);
  check("کارتابل مشاور A فقط مراجعانش + خودش (۳)", cartA.body?.rows?.length === 3 && cartA.body?.scoped === true, `rows=${cartA.body?.rows?.length}`);

  console.log("── ۳) ثبت جلسه جدید — POST /api/events");
  const newEv = await req("/api/events", aT, {
    method: "POST",
    body: JSON.stringify({ userId: client1.id, serviceId: service.id, centerId: center1.id, startDate: new Date().toISOString(), time: "15:30", topic: "اضطراب اجتماعی", userTariff: 850000, description: "جلسهٔ اول ارزیابی" }),
  });
  check("ثبت جلسه برای مراجع موجود", newEv.status === 200 && newEv.body?.event?.id, `status=${newEv.status} ${JSON.stringify(newEv.body)}`);
  const newEvRow = newEv.body?.event?.id ? await db.event.findUnique({ where: { id: newEv.body.event.id } }) : null;
  check("پذیرندهٔ جلسه = مشاورِ ثبت‌کننده", newEvRow?.acceptorId === counsA.id, `acceptor=${newEvRow?.acceptorId}`);
  check("کد رهگیری تولید شد", (newEvRow?.trackingCode ?? 0) > 0, `tc=${newEvRow?.trackingCode}`);

  const outScope = await req("/api/events", aT, {
    method: "POST",
    body: JSON.stringify({ userId: client1.id, serviceId: service.id, centerId: center3.id, topic: "خارج از محدوده" }),
  });
  check("ثبت جلسه در کلینیک خارج از عضویت رد می‌شود (403)", outScope.status === 403, `status=${outScope.status}`);

  const forcedAcceptor = await req("/api/events", aT, {
    method: "POST",
    body: JSON.stringify({ userId: client2.id, serviceId: service.id, centerId: center2.id, acceptorId: counsB.id }),
  });
  const forcedRow = forcedAcceptor.body?.event?.id ? await db.event.findUnique({ where: { id: forcedAcceptor.body.event.id } }) : null;
  check("مشاور نمی‌تواند پذیرندهٔ دیگری تعیین کند", forcedRow?.acceptorId === counsA.id, `acceptor=${forcedRow?.acceptorId}`);

  console.log("── ۴) ثبت جلسه با متقاضی جدید");
  const newClientNid = "3344556677";
  const withNew = await req("/api/events", aT, {
    method: "POST",
    body: JSON.stringify({
      newClient: { nid: newClientNid, name: "نیما", family: "بهمنی", mobile: "09123334444", gender: "مرد" },
      serviceId: service.id, centerId: center1.id, topic: "مشاورهٔ اولیه",
    }),
  });
  check("ثبت جلسه با ساخت متقاضی جدید", withNew.status === 200 && withNew.body?.client?.id, `status=${withNew.status}`);
  const createdClient = withNew.body?.client?.id ? await db.user.findUnique({ where: { id: withNew.body.client.id } }) : null;
  check("متقاضی جدید با کد ملی و نام کاربری یکتا ساخته شد", createdClient?.nid === BigInt(newClientNid) && createdClient?.username === newClientNid, `username=${createdClient?.username}`);
  const dupClient = await req("/api/events", aT, {
    method: "POST",
    body: JSON.stringify({ newClient: { nid: newClientNid, name: "نیما", family: "بهمنی", mobile: "09123334444" }, serviceId: service.id, centerId: center1.id }),
  });
  check("کد ملی تکراری — از پروندهٔ موجود استفاده می‌شود (بدون دوباره‌سازی)", dupClient.status === 200 && dupClient.body?.client?.id === createdClient?.id, `status=${dupClient.status}`);

  const loginNew = await login(newClientNid, "123456");
  check("ورود متقاضی جدید با کد ملی و رمز پیش‌فرض", loginNew.status === 200 && loginNew.token, `status=${loginNew.status}`);

  console.log("── ۵) ثبت انجام جلسه — action=complete");
  const completeByOther = await req(`/api/events/${newEv.body.event.id}`, bT, { method: "POST", body: JSON.stringify({ action: "complete", comment: "تلاش مشاور دیگر" }) });
  check("مشاور دیگر نمی‌تواند جلسهٔ غیرخودی را «انجام شده» کند (403)", completeByOther.status === 403, `status=${completeByOther.status}`);
  const complete = await req(`/api/events/${newEv.body.event.id}`, aT, { method: "POST", body: JSON.stringify({ action: "complete", comment: "جلسه با تمرین تن‌آرامی برگزار شد" }) });
  check("ثبت انجام جلسه توسط مشاور", complete.status === 200, `status=${complete.status}`);
  const doneRow = await db.event.findUnique({ where: { id: newEv.body.event.id } });
  check("وضعیت پس از ثبت انجام = در انتظار تایید مدیر مرکز", doneRow?.status === "در انتظار تایید مدیر مرکز", `status=${doneRow?.status}`);
  check("تاریخ پایان ثبت شد", Boolean(doneRow?.endDate));
  const noteCount = await db.eventComment.count({ where: { eventId: newEv.body.event.id } });
  check("یادداشت انجام جلسه ثبت شد", noteCount === 1, `=${noteCount}`);

  console.log("── ۶) ثبت رزرو — POST /api/reserves");
  const reserve = await req("/api/reserves", aT, {
    method: "POST",
    body: JSON.stringify({ eventId: newEv.body.event.id, date: new Date(Date.now() + 86400000).toISOString(), time: "17:45" }),
  });
  check("ثبت رزرو برای جلسهٔ خود", reserve.status === 200 && reserve.body?.reserve?.id, `status=${reserve.status}`);
  const reserveRow = reserve.body?.reserve?.id ? await db.eventReserve.findUnique({ where: { id: reserve.body.reserve.id } }) : null;
  check("ساعت رزرو اعمال شد (17:45)", reserveRow?.date && new Date(reserveRow.date).getUTCHours() === 17, `=${reserveRow?.date}`);
  const reserveDenied = await req("/api/reserves", bT, {
    method: "POST",
    body: JSON.stringify({ eventId: newEv.body.event.id, date: new Date().toISOString() }),
  });
  check("رزرو جلسهٔ خارج از دامنه رد می‌شود (403)", reserveDenied.status === 403, `status=${reserveDenied.status}`);

  console.log("── ۷) ثبت مورد حاد — POST /api/ems");
  const emsDenied = await req("/api/ems", bT, {
    method: "POST",
    body: JSON.stringify({ eventId: newEv.body.event.id, severity: "بالا", emsType: ["خودکشی"] }),
  });
  check("ثبت مورد حاد برای جلسهٔ خارج از دامنه رد می‌شود (403)", emsDenied.status === 403, `status=${emsDenied.status}`);
  const ems = await req("/api/ems", aT, {
    method: "POST",
    body: JSON.stringify({
      eventId: newEv.body.event.id, severity: "بالا",
      emsType: ["بحران روانی حاد"], suicidalFrom: ["افسردگی شدید", "شکست عاطفی"],
      protectiveFactors: ["حمایت خانواده"], suggestedActions: ["ارجاع فوری به روانپزشک"],
      actionsTaken: "تماس اضطراری با خانواده و ارجاع فوری", financialAssistanceRequest: true,
    }),
  });
  check("ثبت مورد حاد با فهرست‌ها", ems.status === 200 && ems.body?.ems?.id, `status=${ems.status}`);
  const emsRow = ems.body?.ems?.id ? await db.eventsEms.findUnique({ where: { id: ems.body.ems.id } }) : null;
  check("شدت «بالا» ذخیره شد", emsRow?.severity === "بالا", `=${emsRow?.severity}`);
  check("عوامل خطر به‌صورت JSON ذخیره شد", JSON.parse(emsRow?.suicidalFrom ?? "[]").length === 2, `=${emsRow?.suicidalFrom}`);
  check("درخواست کمک‌هزینه = در انتظار بررسی", emsRow?.hadPaymentStatus === "در انتظار بررسی", `=${emsRow?.hadPaymentStatus}`);
  const evAfterEms = await db.event.findUnique({ where: { id: newEv.body.event.id }, select: { isEms: true } });
  check("جلسه «مورد حاد» علامت خورد", evAfterEms?.isEms === true, `isEms=${evAfterEms?.isEms}`);
  const emsListA = await req("/api/ems?q=", aT);
  check("فهرست موارد حاد مشاور A فقط مورد خودش (۱)", emsListA.body?.total === 1, `total=${emsListA.body?.total}`);
  const emsListB = await req("/api/ems?q=", bT);
  check("فهرست موارد حاد مشاور B خالی", emsListB.body?.total === 0, `total=${emsListB.body?.total}`);

  console.log("── ۸) پرسشنامه — تعریف و ثبت پاسخ");
  const mkForm = await req("/api/forms", adminT, {
    method: "POST",
    body: JSON.stringify({ title: "پرسشنامهٔ اضطراب بک", fields: [{ key: "score", label: "نمرهٔ اضطراب", type: "number", required: true }, { key: "mood", label: "خلق غالب", type: "select", options: ["خوب", "متوسط", "بد"], required: true }] }),
  });
  check("تعریف پرسشنامه", mkForm.status === 200 && mkForm.body?.id, `status=${mkForm.status}`);
  const submitQ = await req(`/api/forms/${mkForm.body.id}/submit`, aT, {
    method: "POST",
    body: JSON.stringify({ data: { score: "18", mood: "بد" }, userId: client1.id, eventId: newEv.body.event.id }),
  });
  check("ثبت پاسخ پرسشنامه برای مراجع", submitQ.status === 200 && submitQ.body?.id, `status=${submitQ.status}`);
  const badSubmit = await req(`/api/forms/${mkForm.body.id}/submit`, aT, { method: "POST", body: JSON.stringify({ data: { mood: "بد" } }) });
  check("فیلد اجباری خالی رد می‌شود", badSubmit.status === 400, `status=${badSubmit.status}`);

  console.log("── ۹) پروندهٔ کارتابل پس از ثبت‌ها");
  const docA = await req(`/api/cartable/${client1.id}`, aT);
  check("پروندهٔ مراجع شامل جلسهٔ تازه است", docA.status === 200 && docA.body?.stats?.sessions === 2, `sessions=${docA.body?.stats?.sessions}`);
  check("پرونده شامل مورد حاد است", docA.body?.stats?.acute === 1, `acute=${docA.body?.stats?.acute}`);
  check("پرونده شامل پرسشنامهٔ ثبت‌شده است", (docA.body?.questionnaires ?? []).length === 1, `questionnaires=${docA.body?.questionnaires?.length}`);
  const kinds = (docA.body?.timeline ?? []).map((t: any) => t.kind);
  check("خط زمانی شامل رزرو و مورد حاد و پرسشنامه/یادداشت است", kinds.includes("رزرو") && kinds.includes("مورد حاد"), `kinds=${[...new Set(kinds)].join("،")}`);

  console.log("── ۱۰) تعریف کاربر — POST /api/users (فقط مدیر)");
  const newUserByCouns = await req("/api/users", aT, {
    method: "POST",
    body: JSON.stringify({ nid: "4455667788", name: "تست", family: "مشاور", mobile: "09121112222" }),
  });
  check("مشاور اجازهٔ تعریف کاربر ندارد (403)", newUserByCouns.status === 403, `status=${newUserByCouns.status}`);
  const newUser = await req("/api/users", adminT, {
    method: "POST",
    body: JSON.stringify({ nid: "4455667788", name: "فاطمه", family: "کارشناس", mobile: "09121112222", gender: "زن", roleId: clinRole.id, centerIds: [center1.id], password: "pass1234" }),
  });
  check("تعریف کاربر با نقش مدیر کلینیک", newUser.status === 200 && newUser.body?.user?.id, `status=${newUser.status}`);
  const dupNid = await req("/api/users", adminT, { method: "POST", body: JSON.stringify({ nid: "4455667788", name: "دوباره", family: "تکراری", mobile: "09121112223" }) });
  check("کد ملی تکراری رد می‌شود", dupNid.status === 400, `status=${dupNid.status}`);
  const newUserId = newUser.body?.user?.id;
  const newUrow = newUserId ? await db.user.findUnique({ where: { id: newUserId }, include: { roles: true, centerLinks: true } }) : null;
  check("نقش و عضویت کلینیک کاربر جدید ذخیره شد", newUrow?.roles?.length === 1 && newUrow?.centerLinks?.length === 1, `roles=${newUrow?.roles?.length} centers=${newUrow?.centerLinks?.length}`);
  const loginNewUser = await login("4455667788", "pass1234");
  check("ورود کاربر جدید با رمز تعیین‌شده", loginNewUser.status === 200 && loginNewUser.token, `status=${loginNewUser.status}`);

  console.log("── ۱۱) ویرایش کاربر — PATCH /api/users/[id]");
  const editByOther = await req(`/api/users/${client2.id}`, bT, { method: "PATCH", body: JSON.stringify({ name: "هک" }) });
  check("مشاور اجازهٔ ویرایش کاربر دیگر را ندارد (403)", editByOther.status === 403, `status=${editByOther.status}`);
  const selfEdit = await req(`/api/users/${counsA.id}`, aT, { method: "PATCH", body: JSON.stringify({ bio: "مشاور بالین با ۵ سال سابقه" }) });
  check("کاربر می‌تواند پروفایل خودش را ویرایش کند", selfEdit.status === 200, `status=${selfEdit.status}`);
  const editUser = await req(`/api/users/${newUserId}`, adminT, {
    method: "PATCH",
    body: JSON.stringify({ name: "فاطمهٔ ویرایش‌شده", mobile: "09121119999", password: "newpass99", roleId: counsRole.id, centerIds: [center1.id, center2.id] }),
  });
  check("ویرایش کامل کاربر توسط مدیر", editUser.status === 200, `status=${editUser.status}`);
  const editedRow = await db.user.findUnique({ where: { id: newUserId }, include: { roles: true, centerLinks: true } });
  check("نام و موبایل ویرایش شد", editedRow?.name === "فاطمهٔ ویرایش‌شده" && editedRow?.mobile === BigInt(9121119999), `mobile=${editedRow?.mobile}`);
  check("نقش جایگزین شد (مدیر کلینیک ← مشاور)", editedRow?.roles?.[0]?.roleId === counsRole.id, `role=${editedRow?.roles?.[0]?.roleId}`);
  check("عضویت دو کلینیک جایگزین شد", editedRow?.centerLinks?.length === 2, `centers=${editedRow?.centerLinks?.length}`);
  const loginChanged = await login("4455667788", "newpass99");
  check("ورود با رمز جدید", loginChanged.status === 200, `status=${loginChanged.status}`);
  const loginOld = await login("4455667788", "pass1234");
  check("رمز قبلی دیگر کار نمی‌کند", loginOld.status === 401, `status=${loginOld.status}`);

  console.log("── ۱۲) ورود نیابتی — دکمهٔ بازگشت به حساب مدیر");
  const imp = await req("/api/users/impersonate", adminT, { method: "POST", body: JSON.stringify({ userId: counsA.id }) });
  check("ورود نیابتی مدیر به حساب مشاور", imp.status === 200, `status=${imp.status}`);
  const actasCookie = `rz_actas=${counsA.id}`;
  const meImp = await req("/api/auth/me", adminT, { headers: { cookie: `rz_session=${adminT}; ${actasCookie}` } });
  check("در حالت نیابتی — acting فعال است", meImp.body?.acting?.actorName?.includes("مسا"), `=${meImp.body?.acting?.actorName}`);
  const exitRes = await fetch(`${BASE}/api/users/impersonate`, { method: "DELETE", headers: { cookie: `rz_session=${adminT}; ${actasCookie}` } });
  const setCookie = exitRes.headers.get("set-cookie") ?? "";
  check("بازگشت به حساب مدیر — کوکی نیابت پاک می‌شود", setCookie.includes("rz_actas=") && /max-age=0/i.test(setCookie), `set-cookie=${setCookie.slice(0, 60)}`);

  console.log("── ۱۳) رزرو و جلسات — فهرست‌ها در محدوده");
  const resA = await req("/api/reserves?q=", aT);
  check("رزروهای مشاور A فقط خودش (۱)", resA.body?.total === 1, `total=${resA.body?.total}`);
  const evA = await req("/api/events?pageSize=50", aT);
  check("جلسات مشاور A شامل ثبت‌های جدید (۶)", evA.body?.total === 6, `total=${evA.body?.total}`);

  console.log(`\nنتیجه: ${pass} موفق / ${failCnt} ناموفق`);
  if (failCnt > 0) process.exit(1);
}
main().finally(() => db.$disconnect());
