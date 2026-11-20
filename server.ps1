# =====================================================================
#  مرکز مشاوره رز (سامانه راه زندگی) — استقرار یک‌فرمانی روی سرور ویندوزی (نسخه ۶.۲۰)
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
# =====================================================================
param(
  [int]$Port = 8089,

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
  $args = @("install","--id",$Id,"-e","--accept-source-agreements","--accept-package-agreements","--silent","--disable-interactivity")
  $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  & winget @args 2>&1 | Out-Null
  $ErrorActionPreference = $prev
  return ($LASTEXITCODE -eq 0)
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
  New-Item -ItemType Directory -Force -Path (Split-Path $InstallDir -Parent) | Out-Null
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
}

# ------------------------------------------------------------- ۴) استقرار با deploy.ps1 (install + اجرای خودکار)
Write-Step "استقرار سامانه روی پورت $Port (نصب وابستگی‌ها + دیتابیس + build + اجرا)"
$deployArgs = @{
  Mode       = "install"
  AppPort    = $Port
  DbEngine   = $DbEngine
  InstallDir = $InstallDir
  DataDir    = $DataDir
  AutoStart  = $true
}
if ($DbEngine -eq "mysql") {
  $deployArgs.MysqlHost     = $MysqlHost
  $deployArgs.MysqlPort     = $MysqlPort
  $deployArgs.MysqlUser     = $MysqlUser
  $deployArgs.MysqlPassword = $MysqlPassword
  $deployArgs.MysqlDatabase = $MysqlDatabase
}

$deployScript = Join-Path $InstallDir "deploy.ps1"
if (-not (Test-Path $deployScript)) { Write-Fail "deploy.ps1 در مخزن پیدا نشد" }

$prevEAP = $ErrorActionPreference; $ErrorActionPreference = "Continue"
try { & $deployScript @deployArgs; $deployOk = ($LASTEXITCODE -ne 1) } catch {
  Write-Host $_.Exception.Message -ForegroundColor Red; $deployOk = $false
}
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
Write-Host "  پس از ری‌استارت سرور، سامانه خودکار بالا می‌آید (Task Scheduler: RaheZendegi)" -ForegroundColor DarkGray
if (-not $deployOk) {
  Write-Host "  ⚠ مرحلهٔ استقرار با خطا روبه‌رو شد — پیام‌های بالا و server.err.log را بررسی کنید" -ForegroundColor Yellow
}
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
