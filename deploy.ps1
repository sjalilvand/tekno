# =====================================================================
#  مرکز مشاوره رز (سامانه راه زندگی) — استقرار خودکار روی ویندوز (نسخه ۶.۱۵)
#  تغییرات ۶.۱۵: رفع شکست «prisma db push» روی دیتابیس legacy —
#  پاک‌سازی خودکار تاریخ‌های صفر («0000-00-00») قبل از db push و بعد از انتقال +
#  درون‌ریز: تاریخ نامعتبر legacy → NULL (به‌جای شکست درج) + تلاش ردیف‌به‌ردیف
#  در شکست دسته‌های ۵۰۰تایی تا یک ردیف خراب بقیهٔ جدول را نیندازد
#  تغییرات ۶.۲: وب‌سرویس‌ساز (REST API با JSON/XML/CSV + کلید API) + به‌روزرسانی
#  داده با پشتیبان جدید (صف ImportJob با پایش پیشرفت) + جداول WebServices/ImportJobs
#  + داشبورد اصلی: شاخص‌های کلیدی با تفسیر + امتیاز سلامت داده
#  تغییرات ۵.۷: حالت import ابتدا کد مخزن را از GitHub به‌روزرسانی می‌کند
#  (دیگر هیچ‌وقت با deploy.ps1/importer قدیمی اجرا نمی‌شود) + تست واقعی
#  بارگذاری better-sqlite3/mysql2 با require (نه فقط وجود پوشهٔ ناقص) +
#  اجرای npm install همیشه داخل پوشهٔ سامانه + اسکریپت‌های .mts بدون هشدار node
#  تغییرات ۵.۶: همگام‌سازی خودکار deploy.ps1 اجراکننده با نسخهٔ مخزن +
#  بازگردانی خودکار وابستگی‌های انتقال داده (better-sqlite3/mysql2) قبل از import
#  تغییرات ۵.۳: توقف نمونهٔ در حال اجرا «قبل از build» — رفع خطای
#  EPERM: unlink query_engine-windows.dll.node (قفل فایل توسط اجرای قبلی)
#  تغییرات ۵.۲: اجرای اسکریپت‌های TS با خود Node (بدون دانلود tsx)،
#  جلوگیری از حذف وابستگی‌های dev توسط npm (نشتی NODE_ENV) و --include=dev
# ---------------------------------------------------------------------
#  این اسکریپت سامانه را از GitHub می‌گیرد، وابستگی‌ها را نصب می‌کند،
#  دیتابیس MySQL واقعی را آماده می‌کند (prisma db push --schema prisma/schema.mysql.prisma)
#  و در صورت وجود پشتیبان SQLite (app.sqlite) داده‌ها را به MySQL منتقل می‌کند.
#
#  نمونهٔ اجرا (PowerShell):
#    .\deploy.ps1 -Mode install -DbEngine mysql -DataDir "D:\Projects\rahe_zendegi\data"
#
#  حالت‌ها:  install | update | start | stop | restart | status | import
# =====================================================================
param(
  [ValidateSet("install", "update", "start", "stop", "restart", "status", "import")]
  [string]$Mode = "install",

  [string]$InstallDir = "D:\Projects\rahe_zendegi\app",
  [string]$DataDir    = "D:\Projects\rahe_zendegi\data",
  [string]$RepoUrl    = "https://github.com/sjalilvand/tekno.git",
  [string]$Branch     = "main",

  # توکن GitHub برای دریافت کد — اگر ست شود، آدرس origin به‌روز می‌شود
  # (توکن قبلی باطل شده است؛ بدون توکن معتبر، به‌روزرسانی از GitHub انجام نمی‌شود)
  [string]$GithubToken = "",

  # mysql | sqlite
  [ValidateSet("mysql", "sqlite")]
  [string]$DbEngine = "mysql",

  [string]$MysqlHost = "localhost",
  [int]$MysqlPort    = 3306,
  [string]$MysqlUser = "root",
  [string]$MysqlPassword = "",
  [string]$MysqlDatabase = "rahe_zendegi",

  [int]$AppPort = 3000,

  # انتقال پشتیبان app.sqlite به MySQL پس از استقرار
  [switch]$ImportSqlite,
  [string]$SqliteFile = "",   # پیش‌فرض: <DataDir>\app.sqlite

  [switch]$SkipBuild,
  [switch]$AutoStart          # ثبت Startup خودکار در Task Scheduler
)

# ------------------------------------------------------------- ابزارها
$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$PSStyle = $null  # سازگاری با PowerShell 5.1

# مهم: اگر از اجرای قبلی NODE_ENV=production در همین سشن PowerShell مانده باشد،
# npm آن را بهانهٔ حذف وابستگی‌های dev (tsx، typescript، tailwindcss و…) می‌گیرد
Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue

