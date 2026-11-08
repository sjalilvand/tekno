// =====================================================================
//  دستیار هوشمند چت — نسخهٔ ۶.۱
//  • مفهوم‌یابی فارسی (نرمال‌سازی + کلیدواژه) — بدون وابستگی خارجی
//  • پاسخ بر اساس «سطح دسترسی» نقش کاربر (مدیر / مدیر مرکز / مشاور / خود شخص)
//  • نمودار و کارت ساختاریافته برای UI چت + شناسایی کیس‌های حاد
//  • اختیاری: اتصال به هر مدل سازگار با OpenAI (تنظیم ai_api_url / ai_api_key /
//    ai_model در جدول تنظیمات) — در نبودِ آن، موتور داخلی پاسخ می‌دهد.
// =====================================================================
import { db } from "@/lib/db";
import { cacheGet, cacheSet } from "@/lib/analytics";
import { getChainStats, bottleneckSummaryText } from "@/lib/monitoring";
import { faNum, jDate } from "@/lib/jalali";
import { Prisma } from "@prisma/client";

// ------------------------------------------------------------- انواع
export type ChatPayload = {
  chart?: { type: "bar" | "pie" | "line"; title: string; data: { name: string; value: number }[] };
  cards?: { title: string; lines: string[]; href?: string; tone?: "rose" | "amber" | "teal" | "slate" }[];
  links?: { label: string; href: string }[];
  table?: { columns: string[]; rows: string[][] };
};

export type AssistantReply = { text: string; payload?: ChatPayload; quickReplies?: string[] };

export type ChatUser = {
  id: number; name: string; family: string; username: string;
  provinceId: number | null; mobile: bigint;
};

export type Scope = { kind: "all" | "center" | "consultant" | "self"; userId: number };

// --------------------------------------------------- نرمال‌سازی فارسی
function normalize(s: string): string {
  return s
    .replace(/[يى]/g, "ی").replace(/[ك]/g, "ک").replace(/[ۀة]/g, "ه")
    .replace(/[\u200c\u200f\u200e]/g, " ")
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// --------------------------------------------------- سطح دسترسی نقش‌ها
const ADMIN_TITLES = ["مدیر سامانه", "مدیر سیستم", "مدیر کل", "ادمین", "admin", "superadmin"];

export async function scopeForUser(user: ChatUser): Promise<Scope> {
  const urs = await db.userRole.findMany({
    where: { userId: user.id },
    include: { role: { select: { title: true } } },
  });
  const titles = urs.map((ur) => (ur.role?.title ?? "").toLowerCase());
  if (titles.some((t) => ADMIN_TITLES.some((a) => t.includes(a.toLowerCase())))) return { kind: "all", userId: user.id };
  if (titles.some((t) => t.includes("مدیر مرکز") || t.includes("مدیر کلینیک"))) return { kind: "center", userId: user.id };
  if (titles.some((t) => t.includes("مشاور") || t.includes("روانپزشک") || t.includes("نظارت") || t.includes("ناظر"))) return { kind: "consultant", userId: user.id };
  return { kind: "self", userId: user.id };
}

/** شرط دامنهٔ جلسات بر اساس سطح دسترسی */
function eventWhere(scope: Scope, extra: Prisma.EventWhereInput = {}): Prisma.EventWhereInput {
  switch (scope.kind) {
    case "all": return { ...extra };
    case "center": return { centerAdminId: scope.userId, ...extra };
    case "consultant": return { acceptorId: scope.userId, ...extra };
    default: return { userId: scope.userId, ...extra };
  }
}

const fa = (n: number | string) => faNum(String(n));
const DATE_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];

