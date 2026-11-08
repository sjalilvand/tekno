# سامانه راه زندگی — نسخه ۵.۱

مشخصات محیط:
- Next.js 16 / TypeScript / Tailwind 4 / shadcn/ui / Prisma / Recharts
- فونت: وزیرمتن | تم: روشن و تیره | چیدمان: RTL فارسی

جدید در ۵.۱:
- پنل «یکپارچه‌سازی‌ها» (`src/views/integrations.tsx` + `src/app/api/integrations/`)
- پیامک واقعی: `src/lib/sms/` (کاوه‌نگار، SMS.ir، ملی پیامک، پنل سها، شبیه‌ساز) — صف جدول SMS
- وب‌سرویس سها: `src/lib/soha/` — کلاینت + همگام‌سازی بیماران/ارجاعات با cursor و SyncLogs
- انتقال داده SQLite→MySQL: `prisma/import-sqlite-to-mysql.mts` (دسته‌ای، resume، وضعیت در import_status.json)
- استقرار ویندوز: `deploy.ps1` (install/update/start/stop/restart/status/import + -AutoStart)
- اسکریپت‌های npm: db:push:mysql / db:generate:mysql / db:import:mysql / seed
- build چندسکویی: `scripts/copy-standalone.mjs` (جایگزین cp -r) و start با node

ورود نمونه:
- مدیر سیستم: admin / 123456
- سایر کاربران: کد ملی / 123456

اجرای داده نمونه: `bun prisma/seed.ts` یا `npm run seed`
استقرار MySQL: `prisma db push --schema prisma/schema.mysql.prisma`
انتقال پشتیبان: `npm run db:import:mysql -- --source <path> --mysql <url> --mode truncate --resume`