function Write-Step { param($m) Write-Host ""; Write-Host "▶ $m" -ForegroundColor Cyan }
function Write-Ok   { param($m) Write-Host "  ✔ $m" -ForegroundColor Green }
function Write-Warn2{ param($m) Write-Host "  ⚠ $m" -ForegroundColor Yellow }
function Write-Fail { param($m) Write-Host "  ✘ $m" -ForegroundColor Red; exit 1 }

function Test-Command { param($name) [bool](Get-Command $name -ErrorAction SilentlyContinue) }

# اجرای دستورهای بومی (npm/npx/git) — خروجی stderr آن‌ها نباید اسکریپت را متوقف کند
function Invoke-Native {
  param([scriptblock]$Block)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try { & $Block } finally { $ErrorActionPreference = $prev }
}

function Get-NodeMajor {
  try { $v = (& node --version) -replace '^v',''; return [int]($v.Split('.')[0]) } catch { return 0 }
}

function Get-UriEscaped { param($s) [System.Uri]::EscapeDataString($s) }

function Build-MysqlUrl {
  $user = Get-UriEscaped $MysqlUser
  $pass = Get-UriEscaped $MysqlPassword
  if ($pass) { return "mysql://${user}:${pass}@${MysqlHost}:${MysqlPort}/${MysqlDatabase}" }
  return "mysql://${user}@${MysqlHost}:${MysqlPort}/${MysqlDatabase}"
}

function Get-SqlitePath { if ($SqliteFile) { return $SqliteFile } else { return (Join-Path $DataDir "app.sqlite") } }

function Write-Env {
  param($path, $content)
  if (Test-Path $path) {
    $bak = "$path.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    Copy-Item $path $bak -Force
    Write-Ok "فایل .env قبلی در $bak پشتیبان شد"
  }
  [System.IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding($false)))
}

# پیدا کردن PID سامانه از روی پورت
function Get-AppPid {
  try {
    $conns = Get-NetTCPConnection -LocalPort $AppPort -State Listen -ErrorAction SilentlyContinue
    if ($conns) { return ($conns | Select-Object -First 1).OwningProcess }
  } catch {}
  if (Test-Path (Join-Path $InstallDir "app.pid")) {
    $pidFile = (Get-Content (Join-Path $InstallDir "app.pid") -ErrorAction SilentlyContinue)
    if ($pidFile) {
      $proc = Get-Process -Id $pidFile -ErrorAction SilentlyContinue
      if ($proc) { return [int]$pidFile }
    }
  }
  return $null
}

# ------------------------------------------------------------- پیش‌نیازها
function Assert-Prerequisites {
  Write-Step "بررسی پیش‌نیازها"
  if (-not (Test-Command node)) {
    Write-Fail "Node.js نصب نیست. نصب کنید: winget install OpenJS.NodeJS.LTS"
  }
  $major = Get-NodeMajor
  if ($major -lt 18) { Write-Fail "نسخهٔ Node.js باید ۱۸ یا بالاتر باشد (فعلی: v$major)" }
  Write-Ok "Node.js v$major"
  if (-not (Test-Command npm)) { Write-Fail "npm یافت نشد — همراه Node.js نصب می‌شود" }
  Write-Ok "npm"
  if ($Mode -in @("install","update","import")) {
    if (-not (Test-Command git)) { Write-Fail "Git نصب نیست. نصب کنید: winget install Git.Git" }
    Write-Ok "git"
  }
  if ($DbEngine -eq "mysql" -and $Mode -in @("install","import")) {
    if (-not (Test-Command mysql)) {
      Write-Warn2 "کلاینت mysql در PATH نیست — ساخت/بازسازی ساختار به‌طور خودکار با prisma db push انجام می‌شود"
    }
  }
}

