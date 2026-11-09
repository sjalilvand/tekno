// =====================================================================
// مدل پیش‌بینی کیس حاد (EMS) — کاوش داده و امتیازدهی ریسک
// ---------------------------------------------------------------------
//  ۱) کاوش الگو: از روی سوابق کیس‌های حاد ثبت‌شده (EventsEms) و مشخصات
//     متقاضیان، ویژگی‌هایی که احتمال رسیدن به کیس حاد را بالا می‌برند
//     کشف می‌شود (نسبت شدت = lift برای هر ویژگی).
//  ۲) امتیازدهی: برای هر متقاضی، ویژگی‌های منطبق جمع و به درصد ریسک
//     ۰ تا ۱۰۰ تبدیل می‌شود (مقیاس لوجیت با نرخ پایهٔ تاریخی).
//  ۳) هشدار: متقاضیان بالای آستانه به مشاورانشان اطلاع داده می‌شود.
// =====================================================================

export type RiskPattern = {
  key: string; // کلید یکتا: category:value
  category: string; // برچسب دسته
  label: string; // برچسب مقدار
  acuteCount: number; // تعداد کیس‌های حاد دارای این ویژگی
  acuteRate: number; // نسبت در بین کیس‌های حاد (۰-۱)
  baseRate: number; // نسبت در کل متقاضیان (۰-۱)
  lift: number; // acuteRate / baseRate
};

export type RiskFactor = { label: string; lift: number };

export type RiskApplicant = {
  id: number; name: string; family: string; nid: string; avatarColor: string | null;
  gender: string | null; age: number | null; sessions: number; acuteCount: number;
  severityHigh: boolean; lastAcuteAt: string | null;
  risk: number; // درصد ۰ تا ۱۰۰
  level: "کم" | "متوسط" | "بالا" | "بحرانی";
  factors: RiskFactor[]; // عوامل مؤثر مرتب‌شده
  acceptors: { id: number; name: string; family: string }[]; // مشاوران مرتبط
};

export type RiskModel = {
  trainedAt: string;
  totalUsers: number; // متقاضیان تحلیل‌شده
  acuteUsers: number; // کیس‌های حاد تاریخی
  baseline: number; // نرخ پایه کیس حاد
  patterns: RiskPattern[];
  insufficient: boolean;
  message: string | null;
};

type EmsRaw = { severity: string | null; dateTime: Date; emsType: string | null; suicidalFrom: string | null; psychiatricDisorders: string | null; socialFactors: string | null; protectiveFactors: string | null; eventId: number; eventUserId: number };

type UserRaw = {
  id: number; name: string; family: string; nid: bigint; avatarColor: string | null;
  gender: string | null; birthday: Date | null;
  educationName: string | null; marriageName: string | null;
  sessions: number; incomplete: number; rejected: number;
  acceptors: { id: number; name: string; family: string }[];
};

// ---------------------------------------------------------------- استخراج ویژگی

function parseList(v: string | null | undefined): string[] {
  if (!v) return [];
  try {
    const arr = JSON.parse(v);
    return Array.isArray(arr) ? arr.map((x) => String(x).trim()).filter(Boolean) : [];
  } catch {
    return typeof v === "string" && v.trim() ? [v.trim()] : [];
  }
}

function ageGroupOf(age: number | null): string | null {
  if (age === null) return null;
  if (age < 18) return "زیر ۱۸ سال";
  if (age < 26) return "۱۸ تا ۲۵ سال";
  if (age < 36) return "۲۶ تا ۳۵ سال";
  if (age < 51) return "۳۶ تا ۵۰ سال";
  return "بالای ۵۰ سال";
}

function ageOf(birthday: Date | null): number | null {
  if (!birthday) return null;
  const diff = Date.now() - birthday.getTime();
  const a = Math.floor(diff / (365.25 * 24 * 3600 * 1000));
  return a > 0 && a < 120 ? a : null;
}

/** ساخت کلیدهای ویژگی برای یک متقاضی (بدون عوامل حفاظتی — آنها ریسک را کم می‌کنند) */
function featureKeysOf(u: UserRaw, ems: EmsRaw[]): Map<string, { label: string; category: string }> {
  const map = new Map<string, { label: string; category: string }>();
  const add = (key: string, label: string, category: string) => map.set(key, { label, category });

  if (u.gender) add(`gender:${u.gender}`, u.gender, "جنسیت");
  const ag = ageGroupOf(ageOf(u.birthday));
  if (ag) add(`age:${ag}`, ag, "سن");
  if (u.marriageName) add(`marriage:${u.marriageName}`, u.marriageName, "وضعیت تأهل");
  if (u.educationName) add(`edu:${u.educationName}`, u.educationName, "تحصیلات");

  if (u.incomplete > 0) add("behavior:ناتمام", "سابقه جلسهٔ ناتمام", "رفتار درمانی");
  if (u.rejected > 0) add("behavior:ردشده", "سابقه جلسهٔ ردشده", "رفتار درمانی");
  if (u.sessions >= 6) add("behavior:جلسات_زیاد", "جلسات مکرر (۶+)", "رفتار درمانی");
  if (u.sessions === 1) add("behavior:تک_جلسه", "فقط یک جلسه", "رفتار درمانی");

  for (const e of ems) {
    for (const t of parseList(e.emsType)) add(`emsType:${t}`, t, "نوع مورد حاد");
    for (const t of parseList(e.suicidalFrom)) add(`suicide:${t}`, t, "عوامل خطر خودکشی");
    for (const t of parseList(e.psychiatricDisorders)) add(`psych:${t}`, t, "اختلالات روان‌پزشکی");
    for (const t of parseList(e.socialFactors)) add(`social:${t}`, t, "عوامل اجتماعی");
    // عوامل حفاظتی عمداً در ریسک وارد نمی‌شوند
  }
  return map;
}

