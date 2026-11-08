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

copy(staticDir, path.join(standaloneDir, ".next", "static"));
copy(path.join(root, "public"), path.join(standaloneDir, "public"));
console.log("✔ آمادهٔ اجرا: node .next/standalone/server.js");
