// =====================================================================
// وب‌سرویس‌ساز — کاتالوگ جداول مجاز روی دیتابیس
// ---------------------------------------------------------------
//  برای امنیت، فقط جداول این کاتالوگ قابل انتشار به‌صورت وب‌سرویس هستند
//  و فقط ستون‌های فهرست‌شده قابل انتخاب‌اند. رمز عبور/هش و توکن هرگز
//  در کاتالوگ نیست.
// =====================================================================

export type CatalogTable = {
  name: string; // نام واقعی جدول در دیتابیس
  label: string;
  columns: string[];
};

export const CATALOG: CatalogTable[] = [
  { name: "Users", label: "کاربران (مراجعان و مشاوران)", columns: ["id", "nid", "username", "name", "family", "gender", "birthday", "mobile", "email", "provinceId", "cityId", "signupDate", "lastLogin", "blocked", "confirm", "consultantLevel", "bio"] },
  { name: "Events", label: "جلسات مشاوره", columns: ["id", "userId", "nid", "trackingCode", "centerId", "serviceId", "userTariff", "acceptorId", "acceptorFee", "secretaryFee", "supervisorFee", "centerFee", "adminFee", "isEms", "level", "status", "startDate", "endDate", "topic", "isGroup", "weight"] },
  { name: "EventReserves", label: "رزرو جلسات", columns: ["id", "eventId", "date", "status"] },
  { name: "EventPsychology", label: "فرم روان‌شناسی جلسات", columns: ["id", "eventId", "description", "createTime"] },
  { name: "EventsEms", label: "کیس‌های حاد (EMS)", columns: ["id", "eventId", "severity", "suicidalRiskLevel", "hadPaymentStatus", "status", "description", "dateTime"] },
  { name: "Centers", label: "مراکز و کلینیک‌ها", columns: ["id", "title", "provinceTitle", "cityTitle", "phone", "address", "isActive"] },
  { name: "Services", label: "خدمات", columns: ["id", "name", "short", "kind", "price"] },
  { name: "Referrs", label: "ارجاعات سها", columns: ["id", "userId", "provinceId", "status", "description", "createTime"] },
  { name: "GroupEvents", label: "جلسات گروهی", columns: ["id", "title", "startDate", "endDate", "capacity", "status"] },
  { name: "Budget", label: "سهمیه‌های بودجه", columns: ["id", "title", "kind", "amount", "used", "reserved", "remained", "startDate", "endDate", "isActive"] },
  { name: "SMS", label: "پیامک‌ها", columns: ["id", "senderId", "receiverId", "mobile", "body", "status", "createTime"] },
  { name: "ConsultantTax", label: "مالیات مشاوران", columns: ["id", "userId", "year", "month", "taxAmount", "totalPayment"] },
  { name: "Provinces", label: "استان‌ها", columns: ["id", "title"] },
  { name: "Roles", label: "نقش‌ها", columns: ["id", "title", "level"] },
];

export function findTable(name: string): CatalogTable | null {
  return CATALOG.find((t) => t.name.toLowerCase() === String(name ?? "").toLowerCase()) ?? null;
}

/** ستون‌های درخواستی را با کاتالوگ تطبیق می‌دهد — خروجی خالی = همهٔ ستون‌ها */
export function safeColumns(table: CatalogTable, requested: string[]): string[] {
  if (!requested.length) return table.columns;
  const ok = requested.map((c) => String(c).trim()).filter((c) => table.columns.includes(c));
  return ok.length ? ok : table.columns;
}

export const ALLOWED_OPS = ["=", "!=", ">", ">=", "<", "<=", "LIKE"] as const;
export type AllowedOp = (typeof ALLOWED_OPS)[number];

export function isAllowedOp(op: string): boolean {
  return (ALLOWED_OPS as readonly string[]).includes(String(op));
}
