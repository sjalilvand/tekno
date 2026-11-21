# =====================================================================
#  مرکز مشاوره رز (سامانه راه زندگی) — استقرار یک‌فرمانی روی سرور ویندوزی (نسخه ۶.۲۴)
#  برای ویندوز سرور ۲۰۲۵ (و ۲۰۱۶ به بعد) — PowerShell را «به‌صورت Administrator» باز کنید:
#
#    Invoke-WebRequest -UseBasicParsing -Uri "https://raw.githubusercontent.com/sjalilvand/tekno/main/server.ps1" -OutFile "$env:TEMP\server.ps1"
#    powershell -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\server.ps1" -Port 8089
#
#  این اسکریپت همهٔ کارها را خودکار انجام می‌دهد:
#    ۱) نصب Git و Node.js در نبودشان (ابتدا winget، در نبود آن دانلود مستقیم نصاب رسمی)
#    ۲) باز کردن پورت در فایروال ویندوز
#    ۳) کلون مخزن از GitHub (مخزن عمومی است — به توکن نیاز ندارد)
#    ۴) اجرای deploy.ps1 در حالت install: نصب وابستگی‌ها + ساخت دیتابیس + build + اجرا
#    ۵) ثبت اجرای خودکار پس از هر ورود به ویندوز (Task Scheduler)
#
#  پیش‌فرض‌ها:  پورت ۸۰۸۹  |  دیتابیس SQLite (بدون نیاز به نصب MySQL)
#  برای MySQL:  powershell -File server.ps1 -Port 8089 -DbEngine mysql -MysqlPassword "رمز"
#
#  انتقال دیتا از پشتیبان MySQL (خروجی mysqldump مثل app2_backup_202611031659.sql):
#    powershell -File server.ps1 -Port 8089 -SqlFile "C:\rahe_zendegi\app2_backup_202611031659.sql"
#  از نسخهٔ ۶.۲۳ این کار با درون‌ریز جریانی داخلی Node انجام می‌شود — بدون نصب MySQL،
#  بدون دانلود بستهٔ دیتابیس (که برای IPهای ایران با خطای 403 Oracle Export Error
#  می‌شکند) و مستقیماً در SQLite سامانه. به‌روزرسانی‌های بعدی دیتا فقط:
#    cd C:\rahe_zendegi\app; .\deploy.ps1 -Mode sqlimport -SqlFile "مسیر پشتیبان جدید"
# =====================================================================
param(
  [int]$Port = 8089,

  # مسیر فایل پشتیبان MySQL (.sql خروجی mysqldump) — با درون‌ریز جریانی داخلی Node
  # مستقیماً در SQLite سامانه می‌ریزد؛ بدون نصب MySQL و بدون دانلود بستهٔ دیتابیس
  [string]$SqlFile = "",

  [string]$InstallDir = "D:\Projects\rahe_zendegi\app",
  [string]$DataDir    = "D:\Projects\rahe_zendegi\data",

  # sqlite (پیش‌فرض — بدون نیاز به MySQL) | mysql
  [ValidateSet("sqlite", "mysql")]
  [string]$DbEngine = "sqlite",
  [string]$MysqlHost     = "localhost",
  [int]$MysqlPort        = 3306,
  [string]$MysqlUser     = "root",
  [string]$MysqlPassword = "",
  [string]$MysqlDatabase = "rahe_zendegi",

  [string]$RepoUrl = "https://github.com/sjalilvand/tekno.git",
  # توکن فقط وقتی لازم است که مخزن خصوصی شود — مخزن فعلی عمومی است
  [string]$GithubToken = "",

  [switch]$SkipFirewall
)

$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$ProgressPreference = "SilentlyContinue"   # سرعت Invoke-WebRequest در PowerShell 5.1
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}

function Write-Step  { param($m) Write-Host ""; Write-Host "▶ $m" -ForegroundColor Cyan }
function Write-Ok    { param($m) Write-Host "  ✔ $m" -ForegroundColor Green }
function Write-Warn2 { param($m) Write-Host "  ⚠ $m" -ForegroundColor Yellow }
function Write-Fail  { param($m) Write-Host "  ✘ $m" -ForegroundColor Red; exit 1 }
function Test-Command { param($name) [bool](Get-Command $name -ErrorAction SilentlyContinue) }

function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
              [Environment]::GetEnvironmentVariable("Path","User")
}

