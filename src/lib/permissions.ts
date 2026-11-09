// =====================================================================
// کاتالوگ دسترسی‌ها — نگاشت ماژول‌ها به برچسب فارسی، آیکون و گروه
// کلید ویژهٔ "*" یعنی دسترسی کامل (مدیر سامانه)
// هر نقش آرایه‌ای از کلیدها را نگه می‌دارد؛ اگر آرایه null بود =
// سازگاری با گذشته و همهٔ دسترسی‌ها باز است.
// =====================================================================

export type PermModule = {
  key: string; // کلید مسیر داخلی
  label: string;
  group: string;
};

export const PERM_MODULES: PermModule[] = [
  // نگاه کلی
  { key: "dashboard", label: "داشبورد", group: "نگاه کلی" },
  { key: "bi", label: "داشبوردهای مدیریتی", group: "نگاه کلی" },
  { key: "processes", label: "فرایندهای سازمانی (BPMN)", group: "نگاه کلی" },
  // ابزارها
  { key: "reports", label: "گزارش‌ساز حرفه‌ای", group: "ابزارها" },
  { key: "forms", label: "فرم‌ساز", group: "ابزارها" },
  { key: "checklists", label: "تیک‌های هوشمند", group: "ابزارها" },
  // عملیات
  { key: "cartable", label: "کارتابل متقاضی", group: "عملیات" },
  { key: "events", label: "جلسات مشاوره", group: "عملیات" },
  { key: "group-events", label: "جلسات گروهی", group: "عملیات" },
  { key: "reserves", label: "رزرو مشاوره", group: "عملیات" },
  { key: "referrals", label: "ارجاعات سها", group: "عملیات" },
  { key: "referral-requests", label: "درخواست‌های رزرو", group: "عملیات" },
  { key: "ems", label: "موارد حاد (EMS)", group: "عملیات" },
  { key: "risk-model", label: "مدل کیس حاد و ریسک", group: "عملیات" },
  // اطلاعات پایه
  { key: "users", label: "کاربران", group: "اطلاعات پایه" },
  { key: "centers", label: "مراکز و کلینیک‌ها", group: "اطلاعات پایه" },
  { key: "roles", label: "کاربران و سطوح دسترسی", group: "اطلاعات پایه" },
  { key: "contracts", label: "قراردادهای سازمانی", group: "اطلاعات پایه" },
  // مالی
  { key: "budgets", label: "سهمیه‌های خدماتی", group: "مالی" },
  { key: "finance", label: "عملکرد مالی", group: "مالی" },
  { key: "tax", label: "مالیات مشاوران", group: "مالی" },
  // ارتباطات
  { key: "sms", label: "پیامک‌ها", group: "ارتباطات" },
  { key: "messages", label: "پیام‌های داخلی", group: "ارتباطات" },
  { key: "occasions", label: "مناسبت‌ها", group: "ارتباطات" },
  // سیستم
  { key: "integrations", label: "یکپارچه‌سازی‌ها", group: "سیستم" },
  { key: "webservices", label: "وب‌سرویس‌ساز", group: "سیستم" },
  { key: "backup", label: "داده و پشتیبان", group: "سیستم" },
  { key: "logs", label: "لاگ فعالیت", group: "سیستم" },
  { key: "tickets", label: "تیکت پشتیبانی", group: "سیستم" },
  { key: "settings", label: "تنظیمات سامانه", group: "سیستم" },
  { key: "helps", label: "راهنما", group: "سیستم" },
  { key: "profile", label: "پروفایل شخصی", group: "سیستم" },
];

export const PERM_GROUPS = [...new Set(PERM_MODULES.map((m) => m.group))];

// =====================================================================
// سطح عملیات — دیدن / ثبت / ویرایش / حذف (نسخهٔ ۶.۵)
// کلیدها در ماتریس: «module» = دیدن، «module:create|edit|delete» = عملیات
// آرایهٔ بدون هیچ «:» = قالب قدیمی — بودن ماژول یعنی همهٔ عملیات آن باز است
// =====================================================================

export const PERM_ACTIONS = [
  { key: "view", label: "دیدن", tone: "emerald" },
  { key: "create", label: "ثبت", tone: "cyan" },
  { key: "edit", label: "ویرایش", tone: "amber" },
  { key: "delete", label: "حذف", tone: "rose" },
] as const;