// ================================================================ پاسخ‌ها
export async function welcome(user: ChatUser, scope: Scope): Promise<AssistantReply> {
  const acute = await countAcute(scope);
  const scopeLabel =
    scope.kind === "all" ? "مدیر سامانه — دسترسی کامل به کل داده‌ها"
    : scope.kind === "center" ? "مدیر مرکز — جلسات مراکز تحت مدیریت شما"
    : scope.kind === "consultant" ? "مشاور — جلسات و مراجعان شما"
    : "کاربر — پروندهٔ شخصی شما";
  let text =
    `سلام ${user.name} ${user.family} عزیز 👋\n` +
    `من دستیار هوشمند مرکز مشاوره رز هستم. سطح دسترسی شما: ${scopeLabel}.\n` +
    `می‌توانید بپرسید یا از دکمه‌های زیر استفاده کنید:`;
  if (acute > 0) {
    text += `\n\n🚨 هشدار: ${fa(acute)} مورد حاد نیازمند بررسی است.`;
  }
  return { text, quickReplies: quickRepliesFor(scope) };
}

export function quickRepliesFor(scope: Scope): string[] {
  if (scope.kind === "all") return [
    "خلاصهٔ وضعیت سامانه", "کیس‌های حاد", "گلوگاه‌های فرایند",
    "روند ماهانهٔ جلسات", "گزارش مالی", "جستجوی متقاضی",
  ];
  if (scope.kind === "center") return ["خلاصهٔ وضعیت مرکز", "کیس‌های حاد", "گلوگاه‌های فرایند", "روند ماهانهٔ جلسات"];
  if (scope.kind === "consultant") return ["جلسات من", "کیس‌های حاد من", "روند ماهانهٔ جلسات من", "درآمد من"];
  return ["جلسات من", "وضعیت جلسات من"];
}

// --------------------------------------------------- شمارش موارد حاد
async function countAcute(scope: Scope): Promise<number> {
  const rows = await db.eventsEms.findMany({
    where: { severity: "بالا", hadPaymentStatus: { in: ["در انتظار بررسی", "تایید شده"] } },
    select: { event: { select: { userId: true, acceptorId: true, centerAdminId: true } } },
    take: 200,
  });
  return rows.filter((r) => {
    const e = r.event;
    if (scope.kind === "all") return true;
    if (scope.kind === "center") return e.centerAdminId === scope.userId;
    if (scope.kind === "consultant") return e.acceptorId === scope.userId;
    return e.userId === scope.userId;
  }).length;
}

