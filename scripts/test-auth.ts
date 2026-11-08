// آزمودن منطق احراز هویت: هش جدید scrypt + هش‌های قدیمی PHP + ارتقای خودکار
import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";
import { verifyPassword, isLegacyHash, isScryptHash, hashPassword } from "../src/lib/server";

const db = new PrismaClient();
let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "✔" : "✘"} ${name}`);
  if (!cond) failures++;
}

async function main() {
  const md5 = (s: string) => createHash("md5").update(s).digest("hex");
  const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");

  // --- ۱) کاربر قدیمی با md5 (شبیه داده‌های منتقل‌شده از PHP) ---
  const legacy = await db.user.create({
    data: {
      nid: 8880000001, username: "legacyuser", passwordHash: md5("secret123"),
      name: "کاربر", family: "قدیمی", mobile: 8880000001,
    },
  });
  check("هش md5 قدیمی شناسایی می‌شود (isLegacyHash)", isLegacyHash(legacy.passwordHash));
  check("رمز درست با md5 قدیمی تأیید می‌شود", verifyPassword("secret123", legacy.passwordHash));
  check("رمز غلط با md5 قدیمی رد می‌شود", !verifyPassword("wrong", legacy.passwordHash));
  check("رمز درست با sha1 قدیمی تأیید می‌شود", verifyPassword("secret123", sha1("secret123")));
  check("رمز درست با متن ساده تأیید می‌شود", verifyPassword("secret123", "secret123"));
  check("رشتهٔ خالی رد می‌شود", !verifyPassword("secret123", ""));
  check("null رد می‌شود", !verifyPassword("secret123", null as any));

  // --- ۲) ارتقای خودکار (همان منطق login route) ---
  if (isLegacyHash(legacy.passwordHash)) {
    await db.user.update({
      where: { id: legacy.id },
      data: { passwordHash: hashPassword("secret123") },
    });
  }
  const upgraded = await db.user.findUniqueOrThrow({ where: { id: legacy.id } });
  check("بعد از ارتقا، قالب scrypt است", isScryptHash(upgraded.passwordHash));
  check("بعد از ارتقا، رمز قبلی هنوز کار می‌کند", verifyPassword("secret123", upgraded.passwordHash));
  check("بعد از ارتقا، قدیمی دیگر legacy نیست", !isLegacyHash(upgraded.passwordHash));

  // --- ۳) حساب‌های seed شده: همان کوئری login ---
  const user = await db.user.findFirst({
    where: { OR: [{ username: "admin" }, { nid: { equals: Number("admin") || -1 } }] },
    include: { roles: { include: { role: true } } },
  });
  check("کاربر admin با کوئری login پیدا می‌شود", Boolean(user));
  check("رمز 123456 برای admin تأیید می‌شود", verifyPassword("123456", user!.passwordHash));
  check("admin نقش «مدیر سامانه» دارد", user!.roles.some((r) => r.role.title.includes("مدیر سامانه")));
  check("admin مسدود نیست", !user!.blocked);

  const mgr = await db.user.findFirst({ where: { OR: [{ username: "manager" }, { nid: { equals: Number("manager") || -1 } }] } });
  check("کاربر manager پیدا می‌شود و رمز درست است", Boolean(mgr) && verifyPassword("123456", mgr!.passwordHash));
  const cons = await db.user.findFirst({ where: { OR: [{ username: "consultant" }, { nid: { equals: Number("consultant") || -1 } }] } });
  check("کاربر consultant پیدا می‌شود و رمز درست است", Boolean(cons) && verifyPassword("123456", cons!.passwordHash));

  // کاربر غایب → null (پیام 401)
  const none = await db.user.findFirst({ where: { OR: [{ username: "nobody" }, { nid: { equals: Number("nobody") || -1 } }] } });
  check("کاربر ناشناس پیدا نمی‌شود (401)", none === null);

  await db.user.delete({ where: { id: legacy.id } });
  console.log(failures === 0 ? "\nهمهٔ آزمون‌ها سبز بود ✅" : `\n${failures} آزمون قرمز ❌`);
  process.exit(failures === 0 ? 0 : 1);
}

main().finally(() => db.$disconnect());
