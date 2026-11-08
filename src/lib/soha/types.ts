// =====================================================================
// وب‌سرویس سها — پیکربندی و انواع داده
// انتقال تدریجی از کد PHP فعلی: هر منطق اختصاصی که در PHP پیاده شده،
// در لایه‌های client.ts / sync.ts به‌صورت متدهای مجزا بازنویسی می‌شود.
// =====================================================================

export type SohaConfig = {
  enabled: boolean;
  baseUrl: string;     // آدرس پایهٔ وب‌سرویس سها (مثال: https://soha.example.ir/api)
  username: string;
  password: string;
  apiKey: string;      // در صورت استفاده از توکن/کلید به‌جای Basic
  centerCode: string;  // کد مرکز در سامانه سها
  protocol: "rest" | "soap";
};

// کلیدهای تنظیمات در جدول Settings (گروه «وب‌سرویس سها»)
export const SOHA_SETTING_KEYS = {
  enabled: "soha.enabled",
  baseUrl: "soha.baseUrl",
  username: "soha.username",
  password: "soha.password",
  apiKey: "soha.apiKey",
  centerCode: "soha.centerCode",
  protocol: "soha.protocol",
} as const;

// کلید نشانگر افزایشی (cursor) برای هر موجودیت — در Settings نگهداری می‌شود
export const sohaCursorKey = (entity: string) => `soha.cursor.${entity}`;

export const SOHA_ENTITIES = ["Patients", "Referrals", "Services"] as const;
export type SohaEntity = (typeof SOHA_ENTITIES)[number];

// ---------------------- DTOهای سها ----------------------
// فیلدها بر اساس قرارداد رایج وب‌سرویس سها نام‌گذاری شده‌اند؛ پس از اتصال
// به نمونهٔ واقعی، در صورت تفاوت فقط همین DTOها و mapSohaPatient/mapSohaReferral
// را در sync.ts تنظیم کنید (بدون تغییر بقیهٔ سامانه).

export type SohaPatient = {
  nationalId: string;      // کد ملی
  firstName: string;
  lastName: string;
  fatherName?: string;
  gender?: "men" | "women" | string;
  birthDate?: string;      // YYYY/MM/DD یا ISO
  mobile?: string;
  phone?: string;
  provinceCode?: string;
  cityCode?: string;
  address?: string;
  postalCode?: string;
};

export type SohaReferral = {
  refId: string;           // شناسه یکتای ارجاع در سها
  nationalId: string;      // کد ملی مراجع
  serviceCode: string;     // کد خدمت
  description?: string;
  provinceCode?: string;
  cityCode?: string;
  centerCode?: string;
  sessionsCount?: number;
  status?: string;         // وضعیت در سها
  createdAt?: string;
};

export type SohaSyncResult = {
  ok: boolean;
  records: number;
  cursor?: string;
  message?: string;
};