/** شناسایی هوشمند کیس‌های حاد — فرم EMS + پویش متن جلسات اخیر */
async function acuteReport(scope: Scope): Promise<AssistantReply> {
  const where = eventWhere(scope, {
    ems: { some: {} },
    OR: [{ startDate: { gte: new Date(Date.now() - 365 * 86400000) } }, { startDate: null }],
  });
  const events = await db.event.findMany({
    where,
    select: {
      id: true, startDate: true, status: true,
      user: { select: { name: true, family: true } },
      service: { select: { short: true } },
      ems: { select: { id: true, severity: true, dateTime: true, hadPaymentStatus: true }, orderBy: { dateTime: "desc" } },
    },
    orderBy: { startDate: "desc" },
    take: 300,
  });

  const severityCount: Record<string, number> = { "بالا": 0, "متوسط": 0, "کم": 0 };
  const rows: { name: string; sev: string; date: string; pay: string; eventId: number }[] = [];
  for (const ev of events) {
    for (const m of ev.ems) {
      severityCount[m.severity] = (severityCount[m.severity] ?? 0) + 1;
      rows.push({
        name: `${ev.user.name} ${ev.user.family}`,
        sev: m.severity,
        date: jDate(m.dateTime),
        pay: m.hadPaymentStatus ?? "بدون درخواست",
        eventId: ev.id,
      });
    }
  }
  // پویش هوشمند متن جلسات — کلیدواژه‌های خطر (بدون فرم EMS)
  const RISK_WORDS = ["خودکشی", "خودزنی", "بحران", "مسمومیت", "خطر آسیب"];
  const risky = await db.event.findMany({
    where: {
      ...eventWhere(scope),
      startDate: { gte: new Date(Date.now() - 90 * 86400000) },
      OR: [
        { topic: { contains: RISK_WORDS[0] } }, { description: { contains: RISK_WORDS[0] } },
        { topic: { contains: RISK_WORDS[1] } }, { description: { contains: RISK_WORDS[1] } },
        { topic: { contains: RISK_WORDS[2] } }, { description: { contains: RISK_WORDS[2] } },
        { topic: { contains: RISK_WORDS[3] } }, { description: { contains: RISK_WORDS[3] } },
      ],
    },
    select: { id: true, startDate: true, user: { select: { name: true, family: true } } },
    orderBy: { startDate: "desc" }, take: 5,
  });

  const total = rows.length;
  const top = rows.sort((a, b) => (a.sev === "بالا" ? -1 : 1) - (b.sev === "بالا" ? -1 : 1)).slice(0, 5);
  const text =
    `🚨 گزارش موارد حاد:\n` +
    `• مجموع فرم‌های EMS: ${fa(total)}\n` +
    `• شدت بالا: ${fa(severityCount["بالا"] ?? 0)} — متوسط: ${fa(severityCount["متوسط"] ?? 0)} — کم: ${fa(severityCount["کم"] ?? 0)}\n` +
    (risky.length ? `• ${fa(risky.length)} جلسهٔ اخیر با کلیدواژهٔ خطر در متن شناسایی شد (پویش هوشمند)\n` : "") +
    (total ? "\nمهم‌ترین موارد:" : "\nمورد حاد فعالی در دامنهٔ دسترسی شما ثبت نشده است ✓");
  return {
    text,
    payload: {
      chart: total ? {
        type: "pie", title: "توزیع شدت موارد حاد",
        data: (["بالا", "متوسط", "کم"] as const).filter((k) => severityCount[k]).map((k) => ({ name: k, value: severityCount[k] })),
      } : undefined,
      cards: top.map((r) => ({
        title: `${r.name} — شدت ${r.sev}`,
        lines: [`تاریخ: ${r.date}`, `وضعیت کمک مالی: ${r.pay}`],
        href: `#/cartable?event=${r.eventId}`,
        tone: r.sev === "بالا" ? "rose" as const : r.sev === "متوسط" ? "amber" as const : "slate" as const,
      })),
      links: [{ label: "بخش موارد حاد", href: "#/ems" }, { label: "کارتابل متقاضی", href: "#/cartable" }],
    },
    quickReplies: quickRepliesFor(scope),
  };
}

// --------------------------------------------------- خلاصهٔ وضعیت
async function summaryReport(scope: Scope): Promise<AssistantReply> {
  const where = eventWhere(scope);
  const [total, confirmed, pending, rejected, last30] = await Promise.all([
    db.event.count({ where }),
    db.event.count({ where: { ...where, status: "تایید نهایی" } }),
    db.event.count({ where: { ...where, status: { contains: "در انتظار" } } }),
    db.event.count({ where: { ...where, status: "رد شده" } }),
    db.event.count({ where: { ...where, startDate: { gte: new Date(Date.now() - 30 * 86400000) } } }),
  ]);
  const statusDist = await db.event.groupBy({
    by: ["status"], _count: true,
    where: scope.kind === "center" ? { centerAdminId: scope.userId } : scope.kind === "consultant" ? { acceptorId: scope.userId } : scope.kind === "self" ? { userId: scope.userId } : {},
  });
  let extraUsers = "";
  if (scope.kind === "all") {
    const [users, centers, consultants] = await Promise.all([
      db.user.count(),
      db.center.count({ where: { isEnabled: true } }),
      db.user.count({ where: { roles: { some: { role: { title: { in: ["مشاور", "روانپزشک"] } } } } } }),
    ]);
    extraUsers = `• کاربران: ${fa(users)} — مراکز فعال: ${fa(centers)} — مشاوران: ${fa(consultants)}\n`;
  }
  const text =
    `📊 خلاصهٔ وضعیت (${scope.kind === "all" ? "کل سامانه" : scope.kind === "center" ? "مرکز شما" : scope.kind === "consultant" ? "جلسات شما" : "پروندهٔ شما"}):\n` +
    `• مجموع جلسات: ${fa(total)} — ۳۰ روز اخیر: ${fa(last30)}\n` +
    `• تایید نهایی: ${fa(confirmed)} — در انتظار: ${fa(pending)} — رد شده: ${fa(rejected)}\n` + extraUsers;
  return {
    text,
    payload: {
      chart: {
        type: "bar", title: "توزیع وضعیت جلسات",
        data: statusDist.filter((s) => s.status).map((s) => ({ name: s.status as string, value: s._count })).sort((a, b) => b.value - a.value).slice(0, 7),
      },
      links: [{ label: "داشبورد کامل", href: "#/dashboard" }, { label: "داشبوردهای مدیریتی", href: "#/bi" }],
    },
    quickReplies: quickRepliesFor(scope),
  };
}

