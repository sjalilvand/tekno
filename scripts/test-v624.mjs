#!/usr/bin/env node
// =====================================================================
//  تست دود نسخهٔ ۶.۲۴ — درون‌ریزی پشتیبان mysqldump واقع‌نمایانه
//  مدل‌سازی از ساختار واقعی app2_backup (Users/Log/SMS/Sessions/Centers/
//  Messages/Groups/Helps/EventReferrs/EquipmentItems/Settings + جدول legacy)
//  با: escapeهای MySQL، تاریخ صفر، _binary، X'' ، INSERT IGNORE، INSERT بدون
//  فهرست ستون، alias جدول/ستون، پر کردن ستون NOT-NULL بی‌منبع، truncate
// =====================================================================
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const TMP = "/tmp/rz-v624-test";
const DB = path.join(TMP, "test.sqlite");
const DUMP = path.join(TMP, "dump.sql");
const REPORT = path.join(TMP, "report.json");

let passed = 0, failed = 0;
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; console.log(`  ✘ ${name} ${extra}`); }
}
const q = (db, sql, ...p) => db.prepare(sql).all(...p);
const one = (db, sql, ...p) => db.prepare(sql).get(...p);

// ---------- ۰) محیط تمیز
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
console.log("۱) ساخت دیتابیس از اسکیمای Prisma…");
const push = spawnSync("npx", ["prisma", "db", "push", "--skip-generate"], {
  cwd: ROOT,
  env: { ...process.env, DATABASE_URL: "file:" + DB },
  encoding: "utf8",
});
if (push.status !== 0) {
  console.error(push.stdout + "\n" + push.stderr);
  process.exit(1);
}

// ---------- ۱) دیتای legacy پیش از درون‌ریزی (باید truncate شود)
const pre = new DatabaseSync(DB);
pre.prepare("INSERT INTO Settings (name, value) VALUES (?, ?)").run("old-key", "old-value");
pre.prepare("INSERT INTO Settings (name, value) VALUES (?, ?)").run("تست-قدیمی", "۱۲۳");
pre.prepare(
  "INSERT INTO Users (id, nid, username, passwordHash, name, family, mobile, signupDate, blocked, checked) VALUES (?,?,?,?,?,?,?,?,?,?)"
).run(9001, 1111111111n, "legacy1", "old-hash", "قدیمی", "حذف‌شدنی", 9120000000, Date.now(), 0, 0);
pre.prepare(
  "INSERT INTO Users (id, nid, username, passwordHash, name, family, mobile, signupDate, blocked, checked) VALUES (?,?,?,?,?,?,?,?,?,?)"
).run(9002, 2222222222n, "legacy2", "old-hash2", "قدیمی۲", "حذف‌شدنی۲", 9130000000, Date.now(), 0, 0);
pre.close();
console.log("  دیتای legacy: ۲ کاربر + ۲ تنظیم — باید با truncate پاک شوند");

