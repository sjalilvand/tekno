// ساخت یک کاربر قدیمی با هش md5 برای آزمون ورود واقعی از طریق HTTP
import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";

const db = new PrismaClient();
const md5 = (s: string) => createHash("md5").update(s).digest("hex");

async function main() {
  await db.user.upsert({
    where: { username: "legacyuser" },
    update: { passwordHash: md5("secret123"), blocked: false },
    create: { nid: 8880000001, username: "legacyuser", passwordHash: md5("secret123"), name: "کاربر", family: "قدیمی", mobile: 8880000001 },
  });
  console.log("legacyuser ساخته شد با هش md5");
}

main().finally(() => db.$disconnect());
