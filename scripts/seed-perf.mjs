// دادهٔ آزمایشی سنگین برای سنجش سرعت داشبوردها — فقط برای محیط توسعهٔ سندباکس
// اجرا: node scripts/seed-perf.mjs [dbPath]
import Database from "better-sqlite3";

const dbPath = process.argv[2] ?? "/home/z/my-project/db/custom.db";
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("synchronous = OFF");
db.pragma("foreign_keys = OFF");

const rnd = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rnd(arr.length)];

const STATUSES = ["تایید نهایی", "در انتظار پذیرش", "در انتظار تایید مدیر مرکز", "در انتظار تایید مسئول فنی", "در انتظار تایید نظارت حرفه‌ای", "در انتظار تایید ناظر استان", "رد شده", "ناتمام"];
const GENDERS = ["مرد", "زن"];

console.log("پاکسازی جداول...");
for (const t of ["Events", "Users", "Sessions", "UserRoles", "Roles", "Centers", "Services", "Marriage", "Education", "Provinces", "SMS", "Referrs", "GroupEvents", "EventReserves", "EventsEms", "Log"]) {
  db.exec(`DELETE FROM "${t}";`);
}

console.log("داده‌های پایه...");
db.exec(`
INSERT INTO Provinces (id, title) VALUES (1,'تهران'),(2,'اصفهان'),(3,'خراسان رضوی'),(4,'فارس'),(5,'آذربایجان شرقی'),(6,'البرز'),(7,'گیلان'),(8,'مازندران');
INSERT INTO Marriage (id, name) VALUES (1,'مجرد'),(2,'متاهل'),(3,'مطلق');
INSERT INTO Education (id, name) VALUES (1,'دیپلم'),(2,'کارشناسی'),(3,'کارشناسی ارشد'),(4,'دکتری'),(5,'زیر دیپلم');
INSERT INTO Roles (id, title, codeName) VALUES (1,'مدیر سامانه','admin'),(2,'مشاور','consultant'),(3,'مشتری','customer');
`);
const centers = [];
for (let i = 1; i <= 12; i++) {
  centers.push({ id: i, title: `مرکز مشاوره رز ${i}`, provinceId: (i % 8) + 1, cityTitle: "شهر مرکز" });
}
const insCenter = db.prepare("INSERT INTO Centers (id, title, isEnabled, cityId, cityTitle, provinceId, provinceTitle) VALUES (@id, @title, 1, 1, @cityTitle, @provinceId, (SELECT title FROM Provinces WHERE id = @provinceId))");
centers.forEach((c) => insCenter.run(c));

const services = [];
for (let i = 1; i <= 10; i++) {
  services.push({ id: i, name: `خدمت مشاوره‌ای شمارهٔ ${i}`, short: `خدمت ${i}` });
}
const insService = db.prepare("INSERT INTO Services (id, name, short, sohaId, weight) VALUES (@id, @name, @short, @id, 1)");
services.forEach((s) => insService.run(s));

console.log("کاربران (۲۵ هزار)...");
const N_USERS = 25000;
const insUser = db.prepare(`INSERT INTO Users (id, nid, username, passwordHash, name, family, gender, marriageId, educationId, mobile, signupDate, blocked, confirm, avatarColor)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, NULL)`);
const firstNames = ["علی", "مریم", "حسین", "زهرا", "رضا", "فاطمه", "امیر", "نرگس", "محمد", "سارا"];
const lastNames = ["احمدی", "محمدی", "کریمی", "موسوی", "حسینی", "صادقی", "رحیمی", "قاسمی"];
let usersDone = 0;
const userTx = db.transaction(() => {
  for (let i = 1; i <= N_USERS; i++) {
    const g = pick(GENDERS);
    insUser.run(
      i, 1000000000 + i, `user${i}`,
      "$scrypt$n=16384$r=8$p=1$cGFzcw==$cGFzcw==",
      pick(firstNames), pick(lastNames), g,
      1 + rnd(3), 1 + rnd(5), 9120000000 + i,
      // پخش در ۴ سال گذشته
      new Date(Date.now() - rnd(1460) * 86400000).toISOString().slice(0, 19).replace("T", " "),
    );
    usersDone++;
  }
});
userTx();
console.log(`  ${usersDone} کاربر`);

