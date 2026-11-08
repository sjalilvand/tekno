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
6. `next build` و اجرای سامانه روی پورت ۳۰۰۰ + بررسی سلامت

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

## ۶) اجرای خودکار صف پیامک

پنل «یکپارچه‌سازی‌ها» → «پیامک واقعی» را پیکربندی و فعال کنید، سپس برای ارسال خودکار صف، یک وظیفه در Task Scheduler بسازید:

```powershell
$act = New-ScheduledTaskAction -Execute "powershell.exe" -Argument `
  "-Command ""Invoke-RestMethod -Method Post -Uri 'http://localhost:3000/api/integrations/run' -ContentType 'application/json' -Body '{\"\"action\"\":\"\"sms-dispatch\"\",\"\"limit\"\":200}'"""
$trg = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 2)
Register-ScheduledTask -TaskName "RZ-SmsQueue" -Action $act -Trigger $trg -Force
```

## ۷) رفع اشکال

| مشکل | راه‌حل |
|---|---|
| `prisma db push` خطای اتصال | رمز/کاربر MySQL و فعال بودن سرویس `mysql80` را بررسی کنید؛ رمز داخل `.env` باید URL-encode باشد (مثلاً `@` → `%40`). |
| «دیتابیس وجود ندارد» | مرحلهٔ ۲ را اجرا کنید. |
| انتقال داده متوقف شد | خطا در `import_status.json` ثبت شده؛ بعد از رفع، همان دستور را با `--resume` ادامه دهید. |
| پورت ۳۰۰۰ اشغال است | `-AppPort 3001` به deploy.ps1 بدهید. |
| صفحات خالی بعد از تغییر دیتابیس | `npm run build` را دوباره اجرا کنید (client باید با اسکیمای فعال تولید شده باشد). |
| فونت/تاریخ فارسی | فونت وزیرمتن داخل پروژه است؛ تاریخ‌ها شمسی‌اند و به تنظیمات ویندوز وابسته نیستند. |
