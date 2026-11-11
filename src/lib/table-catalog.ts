// =====================================================================
// فرادادهٔ جدول‌های سامانه — موتور «مدیریت جدول‌ها» (نسخهٔ ۶.۱۸)
// ---------------------------------------------------------------------
// • TABLE_META  : برچسب فارسی و حوزهٔ کاری هر مدل — پوشش کامل ۷۵ جدول
//   سامانهٔ قدیم (app2_backup) + جدول‌های جدید سامانه
// • FIELD_LABELS: برچسب فارسی فیلدهای پرکاربرد (بقیه با نام خود فیلد)
// • FK_TARGETS  : فیلدهای ارتباطی که در فرم ثبت/ویرایش به‌صورت انتخاب
//   شناسه از جدول مقصد نمایش داده می‌شوند
// • HIDDEN_FIELDS: فیلدهای حساس (رمز/توکن) که هرگز در مدیریت جدول‌ها
//   نمایش یا ویرایش نمی‌شوند
// ساختار فیلدها در زمان اجرا از Prisma.dmmf خوانده می‌شود — همیشه
// همگام با اسکیما؛ این فایل فقط فرادادهٔ نمایشی است.
// =====================================================================

export type TableMeta = {
  /** نام مدل Prisma */
  model: string;
  /** نام delegate در PrismaClient (حرف اول کوچک) */
  delegate: string;
  /** نام جدول فیزیکی/legacy */
  table: string;
  /** برچسب فارسی */
  label: string;
  /** حوزهٔ کاری */
  domain: string;
  /** جدول تازه‌افزوده‌شده در نسخهٔ ۶.۱۸ */
  isNew?: boolean;
};

function meta(model: string, table: string, label: string, domain: string, isNew = false): TableMeta {
  const delegate = model.charAt(0).toLowerCase() + model.slice(1);
  return { model, delegate, table, label, domain, isNew: isNew || undefined };
}