// مشاوران — کاربران ۱..۵۰۰ با نقش مشاور
console.log("مشاوران (۵۰۰)...");
db.prepare("INSERT INTO UserRoles (id, userId, roleId, roleOption, level, startDate) VALUES (1, 1, 1, 0, 0, CURRENT_TIMESTAMP)").run();
const insUR = db.prepare("INSERT INTO UserRoles (id, userId, roleId) VALUES (?, ?, 2)");
const urTx = db.transaction(() => {
  for (let i = 1; i <= 500; i++) insUR.run(i + 1, i);
});
urTx();

console.log("جلسات (۱۲۰ هزار)...");
const N_EVENTS = 120000;
const insEvent = db.prepare(`INSERT INTO Events (id, userId, nid, trackingCode, centerId, serviceId, isEms, acceptorId, acceptorFee, userTariff, centerFee, adminFee, supervisorFee, level, acceptorLevel, weight, budgetUsed, budgetReserved, status, startDate, endDate,
  centerAdminConfirmUserId, centerTechConfirmUserId, operatorConfirmUserId, provinceSupervisorConfirmUserId, supervisorConfirmUserId)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?)`);
const etx = db.transaction(() => {
  for (let i = 1; i <= N_EVENTS; i++) {
    const status = pick(STATUSES);
    const done = status === "تایید نهایی";
    const daysAgo = rnd(1460);
    const hour = 8 + rnd(12);
    const start = new Date(Date.now() - daysAgo * 86400000);
    start.setUTCHours(hour - 1, rnd(60), 0, 0);
    const end = done ? new Date(start.getTime() + 3600000) : null;
    const uid = 1 + rnd(N_USERS);
    const aid = 1 + rnd(500);
    insEvent.run(
      i, uid, 1000000000 + uid, rnd(10000), 1 + rnd(12), 1 + rnd(10),
      rnd(30) === 0 ? 1 : 0, done ? aid : 0, 100000 + rnd(500000),
      200000 + rnd(800000), 50000 + rnd(100000), 30000 + rnd(60000), 20000 + rnd(40000),
      status,
      start.toISOString().slice(0, 19).replace("T", " "),
      end ? end.toISOString().slice(0, 19).replace("T", " ") : null,
      done ? aid : null, done ? aid : null, done ? aid : null, done ? aid : null, done ? aid : null,
    );
  }
});
etx();

