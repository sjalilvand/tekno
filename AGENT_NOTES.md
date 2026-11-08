# سامانه راه زندگی — نسخه ۶.۰

مشخصات محیط:
- Next.js 16 / TypeScript / Tailwind 4 / shadcn/ui / Prisma / Recharts
- فونت: وزیرمتن | تم: روشن و تیره | چیدمان: RTL فارسی

جدید در ۶.۰ — بازسازی BI مطابق read_mysql + BPMN + گزارش‌ساز پیشرفته:
- موتور تحلیل سرور: `src/lib/analytics.ts` (SQL خام + کش ۵ دقیقه‌ای + ماه شمسی + تفسیر خودکار)
- داشبورد توصیفی read_mysql: `src/lib/bi-build.ts` + `/api/bi` — ۸ KPI در یک کوئری، ۱۵ نمودار، خروجی CSV هر نمودار (`/api/bi/csv`)
- نمای BI پنج‌تبی: `src/views/bi.tsx` (توصیفی/تحلیلی/تفسیری/کشف خطا/پیشنهادی) — رنگ‌آمیزی غیرمسدودکننده
- گزارش‌ساز: `/api/report` با ۱۲ منبع داده + حالت خلاصه با GROUP BY داخل دیتابیس + خروجی XLSX (`src/lib/xlsx.ts` بدون وابستگی) — ۱۶ گزارش آماده (`src/lib/report-presets.ts`) در `src/views/report-builder.tsx`
- فرایندهای BPMN: `src/views/processes.tsx` + bpmn-js (ویوئر ناوبری) + ۶ نمودار در `public/bpmn/` (تولید با `scripts/gen-bpmn.mjs`)
- ⚠️ رفع باگ RTL نمودارها: helper-svg سراسری با `direction:ltr` در `src/app/layout.tsx` — بدون آن، getBBox در Chrome عرض منفی می‌دهد و لیبل‌های bpmn-js جابه‌جا می‌شوند
- اتصال پایگاه داده در برنامه: `/api/database` (GET وضعیت، POST test/save) + کارت «اتصال پایگاه داده» در تنظیمات — فقط مدیر سامانه
- ایندکس‌های سرعت روی جدول‌های پرترافیک (Users/SMS/Referrs/GroupEvents/EventsEms/Centers/EventReserves) — با `-Mode update` خودکار اعمال می‌شود

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
