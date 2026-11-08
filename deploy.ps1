# =====================================================================
#  سامانه راه زندگی — استقرار خودکار روی ویندوز (نسخه ۵.۱)
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
  if ($Mode -in @("install","update")) {
    if (-not (Test-Command git)) { Write-Fail "Git نصب نیست. نصب کنید: winget install Git.Git" }
    Write-Ok "git"
  }
  if ($DbEngine -eq "mysql" -and $Mode -in @("install","import")) {
    if (-not (Test-Command mysql)) {
      Write-Warn2 "کلاینت mysql در PATH نیست — ساخت دیتابیس باید از قبل انجام شده باشد"
    }
  }
}

# ------------------------------------------------------------- دریافت کد
function Get-Source {
  Write-Step "دریافت کد سامانه از $RepoUrl"
  if (Test-Path (Join-Path $InstallDir ".git")) {
    Push-Location $InstallDir
    Invoke-Native { git fetch origin $Branch 2>$null }
    Invoke-Native { git reset --hard "origin/$Branch" | Out-Null }
    Pop-Location
    Write-Ok "کد موجود به‌روزرسانی شد (git reset به origin/$Branch)"
  } else {
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    Invoke-Native { git clone --depth 1 --branch $Branch $RepoUrl $InstallDir }
    if ($LASTEXITCODE -ne 0) { Write-Fail "کلون مخزن ناموفق بود — دسترسی اینترنت/آدرس را بررسی کنید" }
    Write-Ok "مخزن در $InstallDir کلون شد"
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

# ------------------------------------------------------------- نصب و ساخت دیتابیس
function Install-Dependencies {
  Write-Step "نصب وابستگی‌ها (npm install) — چند دقیقه طول می‌کشد"
  Push-Location $InstallDir
  Invoke-Native { npm install --no-audit --no-fund 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray } }
  if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Fail "نصب وابستگی‌ها ناموفق بود" }
  Pop-Location
  Write-Ok "وابستگی‌ها نصب شدند"
}

function Invoke-PrismaSetup {
  Push-Location $InstallDir
  if ($DbEngine -eq "mysql") {
    Write-Step "اتصال به MySQL واقعی — prisma db push --schema prisma/schema.mysql.prisma"
    # client تولیدی نهایی باید از اسکیمای MySQL باشد
    Invoke-Native { npx prisma generate --schema prisma/schema.mysql.prisma 2>&1 | Out-Null }
    if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Fail "prisma generate (mysql) ناموفق بود" }
    Invoke-Native { npx prisma db push --schema prisma/schema.mysql.prisma --accept-data-loss 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray } }
    if ($LASTEXITCODE -ne 0) {
      Pop-Location
      Write-Warn2 "prisma db push ناموفق بود — احتمالاً دیتابیس «$MysqlDatabase» وجود ندارد"
      Write-Host "  ایجاد دستی دیتابیس:" -ForegroundColor Yellow
      Write-Host "    mysql -u $MysqlUser -p -e `"CREATE DATABASE $MysqlDatabase CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`"" -ForegroundColor Yellow
      exit 1
    }
    Write-Ok "ساختار جداول روی MySQL ایجاد/به‌روزرسانی شد"
  } else {
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
  Invoke-Native { npx tsx prisma/import-sqlite-to-mysql.ts --source "$src" --mysql "$(Build-MysqlUrl)" --mode truncate --resume 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray } }
  if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Fail "انتقال داده ناموفق بود — پس از رفع مشکل با --resume ادامه دهید" }
  Pop-Location
  Write-Ok "انتقال داده کامل شد (وضعیت: $DataDir\import_status.json)"
}

# ------------------------------------------------------------- ساخت و اجرا
function Invoke-Build {
  if ($SkipBuild) { Write-Warn2 "ساخت رد شد (-SkipBuild)"; return }
  Write-Step "ساخت نسخهٔ تولیدی (next build)"
  Push-Location $InstallDir
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
  $env:NODE_ENV = "production"
  $env:PORT = "$AppPort"
  $env:HOSTNAME = "0.0.0.0"
  $logFile = Join-Path $InstallDir "server.log"
  $proc = Start-Process -FilePath "node" -ArgumentList "`"$server`"" -WorkingDirectory $InstallDir `
          -WindowStyle Hidden -RedirectStandardOutput $logFile -RedirectStandardError "$InstallDir\server.err.log" -PassThru
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
  Write-Step "توقف سامانه"
  $p = Get-AppPid
  if ($p) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue; Write-Ok "فرایند $p متوقف شد" }
  else { Write-Warn2 "سامانه در حال اجرا نیست" }
}

function Show-Status {
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
    Invoke-Build
    Start-App
    if ($AutoStart) { Register-AutoStart }
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  استقرار کامل شد — سامانه راه زندگی نسخهٔ ۵.۱" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
  }
  "update" {
    Get-Source
    Install-Dependencies
    Invoke-PrismaSetup
    Invoke-Build
    Stop-App
    Start-App
  }
  "start"   { Start-App }
  "stop"    { Stop-App }
  "restart" { Stop-App; Start-App }
  "status"  { Show-Status }
  "import"  { Write-DotEnv; Invoke-DataImport }
}