console.log("موارد حاد، پیامک، ارجاع، گروهی، رزرو، لاگ...");
db.exec(`
INSERT INTO EventsEms (id, eventId, severity, hadPaymentStatus, hadPaymentAmount, dateTime)
SELECT e.id, e.id, CASE WHEN e.id % 3 = 0 THEN 'بالا' WHEN e.id % 3 = 1 THEN 'متوسط' ELSE 'کم' END,
       CASE WHEN e.id % 4 = 0 THEN 'تایید شده' WHEN e.id % 4 = 1 THEN 'در انتظار بررسی' WHEN e.id % 4 = 2 THEN 'پرداخت شده' ELSE 'بدون درخواست' END,
       e.id * 1000, e.startDate
FROM Events e WHERE e.isEms = 1;
`);
const sms = db.prepare("INSERT INTO SMS (id, senderId, receiverId, number, message, status, efforts, createTime, updateTime) VALUES (?, 1, ?, ?, 'کد تایید شما', ?, 1, ?, CURRENT_TIMESTAMP)");
const stx = db.transaction(() => {
  for (let i = 1; i <= 40000; i++) {
    sms.run(i, 1 + rnd(N_USERS), 9120000000 + rnd(N_USERS), pick(["موفق", "ناموفق", "در صف"]), new Date(Date.now() - rnd(365) * 86400000).toISOString().slice(0, 19).replace("T", " "));
  }
});
stx();
const ref = db.prepare("INSERT INTO Referrs (id, refId, userId, serviceId, isReferr, provinceId, sessionsCount, status, creationDate, userName) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, 'مراجع ارجاعی')");
const rtx = db.transaction(() => {
  for (let i = 1; i <= 5000; i++) {
    ref.run(i, 500000 + i, 1 + rnd(N_USERS), 1 + rnd(10), 1 + rnd(8), 1 + rnd(6), pick(["در انتظار", "پذیرش‌شده", "ارجاع‌شده", "منقضی"]), new Date(Date.now() - rnd(730) * 86400000).toISOString().slice(0, 19).replace("T", " "));
  }
});
rtx();
const ge = db.prepare("INSERT INTO GroupEvents (id, groupId, topic, startDate, endDate, sessionNumber, status, centerId, acceptorId, userTariff, acceptorFee) VALUES (?, 1, 'جلسهٔ گروهی مهارت‌آموزی', ?, ?, ?, ?, ?, ?, ?, ?)");
const gtx = db.transaction(() => {
  for (let i = 1; i <= 3000; i++) {
    const d = new Date(Date.now() - rnd(1095) * 86400000).toISOString().slice(0, 19).replace("T", " ");
    ge.run(i, d, i % 2 ? d : null, 1 + rnd(8), "تایید نهایی", 1 + rnd(12), 1 + rnd(500), 300000 + rnd(400000), 100000 + rnd(200000));
  }
});
gtx();
const res = db.prepare("INSERT INTO EventReserves (id, eventId, userId, acceptorId, date) VALUES (?, ?, ?, ?, ?)");
const rttx = db.transaction(() => {
  for (let i = 1; i <= 8000; i++) {
    res.run(i, 1 + rnd(N_EVENTS), 1 + rnd(N_USERS), 1 + rnd(500), new Date(Date.now() + rnd(30) * 86400000).toISOString().slice(0, 19).replace("T", " "));
  }
});
rttx();
const lg = db.prepare("INSERT INTO Log (id, userId, category, description, level, ip, timestamp) VALUES (?, ?, ?, ?, ?, '127.0.0.1', ?)");
const ltx = db.transaction(() => {
  for (let i = 1; i <= 20000; i++) {
    lg.run(i, 1 + rnd(N_USERS), pick(["ورود", "جلسه", "مالی", "پیامک"]), "رویداد آزمایشی شمارهٔ " + i, 1, new Date(Date.now() - rnd(180) * 86400000).toISOString().slice(0, 19).replace("T", " "));
  }
});
ltx();
// حساب مدیر برای ورود
db.exec(`
INSERT INTO Users (id, nid, username, passwordHash, name, family, gender, mobile, signupDate, confirm, blocked)
VALUES (99999, 9999999999, 'admin', '$scrypt$n=16384$r=8$p=1$YXNkZg==$YXNkZg==', 'مدیر', 'سامانه', 'مرد', 9120000001, CURRENT_TIMESTAMP, 1, 0);
INSERT INTO UserRoles (id, userId, roleId) VALUES (999, 99999, 1);
INSERT INTO Sessions (id, token, userId, dateTime) VALUES ('testsess', 'testsess', 99999, CURRENT_TIMESTAMP);
`);

for (const [t, c] of [
  ["Events", N_EVENTS], ["Users", N_USERS], ["SMS", 40000], ["Referrs", 5000],
  ["GroupEvents", 3000], ["EventReserves", 8000], ["Log", 20000], ["EventsEms", "?"],
]) {
  const n = c === "?" ? db.prepare("SELECT COUNT(*) c FROM EventsEms").get().c : c;
  console.log(`  ${t}: ${n}`);
}
console.log("تمام شد.");
db.close();
