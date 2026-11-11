// =====================================================================
// قلاب postinstall — پاک‌سازی تاریخ‌های صفر legacy («0000-00-00»)
// ---------------------------------------------------------------------
// چرا این قلاب لازم است؟
//   deploy.ps1ی که «همین لحظه» اجرا می‌شود ممکن است نسخهٔ قدیمی باشد
//   (PowerShell کل فایل را در شروع پارس می‌کند؛ git pull نسخهٔ جدید را
//   روی دیسک می‌نویسد ولی اجرای جاری با کد قدیمی ادامه می‌یابد).
//   npm اما lifecycle اسکریپت‌ها را از package.json «تازهٔ» مخزن اجرا
//   می‌کند — پس این قلاب حتی با اجراکنندهٔ قدیمی هم فرصت اجرا پیدا می‌کند
//   و پیش از prisma db push همان اجرا، داده را تمیز می‌کند.
//
// رفتار:
//   • اگر .env نبود یا به MySQL/MariaDB اشاره نمی‌کرد → بی‌صدا خروج (0)
//   • در غیر این صورت prisma/fix-zero-dates.mjs اجرا می‌شود (خروجی شفاف)
//   • هر خطایی نادیده گرفته می‌شود — این قلاب کمکی است و هرگز نصب را
//     نمی‌شکند؛ db push در صورت نیاز مرحلهٔ جبرانی خودش را دارد (v6.16)
// =====================================================================
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let url = "";
try {
  const env = readFileSync(path.join(root, ".env"), "utf8");
  const m = env.match(/DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/);
  if (m) url = m[1].trim();
} catch {}

if (!/^(mysql|mariadb):\/\//.test(url)) process.exit(0);

try {
  const fixer = path.join(root, "prisma", "fix-zero-dates.mjs");
  const r = spawnSync(process.execPath, [fixer, "--mysql", url], { stdio: "inherit" });
  if (r.status !== 0 || r.error) {
    console.log("(پاک‌سازی خودکار تاریخ صفر کامل نشد — در صورت نیاز db push تلاش جبرانی خواهد کرد)");
  }
} catch {
  // هیچ‌وقت نصب را نمی‌شکند
}
process.exit(0);
