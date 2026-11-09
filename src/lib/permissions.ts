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

/** نقش‌های همیشه‌کامل — بدون نیاز به ماتریس */
export const FULL_ACCESS_ROLES = ["مدیر سامانه", "مدیر سیستم", "مدیر کل", "admin", "Administrator"];

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
