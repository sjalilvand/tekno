// =====================================================================
// گزارش‌های آمادهٔ گزارش‌ساز — الگوبرداری دقیق از read_mysql/presets.py
// ۱۶ گزارش مطابق صفحات برنامهٔ اصلی «راه زندگی»؛ هر گزارش یک پیکربندی
// امن از موتور گزارش‌ساز است (بدون SQL خام).
// =====================================================================

export type PresetConfig = {
  dataset: string;
  mode: "detail" | "summary";
  columns: string[];
  filters: Record<string, string>;
  colFilters?: { column: string; op: string; value?: string }[];
  groupBy?: string;
  metric?: string;
};

export type ReportPreset = {
  key: string;
  title: string;
  desc: string;
  icon: string;
  category: string;
  config: PresetConfig;
};

const f = (over: Record<string, string> = {}): Record<string, string> => ({
  q: "", status: "", serviceId: "", centerId: "", from: "", to: "", ...over,
});

export const REPORT_PRESETS: ReportPreset[] = [
  {
    key: "done_events", title: "گزارش جلسات مشاوره انجام‌شده", icon: "✅", category: "جلسات مشاوره",
    desc: "همهٔ جلسات فردی که پایان یافته‌اند — مطابق صفحهٔ «گزارش جلسات مشاوره انجام شده»",
    config: {
      dataset: "events", mode: "detail", filters: f({ doneOnly: "1" }),
      columns: ["id", "startDate", "endDate", "userName", "userNid", "userMobile", "center", "province", "city", "adviser", "service", "userTariff", "status"],
    },
  },
  {
    key: "undone_events", title: "گزارش جلسات مشاوره ناتمام", icon: "⏳", category: "جلسات مشاوره",
    desc: "جلسات در جریان یا ردشده — جلساتی که پایان نیافته‌اند",
    config: {
      dataset: "events", mode: "detail", filters: f({ doneOnly: "0" }),
      columns: ["id", "startDate", "userName", "userNid", "userMobile", "center", "province", "city", "adviser", "service", "status", "isEms"],
    },
  },
  {
    key: "group_done", title: "گزارش جلسات گروهی انجام‌شده", icon: "👥", category: "جلسات مشاوره",
    desc: "جلسات گروهی پایان‌یافته با تعداد حاضران و موضوع",
    config: {
      dataset: "group-events", mode: "detail", filters: f({ doneOnly: "1" }),
      columns: ["id", "sessionNumber", "topic", "groupTitle", "membersCount", "center", "adviser", "startDate", "endDate", "status"],
    },
  },
  {
    key: "group_undone", title: "گزارش جلسات گروهی ناتمام", icon: "👥", category: "جلسات مشاوره",
    desc: "جلسات گروهی در جریان یا در انتظار تایید",
    config: {
      dataset: "group-events", mode: "detail", filters: f({ doneOnly: "0" }),
      columns: ["id", "sessionNumber", "topic", "groupTitle", "membersCount", "center", "adviser", "startDate", "status"],
    },
  },
  {
    key: "payments", title: "عملکرد مالی (به تفکیک مشاور و خدمت)", icon: "💰", category: "مالی",
    desc: "تعرفه و سهم‌های مالی جلسات با گروه‌بندی بر اساس مشاور",
    config: {
      dataset: "finance", mode: "detail", filters: f(),
      columns: ["startDate", "userName", "adviser", "service", "center", "userTariff", "acceptorFee", "centerFee", "adminFee", "supervisorFee"],
    },
  },
  {
    key: "recipient", title: "گزارش به تفکیک خدمت‌گیرنده", icon: "🧾", category: "مالی",
    desc: "جمع جلسات و تعرفهٔ هر مراجع — گروه‌بندی بر اساس مراجع",
    config: {
      dataset: "events", mode: "summary", filters: f(),
      columns: ["userName", "userNid"], groupBy: "user", metric: "count",
    },
  },
  {
    key: "referrs", title: "ارجاع‌های سها", icon: "↔️", category: "عملیات",
    desc: "ارجاع‌های دریافتی از سامانهٔ سها با وضعیت و تعداد جلسات",
    config: {
      dataset: "referrals", mode: "detail", filters: f(),
      columns: ["id", "refId", "creationDate", "userName", "userNid", "userMobile", "service", "sessionsCount", "status", "description"],
    },
  },
  {
    key: "reserve_requests", title: "درخواست‌های رزرو کاربران", icon: "📥", category: "عملیات",
    desc: "درخواست‌های رزرو ثبت‌شدهٔ کاربران و وضعیت بررسی آن‌ها",
    config: {
      dataset: "reserve-requests", mode: "detail", filters: f(),
      columns: ["id", "creationDate", "userName", "description", "province", "center", "status"],
    },
  },
  {
    key: "ems", title: "موارد حاد", icon: "🚨", category: "موارد حاد",
    desc: "موارد حاد (آسیب به خود) با شدت خطر، وضعیت بررسی و پرداخت",
    config: {
      dataset: "ems", mode: "detail", filters: f(),
      columns: ["id", "date", "userName", "userNid", "province", "city", "adviser", "adviserMobile", "emsType", "suicidalFrom", "severity", "payStatus", "amount", "eventStatus"],
    },
  },
  {
    key: "confirmations", title: "بررسی مشاوره‌ها (تایید چندمرحله‌ای)", icon: "🛡️", category: "جلسات مشاوره",
    desc: "وضعیت تایید ۵ مرحله‌ای هر جلسه: مدیر مرکز، مسئول فنی، نظارت حرفه‌ای، ناظر استان و ناظر کشور",
    config: {
      dataset: "events", mode: "detail", filters: f(),
      columns: ["id", "startDate", "userName", "userNid", "service", "adviser", "province", "city", "center", "confirmCenter", "confirmTech", "confirmOper", "confirmProvince", "confirmSup", "status"],
    },
  },
  {
    key: "invitepersons", title: "کاربران معرفی‌شده", icon: "🤝", category: "کاربران",
    desc: "کاربرانی که توسط معرفان اداری معرفی شده‌اند (بر اساس ارجاع‌های معرفی)",
    config: {
      dataset: "referrals", mode: "detail", filters: f(),
      columns: ["id", "creationDate", "userName", "userNid", "userMobile", "service", "status", "sessionsCount"],
    },
  },
  {
    key: "logs", title: "گزارش فعالیت کاربران", icon: "📜", category: "سیستم",
    desc: "لاگ رویدادهای سامانه با دسته‌بندی، سطح و IP",
    config: {
      dataset: "logs", mode: "detail", filters: f(),
      columns: ["id", "timestamp", "userName", "category", "description", "level", "ip"],
    },
  },
  {
    key: "users", title: "مدیریت کاربران", icon: "👤", category: "کاربران",
    desc: "فهرست کاربران با کد ملی، موبایل، جنسیت و وضعیت",
    config: {
      dataset: "users", mode: "detail", filters: f(),
      columns: ["id", "nid", "username", "name", "family", "mobile", "gender", "signupDate", "blocked", "confirm"],
    },
  },
  {
    key: "consultant_tax", title: "مالیات مشاوران", icon: "🏛️", category: "مالی",
    desc: "مالیات محاسبه‌شدهٔ ماهانهٔ مشاوران بر اساس پرداخت‌ها",
    config: {
      dataset: "taxes", mode: "detail", filters: f(),
      columns: ["id", "userName", "nid", "year", "month", "taxAmount", "totalPayment", "exemptionMonths"],
    },
  },
  {
    key: "budgets", title: "سهمیه‌های خدمات (بودجه)", icon: "📦", category: "مالی",
    desc: "سقف، مصرف و درصد مصرف سهمیه‌های خدمات فردی/گروهی/شغلی",
    config: {
      dataset: "budgets", mode: "detail", filters: f(),
      columns: ["id", "title", "kind", "amount", "used", "reserved", "remained", "assigned", "pct", "startDate", "endDate"],
    },
  },
  {
    key: "reserves", title: "رزرو جلسات مشاوره", icon: "📌", category: "عملیات",
    desc: "رزروهای ثبت‌شدهٔ وقت مشاوره با وضعیت جلسهٔ مرتبط",
    config: {
      dataset: "reserves", mode: "detail", filters: f(),
      columns: ["id", "date", "userName", "eventTrackingCode", "eventStatus"],
    },
  },
];