export const TABLE_META: TableMeta[] = [
  // ───── جدول‌های سامانهٔ قدیم (۷۵ جدول app2_backup) ─────
  meta("Log", "Log", "گزارش فعالیت (لاگ)", "نظارت و ثبت رویداد"),
  meta("ApiReport", "ApiReports", "گزارش‌های API سها", "سها و API"),
  meta("EventComment", "EventComments", "یادداشت مشاور درباره جلسه", "جلسات مشاوره"),
  meta("Event", "Events", "جلسات مشاوره و خدمات", "جلسات و خدمات"),
  meta("EventPersonal", "EventPersonal", "موضوع و شرح جلسه", "جلسات مشاوره", true),
  meta("Sms", "SMS", "پیامک‌ها", "ارتباطات"),
  meta("Referr", "Referrs", "ارجاعات سها", "ارجاع سها"),
  meta("User", "Users", "کاربران (مراجعان، مشاوران، مدیران)", "کاربران و هویت"),
  meta("EventReserve", "EventReserves", "رزرو وقت مشاوره", "رزرو جلسات"),
  meta("FixEndrefer", "_fix_endrefer", "کمکی اصلاح ارجاعات", "فنی", true),
  meta("GroupEventMember", "GroupEventMember", "حاضران جلسات گروهی", "خدمات گروهی"),
  meta("Session", "Sessions", "نشست‌های ورود", "امنیت و ورود"),
  meta("GroupMember", "GroupMembers", "اعضای گروه‌ها", "خدمات گروهی"),
  meta("EventPsychology", "EventPsychology", "شرح حال و معاینه روانی", "پرونده بالینی"),
  meta("EventReferral", "EventReferrs", "ارجاع داخلی جلسات", "ارجاع داخلی"),
  meta("ConsultantCourse", "ConsultantCourses", "دوره‌های آموزشی مشاوران", "منابع انسانی"),
  meta("Job", "JobsList", "عناوین شغلی", "اطلاعات شغلی", true),
  meta("EventQuiz", "EventQuizzes", "آزمون‌های تجویزشده در جلسه", "پرونده بالینی", true),
  meta("EventDisorder", "EventDisorders", "اختلالات ثبت‌شده در جلسه", "پرونده بالینی"),
  meta("Group", "Groups", "گروه‌های مشاوره‌ای", "خدمات گروهی"),
  meta("GroupEvent", "GroupEvents", "جلسات گروهی", "خدمات گروهی"),
  meta("EventsEms", "EventsEms", "موارد حاد (EMS)", "موارد حاد"),
  meta("ConsultantTax", "ConsultantTax", "مالیات مشاوران", "مالی مشاوران"),
  meta("UserRole", "UserRoles", "نقش‌های کاربران", "کاربران و دسترسی"),
  meta("ConsultantExperience", "ConsultantExperience", "سوابق کاری مشاوران", "منابع انسانی"),
  meta("ConsultantTeachingExperience", "ConsultantTeachingExperience", "سوابق تدریس مشاوران", "منابع انسانی", true),
  meta("ReferrRequest", "ReferrsRequest", "درخواست‌های رزرو", "ارجاع و رزرو"),
  meta("ReferrFollowUp", "ReferrFollowUps", "پیگیری ارجاعات", "ارجاع سها"),
  meta("EventNeuroFeedback", "EventNeuroFeedback", "نوروفیدبک", "پرونده بالینی"),
  meta("File", "Files", "فایل‌های بارگذاری‌شده", "فایل و مستندات"),
  meta("ConsultantEducation", "ConsultantEducation", "مدارک تحصیلی مشاوران", "منابع انسانی"),
  meta("CenterBankAccount", "CenterBankAccount", "حساب‌های بانکی مراکز", "مراکز و تسویه"),
  meta("City", "Cities", "شهرستان‌ها", "جغرافیا"),
  meta("CareerCounseling", "CareerCounseling", "مشاوره شغلی", "مشاوره شغلی", true),
  meta("Center", "Centers", "مراکز و کلینیک‌ها", "مراکز و جغرافیا"),
  meta("EventChildPsychology", "EventChildPsychology", "ارزیابی روان‌شناسی کودک", "پرونده بالینی", true),
  meta("EventEmsComment", "EventEmsComments", "نظرات کمیسیون موارد حاد", "موارد حاد"),
  meta("ConsultantHistory", "ConsultantHistory", "تاریخچه همکاری مشاوران", "منابع انسانی", true),
  meta("Disorder", "Disorders", "طبقه‌بندی اختلالات روانی", "مرجع بالینی", true),
  meta("BudgetCity", "BudgetCity", "سهمیهٔ شهرستان", "بودجه و سهمیه"),
  meta("ApiState", "ApiStates", "وضعیت و کد API شهرها", "سها و API", true),
  meta("Message", "Messages", "پیام‌های داخلی", "ارتباطات داخلی"),
  meta("EventMedicine", "EventMedicine", "داروهای تجویزشده", "پرونده بالینی"),
  meta("EventHeadMap", "EventHeadMap", "نقشه مغزی (QEEG)", "پرونده بالینی"),
  meta("BudgetProvince", "BudgetProvince", "سهمیهٔ استان", "بودجه و سهمیه"),
  meta("CorporateContractService", "CorporateContractServices", "خدمات قرارداد سازمانی", "قرارداد و تعرفه"),
  meta("UserMfa", "UserMFA", "ورود دومرحله‌ای", "امنیت و ورود", true),
  meta("BudgetCenter", "BudgetCenter", "سهمیهٔ مرکز", "بودجه و سهمیه"),
  meta("CorporateContractCoupon", "CorporateContractCoupons", "کوپن‌های قرارداد", "قراردادها"),
  meta("CenterEquipment", "CenterEquipments", "تجهیزات مراکز", "مراکز و تجهیزات"),
  meta("Province", "Provinces", "استان‌ها", "جغرافیا"),
  meta("Setting", "Settings", "تنظیمات سامانه", "تنظیمات سامانه"),
  meta("CorporateContract", "CorporateContracts", "قراردادهای سازمانی", "قراردادها"),
  meta("Role", "Roles", "نقش‌ها و سطوح دسترسی", "کاربران و دسترسی"),
  meta("Service", "Services", "خدمات و تعرفه‌ها", "خدمات و تعرفه"),
  meta("EquipmentItem", "EquipmentItems", "فهرست تجهیزات", "مراکز و تجهیزات"),
  meta("Education", "Education", "سطح تحصیلات", "اطلاعات پایه کاربران"),
  meta("Budget", "Budget", "بودجه کلی", "بودجه و سهمیه"),
  meta("CorporateCustomer", "CorporateCustomers", "مشتریان سازمانی", "قراردادها"),
  meta("Marriage", "Marriage", "وضعیت تأهل", "اطلاعات پایه کاربران"),
  meta("Religion", "Religion", "دین و مذهب", "اطلاعات پایه کاربران"),
  meta("CenterCategory", "CenterCategories", "دسته‌بندی مراکز", "مراکز و جغرافیا"),
  meta("SpecialOccasion", "SpecialOccasions", "مناسبت‌های نمایشی", "محتوای نمایشی"),
  meta("InvitePerson", "InvitePersons", "افراد معرفی‌شده", "معرفی و جذب کاربران", true),
  meta("ApiToken", "ApiTokens", "توکن‌های API", "امنیت و API"),
  meta("CorporateContractNid", "CorporateContractNIDs", "کدهای ملی قرارداد سازمانی", "قراردادها", true),
  meta("UserTicket", "UserTicket", "تیکت پشتیبانی", "پشتیبانی"),
  meta("ConsultScope", "ConsultScope", "حوزه‌های تخصصی مشاوره", "اطلاعات پایه مشاوره", true),
  meta("Expense", "Expenses", "هزینه‌های مراکز", "مالی مراکز", true),
  meta("GroupEventReserve", "GroupEventReserves", "رزرو جلسات گروهی", "خدمات گروهی", true),
  meta("Help", "Helps", "راهنمای سامانه", "راهنمای سامانه"),
  meta("Income", "Incomes", "درآمدهای مراکز", "مالی مراکز", true),
  meta("Notification", "Notifications", "اعلان‌ها", "اعلان‌ها"),
  meta("NotificationQueue", "NotificationsQueue", "صف ارسال اعلان", "اعلان‌ها", true),
  meta("UserPasskey", "UserPasskeys", "کلیدهای عبور", "امنیت و ورود", true),
  // ───── جدول‌های ویژهٔ سامانهٔ جدید ─────
  meta("PsychTest", "PsychTests", "آزمون‌های روان‌شناختی", "آزمون و آموزش"),
  meta("PsychTestAttempt", "PsychTestAttempts", "پاسخ‌های آزمون", "آزمون و آموزش"),
  meta("TrainingItem", "TrainingItems", "آموزش‌ها", "آزمون و آموزش"),
  meta("TrainingAttempt", "TrainingAttempts", "پاسخ‌های آموزش", "آزمون و آموزش"),
  meta("FormDefinition", "FormDefinitions", "فرم‌ساز — تعریف فرم", "ابزارها"),
  meta("FormSubmission", "FormSubmissions", "فرم‌ساز — پاسخ‌ها", "ابزارها"),
  meta("ChecklistTemplate", "ChecklistTemplates", "تیک هوشمند — الگو", "ابزارها"),
  meta("ChecklistRun", "ChecklistRuns", "تیک هوشمند — اجراها", "ابزارها"),
  meta("ChecklistRunItem", "ChecklistRunItems", "تیک هوشمند — آیتم‌ها", "ابزارها"),
  meta("WebService", "WebServices", "وب‌سرویس‌ساز", "ابزارها"),
  meta("ProcessDefinition", "ProcessDefinitions", "فرایندها — تعریف", "فرایندهای سازمانی"),
  meta("ProcessInstance", "ProcessInstances", "فرایندها — نمونه‌ها", "فرایندهای سازمانی"),
  meta("ProcessStepLog", "ProcessStepLogs", "فرایندها — گام‌ها", "فرایندهای سازمانی"),
  meta("FinanceTransaction", "FinanceTransactions", "تراکنش‌های مالی", "مالی مراکز"),
  meta("UserCenter", "UserCenters", "ارتباط کاربر و مرکز", "کاربران و دسترسی"),
  meta("ImportJob", "ImportJobs", "کارهای درون‌ریزی داده", "سیستم"),
  meta("SyncLog", "SyncLogs", "لاگ همگام‌سازی", "سیستم"),
  meta("ChatMessage", "ChatMessages", "پیام‌های دستیار هوشمند", "سیستم"),
];