# ------------------------------------------------------------- دریافت کد
function Get-Source {
  Write-Step "دریافت کد سامانه از $RepoUrl"
  if (Test-Path (Join-Path $InstallDir ".git")) {
    Push-Location $InstallDir
    # اگر توکن تازه داده شده، آدرس origin با توکن جدید بازنویسی شود
    if ($GithubToken) {
      $repoPath = $RepoUrl -replace '^https?://', ''
      Invoke-Native { git remote set-url origin "https://$GithubToken@$repoPath" | Out-Null }
      Write-Ok "توکن GitHub در آدرس مخزن به‌روزرسانی شد"
    }
    # اتصال به GitHub گاهی ناپایدار است — تا ۳ بار تلاش می‌شود
    $fetchOk = $false
    foreach ($i in 1..3) {
      Invoke-Native { git fetch origin $Branch 2>$null }
      if ($LASTEXITCODE -eq 0) { $fetchOk = $true; break }
      if ($i -lt 3) { Write-Warn2 "اتصال به GitHub برقرار نشد (تلاش $i از ۳)…"; Start-Sleep -Seconds 2 }
    }
    if ($fetchOk) {
      # فقط وقتی fetch موفق بود reset کن — وگرنه نسخهٔ محلیِ جدیدتر نابود می‌شود
      Invoke-Native { git reset --hard "origin/$Branch" | Out-Null }
    } else {
      Write-Warn2 "به‌روزرسانی از GitHub انجام نشد — ادامه با کد محلی موجود"
      Write-Host "  برای به‌روزرسانی دستی deploy.ps1 از CDN (بدون نیاز به گیت):" -ForegroundColor Yellow
      Write-Host "    Invoke-WebRequest -UseBasicParsing -Uri 'https://cdn.jsdelivr.net/gh/sjalilvand/tekno@main/deploy.ps1' -OutFile 'deploy.ps1'" -ForegroundColor Yellow
    }
    $commit = ""
    try {
      $c = & git rev-parse --short HEAD 2>$null
      if ($LASTEXITCODE -eq 0 -and $c) { $commit = "$c".Trim() }
    } catch {}
    Pop-Location
    if ($fetchOk) { Write-Ok "کد سامانه به‌روزرسانی شد (نسخهٔ $commit)" }
    else { Write-Ok "کد محلی استفاده می‌شود (نسخهٔ $commit)" }
  } else {
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    Invoke-Native { git clone --depth 1 --branch $Branch $RepoUrl $InstallDir }
    if ($LASTEXITCODE -ne 0) { Write-Fail "کلون مخزن ناموفق بود — دسترسی اینترنت/آدرس را بررسی کنید" }
    Write-Ok "مخزن در $InstallDir کلون شد"
  }
  # همگام‌سازی خودکار اسکریپت اجراکننده — اگر deploy.ps1 از جای دیگری (مثل ریشهٔ پروژه) اجرا شود،
  # همهٔ رفع‌اشکال‌های جدید فقط به نسخهٔ داخل app می‌رسند و اجراکننده قدیمی می‌ماند؛
  # این بخش نسخهٔ مخزن را روی فایلِ در حال اجرا کپی می‌کند تا همیشه جدیدترین اسکریپت اجرا شود
  $repoDeploy = Join-Path $InstallDir "deploy.ps1"
  if (Test-Path $repoDeploy) {
    try {
      $runningPath = $PSCommandPath
      if ($runningPath -and ((Resolve-Path $runningPath).Path -ne (Resolve-Path $repoDeploy).Path)) {
        $same = $false
        try { $same = ((Get-FileHash $runningPath -Algorithm MD5).Hash -eq (Get-FileHash $repoDeploy -Algorithm MD5).Hash) } catch {}
        if (-not $same) {
          Copy-Item $repoDeploy "$runningPath.bak" -Force -ErrorAction SilentlyContinue
          Copy-Item $repoDeploy $runningPath -Force
          Write-Ok "اسکریپت استقرار (deploy.ps1) به نسخهٔ مخزن به‌روزرسانی شد — پشتیبان: $(Split-Path $runningPath -Leaf).bak"
          Write-Warn2 "برای اعمال کامل نسخهٔ جدید، همین دستور را یک‌بار دیگر اجرا کنید"
        }
      }
    } catch { Write-Warn2 "همگام‌سازی خودکار deploy.ps1 انجام نشد: $($_.Exception.Message)" }
  }
  if (-not (Test-Path (Join-Path $InstallDir "package.json"))) { Write-Fail "package.json در مخزن پیدا نشد" }
}

# ------------------------------------------------------------- .env
function Write-DotEnv {
  Write-Step "تنظیم فایل .env"
  $envPath = Join-Path $InstallDir ".env"
  $sqliteUrl = "file:" + ((Get-SqlitePath) -replace '\\','/')
  if ($DbEngine -eq "mysql") {
    $content = @"
# سامانه راه زندگی — تولیدشده توسط deploy.ps1
DATABASE_URL="$(Build-MysqlUrl)"
NODE_ENV="production"
PORT="$AppPort"
"@
  } else {
    $content = @"
# سامانه راه زندگی — تولیدشده توسط deploy.ps1
DATABASE_URL="$sqliteUrl"
NODE_ENV="production"
PORT="$AppPort"
"@
  }
  Write-Env $envPath $content
  Write-Ok "DATABASE_URL تنظیم شد (موتور: $DbEngine)"
  # پوشهٔ داده
  if (-not (Test-Path $DataDir)) { New-Item -ItemType Directory -Force -Path $DataDir | Out-Null; Write-Ok "پوشهٔ داده ساخته شد: $DataDir" }
}