// --------------------------------------------------- روند ماهانه
async function monthlyTrend(scope: Scope): Promise<AssistantReply> {
  const where = eventWhere(scope, { status: "تایید نهایی", startDate: { gte: new Date(Date.now() - 335 * 86400000) } });
  const rows = await db.event.findMany({ where, select: { startDate: true } });
  const map = new Map<string, number>();
  const now = new Date();
  for (let i = 10; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    map.set(`${d.getFullYear()}-${d.getMonth()}`, 0);
  }
  for (const r of rows) {
    if (!r.startDate) continue;
    const d = new Date(r.startDate);
    const k = `${d.getFullYear()}-${d.getMonth()}`;
    if (map.has(k)) map.set(k, (map.get(k) ?? 0) + 1);
  }
  const data = Array.from(map.entries()).map(([k, v]) => {
    const [, m] = k.split("-").map(Number);
    return { name: DATE_MONTHS[m], value: v };
  });
  const sum = data.reduce((a, b) => a + b.value, 0);
  return {
    text: `📈 روند جلسات تایید‌شده در ۱۱ ماه اخیر: مجموع ${fa(sum)} جلسه.\nنمودار زیر روند را نشان می‌دهد:`,
    payload: {
      chart: { type: "line", title: "جلسات تایید‌شده به تفکیک ماه", data },
      links: [{ label: "داشبوردهای مدیریتی", href: "#/bi" }, { label: "گزارش‌ساز حرفه‌ای", href: "#/reports" }],
    },
    quickReplies: quickRepliesFor(scope),
  };
}

// --------------------------------------------------- خدمات / مالی
async function serviceDist(scope: Scope): Promise<AssistantReply> {
  const where = eventWhere(scope, { status: "تایید نهایی" });
  const [groups, services] = await Promise.all([
    db.event.groupBy({ by: ["serviceId"], _count: true, where }),
    db.service.findMany({ select: { id: true, short: true, name: true } }),
  ]);
  const data = groups
    .map((g) => ({ name: services.find((s) => s.id === g.serviceId)?.short ?? services.find((s) => s.id === g.serviceId)?.name ?? "سایر", value: g._count }))
    .sort((a, b) => b.value - a.value).slice(0, 8);
  return {
    text: "🧩 توزیع جلسات تایید‌شده بر اساس خدمت:",
    payload: { chart: { type: "pie", title: "سهم خدمات", data }, links: [{ label: "گزارش‌ساز", href: "#/reports" }] },
    quickReplies: quickRepliesFor(scope),
  };
}