// ---------- ۲) ساخت پشتیبان mysqldump واقع‌نمایانه
console.log("۲) ساخت پشتیبان مصنوعی (سبک mysqldump واقعی)…");
const L = [];
// سرستیل معمول mysqldump
L.push("-- MySQL dump 10.13  Distrib 8.0.36");
L.push("-- Host: localhost    Database: rahe_zendegi");
L.push("/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;");
L.push("/*!40103 SET TIME_ZONE='+03:30' */;");
L.push("SET NAMES utf8mb4;");
L.push("SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';");
L.push("");
// Users — CREATE با KEY/ENGINE + INSERT با فهرست ستون (۲۸ ستون واقعی)
L.push("DROP TABLE IF EXISTS `Users`;");
L.push("/*!40101 SET @saved_cs_client = @@character_set_client */;");
L.push("CREATE TABLE `Users` (");
L.push("  `id` int NOT NULL AUTO_INCREMENT,");
L.push("  `NID` bigint(10) NOT NULL,");
L.push("  `DetailCode` varchar(50) DEFAULT NULL,");
L.push("  `Username` varchar(255) NOT NULL,");
L.push("  `Password` varchar(255) NOT NULL,");
L.push("  `Name` varchar(255) NOT NULL,");
L.push("  `Family` varchar(255) NOT NULL,");
L.push("  `Father` varchar(255) DEFAULT NULL,");
L.push("  `Birthday` date DEFAULT NULL,");
L.push("  `Religion` varchar(255) NOT NULL,");
L.push("  `MarriageID` int DEFAULT NULL,");
L.push("  `EducationID` int DEFAULT NULL,");
L.push("  `Mobile` bigint(11) NOT NULL,");
L.push("  `Mobile2` bigint(11) DEFAULT NULL,");
L.push("  `AreaCode` tinyint(3) DEFAULT NULL,");
L.push("  `Phone` int(8) DEFAULT NULL,");
L.push("  `Email` varchar(255) DEFAULT NULL,");
L.push("  `CountryID` int NOT NULL,");
L.push("  `ProvinceID` int NOT NULL,");
L.push("  `CityID` int NOT NULL,");
L.push("  `Address` text,");
L.push("  `ZipCode` bigint(10) DEFAULT NULL,");
L.push("  `SignupDate` datetime NOT NULL,");
L.push("  `LastLogin` datetime DEFAULT NULL,");
L.push("  `Confirm` tinyint DEFAULT NULL,");
L.push("  `Blocked` tinyint(1) NOT NULL DEFAULT '0',");
L.push("  `LastChangePass` date DEFAULT NULL,");
L.push("  `Checked` tinyint(1) NOT NULL DEFAULT '0',");
L.push("  PRIMARY KEY (`id`),");
L.push("  UNIQUE KEY `NID` (`NID`),");
L.push("  KEY `idx_users_city` (`CityID`)");
L.push(") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
L.push("LOCK TABLES `Users` WRITE;");
L.push("/*!40000 ALTER TABLE `Users` DISABLE KEYS */;");
L.push(
  "INSERT INTO `Users` (`id`,`NID`,`DetailCode`,`Username`,`Password`,`Name`,`Family`,`Father`,`Birthday`,`Religion`,`MarriageID`,`EducationID`,`Mobile`,`Mobile2`,`AreaCode`,`Phone`,`Email`,`CountryID`,`ProvinceID`,`CityID`,`Address`,`ZipCode`,`SignupDate`,`LastLogin`,`Confirm`,`Blocked`,`LastChangePass`,`Checked`) VALUES " +
  "(1,13123456789,'D-1','admin','p@ss\\'w\"1','علی','رضایی','محمد','0000-00-00','اسلام',1,2,9123456789,NULL,21,1234567,'a@b.c',1,8,113,'تهران، ولیعصر، پلاک ۱۲',1234567890,'2023-10-06 08:30:00','2024-01-15 22:10:05',1,0,'2024-02-01',1)," +
  "(2,22345678901,NULL,'manager','pass2','مریم','احمدی',NULL,'1995-03-10','شیعه',2,3,9351112223,NULL,26,NULL,NULL,1,8,113,'کرج، مهرشهر',NULL,'2024-01-02 10:00:00',NULL,0,0,NULL,0)," +
  "(3,33456789012,'D-3','consultant','x\\'y\\\\z','حسین','کریمی',NULL,NULL,NULL,NULL,NULL,9812345678,NULL,NULL,NULL,NULL,1,8,113,NULL,NULL,'2024-03-05 12:00:00',NULL,2,1,NULL,1);"
);
L.push("/*!40000 ALTER TABLE `Users` ENABLE KEYS */;");
L.push("UNLOCK TABLES;");
// Log — INSERT بدون فهرست ستون (ترتیب CREATE) + INSERT IGNORE + _binary + X'' + uid ناموجود
L.push("CREATE TABLE `Log` (");
L.push("  `id` int NOT NULL AUTO_INCREMENT,");
L.push("  `uid` int NOT NULL,");
L.push("  `Category` varchar(255) DEFAULT NULL,");
L.push("  `Description` text,");
L.push("  `Level` tinyint NOT NULL DEFAULT '1',");
L.push("  `IP` varchar(255) NOT NULL,");
L.push("  `Timestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,");
L.push("  PRIMARY KEY (`id`)");
L.push(") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
{
  const rows = [];
  for (let i = 1; i <= 40; i++) {
    rows.push(`(${i},1,'ورود','ورود موفق\\nخط ${i} از کاربر آزمایشی',1,'192.168.1.10','2024-05-01 09:00:00')`);
  }
  L.push("INSERT IGNORE INTO `Log` VALUES " + rows.join(",") + ";");
  // ردیف با معرفی‌ستِ _binary — باگ نسخهٔ قبلی: مقدار خام با نقل‌قول ذخیره می‌شد
  L.push("INSERT IGNORE INTO `Log` VALUES (41,1,'پذیرش',_binary 'plain-binary-text',2,'10.0.0.5','2024-05-02 10:30:00');");
  // X'' hex + uid ارجاع به کاربر ناموجود (FK خاموش) + id تکراری (IGNORE → شکست شمرده‌شده)
  L.push(
    "INSERT IGNORE INTO `Log` VALUES (42,5,'API',X'48656C6C6F',3,'0.0.0.0','2024-05-03 11:00:00')," +
    "(43,999999,'پذیرش','کاربر ناموجود',1,'1.2.3.4','2024-05-04 12:00:00')," +
    "(1,1,'تکراری','id تکراری — باید شمرده شود و رد شود',1,'9.9.9.9','2024-05-05 13:00:00');"
  );
}
// SMS — alias ستون SmsSender/SmsReceiver + تاریخ صفر NOT NULL
L.push("CREATE TABLE `SMS` (");
L.push("  `id` int NOT NULL AUTO_INCREMENT,");
L.push("  `SmsSender` int NOT NULL,");
L.push("  `SmsReceiver` int NOT NULL,");
L.push("  `Number` bigint(11) NOT NULL,");
L.push("  `Message` varchar(255) NOT NULL,");
L.push("  `Response` text,");
L.push("  `Efforts` int NOT NULL DEFAULT '0',");
L.push("  `UpdateTime` datetime NOT NULL,");
L.push("  `CreateTime` datetime NOT NULL,");
L.push("  PRIMARY KEY (`id`)");
L.push(") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
L.push(
  "INSERT INTO `SMS` (`id`,`SmsSender`,`SmsReceiver`,`Number`,`Message`,`Response`,`Efforts`,`UpdateTime`,`CreateTime`) VALUES " +
  "(1,1,2,'9123456789','نوبت شما ثبت شد\\nمرکز مشاوره رز','200:OK',1,'0000-00-00 00:00:00','2024-04-01 08:00:00')," +
  "(2,2,3,'9351112223','یادآوری جلسه فردا ساعت ۱۰','Sent',2,'2024-04-02 09:15:30','2024-04-02 09:00:00')," +
  "(3,1,1,'9120000000','کد تأیید: ۱۲۳۴',NULL,3,'2024-04-03 10:00:00','2024-04-03 10:00:00')," +
  "(4,3,2,'9350001111','پیام با نقل‌قول: \\'مهم\\' و بک‌اسلش \\\\','Err',1,'2024-04-04 11:00:00','2024-04-04 11:00:00');"
);
// Sessions — alias `Key` → token + id عددی در ستون TEXT + تاریخ صفر
L.push("CREATE TABLE `Sessions` (");
L.push("  `id` int NOT NULL AUTO_INCREMENT,");
L.push("  `UserID` int NOT NULL,");
L.push("  `Key` varchar(255) NOT NULL,");
L.push("  `IP` varchar(20) DEFAULT NULL,");
L.push("  `Browser` varchar(255) DEFAULT NULL,");
L.push("  `DateTime` datetime NOT NULL,");
L.push("  PRIMARY KEY (`id`)");
L.push(") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
L.push(
  "INSERT INTO `Sessions` (`id`,`UserID`,`Key`,`IP`,`Browser`,`DateTime`) VALUES " +
  "(101,1,'tok-abc-1','5.6.7.8','Chrome','2024-04-01 08:00:00')," +
  "(102,2,'tok-def-2',NULL,'Firefox','0000-00-00 00:00:00');"
);
// Centers — alias CenterTitle → title
L.push("CREATE TABLE `Centers` (");
L.push("  `id` int NOT NULL,");
L.push("  `CenterTitle` varchar(255) NOT NULL,");
L.push("  `IsEnabled` tinyint NOT NULL DEFAULT '1',");
L.push("  `Address` text,");
L.push("  `Tel` varchar(255) DEFAULT NULL,");
L.push("  `CatID` int DEFAULT NULL,");
L.push("  `CityID` int NOT NULL,");
L.push("  `CityTitle` varchar(255) NOT NULL,");
L.push("  `ProvinceID` int NOT NULL,");
L.push("  `ProvinceTitle` varchar(255) NOT NULL,");
L.push("  PRIMARY KEY (`id`)");
L.push(") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
L.push(
  "INSERT INTO `Centers` (`id`,`CenterTitle`,`IsEnabled`,`Address`,`Tel`,`CatID`,`CityID`,`CityTitle`,`ProvinceID`,`ProvinceTitle`) VALUES " +
  "(1,'کلینیک رز تهران',1,'تهران، سعادت‌آباد','021-22334455',2,113,'تهران',8,'تهران')," +
  "(2,'کلینیک رز کرج',0,'کرج، مهرشهر، فاز ۳','026-33445566',1,113,'تهران',8,'تهران');"
);
// Messages — alias FromUID/ToUID + NULL گیرنده
L.push("CREATE TABLE `Messages` (");
L.push("  `id` int NOT NULL AUTO_INCREMENT,");
L.push("  `FromUID` int NOT NULL,");
L.push("  `ToUID` int DEFAULT NULL,");
L.push("  `Subject` varchar(255) DEFAULT NULL,");
L.push("  `Text` text,");
L.push("  `FileID` int DEFAULT NULL,");
L.push("  `TargetRole` varchar(50) DEFAULT NULL,");
L.push("  `TargetProvinceID` int DEFAULT NULL,");
L.push("  `Timestamp` datetime NOT NULL,");
L.push("  `Star` tinyint(1) NOT NULL DEFAULT '0',");
L.push("  PRIMARY KEY (`id`)");
L.push(") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
L.push(
  "INSERT INTO `Messages` (`id`,`FromUID`,`ToUID`,`Subject`,`Text`,`FileID`,`TargetRole`,`TargetProvinceID`,`Timestamp`,`Star`) VALUES " +
  "(1,1,2,'جلسه فردا','لطفاً گزارش را بفرستید',NULL,NULL,NULL,'2024-06-01 09:30:00',1)," +
  "(2,2,NULL,'اطلاعیه عمومی','به همهٔ مشاوران',NULL,'consultant',8,'2024-06-02 10:00:00',0);"
);
// Groups — ستون title در dump وجود ندارد → پر شدن خودکار با ''
L.push("CREATE TABLE `Groups` (");
L.push("  `id` int NOT NULL AUTO_INCREMENT,");
L.push("  `CorporateContractID` int DEFAULT NULL,");
L.push("  `CenterID` int NOT NULL,");
L.push("  `AcceptorID` int NOT NULL,");
L.push("  `CreatorID` int DEFAULT NULL,");
L.push("  `Tel` varchar(15) DEFAULT NULL,");
L.push("  `Address` varchar(255) NOT NULL,");
L.push("  `CreateDate` datetime NOT NULL,");
L.push("  PRIMARY KEY (`id`)");
L.push(") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
L.push(
  "INSERT INTO `Groups` (`id`,`CorporateContractID`,`CenterID`,`AcceptorID`,`CreatorID`,`Tel`,`Address`,`CreateDate`) VALUES " +
  "(1,NULL,1,3,1,'021-11111111','گروه کنکور تهران','2024-02-10 08:00:00')," +
  "(2,1,2,2,1,NULL,'گروه اضطراب کرج','2024-02-11 09:00:00');"
);
// Helps — alias File_1 → fileUrl + پر شدن title
L.push("CREATE TABLE `Helps` (");
L.push("  `id` int NOT NULL AUTO_INCREMENT,");
L.push("  `RoleID` int NOT NULL,");
L.push("  `File_1` varchar(255) NOT NULL,");
L.push("  PRIMARY KEY (`id`)");
L.push(") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
L.push("INSERT INTO `Helps` (`id`,`RoleID`,`File_1`) VALUES (1,1,'/files/help/admin.pdf');");
// EventReferrs — alias جدول → EventReferral
L.push("CREATE TABLE `EventReferrs` (");
L.push("  `id` int NOT NULL AUTO_INCREMENT,");
L.push("  `EventID` int NOT NULL,");
L.push("  `FromUserID` int NOT NULL,");
L.push("  `ToUserID` int NOT NULL,");
L.push("  `Reason` text,");
L.push("  `DateTime` datetime NOT NULL,");
L.push("  PRIMARY KEY (`id`)");
L.push(") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
L.push(
  "INSERT INTO `EventReferrs` (`id`,`EventID`,`FromUserID`,`ToUserID`,`Reason`,`DateTime`) VALUES " +
  "(1,10,1,3,'ادامهٔ درمان','2024-03-01 10:00:00')," +
  "(2,11,2,3,'تخصص روان‌شناسی کودک','2024-03-02 11:30:00');"
);
// EquipmentItems — alias جدول → EquipmentItem
L.push("CREATE TABLE `EquipmentItems` (");
L.push("  `id` int NOT NULL,");
L.push("  `Title` varchar(255) NOT NULL,");
L.push("  PRIMARY KEY (`id`)");
L.push(") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
L.push("INSERT INTO `EquipmentItems` (`id`,`Title`) VALUES (1,'نقشه مغزی QEEG'),(2,'نوروفیدبک');");
// Settings — truncate دیتای legacy
L.push("CREATE TABLE `Settings` (");
L.push("  `Name` varchar(255) NOT NULL,");
L.push("  `Value` varchar(255) DEFAULT NULL,");
L.push("  PRIMARY KEY (`Name`)");
L.push(") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
L.push(
  "INSERT INTO `Settings` (`Name`,`Value`) VALUES ('site-title','مرکز مشاوره رز'),('sms-panel','کاوه‌نگار');"
);
// جدول legacy ناشناخته — باید کامل نادیده گرفته شود
L.push("CREATE TABLE `LegacyUnknown` (");
L.push("  `id` int NOT NULL AUTO_INCREMENT,");
L.push("  `Name` varchar(255) DEFAULT NULL,");
L.push("  PRIMARY KEY (`id`)");
L.push(") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
L.push("INSERT INTO `LegacyUnknown` (`id`,`Name`) VALUES (1,'الف'),(2,'ب'),(3,'ج');");
L.push("");
L.push("/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;");
fs.writeFileSync(DUMP, L.join("\n") + "\n", "utf8");
console.log(`  dump: ${(fs.statSync(DUMP).size / 1024).toFixed(1)} KB`);

// ---------- ۳) اجرای درون‌ریز
console.log("۳) اجرای درون‌ریز…");
const run = spawnSync("node", [path.join(ROOT, "scripts/import-mysqldump.mjs"), "--sql", DUMP, "--db", DB, "--report", REPORT], { cwd: ROOT, encoding: "utf8" });
console.log(run.stdout);
if (run.status !== 0) {
  console.error(run.stderr);
  console.error("  ✘ درون‌ریز با کد خروج " + run.status + " شکست خورد");
  process.exit(1);
}

// ---------- ۴) اعتبارسنجی دیتابیس
console.log("۴) اعتبارسنجی…");
const db = new DatabaseSync(DB);
const cnt = (t) => one(db, `SELECT COUNT(*) AS c FROM "${t}"`).c;

check("Users: ۳ کاربر (legacy ۹۰۰۱/۹۰۰۲ حذف شد)", cnt("Users") === 3, `→ ${cnt("Users")}`);
const u1 = one(db, `SELECT * FROM Users WHERE id=1`);
check("Users.Password → passwordHash (alias)", u1 && u1.passwordHash === "p@ss'w\"1", `→ ${JSON.stringify(u1?.passwordHash)}`);
check("Users.nid BIGINT دقیق", u1 && Number(u1.nid) === 13123456789, `→ ${u1?.nid}`);
check("Users فارسی سالم", u1 && u1.name === "علی" && u1.family === "رضایی", `→ ${u1?.name} ${u1?.family}`);
check("Users.Birthday تاریخ صفر nullable → NULL", u1 && u1.birthday === null, `→ ${u1?.birthday}`);
check("Users.SignupDate epoch تهران", u1 && u1.signupDate === 1696568400000, `→ ${u1?.signupDate}`);
check("Users.LastLogin epoch", u1 && u1.lastLogin === Date.UTC(2024, 0, 15, 18, 40, 5), `→ ${u1?.lastLogin}`);
check("Users.DetailCode legacy حذف‌شده ستون", u1 && u1.address === "تهران، ولیعصر، پلاک ۱۲");
check("Users.Blocked/Checked boolean", u1 && u1.blocked === 0 && u1.checked === 1);
const u3 = one(db, `SELECT * FROM Users WHERE id=3`);
check("Users escape \\' و \\\\ در Password", u3 && u3.passwordHash === "x'y\\z", `→ ${JSON.stringify(u3?.passwordHash)}`);

check("Log: ۴۳ درج موفق (۱ تکراری IGNORE شمرده شد)", cnt("Log") === 43, `→ ${cnt("Log")}`);
const l1 = one(db, `SELECT * FROM Log WHERE id=1`);
check("Log escape \\n → newline واقعی", l1 && l1.description.includes("\n"), `→ ${JSON.stringify(l1?.description)}`);
check("Log.uid → userId (alias)", l1 && l1.userId === 1, `→ ${l1?.userId}`);
const l41 = one(db, `SELECT * FROM Log WHERE id=41`);
check("Log _binary 'plain' → متن تمیز", l41 && String(l41.ip).includes("plain") === false && l41.description === "plain-binary-text", `→ ${JSON.stringify(l41?.description)}`);
const l42 = one(db, `SELECT * FROM Log WHERE id=42`);
check("Log X'' → bytes Hello", l42 && l42.description && Buffer.from(l42.description).equals(Buffer.from("Hello")), `→ ${JSON.stringify(l42?.description)}`);
const l43 = one(db, `SELECT * FROM Log WHERE id=43`);
check("Log uid ارجاع ناموجود با FK خاموش درج شد", !!l43);

check("SMS: ۴ پیامک", cnt("SMS") === 4, `→ ${cnt("SMS")}`);
const s1 = one(db, `SELECT * FROM SMS WHERE id=1`);
check("SMS.SmsSender → senderId (alias)", s1 && s1.senderId === 1 && s1.receiverId === 2, `→ ${s1?.senderId}/${s1?.receiverId}`);
check("SMS.UpdateTime تاریخ صفر NOT NULL → SENTINEL", s1 && s1.updateTime === -12600000, `→ ${s1?.updateTime}`);
const s4 = one(db, `SELECT * FROM SMS WHERE id=4`);
check("SMS escape‌های \\' و \\\\", s4 && s4.message.includes("'مهم'") && s4.message.includes("\\"), `→ ${JSON.stringify(s4?.message)}`);

check("Sessions: ۲ نشست", cnt("Sessions") === 2, `→ ${cnt("Sessions")}`);
const se1 = one(db, `SELECT * FROM Sessions WHERE id='101'`);
check("Sessions.Key → token (alias)", se1 && se1.token === "tok-abc-1", `→ ${JSON.stringify(se1?.token)}`);
const se2 = one(db, `SELECT * FROM Sessions WHERE id='102'`);
check("Sessions.DateTime تاریخ صفر → SENTINEL", se2 && se2.dateTime === -12600000, `→ ${se2?.dateTime}`);

check("Centers: ۲ مرکز", cnt("Centers") === 2, `→ ${cnt("Centers")}`);
const c1 = one(db, `SELECT * FROM Centers WHERE id=1`);
check("Centers.CenterTitle → title (alias)", c1 && c1.title === "کلینیک رز تهران", `→ ${JSON.stringify(c1?.title)}`);

check("Messages: ۲ پیام", cnt("Messages") === 2, `→ ${cnt("Messages")}`);
const m1 = one(db, `SELECT * FROM Messages WHERE id=1`);
check("Messages.FromUID/ToUID → fromUserId/toUserId", m1 && m1.fromUserId === 1 && m1.toUserId === 2);
const m2 = one(db, `SELECT * FROM Messages WHERE id=2`);
check("Messages NULL گیرنده و TargetRole سالم", m2 && m2.toUserId === null && m2.targetRole === "consultant");

check("Groups: ۲ گروه (title خودکار '')", cnt("Groups") === 2, `→ ${cnt("Groups")}`);
const g1 = one(db, `SELECT * FROM Groups WHERE id=1`);
check("Groups.title پرشدهٔ امن", g1 && g1.title === "" && g1.address === "گروه کنکور تهران", `→ ${JSON.stringify(g1?.title)}`);

check("Helps: ۱ راهنما", cnt("Helps") === 1, `→ ${cnt("Helps")}`);
const h1 = one(db, `SELECT * FROM Helps WHERE id=1`);
check("Helps.File_1 → fileUrl (alias)", h1 && h1.fileUrl === "/files/help/admin.pdf" && h1.title === "");

check("EventReferral (alias جدول EventReferrs): ۲", cnt("EventReferral") === 2, `→ ${cnt("EventReferral")}`);
const er1 = one(db, `SELECT * FROM EventReferral WHERE id=1`);
check("EventReferral ستون‌های ci سالم", er1 && er1.eventId === 10 && er1.fromUserId === 1 && er1.reason === "ادامهٔ درمان");

check("EquipmentItem (alias جدول EquipmentItems): ۲", cnt("EquipmentItem") === 2, `→ ${cnt("EquipmentItem")}`);

check("Settings: truncate + ۲ ردیف جدید", cnt("Settings") === 2 && !one(db, `SELECT * FROM Settings WHERE name='old-key'`), `→ ${cnt("Settings")}`);
check("جدول LegacyUnknown ساخته نشد", !one(db, `SELECT name FROM sqlite_master WHERE type='table' AND name='LegacyUnknown'`));

// گزارش JSON
const rep = JSON.parse(fs.readFileSync(REPORT, "utf8"));
check("گزارش JSON: مجموع درج ۶۵", rep.totals.inserted === 65, `→ ${rep.totals.inserted}`);
check("گزارش JSON: Log.failed=۱", rep.tables.find((t) => t.target === "Log")?.failed === 1);
check("گزارش JSON: LegacyUnknown پرش‌شده", rep.skippedTables.some((t) => t.dump === "LegacyUnknown"));
check("گزارش JSON: ستون legacy شمرده", rep.tables.some((t) => (t.skippedColumns || []).includes("Users.DetailCode")));
db.close();

// ---------- ۵) dry-run — چیزی نباید تغییر کند
console.log("۵) dry-run…");
const dbBefore = cnt2();
const dry = spawnSync("node", [path.join(ROOT, "scripts/import-mysqldump.mjs"), "--sql", DUMP, "--db", DB, "--dry-run", "--report", path.join(TMP, "dry.json")], { cwd: ROOT, encoding: "utf8" });
function cnt2() { const d = new DatabaseSync(DB); const c = one(d, "SELECT (SELECT COUNT(*) FROM Users)+(SELECT COUNT(*) FROM Log) AS c").c; d.close(); return c; }
check("dry-run: کد خروج ۰", dry.status === 0);
check("dry-run: دیتابیس دست نخورد", cnt2() === dbBefore);
const dryRep = JSON.parse(fs.readFileSync(path.join(TMP, "dry.json"), "utf8"));
check("dry-run: dryRun=true", dryRep.dryRun === true);

// ---------- پایان
console.log("");
console.log(`═══ نتیجه: ${passed} موفق / ${failed} شکست ═══`);
process.exit(failed ? 1 : 0);
