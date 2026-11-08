// کپی خروجی استاندارد (standalone) — جایگزین چندسکویی دستور cp -r
// این اسکریپت پس از next build اجرا می‌شود و روی ویندوز/لینوکس/macOS کار می‌کند.
import fs from "node:fs";
import path from "node:path";

function copy(src, dest) {
  if (!fs.existsSync(src)) {
    console.error(`✘ مسیر پیدا نشد: ${src}`);
    process.exit(1);
  }
  fs.cpSync(src, dest, { recursive: true, force: true });
  console.log(`✔ ${src} → ${dest}`);
}

const root = process.cwd();
const staticDir = path.join(root, ".next", "static");
const standaloneDir = path.join(root, ".next", "standalone");

if (!fs.existsSync(standaloneDir)) {
  console.error('✘ پوشهٔ .next/standalone پیدا نشد — مطمئن شوید output: "standalone" در next.config.ts فعال است');
  process.exit(1);
}

// اگر Next خروجی را nested ساخت (مثل محیط‌های monorepo با package.json در والد)،
// محتویات پوشهٔ داخلی به ریشهٔ standalone منتقل می‌شود تا مسیر اجرا همیشه ثابت بماند:
//   node .next/standalone/server.js
if (!fs.existsSync(path.join(standaloneDir, "server.js"))) {
  const nested = fs
    .readdirSync(standaloneDir)
    .find((n) => {
      const p = path.join(standaloneDir, n);
      return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, "server.js"));
    });
  if (nested) {
    fs.cpSync(path.join(standaloneDir, nested), standaloneDir, { recursive: true, force: true });
    console.log(`✔ خروجی nested از .next/standalone/${nested} به ریشه منتقل شد`);
  }
}

copy(staticDir, path.join(standaloneDir, ".next", "static"));
copy(path.join(root, "public"), path.join(standaloneDir, "public"));
console.log("✔ آمادهٔ اجرا: node .next/standalone/server.js");