# ------------------------------------------------------------- ۰) فقط با دسترسی Administrator
Write-Step "بررسی دسترسی Administrator"
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
           ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Write-Fail "این اسکریپت باید در PowerShell «به‌صورت Administrator» اجرا شود (روی PowerShell راست‌کلیک → Run as administrator)" }
Write-Ok "دسترسی Administrator تأیید شد"

# ------------------------------------------------------------- ۱) نصب Git و Node.js در نبودشان
function Install-WithWinget {
  param([string]$Id)
  if (-not (Test-Command winget)) { return $false }
  Write-Host "  نصب با winget: $Id …" -ForegroundColor DarkGray
  $wingetArgs = @("install","--id",$Id,"-e","--accept-source-agreements","--accept-package-agreements","--silent","--disable-interactivity")
  $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  & winget @wingetArgs 2>&1 | Out-Null
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev
  # ۰ = موفق | ۳۰۱۰ = موفق ولی نیاز به ری‌استارت
  return ($code -eq 0 -or $code -eq 3010)
}

# نصب Git — دانلود مستقیم آخرین نصاب رسمی Git for Windows (نصاب InnoSetup)
function Install-GitDirect {
  Write-Step "نصب مستقیم Git (دانلود نصاب رسمی)"
  try {
    $rel = Invoke-RestMethod -Uri "https://api.github.com/repos/git-for-windows/git/releases/latest" -TimeoutSec 30
    $asset = $rel.assets | Where-Object { $_.name -match '^Git-.*-64-bit\.exe$' } | Select-Object -First 1
    if (-not $asset) { throw "نصاب یافت نشد" }
    $installer = "$env:TEMP\$($asset.name)"
    Write-Host "  دانلود $($asset.name) …" -ForegroundColor DarkGray
    Invoke-WebRequest -UseBasicParsing -Uri $asset.browser_download_url -OutFile $installer -TimeoutSec 600
    Write-Host "  اجرای نصاب (صامت) …" -ForegroundColor DarkGray
    Start-Process -FilePath $installer -ArgumentList "/VERYSILENT","/NORESTART","/SUPPRESSMSGBOXES" -Wait
    Refresh-Path
    if (Test-Command git) { Write-Ok "Git نصب شد"; return $true }
  } catch { Write-Warn2 "نصب مستقیم Git ناموفق بود: $($_.Exception.Message)" }
  return $false
}