async function financeReport(scope: Scope): Promise<AssistantReply> {
  if (scope.kind === "self") {
    return { text: "دسترسی مالی برای کاربران عادی تعریف نشده است. برای موارد مالی با مرکز تماس بگیرید.", quickReplies: quickRepliesFor(scope) };
  }
  const where = eventWhere(scope, { status: "تایید نهایی" });
  const agg = await db.event.aggregate({ where, _sum: { userTariff: true, acceptorFee: true, centerFee: true } });
  const totalTariff = agg._sum.userTariff ?? 0;
  const consultant = agg._sum.acceptorFee ?? 0;
  const center = agg._sum.centerFee ?? 0;
  return {
    text:
      `💰 گزارش مالی جلسات تایید‌شده:\n` +
      `• مجموع تعرفه: ${fa(Number(totalTariff).toLocaleString("fa-IR"))} تومان\n` +
      `• سهم مشاوران: ${fa(Number(consultant).toLocaleString("fa-IR"))} — سهم مراکز: ${fa(Number(center).toLocaleString("fa-IR"))}\n`,
    payload: {
      chart: {
        type: "bar", title: "سهم‌های مالی (تومان)",
        data: [
          { name: "تعرفهٔ کل", value: Number(totalTariff) },
          { name: "سهم مشاور", value: Number(consultant) },
          { name: "سهم مرکز", value: Number(center) },
        ],
      },
      links: [{ label: "عملکرد مالی", href: "#/finance" }],
    },
    quickReplies: quickRepliesFor(scope),
  };
}

// --------------------------------------------------- جلسات من
async function mySessions(scope: Scope): Promise<AssistantReply> {
  const where = eventWhere(scope);
  const [count, rows] = await Promise.all([
    db.event.count({ where }),
    db.event.findMany({
      where,
      orderBy: { startDate: "desc" }, take: 6,
      select: {
        id: true, status: true, startDate: true, trackingCode: true,
        service: { select: { short: true } }, center: { select: { cityTitle: true } },
        user: { select: { name: true, family: true } },
      },
    }),
  ]);
  const text = count
    ? `🗓️ ${fa(count)} جلسه در دامنهٔ دسترسی شماست. ۶ جلسهٔ اخیر:`
    : "هنوز جلسه‌ای در دامنهٔ دسترسی شما ثبت نشده است.";
  return {
    text,
    payload: {
      table: rows.length ? {
        columns: ["متقاضی", "خدمت", "مرکز", "تاریخ", "وضعیت"],
        rows: rows.map((r) => [
          r.user.name + " " + r.user.family,
          r.service?.short ?? "—", r.center?.cityTitle ?? "—",
          r.startDate ? jDate(r.startDate) : "—", r.status,
        ]),
      } : undefined,
      links: [{ label: "بخش جلسات", href: "#/events" }, { label: "کارتابل", href: "#/cartable" }],
    },
    quickReplies: quickRepliesFor(scope),
  };
}

// --------------------------------------------------- جستجوی متقاضی → کارتابل
async function clientLookup(term: string, scope: Scope): Promise<AssistantReply> {
  const digits = term.replace(/\D/g, "");
  const users = await db.user.findMany({
    where: {
      OR: [
        { name: { contains: term } },
        { family: { contains: term } },
        { username: { contains: term } },
        ...(digits.length >= 4 ? [{ nid: BigInt(digits) } as Prisma.UserWhereInput] : []),
        // BigInt روی فیلتر contains پشتیبانی نمی‌شود — مطابقت دقیق موبایل فقط با کامل بودن شماره
        ...(digits.length >= 10 ? [{ mobile: BigInt(digits) } as Prisma.UserWhereInput] : []),
      ],
    },
    select: {
      id: true, name: true, family: true, nid: true, mobile: true,
      eventsAsClient: { select: { id: true, status: true, startDate: true } },
    },
    take: 5,
  });
  if (!users.length) {
    return { text: `متقاضی‌ای با «${term}» پیدا نشد. نام خانوادگی، کد ملی یا شمارهٔ همراه را کامل‌تر بنویسید.`, quickReplies: quickRepliesFor(scope) };
  }
  return {
    text: `🔎 ${fa(users.length)} متقاضی یافت شد — برای باز شدن کارتابل کامل روی هر کارت بزنید:`,
    payload: {
      cards: users.map((u) => {
        const evs = u.eventsAsClient;
        const last = evs.map((e) => e.startDate).filter(Boolean).sort((a, b) => (b as Date).getTime() - (a as Date).getTime())[0];
        return {
          title: `${u.name} ${u.family}`,
          lines: [
            `کد ملی: ${fa(String(u.nid))} — همراه: ${fa(String(u.mobile))}`,
            `جلسات: ${fa(evs.length)} — آخرین: ${last ? jDate(last) : "—"}`,
            `در انتظار: ${fa(evs.filter((e) => e.status.includes("در انتظار")).length)}`,
          ],
          href: `#/cartable?u=${u.id}`,
          tone: "teal" as const,
        };
      }),
      links: [{ label: "کارتابل کامل متقاضیان", href: "#/cartable" }],
    },
    quickReplies: quickRepliesFor(scope),
  };
}

