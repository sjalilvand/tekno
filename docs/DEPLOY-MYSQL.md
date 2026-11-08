# راهنمای استقرار سامانه راه زندگی روی MySQL واقعی (ویندوز)

این راهنما انتقال سامانه از حالت توسعه (SQLite) به **MySQL واقعی** روی سرور/سیستم ویندوزی شما را قدم‌به‌قدم توضیح می‌دهد.

---

## ۱) پیش‌نیازها

| نرم‌افزار | حداقل نسخه | نصب |
|---|---|---|
| Node.js | 18 (پیشنهادی: LTS 20+) | `winget install OpenJS.NodeJS.LTS` |
| Git | هر نسخه | `winget install Git.Git` |
| MySQL Server | 8.0 | `winget install Oracle.MySQL` یا نصب XAMPP/WAMP |

بررسی نصب بودن:

```powershell
node --version ; git --version ; mysql --version
```

## ۲) ساخت دیتابیس MySQL

```sql
CREATE DATABASE rahe_zendegi CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'rzuser'@'localhost' IDENTIFIED BY 'رمز-قوی-انتخاب-کنید';
GRANT ALL PRIVILEGES ON rahe_zendegi.* TO 'rzuser'@'localhost';
FLUSH PRIVILEGES;
```

> مجموعه‌کاراکتر `utf8mb4` برای پشتیبانی کامل از فارسی و ایموجی الزامی است.

## ۳) استقرار خودکار (روش پیشنهادی)

```powershell
# داخل پوشه‌ای که deploy.ps1 از مخزن گرفته شده (یا همین فایل از مخزن)
.\deploy.ps1 -Mode install `
  -DbEngine mysql `
  -MysqlHost localhost -MysqlPort 3306 `
  -MysqlUser rzuser -MysqlPassword "رمز-قوی-انتخاب-کنید" `
  -MysqlDatabase rahe_zendegi `
  -DataDir "D:\Projects\rahe_zendegi\data" `
  -ImportSqlite
```

این دستور به‌ترتیب انجام می‌دهد:

1. کلون (یا به‌روزرسانی) کد از GitHub در `D:\Projects\rahe_zendegi\app`
2. `npm install`
3. ساخت `.env` با `DATABASE_URL` مخصوص MySQL (نسخهٔ قبلی پشتیبان می‌شود)
4. **اتصال به MySQL واقعی:** `prisma db push --schema prisma/schema.mysql.prisma`
5. انتقال کامل پشتیبان `app.sqlite` (حدود ۱.۵ گیگابایت) به MySQL
6. **ایجاد حساب‌های مدیریتی:** `admin` / `manager` / `consultant` با رمز `123456` (اگر کاربری همنام از داده‌های قدیمی باشد، فقط رمزش بازنشانی می‌شود)
7. `next build` و اجرای سامانه روی پورت ۳۰۰۰ + بررسی سلامت

سایر حالت‌ها:

```powershell
.\deploy.ps1 -Mode update        # دریافت آخرین کد + build مجدد + اجرا
.\deploy.ps1 -Mode start|stop|restart|status
.\deploy.ps1 -Mode import        # فقط تکرار انتقال داده (با --resume از همان‌جا ادامه می‌دهد)
.\deploy.ps1 -Mode install ... -AutoStart   # اجرای خودکار پس از روشن شدن ویندوز
```

## ۴) استقرار دستی (در صورت تمایل)

```powershell
git clone https://github.com/sjalilvand/tekno.git D:\Projects\rahe_zendegi\app
cd D:\Projects\rahe_zendegi\app

# فایل .env بسازید:
# DATABASE_URL="mysql://rzuser:رمز@localhost:3306/rahe_zendegi"
# NODE_ENV="production"
# PORT="3000"

npm install
npm run db:generate:mysql    # تولید Prisma Client مخصوص MySQL
npm run db:push:mysql        # prisma db push --schema prisma/schema.mysql.prisma

npm run db:import:mysql -- --source "D:\Projects\rahe_zendegi\data\app.sqlite" --mysql "mysql://rzuser:رمز@localhost:3306/rahe_zendegi" --mode truncate --resume

npm run seed:admin           # ساخت حساب‌های admin / manager / consultant با رمز 123456

npm run build
npm run start                # http://localhost:3000
```

## ۵) اسکریپت انتقال داده (SQLite → MySQL)