# آیا فایل .env موجود با موتور درخواستی سازگار است؟
function Test-EnvMatches {
  $envPath = Join-Path $InstallDir ".env"
  if (-not (Test-Path $envPath)) { return $false }
  $content = Get-Content $envPath -Raw -ErrorAction SilentlyContinue
  if (-not $content) { return $false }
  $m = [regex]::Match($content, 'DATABASE_URL\s*=\s*"?([^"\r\n]+)"?')
  if (-not $m.Success) { return $false }
  $url = $m.Groups[1].Value.Trim()
  if ($DbEngine -eq "mysql") { return ($url -like "mysql://*" -or $url -like "mariadb://*") }
  return ($url -like "file:*")
}

# ------------------------------------------------------------- نصب و ساخت دیتابیس
function Install-Dependencies {
  Write-Step "نصب وابستگی‌ها (npm install) — چند دقیقه طول می‌کشد"
  Push-Location $InstallDir
  # --include=dev: tsx/typescript/tailwindcss لازمِ build و انتقال داده‌اند؛
  # NODE_ENV هم موقتاً حذف می‌شود تا npm وابستگی‌های dev را حذف نکند
  $oldNodeEnv = $env:NODE_ENV
  Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue
  Invoke-Native { npm install --no-audit --no-fund --include=dev 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray } }
  $code = $LASTEXITCODE
  if ($null -eq $oldNodeEnv) { Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue } else { $env:NODE_ENV = $oldNodeEnv }
  if ($code -ne 0) { Pop-Location; Write-Fail "نصب وابستگی‌ها ناموفق بود" }
  Pop-Location
  Write-Ok "وابستگی‌ها نصب شدند"
}

# ------------------------------------------------------------- پاک‌سازی تاریخ‌های نامعتبر
# سامانهٔ قدیمی برای «تاریخ ثبت‌نشده» مقدار صفر («0000-00-00») می‌نوشت؛ این مقادیر
# با حالت strict سرورهای MySQL جدید ناسازگارند:
#   • «prisma db push» هنگام بازسازی جدول با خطای
#     «Incorrect datetime value: '0000-00-00 00:00:00.000'» متوقف می‌شود
#     (همان شکستی که در deploy -Mode update دیده شد)
#   • Prisma Client هم هنگام خواندن همان ردیف‌ها خطای Invalid Date می‌دهد
# این تابع همهٔ ستون‌های تاریخ/ساعت دیتابیس را پاک‌سازی می‌کند:
#   ستون nullable → NULL | ستون NOT NULL → پیش‌فرض امن
function Invoke-ZeroDateFix {
  Push-Location $InstallDir
  try {
    $fixScript = "prisma/fix-zero-dates.mjs"
    if (-not (Test-Path $fixScript)) { return }
    Invoke-Native { node $fixScript --mysql "$(Build-MysqlUrl)" 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray } }
    if ($LASTEXITCODE -ne 0) {
      Write-Warn2 "پاک‌سازی تاریخ‌های نامعتبر ناموفق بود — ادامه می‌دهیم؛ اگر دادهٔ خرابی مانده باشد prisma db push خودش خطا می‌دهد"
    }
  } finally { Pop-Location }
}