/** جدول‌های تازه‌افزودهٔ ۶.۱۸ */
export const NEW_TABLES = TABLE_META.filter((t) => t.isNew).map((t) => t.model);

// ---------------------------------------------------------------------
// برچسب فارسی فیلدها — نام‌های پرکاربرد؛ بقیه با نام خود فیلد نمایش
// ---------------------------------------------------------------------
export const FIELD_LABELS: Record<string, string> = {
  id: "شناسه",
  userId: "شناسه کاربر",
  eventId: "شناسه جلسه",
  centerId: "شناسه مرکز",
  serviceId: "شناسه خدمت",
  provinceId: "شناسه استان",
  cityId: "شناسه شهر",
  roleId: "شناسه نقش",
  groupId: "شناسه گروه",
  groupEventId: "شناسه جلسه گروهی",
  contractId: "شناسه قرارداد",
  fileId: "شناسه فایل",
  corporateCustomerId: "شناسه مشتری سازمانی",
  consultantId: "شناسه مشاور",
  agentId: "شناسه کارگزار",
  acceptorId: "شناسه پذیرنده",
  createdBy: "ثبت‌کننده",
  addedBy: "افزوده‌شده توسط",
  title: "عنوان",
  name: "نام",
  family: "نام‌خانوادگی",
  topic: "موضوع",
  description: "توضیحات",
  note: "یادداشت",
  nid: "کد ملی",
  consultantNid: "کد ملی مشاور",
  applicantNid: "کد ملی متقاضی",
  mobile: "موبایل",
  phone: "تلفن",
  code: "کد",
  apiCode: "کد API",
  trackingCode: "کد رهگیری",
  isActive: "فعال",
  enabled: "فعال‌سازی",
  used: "استفاده‌شده",
  status: "وضعیت",
  requestStatus: "وضعیت درخواست",
  category: "دسته",
  type: "نوع",
  kind: "نوع",
  method: "روش",
  fee: "مبلغ",
  amount: "مبلغ",
  weight: "وزن",
  dateTime: "تاریخ و ساعت",
  createdAt: "تاریخ ثبت",
  updatedAt: "آخرین به‌روزرسانی",
  createTime: "زمان ایجاد",
  updateTime: "زمان به‌روزرسانی",
  startDate: "تاریخ شروع",
  endDate: "تاریخ پایان",
  startTime: "زمان شروع",
  date: "تاریخ",
  payDate: "تاریخ پرداخت",
  incomeDate: "تاریخ درآمد",
  applicationDate: "تاریخ درخواست",
  graduationDate: "تاریخ فارغ‌التحصیلی",
  fromYear: "از سال",
  toYear: "تا سال",
  scheduledAt: "زمان‌بندی ارسال",
  sentAt: "زمان ارسال",
  lastRunAt: "آخرین اجرا",
  lastUsedAt: "آخرین استفاده",
  uploadDateTime: "زمان بارگذاری",
  answers: "پاسخ‌ها",
  payload: "داده (JSON)",
  channel: "کانال",
  attempts: "تعداد تلاش",
  totalScore: "نمره کل",
  resultScore: "نمره نهایی",
  hours: "ساعت",
  institution: "مؤسسه",
  institute: "آموزشگاه",
  grade: "مدرک / پایه",
  office: "دفتر",
  applicantName: "نام متقاضی",
  applicantMobile: "موبایل متقاضی",
  applicantGender: "جنسیت متقاضی",
  targetGroup: "گروه هدف",
  instituteProvinceId: "استان آموزشگاه",
  instituteProvince: "استان آموزشگاه",
  budgetReserved: "بودجه رزرو شده",
  budgetUsed: "بودجه مصرف شده",
  groupName: "نام گروه",
  response: "پاسخ",
  payTo: "پرداخت به",
  payType: "نوع پرداخت",
  birthHistory: "سابقه تولد",
  development: "مراحل رشد",
  familyStatus: "وضعیت خانواده",
  schoolStatus: "وضعیت تحصیل",
  behavior: "رفتار",
  sleep: "خواب",
  speech: "گفتار",
  observation: "مشاهده بالینی",
  conclusion: "نتیجه‌گیری",
  device: "دستگاه",
  credentialId: "شناسه اعتبار",
  secret: "کلید رمز",
  recoveryCodes: "کدهای بازیابی",
  publicKey: "کلید عمومی",
  counter: "شمارنده",
  location: "مسیر فایل",
  value: "مقدار",
  group: "گروه",
  permissions: "دسترسی‌ها (JSON)",
  dataScope: "دامنهٔ داده",
  short: "نام کوتاه",
  address: "نشانی",
  tel: "تلفن",
  email: "ایمیل",
  file: "فایل",
  scorePercent: "درصد نمره",
  passed: "قبول",
  subject: "موضوع",
  text: "متن",
  message: "پیام",
  level: "سطح",
  isRead: "خوانده‌شده",
  body: "متن",
  comment: "یادداشت",
};