// --------------------------------------------------- گلوگاه / مانیتورینگ
async function bottleneckReport(scope: Scope): Promise<AssistantReply> {
  const stats = await getChainStats(180);
  const text = "⚙️ تحلیل مانیتورینگ فرایند:\n" + bottleneckSummaryText(stats);
  return {
    text,
    payload: {
      chart: {
        type: "bar", title: "میانگین انتظار هر مرحله (ساعت)",
        data: stats.stages.filter((s) => s.doneCount > 0).map((s) => ({ name: s.name, value: s.avgHours })),
      },
      links: [
        { label: "مانیتورینگ کامل فرایند", href: "#/processes?tab=monitoring" },
        { label: "شبیه‌سازی درخواست‌ها", href: "#/processes?tab=simulation" },
      ],
    },
    quickReplies: quickRepliesFor(scope),
  };
}

// --------------------------------------------------- تیک‌ها و فرم‌ها
async function checklistSummary(scope: Scope): Promise<AssistantReply> {
  const runs = await db.checklistRun.findMany({
    where: { status: "در جریان", ...(scope.kind === "all" ? {} : { userId: scope.userId }) },
    include: { items: { where: { done: false } } },
    orderBy: { createdAt: "desc" }, take: 6,
  });
  const pending = runs.reduce((a, r) => a + r.items.length, 0);
  return {
    text:
      `✅ تیک‌های هوشمند:\n` +
      `• ${fa(runs.length)} چک‌لیست در جریان — ${fa(pending)} آیتم باز\n` +
      (runs.length ? "• آخرین چک‌لیست‌ها: " + runs.slice(0, 3).map((r) => `«${r.template?.title ?? r.title ?? "چک‌لیست"}»`).join("، ") : ""),
    payload: { links: [{ label: "مدیریت تیک‌های هوشمند", href: "#/checklists" }] },
    quickReplies: quickRepliesFor(scope),
  };
}

async function formsSummary(_scope: Scope): Promise<AssistantReply> {
  const [forms, subs] = await Promise.all([
    db.formDefinition.count({ where: { isActive: true } }),
    db.formSubmission.count(),
  ]);
  return {
    text:
      `📋 فرم‌ساز:\n• ${fa(forms)} فرم فعال — ${fa(subs)} پاسخ ثبت‌شده\n` +
      "فرم دلخواه بسازید و به متقاضی/جلسه متصل کنید.",
    payload: { links: [{ label: "فرم‌ساز", href: "#/forms" }] },
    quickReplies: quickRepliesFor(_scope),
  };
}