# نصب Node.js — دانلود مستقیم MSI رسمی LTS (شاخهٔ ۲۲)
function Install-NodeDirect {
  Write-Step "نصب مستقیم Node.js LTS (دانلود MSI رسمی)"
  try {
    $listing = (Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/latest-v22.x/" -TimeoutSec 60).Content
    $msiName = [regex]::Match($listing, 'node-v[\d.]+-x64\.msi').Value
    if (-not $msiName) { throw "نام MSI در فهرست پیدا نشد" }
    $msiFile = "$env:TEMP\$msiName"
    Write-Host "  دانلود $msiName …" -ForegroundColor DarkGray
    Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/latest-v22.x/$msiName" -OutFile $msiFile -TimeoutSec 900
    Write-Host "  اجرای نصاب (صامت) …" -ForegroundColor DarkGray
    Start-Process -FilePath "msiexec.exe" -ArgumentList "/i","`"$msiFile`"","/qn","/norestart" -Wait
    Refresh-Path
    if (Test-Command node) { Write-Ok "Node.js نصب شد"; return $true }
  } catch { Write-Warn2 "نصب مستقیم Node.js ناموفق بود: $($_.Exception.Message)" }
  return $false
}

function Get-NodeMajor {
  try { $v = (& node --version) -replace '^v',''; return [int]($v.Split('.')[0]) } catch { return 0 }
}

Write-Step "بررسی/نصب Git"
if (Test-Command git) {
  Write-Ok "Git از قبل نصب است"
} else {
  if (-not (Install-WithWinget "Git.Git")) { Refresh-Path; if (-not (Test-Command git)) { if (-not (Install-GitDirect)) { Write-Fail "Git نصب نشد — PowerShell را بسته، دوباره به‌صورت Administrator باز و اسکریپت را دوباره اجرا کنید" } } }
  if (Test-Command git) { Write-Ok "Git آماده است" }
}

Write-Step "بررسی/نصب Node.js"
$nodeMajor = Get-NodeMajor
if ($nodeMajor -ge 18) {
  Write-Ok "Node.js v$nodeMajor از قبل نصب است"
} else {
  if (-not (Install-WithWinget "OpenJS.NodeJS.LTS")) { Refresh-Path; if ((Get-NodeMajor) -lt 18) { if (-not (Install-NodeDirect)) { Write-Fail "Node.js نصب نشد — PowerShell را بسته، دوباره به‌صورت Administrator باز و اسکریپت را دوباره اجرا کنید" } } }
  $nodeMajor = Get-NodeMajor
  if ($nodeMajor -ge 18) { Write-Ok "Node.js v$nodeMajor آماده است" }
  else { Write-Fail "Node.js نصب شد ولی در PATH نیست — PowerShell را بسته و اسکریپت را دوباره اجرا کنید" }
}
if (-not (Test-Command npm)) { Write-Fail "npm یافت نشد — همراه Node.js باید نصب شود" }

# ------------------------------------------------------------- ۱.۵) مسیر نصب — اگر درایو پیش‌فرض (D:) قابل نوشتن نبود، درایو سیستم
# روی خیلی از سرورها D: درایو CD یا دیسک قفل‌شده است و ساخت پوشه با Access Denied شکست می‌خورد
function Test-DirWritable {
  param([string]$dir)
  try {
    New-Item -ItemType Directory -Force -Path $dir -ErrorAction Stop | Out-Null
    $t = Join-Path $dir ".rz-write-test"
    New-Item -ItemType Directory -Force -Path $t -ErrorAction Stop | Out-Null
    Remove-Item $t -Force -ErrorAction SilentlyContinue
    return $true
  } catch { return $false }
}

Write-Step "بررسی مسیر نصب"
$installParent = Split-Path $InstallDir -Parent
if (Test-DirWritable $installParent) {
  Write-Ok "مسیر نصب: $InstallDir"
} else {
  $sysRoot = "$env:SystemDrive\rahe_zendegi"
  Write-Warn2 "نوشتن در $installParent ممکن نیست (درایو D: احتمالاً CD-ROM یا قفل‌شده است) — مسیر جایگزین: $sysRoot"
  $InstallDir = Join-Path $sysRoot "app"
  $DataDir    = Join-Path $sysRoot "data"
  if (-not (Test-DirWritable (Split-Path $InstallDir -Parent))) {
    Write-Fail "ساخت پوشهٔ نصب در D: و C: ممکن نشد — دسترسی دیسک سرور را بررسی کنید یا مسیر را با -InstallDir بدهید"
  }
  Write-Ok "مسیر نصب: $InstallDir | مسیر داده: $DataDir"
}

# ------------------------------------------------------------- ۲) فایروال ویندوز
if (-not $SkipFirewall) {
  Write-Step "باز کردن پورت $Port در فایروال ویندوز"
  $ruleName = "RaheZendegi-$Port"
  $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
  if ($existing) {
    Write-Ok "قانون فایروال از قبل وجود دارد ($ruleName)"
  } else {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Any | Out-Null
    Write-Ok "پورت $Port برای ورود از شبکه باز شد"
  }
  Write-Warn2 "اگر سرور روی VPS است، پورت $Port را در پنلِ ارائه‌دهنده (Security Group) هم باز کنید"
}

# ------------------------------------------------------------- ۳) کلون مخزن (اگر از قبل کلون نشده)
Write-Step "دریافت کد سامانه از $RepoUrl"
$cloneUrl = $RepoUrl
if ($GithubToken) { $cloneUrl = $RepoUrl -replace '^https?://', "https://$GithubToken@" }
if (-not (Test-Path (Join-Path $InstallDir ".git"))) {
  try { New-Item -ItemType Directory -Force -Path (Split-Path $InstallDir -Parent) -ErrorAction Stop | Out-Null }
  catch { Write-Fail "ساخت پوشهٔ $(Split-Path $InstallDir -Parent) ممکن نشد: $($_.Exception.Message)" }
  $cloned = $false
  foreach ($i in 1..3) {
    $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    & git clone --depth 1 $cloneUrl $InstallDir 2>&1 | Out-Null
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    if ($code -eq 0) { $cloned = $true; break }
    if ($i -lt 3) { Write-Warn2 "کلون ناموفق (تلاش $i از ۳) — دوباره تلاش می‌شود…"; Start-Sleep -Seconds 3 }
  }
  if (-not $cloned) { Write-Fail "کلون مخزن ناموفق بود — اینترنت/آدرس مخزن را بررسی کنید" }
  Write-Ok "مخزن در $InstallDir کلون شد"
} else {
  Write-Ok "مخزن از قبل در $InstallDir موجود است"
  # ------------------------------------------------ به‌روزرسانی کد پیش از اجرای deploy.ps1 (نسخهٔ ۶.۲۴)
  # درون‌ریزی پشتیبان فقط با deploy.ps1 نسخهٔ جدید کار می‌کند؛ اسکریپتِ در حال اجرا همان
  # نسخهٔ محلی است — اگر کد قدیمی باشد -SqlFile بی‌صدا نادیده گرفته می‌شد (باگ واقعی ۶.۲۳
  # روی سرور: استقرار کامل شد ولی دیتا وارد نشد). پس اول کد از GitHub تازه می‌شود.
  $prevGit = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  $fetchOk = $false
  foreach ($i in 1..3) {
    & git -C $InstallDir fetch origin main 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { $fetchOk = $true; break }
    if ($i -lt 3) { Write-Warn2 "اتصال به GitHub برقرار نشد (تلاش $i از ۳)…"; Start-Sleep -Seconds 2 }
  }
  if ($fetchOk) {
    # فقط وقتی fetch موفق بود reset کن — وگرنه نسخهٔ محلی دست‌نخورده می‌ماند (.env و node_modules از قبل gitignore هستند)
    & git -C $InstallDir reset --hard origin/main 2>&1 | Out-Null
    $gitCode = $LASTEXITCODE
  }
  $ErrorActionPreference = $prevGit
  if ($fetchOk -and $gitCode -eq 0) {
    $commit = ""
    try { $c = & git -C $InstallDir rev-parse --short HEAD 2>$null; if ($LASTEXITCODE -eq 0 -and $c) { $commit = "$c".Trim() } } catch {}
    Write-Ok "کد سامانه به‌روزرسانی شد (نسخهٔ $commit)"
  } else {
    Write-Warn2 "به‌روزرسانی کد از GitHub انجام نشد — ادامه با کد محلی موجود"
    Write-Host "  برای به‌روزرسانی دستی deploy.ps1 (بدون نیاز به گیت):" -ForegroundColor Yellow
    Write-Host "    Invoke-WebRequest -UseBasicParsing -Uri 'https://cdn.jsdelivr.net/gh/sjalilvand/tekno@main/deploy.ps1' -OutFile '$InstallDir\deploy.ps1'" -ForegroundColor Yellow
  }
}

# ------------------------------------------------------------- ۳.۵) فایل پشتیبان — فقط اعتبارسنجی مسیر (۶.۲۳)
# از نسخهٔ ۶.۲۳ هیچ MySQL نصب یا دانلود نمی‌شود — درون‌ریز داخلی Node پشتیبان
# mysqldump را مستقیماً در SQLite سامانه می‌ریزد (دانلود بستهٔ Oracle برای IPهای
# ایران با 403 می‌شکند و روی این سرور هم MySQL وجود ندارد).
if ($SqlFile) {
  Write-Step "بررسی فایل پشتیبان"
  $sqlResolved = Resolve-Path $SqlFile -ErrorAction SilentlyContinue
  if (-not $sqlResolved) { Write-Fail "فایل پشتیبان پیدا نشد: $SqlFile" }
  $SqlFile = $sqlResolved.Path
  $sizeGB = [Math]::Round((Get-Item $SqlFile).Length / 1GB, 2)
  Write-Ok "فایل پشتیبان: $SqlFile ($sizeGB گیگابایت) — پس از استقرار، دیتا با درون‌ریز داخلی Node وارد SQLite می‌شود (بدون MySQL)"
  # محافظ نسخهٔ deploy.ps1 — اگر نسخهٔ محلی قدیمی باشد -SqlFile را نادیده می‌گرفت؛
  # از CDN تازه می‌شود (jsdelivr برای IP ایران هم در دسترس است)
  $deployScriptPath = Join-Path $InstallDir "deploy.ps1"
  if (Test-Path $deployScriptPath) {
    $deployText = Get-Content $deployScriptPath -Raw -ErrorAction SilentlyContinue
    if ($deployText -and ($deployText -notmatch 'Invoke-SqlFileImport')) {
      Write-Warn2 "deploy.ps1 محلی قدیمی است (درون‌ریزی پشتیبان ندارد) — نسخهٔ جدید از CDN دریافت می‌شود…"
      try {
        Invoke-WebRequest -UseBasicParsing -Uri "https://cdn.jsdelivr.net/gh/sjalilvand/tekno@main/deploy.ps1" -OutFile $deployScriptPath -TimeoutSec 60
        Write-Ok "deploy.ps1 به نسخهٔ جدید به‌روزرسانی شد"
      } catch {
        Write-Fail "به‌روزرسانی deploy.ps1 ممکن نشد: $($_.Exception.Message) — اینترنت را بررسی و دوباره اجرا کنید"
      }
    }
  }
}

# ------------------------------------------------------------- ۴) استقرار با deploy.ps1 (install + درون‌ریزی پشتیبان + اجرای خودکار)
Write-Step "استقرار سامانه روی پورت $Port (نصب وابستگی‌ها + دیتابیس + build + اجرا)"
$deployDbEngine = $DbEngine
$deployArgs = @(
  "-Mode","install",
  "-AppPort","$Port",
  "-DbEngine",$deployDbEngine,
  "-InstallDir",$InstallDir,
  "-DataDir",$DataDir,
  "-AutoStart"
)
# پشتیبان mysqldump مستقیماً داخل همان اجرا درون‌ریزی می‌شود (بدون MySQL — نسخهٔ ۶.۲۳)
if ($SqlFile) { $deployArgs += @("-SqlFile","$SqlFile") }
if ($deployDbEngine -eq "mysql") {
  $MysqlDbPass = $MysqlPassword
  if (-not $MysqlDbPass) { $MysqlDbPass = "RaheZendegi2026" }
  $deployArgs += @(
    "-MysqlHost",$MysqlHost,
    "-MysqlPort","$MysqlPort",
    "-MysqlUser",$MysqlUser,
    "-MysqlPassword",$MysqlDbPass,
    "-MysqlDatabase",$MysqlDatabase
  )
}

$deployScript = Join-Path $InstallDir "deploy.ps1"
if (-not (Test-Path $deployScript)) { Write-Fail "deploy.ps1 در مخزن پیدا نشد" }

$prevEAP = $ErrorActionPreference; $ErrorActionPreference = "Continue"
# اجرا در پروسهٔ جداگانه — تا «exit 1» داخل deploy.ps1 کل اسکریپت را نبندد
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$deployScript" @deployArgs
$deployOk = ($LASTEXITCODE -eq 0)
$ErrorActionPreference = $prevEAP

# ------------------------------------------------------------- ۵) بنر پایانی
Write-Host ""
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  آدرس روی سرور:  http://localhost:$Port" -ForegroundColor Cyan
try {
  $pub = (Invoke-RestMethod -Uri "https://api.ipify.org?format=json" -TimeoutSec 5).ip
  if ($pub) { Write-Host "  آدرس از بیرون:  http://$pub`:$Port" -ForegroundColor Cyan }
} catch {}
Write-Host "  ورود پیش‌فرض:  admin / 123456  (پس از اولین ورود رمز را عوض کنید)" -ForegroundColor Magenta
if ($SqlFile) {
  if ($deployOk) { Write-Host "  دیتابیس: SQLite — دیتای پشتیبان کامل وارد شد (درون‌ریز داخلی Node، بدون MySQL)" -ForegroundColor DarkGray }
  else { Write-Host "  دیتابیس: درون‌ریزی پشتیبان کامل نشد — پیام‌های بالا را بررسی و دوباره اجرا کنید" -ForegroundColor Yellow }
} else {
  Write-Host "  دیتابیس: SQLite در $DataDir" -ForegroundColor DarkGray
}
Write-Host "  به‌روزرسانی‌های بعدی دیتا:  cd $InstallDir; .\deploy.ps1 -Mode sqlimport -SqlFile 'مسیر-پشتیبان-جدید'" -ForegroundColor DarkGray
Write-Host "  پس از ری‌استارت سرور، سامانه خودکار بالا می‌آید (Task Scheduler: RaheZendegi)" -ForegroundColor DarkGray
if (-not $deployOk) {
  Write-Host "  ⚠ مرحلهٔ استقرار با خطا روبه‌رو شد — پیام‌های بالا و server.err.log را بررسی کنید" -ForegroundColor Yellow
}
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