نکات مهم برای پشتیبان ۱.۵ گیگابایتی:

- فایل مبدأ **فقط‌خواندنی** باز می‌شود؛ پشتیبان دست‌نخورده می‌ماند.
- ردیف‌ها در دسته‌های ۵۰۰تایی درج می‌شوند (`--batch` قابل تغییر است).
- `FOREIGN_KEY_CHECKS` حین انتقال خاموش و در پایان روشن می‌شود.
- تاریخ‌ها (میلی‌ثانیهٔ epoch در SQLite) به فرمت `DATETIME(3)` استاندارد MySQL تبدیل می‌شوند.
- وضعیت هر جدول در `import_status.json` کنار فایل مبدأ نوشته می‌شود؛ با `--resume` فقط جدول‌های ناتمام منتقل می‌شوند.
- در حالت `--mode truncate` جدول‌های MySQL قبل از درج خالی می‌شوند (برای اولین انتقال). در حالت `append` از `INSERT IGNORE` استفاده می‌شود تا رکوردهای تکراری خطا ندهند.

پیش از اجرای واقعی، می‌توانید یک اجرای آزمایشی بدون اتصال به MySQL بگیرید:

```powershell
npm run db:import:mysql -- --source "D:\...\app.sqlite" --dry-run
```

## ۶) حساب‌های ورود و رمزهای قدیمی (مهاجرت تدریجی)

- بعد از هر استقرار/انتقال داده، سه حساب مدیریتی با رمز `123456` تضمین می‌شوند: `admin`، `manager`، `consultant`. اگر کاربری با همین نام کاربری از داده‌های قدیمی وجود داشته باشد فقط رمزش بازنشانی می‌شود و بقیهٔ مشخصات دست‌نخورده می‌ماند.
- رمز کاربران قدیمی (منتقل‌شده از PHP) هم کار می‌کند: سامانه علاوه بر قالب جدید `scrypt`، هش‌های قدیمی `md5`، `sha1`، `sha256` (هگز) و متن ساده را می‌شناسد و **در اولین ورود موفق، رمز همان لحظه به قالب امن scrypt ارتقا می‌یابد** (مهاجرت تدریجی بدون هیچ تغییری برای کاربر).
- اگر سامانهٔ قدیمی PHP قالب دیگری (مثلاً md5 با نمک ثابت) استفاده می‌کرد، فقط کافیست به `verifyPassword` در `src/lib/server.ts` یک شرط اضافه شود.

## ۷) اجرای خودکار صف پیامک

پنل «یکپارچه‌سازی‌ها» → «پیامک واقعی» را پیکربندی و فعال کنید، سپس برای ارسال خودکار صف، یک وظیفه در Task Scheduler بسازید:

```powershell
$act = New-ScheduledTaskAction -Execute "powershell.exe" -Argument `
  "-Command ""Invoke-RestMethod -Method Post -Uri 'http://localhost:3000/api/integrations/run' -ContentType 'application/json' -Body '{\"\"action\"\":\"\"sms-dispatch\"\",\"\"limit\"\":200}'"""