// --------------------------------------------------- موتور LLM اختیاری
async function llmFallback(question: string, context: string): Promise<string | null> {
  try {
    const [urlS, keyS, modelS] = await Promise.all([
      db.setting.findUnique({ where: { name: "ai_api_url" } }),
      db.setting.findUnique({ where: { name: "ai_api_key" } }),
      db.setting.findUnique({ where: { name: "ai_model" } }),
    ]);
    const url = urlS?.value, key = keyS?.value, model = modelS?.value ?? "gpt-4o-mini";
    if (!url || !key || !url.startsWith("http")) return null;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    try {
      const res = await fetch(url.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          messages: [
            { role: "system", content: "تو دستیار سامانهٔ مرکز مشاوره رز هستی. فقط بر اساس دادهٔ JSON زیر به فارسی و کوتاه پاسخ بده. از دادهٔ غیرواقعی استفاده نکن.\n\nداده:\n" + context },
            { role: "user", content: question },
          ],
        }),
        signal: ctl.signal,
      });
      if (!res.ok) return null;
      const j = await res.json();
      const txt = j?.choices?.[0]?.message?.content;
      return typeof txt === "string" && txt.trim() ? txt.trim() : null;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

// --------------------------------------------------------------- تشخیص نیّت
type Intent =
  | "greet" | "help" | "acute" | "bottleneck" | "summary" | "trend"
  | "services" | "finance" | "sessions" | "lookup" | "checklist" | "forms" | "simulate" | "thanks" | "unknown";

function detectIntent(q: string, hasNameLike: boolean): Intent {
  if (/^(سلام|درود|هی|های|hello|hi)\b/.test(q) || q.includes("خسته نباشید") || q.includes("وقت بخیر")) return "greet";
  if (/(ممنون|مرسی|تشکر|سپاس|thanks|thank you)/.test(q)) return "thanks";
  if (/(راهنما|کمک|چه کاری|چه سوال|بلدی|توانایی|کارهایی|چطور استفاده)/.test(q)) return "help";
  if (/(کیس|مورد).*(حاد)|حاد|بحران|خودکشی|خودزنی|مسکین|مسومیت|مسومیت|ems|اورژانس|فوری/.test(q)) return "acute";
  if (/(گلوگاه|مانیتورینگ|تاخیر|معطلی|کند.*(فرایند|مرحله)|اختناق)/.test(q)) return "bottleneck";
  if (/(شبیه‌ساز|شبیه سازی|simulate|پویانمایی|حرکت توکن)/.test(q)) return "simulate";
  if (/(روند|ماهانه|ماه اخیر|ماه‌ها|روند رشد|نمودار خطی|سری زمانی|روند ماهانه)/.test(q)) return "trend";
  if (/(خدمت|خدمات|نوع جلسه|سرویس|توزیع خدمت)/.test(q)) return "services";
  if (/(مالی|درآمد|تعرفه|تسویه|حقوق|پول|هزینه)/.test(q)) return "finance";
  if (/(جلسات من|جلسه‌های من|جلسه های من|جلسات اخیر|وضعیت جلسات)/.test(q)) return "sessions";
  if (/(تیک|چک‌لیست|چک لیست|checklist|چک کردن)/.test(q)) return "checklist";
  if (/(فرم‌ساز|فرم ساز|فرم‌ها|فرم ها|فرم جدید|پاسخ فرم|فرم‌نویس)/.test(q)) return "forms";
  if (/(خلاصه|داشبورد|آمار|وضعیت سامانه|وضعیت مرکز|گزارش کلی|جمع‌بندی|report)/.test(q)) return "summary";
  if (/(کارتابل|متقاضی|پرونده|مراجع|جستجو|بگرد|پیدا کن|کد ملی)/.test(q) || hasNameLike) return "lookup";
  return "unknown";
}