// ---------------------------------------------------------------- کاوش الگو

const MIN_PATTERN_ACUTE = 2; // حداقل تکرار در کیس‌های حاد
const MIN_LIFT = 1.25; // حداقل شدت اثر
const MAX_PATTERNS = 18;

/**
 * کاوش الگو + ساخت مدل — ورودی داده‌های خام
 */
export function minePatterns(users: UserRaw[], emsByUser: Map<number, EmsRaw[]>): { patterns: RiskPattern[]; model: RiskModel } {
  const totalUsers = users.length;
  const acuteUsersArr = users.filter((u) => (emsByUser.get(u.id)?.length ?? 0) > 0);
  const acuteUsers = acuteUsersArr.length;
  const baseline = totalUsers > 0 ? acuteUsers / totalUsers : 0;

  const insufficient = acuteUsers < 3;
  const modelBase: RiskModel = {
    trainedAt: new Date().toISOString(),
    totalUsers, acuteUsers, baseline,
    patterns: [],
    insufficient,
    message: insufficient
      ? `برای کشف الگوی معنادار حداقل ۳ کیس حاد ثبت‌شده لازم است (فعلاً ${acuteUsers} مورد). با ثبت فرم‌های EMS در «موارد حاد»، مدل به‌تدریج هوشمندتر می‌شود.`
      : null,
  };

  if (insufficient || totalUsers === 0) return { patterns: [], model: modelBase };

  // شمارش ویژگی‌ها
  const stats = new Map<string, { label: string; category: string; acute: number; all: number }>();
  for (const u of users) {
    const isAcute = (emsByUser.get(u.id)?.length ?? 0) > 0;
    const keys = featureKeysOf(u, emsByUser.get(u.id) ?? []);
    for (const [key, meta] of keys) {
      let s = stats.get(key);
      if (!s) { s = { label: meta.label, category: meta.category, acute: 0, all: 0 }; stats.set(key, s); }
      s.all += 1;
      if (isAcute) s.acute += 1;
    }
  }

  const patterns: RiskPattern[] = [];
  for (const [key, s] of stats) {
    if (s.acute < MIN_PATTERN_ACUTE) continue;
    const acuteRate = s.acute / acuteUsers;
    const baseRate = s.all / totalUsers;
    if (baseRate <= 0) continue;
    const lift = acuteRate / baseRate;
    if (lift < MIN_LIFT) continue;
    patterns.push({ key, category: s.category, label: s.label, acuteCount: s.acute, acuteRate, baseRate, lift });
  }
  patterns.sort((a, b) => b.lift - a.lift);
  const top = patterns.slice(0, MAX_PATTERNS);

  return { patterns: top, model: { ...modelBase, patterns: top } };
}

// ---------------------------------------------------------------- امتیازدهی

const LEVELS: { min: number; level: RiskApplicant["level"] }[] = [
  { min: 65, level: "بحرانی" },
  { min: 45, level: "بالا" },
  { min: 25, level: "متوسط" },
  { min: 0, level: "کم" },
];

function levelOf(risk: number): RiskApplicant["level"] {
  return LEVELS.find((l) => risk >= l.min)?.level ?? "کم";
}

/**
 * امتیازدهی همهٔ متقاضیان با مدل کشف‌شده — خروجی مرتب بر اساس ریسک
 * فرمول: logit = log(پریور) + Σ log(lift) → سیگموید → درصد
 */
export function scoreApplicants(users: UserRaw[], emsByUser: Map<number, EmsRaw[]>, patterns: RiskPattern[], baseline: number): RiskApplicant[] {
  if (patterns.length === 0 || users.length === 0) return [];
  const weight = new Map<string, { w: number; label: string; category: string }>();
  for (const p of patterns) {
    const capped = Math.min(p.lift, 5); // سقف شدت — جلوگیری از غلبهٔ یک ویژگی
    weight.set(p.key, { w: Math.log(capped), label: p.label, category: p.category });
  }
  const priorOdds = Math.max(baseline, 0.002) / Math.max(1 - baseline, 0.002); // odds = p/(1-p)
  const priorLogit = Math.log(priorOdds);

  const out: RiskApplicant[] = [];
  for (const u of users) {
    const ems = emsByUser.get(u.id) ?? [];
    const keys = featureKeysOf(u, ems);
    let logit = priorLogit;
    const factors: RiskFactor[] = [];
    for (const [key, meta] of keys) {
      const w = weight.get(key);
      if (w) {
        logit += w.w;
        factors.push({ label: meta.label, lift: Math.exp(w.w) });
      }
    }
    factors.sort((a, b) => b.lift - a.lift);
    const p = 1 / (1 + Math.exp(-logit));
    const risk = Math.round(Math.min(p, 0.97) * 100);
    const acuteSorted = [...ems].sort((a, b) => b.dateTime.getTime() - a.dateTime.getTime());
    out.push({
      id: u.id, name: u.name, family: u.family, nid: String(u.nid), avatarColor: u.avatarColor,
      gender: u.gender, age: ageOf(u.birthday), sessions: u.sessions, acuteCount: ems.length,
      severityHigh: ems.some((e) => e.severity === "بالا"),
      lastAcuteAt: acuteSorted[0]?.dateTime ? acuteSorted[0].dateTime.toISOString() : null,
      risk, level: levelOf(risk), factors: factors.slice(0, 6),
      acceptors: u.acceptors,
    });
  }
  out.sort((a, b) => b.risk - a.risk);
  return out;
}

export type { UserRaw, EmsRaw };