export type PermAction = (typeof PERM_ACTIONS)[number]["key"];

/** کلید ویژه — مشاور با این کلید، همهٔ داده‌ها (نه فقط مراجعان خودش) را می‌بیند */
export const SCOPE_ALL = "scope:all";

// =====================================================================
// دامنهٔ دادهٔ نقش (نسخهٔ ۶.۱۰) — تعریف اینکه هر نقش چه نوع داده‌ای را می‌بیند
//   all      — همهٔ داده‌ها (مدیر سامانه)
//   province — فقط دادهٔ استان مشخص‌شده (مدیر استان)
//   center   — فقط دادهٔ مرکز/کلینیک مشخص‌شده (مدیر کلینیک)
//   self     — فقط دادهٔ خودِ کاربر (مشاور — مراجعان خودش)
//   ""       — خودکار: مطابق رفتار گذشته (مشاور فقط خودش، بقیه همه)
// =====================================================================
export const DATA_SCOPES = [
  { key: "", label: "خودکار (مطابق گذشته)", hint: "نقش‌های مشاور فقط دادهٔ خودشان؛ سایر نقش‌ها همهٔ داده‌ها" },
  { key: "all", label: "همهٔ داده‌ها", hint: "دیدن دادهٔ همهٔ استان‌ها و مراکز — فقط برای مدیر سامانه" },
  { key: "province", label: "دادهٔ یک استان", hint: "مدیر استان — همهٔ دادهٔ مشاوران و مراکز همان استان" },
  { key: "center", label: "دادهٔ یک مرکز/کلینیک", hint: "مدیر کلینیک — همهٔ دادهٔ همان کلینیک" },
  { key: "self", label: "فقط دادهٔ خود کاربر", hint: "مشاور — فقط مراجعان و جلسات خودش" },
] as const;

export const DATA_SCOPE_KEYS: string[] = ["", "all", "province", "center", "self"];

export function dataScopeLabel(key: string | null | undefined): string {
  return DATA_SCOPES.find((s) => s.key === (key ?? ""))?.label ?? "خودکار";
}

/** آیا آرایه در قالب عملیاتی جدید است؟ (حداقل یک کلید دارای «:») */
export function isActionStyle(perms: string[] | null | undefined): boolean {
  return Boolean(perms && perms.some((p) => p.includes(":")));
}

/** آیا این مجموعه دسترسی، عملیات داده‌شده روی ماژول را مجاز می‌داند؟ */
export function canAction(perms: string[] | null | undefined, module: string, action: PermAction): boolean {
  if (perms === null || perms === undefined) return true; // legacy — همه‌چیز باز
  if (perms.includes("*")) return true;
  if (action === "view") return hasPermission(perms, module);
  if (!isActionStyle(perms)) return hasPermission(perms, module); // قالب قدیمی — ماژول = همهٔ عملیات
  return perms.includes(`${module}:${action}`);
}

/** برچسب فارسی عملیات برای پیام خطا */
export function actionLabel(action: PermAction): string {
  return PERM_ACTIONS.find((a) => a.key === action)?.label ?? action;
}

/** تبدیل آرایهٔ ماژول‌محور قدیمی به قالب عملیاتی — ماژول‌های فعلی = همهٔ عملیات */
export function toActionStyle(perms: string[]): string[] {
  if (isActionStyle(perms)) return perms;
  if (perms.includes("*")) return ["*"];
  const out: string[] = [];
  for (const p of perms) {
    out.push(p);
    if (PERM_MODULES.some((m) => m.key === p)) out.push(`${p}:create`, `${p}:edit`, `${p}:delete`);
  }
  return [...new Set(out)];
}

/** الگوی نقش‌های مشاور — این نقش‌ها فقط دادهٔ مراجعان خودشان را می‌بینند */
export const COUNSELOR_TITLE_RE = /مشاور|روانپزشک|روانشناس|روان\u200cشناس/;

/** الگوی نقش‌های مدیریتی — کلیدهای حساس سیستم (نقش‌ها/کاربران/وب‌سرویس) */
export const ADMIN_TITLE_RE = /مدیر|ادمین|admin|superuser/i;