# ------------------------------------------------------------- همگام‌سازی اسکیمای MySQL
# در حالت import هم اجرا می‌شود تا تغییر ساختار (مثل حذف کلیدهای یکتای ناسازگار با دادهٔ legacy) اعمال شود
# با -AllowReset: اگر push معمولی به‌خاطر ناسازگاری ساختار موجود شکست خورد
# (مثل «Duplicate foreign key constraint name»)، ساختار از نو ساخته می‌شود؛
# داده‌ها بلافاصله بعد از آن در مرحلهٔ انتقال کامل دوباره وارد می‌شوند (منبع: app.sqlite)
function Invoke-MysqlSchemaSync {
  param([switch]$AllowReset)
  Push-Location $InstallDir
  try {
    # ۱) پاک‌سازی تاریخ‌های صفر legacy — وگرنه db push هنگام بازسازی جدول‌ها
    #    با «Incorrect datetime value: '0000-00-00'» متوقف می‌شود
    Write-Step "پاک‌سازی تاریخ‌های نامعتبر legacy در MySQL"
    Invoke-ZeroDateFix
    Write-Step "اتصال به MySQL واقعی — prisma db push --schema prisma/schema.mysql.prisma"
    # client تولیدی نهایی باید از اسکیمای MySQL باشد
    Invoke-Native { npx prisma generate --schema prisma/schema.mysql.prisma 2>&1 | Out-Null }
    if ($LASTEXITCODE -ne 0) { Write-Fail "prisma generate (mysql) ناموفق بود" }
    Invoke-Native { npx prisma db push --schema prisma/schema.mysql.prisma --accept-data-loss 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray } }
    if ($LASTEXITCODE -ne 0) {
      if ($AllowReset) {
        Write-Warn2 "ساختار فعلی MySQL با اسکیمای جدید سازگار نیست (ناسازگاری کلیدهای خارجی/یکتای قدیمی)"
        Write-Host "  بازسازی کامل ساختار انجام می‌شود — همهٔ داده‌ها در مرحلهٔ بعد از app.sqlite دوباره منتقل می‌شوند" -ForegroundColor Yellow
        # وضعیت انتقال قبلی باید پاک شود تا همهٔ جدول‌ها دوباره منتقل شوند
        $statusFile = Join-Path $DataDir "import_status.json"
        if (Test-Path $statusFile) { Remove-Item $statusFile -Force; Write-Host "  وضعیت انتقال قبلی پاک شد ($statusFile)" -ForegroundColor DarkGray }
        Invoke-Native { npx prisma db push --schema prisma/schema.mysql.prisma --force-reset --skip-generate 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray } }
        if ($LASTEXITCODE -ne 0) { Write-Fail "بازسازی ساختار MySQL هم ناموفق بود — دیتابیس «$MysqlDatabase» را از نو بسازید" }
        Write-Ok "ساختار جداول از نو ساخته شد (۵۷ جدول) — انتقال کامل داده در مرحلهٔ بعد"
      } else {
        Write-Warn2 "prisma db push ناموفق بود — اگر خطای «Incorrect datetime value: '0000-00-00'» دیدید، تاریخ صفر legacy در دیتابیس است و باید مرحلهٔ پاک‌سازی بالای همین خروجی موفق شده باشد"
        Write-Host "  ایجاد دستی دیتابیس:" -ForegroundColor Yellow
        Write-Host "    mysql -u $MysqlUser -p -e `"CREATE DATABASE $MysqlDatabase CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`"" -ForegroundColor Yellow
        Write-Host "  اگر دیتابیس هست ولی ساختار قدیمی است، یک‌بار اجرا کنید:" -ForegroundColor Yellow
        Write-Host "    .\deploy.ps1 -Mode import -DbEngine mysql -MysqlUser $MysqlUser -MysqlDatabase $MysqlDatabase" -ForegroundColor Yellow
        Write-Host "  (حالت import خودش ساختار را بازسازی و داده‌ها را کامل منتقل می‌کند)" -ForegroundColor Yellow
        exit 1
      }
    } else {
      Write-Ok "ساختار جداول روی MySQL ایجاد/به‌روزرسانی شد"
    }
  } finally {
    Pop-Location
  }
}

function Invoke-PrismaSetup {
  if ($DbEngine -eq "mysql") { Invoke-MysqlSchemaSync; return }
  Push-Location $InstallDir
  Write-Step "آماده‌سازی SQLite"
  Invoke-Native { npx prisma generate 2>&1 | Out-Null }
  if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Fail "prisma generate ناموفق بود" }
  if (-not (Test-Path (Get-SqlitePath))) {
    $env:DATABASE_URL = "file:" + ((Get-SqlitePath) -replace '\\','/')
    Invoke-Native { npx prisma db push --accept-data-loss 2>&1 | Out-Null }
    Write-Ok "دیتابیس SQLite جدید ساخته شد: $(Get-SqlitePath)"
  } else {
    Write-Ok "از دیتابیس موجود استفاده می‌شود: $(Get-SqlitePath)"
  }
  Pop-Location
}

# ------------------------------------------------------------- انتقال داده
function Invoke-DataImport {
  if ($DbEngine -ne "mysql") { Write-Warn2 "انتقال داده فقط در حالت mysql معنا دارد"; return }
  $src = Get-SqlitePath
  if (-not (Test-Path $src)) { Write-Warn2 "پشتیبان SQLite پیدا نشد: $src — انتقال رد شد"; return }
  Write-Step "انتقال داده از SQLite به MySQL"
  Write-Host "  مبدأ: $src ($([math]::Round((Get-Item $src).Length/1GB,2)) گیگابایت)" -ForegroundColor DarkGray
  Push-Location $InstallDir
  try {
    # وابستگی‌های انتقال داده (better-sqlite3/mysql2) در devDependencies اند و ممکن است
    # توسط اجرای قبلی npm حذف یا ناقص مانده باشند — با require واقعی تست می‌شوند
    # (نه فقط وجود پوشه)؛ در صورت خرابی، قبل از انتقال بازگردانی می‌شوند.
    # npm هم داخل پوشهٔ سامانه اجرا می‌شود — نه پوشهٔ جاریِ کاربر
    Invoke-Native { node -e "require('better-sqlite3'); require('mysql2')" 2>$null }
    if ($LASTEXITCODE -ne 0) {
      Write-Warn2 "وابستگی‌های انتقال داده (better-sqlite3/mysql2) قابل بارگذاری نیستند — بازگردانی…"
      Invoke-Native { npm install --no-audit --no-fund --include=dev 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray } }
      if ($LASTEXITCODE -ne 0) { Write-Fail "بازگردانی وابستگی‌ها ناموفق بود — در پوشهٔ سامانه دستی «npm install --include=dev» اجرا کنید" }
      Invoke-Native { node -e "require('better-sqlite3'); require('mysql2')" 2>$null }
      if ($LASTEXITCODE -ne 0) { Write-Fail "پس از نصب هم better-sqlite3/mysql2 بارگذاری نشد — خروجی npm را بررسی کنید" }
      Write-Ok "وابستگی‌های انتقال داده بازگردانی شدند"
    }
    # اسکریپت انتقال — نسخهٔ .mts (ESM صریح، بدون هشدار MODULE_TYPELESS) با fallback به .ts قدیمی
    $importer = "prisma/import-sqlite-to-mysql.mts"
    if (-not (Test-Path $importer)) { $importer = "prisma/import-sqlite-to-mysql.ts" }
    # Node 23+ فایل‌های TS را خودش اجرا می‌کند — بدون دانلود tsx و بدون نیاز به اینترنت
    if ((Get-NodeMajor) -ge 23) {
      Invoke-Native { node $importer --source "$src" --mysql "$(Build-MysqlUrl)" --mode truncate --resume 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray } }
    } else {
      Invoke-Native { npx --yes tsx $importer --source "$src" --mysql "$(Build-MysqlUrl)" --mode truncate --resume 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray } }
    }
    if ($LASTEXITCODE -ne 0) { Write-Fail "انتقال داده ناموفق بود — پس از رفع مشکل با --resume ادامه دهید" }
    # ۲) پاک‌سازی نهایی: اگر تاریخ صفر/نامعتبری از فایل legacy عبور کرده باشد (مثل
    #    مسیر قدیمی .ts یا مقدارهای غیرقابل پیش‌بینی)، قبل از استفادهٔ سامانه تمیز شود
    Write-Step "پاک‌سازی تاریخ‌های نامعتبر بعد از انتقال"
    Invoke-ZeroDateFix
  } finally {
    Pop-Location
  }
  Write-Ok "انتقال داده کامل شد (وضعیت: $DataDir\import_status.json)"
}

# ------------------------------------------------------------- حساب‌های مدیریتی
function Invoke-SeedAdmin {
  Write-Step "ایجاد/به‌روزرسانی حساب‌های مدیریتی (admin)"
  Push-Location $InstallDir
  # نسخهٔ .mts (ESM صریح) با fallback به .ts قدیمی
  $seedScript = "prisma/seed-admin.mts"
  if (-not (Test-Path $seedScript)) { $seedScript = "prisma/seed-admin.ts" }
  $code = 1
  # Node 23+ فایل‌های TS را خودش اجرا می‌کند — بدون دانلود tsx و بدون نیاز به اینترنت
  if ((Get-NodeMajor) -ge 23) {
    Invoke-Native { node $seedScript 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray } }
    $code = $LASTEXITCODE
  }
  if ($code -ne 0) {
    # جایگزین: tsx محلی (--yes تا در پرسش «Ok to proceed?» متوقف نماند)
    Write-Warn2 "اجرای مستقیم با node ممکن نشد — تلاش با tsx محلی…"
    Invoke-Native { npx --yes tsx $seedScript 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray } }
    $code = $LASTEXITCODE
  }
  Pop-Location
  if ($code -ne 0) { Write-Warn2 "ایجاد حساب‌های مدیریتی ناموفق بود — دستی اجرا کنید: npm run seed:admin"; return }
  Write-Ok "حساب‌های admin / manager / consultant با رمز 123456 آماده‌اند"
}

# ------------------------------------------------------------- ساخت و اجرا
function Invoke-Build {
  if ($SkipBuild) { Write-Warn2 "ساخت رد شد (-SkipBuild)"; return }
  Write-Step "ساخت نسخهٔ تولیدی (next build)"
  Push-Location $InstallDir
  # پاکسازی .next قدیمی با چند بار تلاش — تا مطمئن شویم قفلی باقی نمانده
  if (Test-Path ".next") {
    $cleaned = $false
    foreach ($i in 1..3) {
      try { Remove-Item -Recurse -Force ".next" -ErrorAction Stop; $cleaned = $true; break }
      catch { Start-Sleep -Seconds 2 }
    }
    if (-not $cleaned) {
      Write-Warn2 "پوشهٔ .next قدیمی کامل پاک نشد"
      Write-Warn2 "اگر خطای EPERM دیدید: Get-Process node | Stop-Process -Force و سپس اجرای مجدد"
    }
  }
  Invoke-Native { npx next build 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray } }
  if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Fail "ساخت پروژه ناموفق بود" }
  Invoke-Native { node scripts/copy-standalone.mjs | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray } }
  Pop-Location
  Write-Ok "نسخهٔ تولیدی آماده شد"
}

function Start-App {
  Write-Step "اجرای سامانه"
  $existing = Get-AppPid
  if ($existing) { Write-Warn2 "سامانه از قبل در حال اجراست (PID $existing)"; Show-Status; return }
  $server = Join-Path $InstallDir ".next\standalone\server.js"
  if (-not (Test-Path $server)) { Write-Fail "server.js پیدا نشد — ابتدا build کنید" }
  Push-Location $InstallDir
  # متغیرها فقط به فرایند سامانه برسند و در سشن PowerShell باقی نمانند
  # (NODE_ENV باقی‌مانده در اجرای بعدی باعث حذف وابستگی‌های dev توسط npm می‌شود)
  $oldNodeEnv = $env:NODE_ENV; $oldPort = $env:PORT; $oldHost = $env:HOSTNAME
  $env:NODE_ENV = "production"
  $env:PORT = "$AppPort"
  $env:HOSTNAME = "0.0.0.0"
  $logFile = Join-Path $InstallDir "server.log"
  $proc = Start-Process -FilePath "node" -ArgumentList "`"$server`"" -WorkingDirectory $InstallDir `
          -WindowStyle Hidden -RedirectStandardOutput $logFile -RedirectStandardError "$InstallDir\server.err.log" -PassThru
  if ($null -eq $oldNodeEnv) { Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue } else { $env:NODE_ENV = $oldNodeEnv }
  if ($null -eq $oldPort)    { Remove-Item Env:PORT    -ErrorAction SilentlyContinue } else { $env:PORT    = $oldPort }
  if ($null -eq $oldHost)    { Remove-Item Env:HOSTNAME -ErrorAction SilentlyContinue } else { $env:HOSTNAME = $oldHost }
  Pop-Location
  Set-Content -Path (Join-Path $InstallDir "app.pid") -Value $proc.Id
  Write-Ok "سامانه اجرا شد (PID $($proc.Id))"
  # بررسی سلامت
  $ok = $false
  foreach ($i in 1..20) {
    Start-Sleep -Seconds 1
    try {
      $res = Invoke-WebRequest -Uri "http://localhost:$AppPort/" -UseBasicParsing -TimeoutSec 3
      if ($res.StatusCode -eq 200) { $ok = $true; break }
    } catch {}
    Write-Host "  … در حال بالا آمدن ($i/20)" -ForegroundColor DarkGray
  }
  if ($ok) {
    Write-Ok "سامانه فعال است: http://localhost:$AppPort"
    Write-Host ""
    Write-Host "  ورود پیش‌فرض: admin / 123456  (پس از اولین ورود رمز را عوض کنید)" -ForegroundColor Magenta
  } else {
    Write-Warn2 "پاسخ HTTP دریافت نشد — لاگ: $InstallDir\server.err.log"
  }
}

function Stop-App {
  param([switch]$Quiet)
  # خاموش کردن هر نمونهٔ در حال اجرا — قبل از build الزامی است وگرنه
  # next build نمی‌تواند .next قدیمی را پاک کند:
  # EPERM: unlink ...query_engine-windows.dll.node (فایل قفل‌شده توسط اجرای قبلی)
  if (-not $Quiet) { Write-Step "توقف سامانه" }
  $stopped = @()
  $p = Get-AppPid
  if ($p) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue; $stopped += $p }
  # هر فرایند node دیگری که از پوشهٔ سامانه اجرا شده باشد هم بسته شود
  # (ممکن است PID در app.pid ثبت نشده باشد اما قفل DLL را نگه داشته باشد)
  try {
    $procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue
    foreach ($proc in $procs) {
      if ($proc.CommandLine -and ($proc.CommandLine -like "*$InstallDir*") -and ($stopped -notcontains $proc.ProcessId)) {
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
        $stopped += $proc.ProcessId
      }
    }
  } catch {}
  if ($stopped.Count -eq 0) {
    if (-not $Quiet) { Write-Warn2 "سامانه در حال اجرا نیست" }
    return $false
  }
  # صبر تا آزاد شدن پورت و قفل فایل‌ها (حداکثر ~۱۰ ثانیه)
  foreach ($i in 1..10) {
    $still = $null
    try { $still = Get-NetTCPConnection -LocalPort $AppPort -State Listen -ErrorAction SilentlyContinue } catch {}
    if (-not $still) { break }
    Start-Sleep -Seconds 1
  }
  Start-Sleep -Milliseconds 500
  if (-not $Quiet) { Write-Ok ("فرایند متوقف شد (PID " + ($stopped -join ", ") + ")") }
  return $true
}