$trg = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 2)
Register-ScheduledTask -TaskName "RZ-SmsQueue" -Action $act -Trigger $trg -Force
```

## ۸) رفع اشکال

| مشکل | راه‌حل |
|---|---|
| در مرحلهٔ «حساب‌های مدیریتی» در پرسش `Need to install … tsx` می‌ایستد | نسخهٔ ۵.۲ اسکریپت، TS را با خود Node اجرا می‌کند و دیگر نیازی به دانلود tsx ندارد. `deploy.ps1` را به‌روزرسانی کنید (یک بار دیگر اجرا کنید). در قدیم: `y` بزنید یا Ctrl+C و سپس `npm run seed:admin`. |
| در مرحلهٔ build خطای `EPERM: operation not permitted, unlink …query_engine-windows.dll.node` | نسخهٔ قدیمی سامانه هنوز در پس‌زمینه در حال اجراست و فایل Prisma را قفل کرده است. نسخهٔ ۵.۳ اسکریپت، خودش قبل از build نمونهٔ در حال اجرا را متوقف می‌کند (`Stop-App -Quiet`). برای یک‌بار دستی: `Get-Process node -ErrorAction SilentlyContinue \| Stop-Process -Force` و سپس اجرای مجدد deploy. |
| بعد از یک اجرا، `npm install` می‌گوید «removed 344 packages» | علت آن بود که `NODE_ENV=production` از اجرای قبلی در سشن PowerShell مانده بود و npm وابستگی‌های dev را حذف می‌کرد؛ نسخهٔ ۵.۲ با `--include=dev` و پاک‌سازی خودکار این را برطرف می‌کند. (این بسته‌ها برای build و انتقال داده لازم‌اند.) |
| ورود با admin/123456 نمی‌شود | `npm run seed:admin` را در پوشهٔ سامانه اجرا کنید و سرویس را ری‌استارت نکنید (لازم نیست)؛ اگر بازهم نشد، `DATABASE_URL` در `.env` را با دیتابیس فعلی مقایسه کنید. |
| MySQL در XAMPP بالا نمی‌آید (پورت 3306 اشغال است) | عادی است — سرویس `MySQL Server 8.x` ویندوز خودش روی 3306 فعال است و همان استفاده می‌شود؛ MySQL داخل XAMPP را Start نکنید. |
| `prisma db push` خطای اتصال | رمز/کاربر MySQL و فعال بودن سرویس `mysql80` را بررسی کنید؛ رمز داخل `.env` باید URL-encode باشد (مثلاً `@` → `%40`). |
| «دیتابیس وجود ندارد» | مرحلهٔ ۲ را اجرا کنید. |
| انتقال داده متوقف شد | خطا در `import_status.json` ثبت شده؛ بعد از رفع، همان دستور را با `--resume` ادامه دهید. |
| «Duplicate entry … for key …» هنگام انتقال (مثل Events/Sessions/EventHeadMap/EventNeuroFeedback/EventsEms) | دادهٔ legacy در چند ستون مقدار تکراری دارد (مثلاً صدها جلسه با کد رهگیری ۰) در حالی که اسکیما آن ستون را یکتا می‌خواست. از نسخهٔ ۵.۴ این قیدهای یکتا حذف و با ایندکس معمولی جایگزین شده‌اند؛ `-Mode import` خودش ابتدا `prisma db push` را اجرا می‌کند تا ساختار به‌روز شود و سپس انتقال با `ON DUPLICATE KEY UPDATE` به‌صورت امن و قابل اجرای مجدد انجام می‌شود. اگر با نسخهٔ قدیمی گرفتار شده‌اید: `git pull` و اجرای مجدد `-Mode import`. |
| `Duplicate foreign key constraint name '…'` هنگام db push در update | ساختار فعلی MySQL با اسکیمای جدید ناسازگار شده (Prisma هنگام گذار از قیدهای یکتای قدیمی می‌خواهد کلید خارجیِ موجود را دوباره بسازد). نسخهٔ ۵.۵ در حالت import این را خودکار حل می‌کند: push معمولی اگر شکست بخورد، ساختار با `--force-reset` از نو ساخته و وضعیت انتقال قبلی پاک می‌شود و همهٔ داده‌ها کامل از app.sqlite منتقل می‌شوند. کافی است پس از آپدیت کد، یک‌بار `.\deploy.ps1 -Mode import …` و سپس `-Mode update` اجرا کنید. |
| «Need to install the following packages: tsx…» هنگام import می‌ماند، یا مراحل جدید (db push/بازسازی) در خروجی دیده نمی‌شوند | اسکریپتی که اجرا می‌کنید (deploy.ps1 در ریشهٔ پروژه) نسخهٔ قدیمی است — رفع‌اشکال‌ها به نسخهٔ داخل `app\deploy.ps1` می‌روند. از نسخهٔ ۵.۶، حالت update خودش اجراکننده را همگام می‌کند. برای یک‌بار دستی: `Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/sjalilvand/tekno/main/deploy.ps1' -OutFile 'D:\Projects\rahe_zendegi\deploy.ps1'` و اجرای مجدد. |
| پورت ۳۰۰۰ اشغال است | `-AppPort 3001` به deploy.ps1 بدهید. |
| صفحات خالی بعد از تغییر دیتابیس | `npm run build` را دوباره اجرا کنید (client باید با اسکیمای فعال تولید شده باشد). |
| فونت/تاریخ فارسی | فونت وزیرمتن داخل پروژه است؛ تاریخ‌ها شمسی‌اند و به تنظیمات ویندوز وابسته نیستند. |