// ================================================================= پاسخ اصلی
export async function askAssistant(question: string, user: ChatUser): Promise<AssistantReply> {
  const scope = await scopeForUser(user);
  const q = normalize(question);

  // عبارت باقی‌مانده برای جستجوی متقاضی — حذف کلمات پرسشی
  const STOP = /(کارتابل|متقاضی|پرونده|مراجع|جستجو|بگرد|پیدا کن|کد ملی|دنبال|اطلاعات|لطفا|میخوام|می‌خوام|نشان|بده|رو|را|که|با|از|در|روی|چیه|چیست|کجا|باز)/g;
  const rest = q.replace(STOP, " ").replace(/\s+/g, " ").trim();
  const hasNameLike = rest.length >= 3 && !/^\d+$/.test(rest);

  let reply: AssistantReply;
  switch (detectIntent(q, hasNameLike)) {
    case "greet": reply = await welcome(user, scope); break;
    case "thanks": reply = { text: "خواهش می‌کنم 🌷 اگر چیز دیگری لازم بود در خدمتم.", quickReplies: quickRepliesFor(scope) }; break;
    case "help": reply = helpReply(scope); break;
    case "acute": reply = await acuteReport(scope); break;
    case "bottleneck": reply = await bottleneckReport(scope); break;
    case "summary": reply = await summaryReport(scope); break;
    case "trend": reply = await monthlyTrend(scope); break;
    case "services": reply = await serviceDist(scope); break;
    case "finance": reply = await financeReport(scope); break;
    case "sessions": reply = await mySessions(scope); break;
    case "checklist": reply = await checklistSummary(scope); break;
    case "forms": reply = await formsSummary(scope); break;
    case "simulate": reply = {
      text: "🎬 شبیه‌سازی فرایند: در بخش «فرایندهای سازمانی (BPMN)» زبانهٔ «شبیه‌سازی درخواست» را باز کنید؛ کد پیگیری یا نام متقاضی را بدهید تا توکن روی نمودار BPMN با زمان‌های واقعی تاییدها حرکت کند.",
      payload: { links: [{ label: "شبیه‌سازی درخواست‌ها", href: "#/processes?tab=simulation" }] },
      quickReplies: quickRepliesFor(scope),
    }; break;
    case "lookup": reply = rest.length >= 2 ? await clientLookup(rest, scope) : await clientLookup("", scope); break;
    default: {
      // موتور داخلی نشد — اگر LLM تنظیم شده باشد همان پاسخ می‌دهد، وگرنه راهنما
      const snapshot = await briefSnapshot(scope);
      const llm = await llmFallback(question, snapshot);
      reply = llm
        ? { text: llm, quickReplies: quickRepliesFor(scope) }
        : helpReply(scope);
      break;
    }
  }
  return reply;
}

function helpReply(scope: Scope): AssistantReply {
  return {
    text:
      "دستیار سامانه — کارهایی که می‌توانید از من بخواهید:\n" +
      "• خلاصهٔ وضعیت / آمار («خلاصهٔ وضعیت سامانه»)\n" +
      "• شناسایی و گزارش کیس‌های حاد («کیس‌های حاد»)\n" +
      "• تحلیل گلوگاه‌های فرایند («گلوگاه‌های فرایند»)\n" +
      "• روند ماهانهٔ جلسات، توزیع خدمات، گزارش مالی\n" +
      "• کارتابل متقاضی («کارتابل احمدی» یا «کد ملی ۰۰۱۲۳۴۵۶۷۸»)\n" +
      "• وضعیت تیک‌های هوشمند و فرم‌ها\n" +
      "پاسخ‌ها همیشه فقط در محدودهٔ سطح دسترسی شما تولید می‌شود.",
    quickReplies: quickRepliesFor(scope),
  };
}

/** اسنپ‌شات کوتاه برای LLM اختیاری — فقط اعداد کلیدی */
async function briefSnapshot(scope: Scope): Promise<string> {
  try {
    const where = eventWhere(scope);
    const [total, confirmed, pending] = await Promise.all([
      db.event.count({ where }),
      db.event.count({ where: { ...where, status: "تایید نهایی" } }),
      db.event.count({ where: { ...where, status: { contains: "در انتظار" } } }),
    ]);
    return JSON.stringify({ scope: scope.kind, totalEvents: total, confirmed, pending, today: jDate(new Date()) });
  } catch {
    return "{}";
  }
}