/** الگوی نقش‌های مدیریتیِ محدود (نسخهٔ ۶.۱۰) — مدیر استان/کلینیک ادمین کامل نیستند؛
 *  دامنهٔ داده‌شان از فیلد dataScope نقش تعیین می‌شود. */
export const SCOPED_MANAGER_TITLE_RE = /مدیر\s*(استان|کلینیک|مرکز)|ناظر\s*استان/;

/** نقش‌های همیشه‌کامل — بدون نیاز به ماتریس */
export const FULL_ACCESS_ROLES = ["مدیر سامانه", "مدیر سیستم", "مدیر کل", "admin", "Administrator"];

/** تطبیق دقیق عنوان نقش با فهرست نقش‌های همیشه‌کامل (نسخهٔ ۶.۱۰)
 *  «مدیر کلینیک» نباید با «مدیر کل» تطبیق کند — پس از تطبیق باید مرز واژه باشد. */
export function isFullAccessTitle(title: string | null | undefined): boolean {
  const norm = (title ?? "").replace(/\u200c/g, " ").trim();
  if (!norm) return false;
  return FULL_ACCESS_ROLES.some((f) => {
    const fn = f.replace(/\u200c/g, " ");
    let i = norm.indexOf(fn);
    while (i !== -1) {
      const after = norm[i + fn.length];
      if (after === undefined || !/[\u0600-\u06FFa-zA-Z0-9]/.test(after)) return true;
      i = norm.indexOf(fn, i + 1);
    }
    return false;
  });
}

/** پیش‌تنظیم‌های آمادهٔ نقش — برای دکمه‌های سریع در ماتریس */
export const PERM_PRESETS: { key: string; label: string; modules: string[] }[] = [
  { key: "full", label: "دسترسی کامل (مدیر)", modules: ["*"] },
  {
    key: "consultant",
    label: "مشاور",
    modules: ["dashboard", "cartable", "events", "group-events", "reserves", "ems", "risk-model", "forms", "checklists", "messages", "profile", "helps", "tickets"],
  },
  {
    key: "secretary",
    label: "منشی / پذیرش",
    modules: ["dashboard", "cartable", "events", "reserves", "referral-requests", "referrals", "users", "sms", "messages", "profile", "helps", "tickets"],
  },
  {
    key: "finance",
    label: "واحد مالی",
    modules: ["dashboard", "finance", "tax", "budgets", "reports", "contracts", "profile", "helps", "tickets"],
  },
  {
    key: "viewer",
    label: "مشاهده‌گر (فقط خواندن)",
    modules: ["dashboard", "bi", "reports", "profile", "helps", "tickets"],
  },
  { key: "none", label: "بدون دسترسی", modules: ["profile", "helps", "tickets"] },
];

/**
 * استخراج دسترسی‌های نقش — ورودی: متن JSON ستون permissions
 * خروجی: ["*"] یعنی همه؛ آرایهٔ کلیدها؛ null ورودی = دسترسی کامل (سازگاری)
 */
export function parseRolePermissions(raw: string | null | undefined): string[] | null {
  if (raw === null || raw === undefined) return null; // legacy — همه‌چیز باز
  const s = raw.trim();
  if (!s) return null;
  try {
    const arr = JSON.parse(s);
    if (Array.isArray(arr)) return arr.map(String);
  } catch { /* نادیده */ }
  return null;
}

/** آیا این مجموعهٔ دسترسی، مسیر داده‌شده را شامل می‌شود؟ */
export function hasPermission(perms: string[] | null | undefined, routeKey: string): boolean {
  if (perms === null || perms === undefined) return true; // legacy
  if (perms.includes("*")) return true;
  return perms.includes(routeKey);
}

/** ترکیب دسترسی چند نقش یک کاربر — اگر حتی یک نقش "*" یا legacy داشت = کامل */
export function mergePermissions(rolePermLists: (string[] | null)[]): string[] {
  if (rolePermLists.some((p) => p === null)) return [];
  const merged = new Set<string>();
  for (const list of rolePermLists) for (const p of list ?? []) merged.add(p);
  return [...merged];
}