// ---------------------------------------------------------------------
// فیلدهای ارتباطی — در فرم، انتخاب شناسه از جدول مقصد را ممکن می‌کند
// ---------------------------------------------------------------------
export type FkTarget = { model: string; delegate: string; labelFields: string[] };

function fk(field: string, model: string, labelFields: string[]): [string, FkTarget] {
  return [field, { model, delegate: model.charAt(0).toLowerCase() + model.slice(1), labelFields }];
}

export const FK_TARGETS: Record<string, FkTarget> = Object.fromEntries([
  fk("userId", "User", ["name", "family"]),
  fk("consultantId", "User", ["name", "family"]),
  fk("agentId", "User", ["name", "family"]),
  fk("acceptorId", "User", ["name", "family"]),
  fk("createdBy", "User", ["name", "family"]),
  fk("centerId", "Center", ["centerTitle"]),
  fk("serviceId", "Service", ["name"]),
  fk("provinceId", "Province", ["title"]),
  fk("cityId", "City", ["title"]),
  fk("roleId", "Role", ["title"]),
  fk("groupId", "Group", []),
  fk("groupEventId", "GroupEvent", ["topic"]),
  fk("contractId", "CorporateContract", []),
  fk("corporateCustomerId", "CorporateCustomer", ["title"]),
  fk("fileId", "File", ["name"]),
  fk("eventId", "Event", ["trackingCode"]),
]);

// ---------------------------------------------------------------------
// فیلدهای حساس — هرگز نمایش/ویرایش نمی‌شوند
// ---------------------------------------------------------------------
export const HIDDEN_FIELDS: Record<string, string[]> = {
  User: ["passwordHash"],
  Session: ["token"],
  ApiToken: ["token"],
  UserMfa: ["secret", "recoveryCodes"],
  UserPasskey: ["publicKey"],
};

/** برچسب فارسی یک فیلد */
export function fieldLabel(name: string): string {
  return FIELD_LABELS[name] ?? name;
}

/** یافتن فرادادهٔ جدول با نام مدل */
export function findTableMeta(model: string): TableMeta | undefined {
  return TABLE_META.find((t) => t.model === model);
}
