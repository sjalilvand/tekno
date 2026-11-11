// =====================================================================
// شخصی‌سازی ظاهر — پالت رنگ، فونت، تراکم و گردی گوشه‌ها (نسخهٔ ۶.۱۲)
// ذخیره‌سازی در localStorage هر کاربر + اعمال با data-attribute روی <html>
// =====================================================================

export type AppearanceFont = "sm" | "md" | "lg";
export type AppearanceDensity = "compact" | "cozy" | "roomy";
export type AppearanceRadius = "sharp" | "round" | "soft";

export type Appearance = {
  accent: string; // کلید پالت — rose | burgundy | indigo | teal | forest | slate
  font: AppearanceFont;
  density: AppearanceDensity;
  radius: AppearanceRadius;
};

export const APPEARANCE_KEY = "rz-appearance";

export const APPEARANCE_DEFAULT: Appearance = {
  accent: "rose",
  font: "md",
  density: "cozy",
  radius: "round",
};

/** اعمال فوری ویژگی‌های ظاهر روی سند — قبل از رندر (boot) و در تنظیمات */
export function applyAppearance(a: Partial<Appearance>): void {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  if (a.accent) el.dataset.accent = a.accent;
  if (a.font) el.dataset.font = a.font;
  if (a.density) el.dataset.density = a.density;
  if (a.radius) el.dataset.radius = a.radius;
}

/** خواندن تنظیمات ذخیره‌شده کاربر */
export function readAppearance(): Appearance {
  if (typeof localStorage === "undefined") return APPEARANCE_DEFAULT;
  try {
    return { ...APPEARANCE_DEFAULT, ...JSON.parse(localStorage.getItem(APPEARANCE_KEY) ?? "{}") };
  } catch {
    return APPEARANCE_DEFAULT;
  }
}

/** اسکریپت بوت برای layout — قبل از اولین رنگ‌آمیزی اجرا می‌شود تا پرش تم نداشته باشیم */
export const APPEARANCE_BOOT_SCRIPT = `(function(){try{var a=JSON.parse(localStorage.getItem("${APPEARANCE_KEY}")||"{}");var d=document.documentElement;if(a.accent)d.dataset.accent=a.accent;if(a.font)d.dataset.font=a.font;if(a.density)d.dataset.density=a.density;if(a.radius)d.dataset.radius=a.radius;}catch(e){}})();`;