function Show-Status {
  # نسخهٔ مستقرشده
  $commit = ""
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    Push-Location $InstallDir
    $c = & git rev-parse --short HEAD 2>$null
    if ($LASTEXITCODE -eq 0 -and $c) { $commit = "$c".Trim() }
  } catch {}
  finally { Pop-Location; $ErrorActionPreference = $prevEap }
  if ($commit) { Write-Host "  نسخهٔ کد: $commit" -ForegroundColor DarkGray }
  $p = Get-AppPid
  if ($p) {
    Write-Ok "سامانه در حال اجراست (PID $p) — http://localhost:$AppPort"
    try {
      $res = Invoke-WebRequest -Uri "http://localhost:$AppPort/" -UseBasicParsing -TimeoutSec 5
      Write-Ok "پاسخ HTTP: $($res.StatusCode)"
    } catch { Write-Warn2 "وب‌سرور پاسخ نمی‌دهد" }
  } else {
    Write-Warn2 "سامانه متوقف است"
  }
  Write-Host ""
  Write-Host "  موتور دیتابیس: $DbEngine | پوشهٔ داده: $DataDir | پورت: $AppPort" -ForegroundColor DarkGray
}

# ------------------------------------------------------------- اجرای خودکار
function Register-AutoStart {
  Write-Step "ثبت اجرای خودکار در Task Scheduler"
  $action  = New-ScheduledTaskAction -Execute "powershell.exe" `
             -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$InstallDir\deploy.ps1`" -Mode start -DbEngine $DbEngine -DataDir `"$DataDir`" -AppPort $AppPort"
  $trigger = New-ScheduledTaskTrigger -AtLogOn
  Register-ScheduledTask -TaskName "RaheZendegi" -Action $action -Trigger $trigger -Force | Out-Null
  Write-Ok "وظیفهٔ RaheZendegi ثبت شد — پس از ورود به ویندوز، سامانه خودکار بالا می‌آید"
}

# ------------------------------------------------------------- اجرای اصلی
Assert-Prerequisites

switch ($Mode) {
  "install" {
    Get-Source
    Install-Dependencies
    Write-DotEnv
    Invoke-PrismaSetup
    if ($ImportSqlite) { Invoke-DataImport }
    Invoke-SeedAdmin
    Stop-App -Quiet   # آزادسازی قفل فایل‌های .next پیش از build (رفع EPERM)
    Invoke-Build
    Start-App
    if ($AutoStart) { Register-AutoStart }
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  استقرار کامل شد — مرکز مشاوره رز (راه زندگی) نسخهٔ ۶.۱۵" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
  }
  "update" {
    Get-Source
    # git reset ممکن است .env داخل مخزن را برگرداند — اگر با موتور درخواستی ناسازگار است، بازسازی شود
    if (-not (Test-EnvMatches)) {
      Write-Warn2 "فایل .env نامعتبر یا ناسازگار با موتور $DbEngine بود — بازسازی می‌شود"
      Write-DotEnv
    }
    Install-Dependencies
    Invoke-PrismaSetup
    Invoke-SeedAdmin
    Stop-App -Quiet   # آزادسازی قفل فایل‌های .next پیش از build (رفع EPERM)
    Invoke-Build
    Start-App
  }
  "start"   { Start-App }
  "stop"    { Stop-App }
  "restart" { Stop-App; Start-App }
  "status"  { Show-Status }
  "import"  {
    # کد مخزن ابتدا از GitHub به‌روزرسانی می‌شود — تا importr/اسکیما همیشه جدید باشند؛
    # اگر اینترنت در دسترس نباشد، با کد محلی ادامه می‌دهد (رفتار Get-Source)
    Get-Source
    Write-DotEnv
    if ($DbEngine -eq "mysql") { Invoke-MysqlSchemaSync -AllowReset }
    Invoke-DataImport
    Invoke-SeedAdmin
    Write-Host ""
    Write-Host "  مرحلهٔ بعد: .\deploy.ps1 -Mode update -DbEngine mysql  (ساخت و اجرای مجدد سامانه)" -ForegroundColor Magenta
  }
}
