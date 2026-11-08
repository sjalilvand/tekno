import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail } from "@/lib/server";

// =====================================================================
// تیک‌های هوشمند — الگوها + اجراها + «تیک خودکار» بر اساس قواعد داده
// قاعده‌ها (autoRule) هنگام هر خواندن ارزیابی می‌شوند؛ اگر شرط داده برقرار
// باشد آیتم بدون دخالت کاربر تیک می‌خورد (auto=true) و قابل مشاهده است.
// =====================================================================

type ItemDef = { title: string; autoRule?: string };

const DEFAULT_TEMPLATES: { key: string; title: string; desc: string; trigger: string; items: ItemDef[] }[] = [
  {
    key: "intake",
    title: "پذیرش متقاضی جدید",
    desc: "چک‌لیست استاندارد پذیرش — هنگام ثبت اولین جلسهٔ هر متقاضی پیشنهاد می‌شود.",
    trigger: "new_client",
    items: [
      { title: "ثبت کامل هویت (کد ملی و شمارهٔ تماس)" },
      { title: "رزرو اولین وقت مشاوره" },
      { title: "برگزاری و ثبت اولین جلسه", autoRule: "has_event" },
      { title: "تایید نهایی جلسهٔ اول", autoRule: "event_confirmed" },
      { title: "تکمیل فرم ارزیابی روان‌شناختی", autoRule: "psychology_form" },
      { title: "اطلاع‌رسانی شرایط مرکز و محرمانگی به مراجع" },
    ],
  },
  {
    key: "acute",
    title: "پیگیری مورد حاد (EMS)",
    desc: "برای هر فرم مورد حاد با شدت بالا — مسیر پیگیری استاندارد بحران.",
    trigger: "acute",
    items: [
      { title: "ثبت فرم مورد حاد (EMS)" },
      { title: "اقدام فوری انجام شد (تماس/اعزام/مداخله)" },
      { title: "اطلاع به مسئولین مرکز و نظارت حرفه‌ای" },
      { title: "بررسی درخواست کمک مالی", autoRule: "payment_decided" },
      { title: "پیگیری وضعیت مراجع پس از ۷۲ ساعت", autoRule: "no_acute_90d" },
    ],
  },
  {
    key: "approval",
    title: "پیگیری جلسهٔ معلق در چرخهٔ تایید",
    desc: "وقتی جلسه‌ای بیش از حد مجاز در یک مرحلهٔ تایید متوقف می‌ماند پیشنهاد می‌شود.",
    trigger: "approval_stuck",
    items: [
      { title: "یادآوری به تاییدکنندهٔ مرحلهٔ جاری" },
      { title: "بررسی دلیل تاخیر و ثبت یادداشت" },
      { title: "در صورت نیاز، ابطال یا اصلاح جلسه" },
      { title: "تایید نهایی ثبت شد", autoRule: "event_confirmed" },
    ],
  },
];

async function ensureTemplates() {
  const count = await db.checklistTemplate.count();
  if (count >= DEFAULT_TEMPLATES.length) return;
  for (const t of DEFAULT_TEMPLATES) {
    await db.checklistTemplate.upsert({
      where: { key: t.key },
      update: {},
      create: {
        key: t.key, title: t.title, desc: t.desc, trigger: t.trigger,
        items: JSON.stringify(t.items),
      },
    });
  }
}

// --------------------------------------------------- ارزیابی تیک خودکار
async function ruleSatisfied(rule: string, userId: number | null, eventId: number | null): Promise<boolean> {
  try {
    switch (rule) {
      case "has_event":
        if (eventId) return true;
        return userId ? (await db.event.count({ where: { userId } })) > 0 : false;
      case "event_confirmed":
        if (eventId) return (await db.event.count({ where: { id: eventId, status: "تایید نهایی" } })) > 0;
        return userId ? (await db.event.count({ where: { userId, status: "تایید نهایی" } })) > 0 : false;
      case "psychology_form": {
        if (eventId) return (await db.eventPsychology.count({ where: { eventId } })) > 0;
        if (!userId) return false;
        const cnt = await db.event.count({ where: { userId, status: "تایید نهایی", psychology: { is: {} } } });
        return cnt > 0;
      }
      case "payment_decided": {
        if (!eventId) return false;
        const ems = await db.eventsEms.findMany({ where: { eventId }, select: { hadPaymentStatus: true } });
        return ems.some((m) => m.hadPaymentStatus && m.hadPaymentStatus !== "بدون درخواست" && m.hadPaymentStatus !== "در انتظار بررسی");
      }
      case "no_acute_90d": {
        if (!userId) return false;
        const cnt = await db.eventsEms.count({
          where: { severity: "بالا", dateTime: { gte: new Date(Date.now() - 90 * 86400000) }, event: { userId } },
        });
        return cnt === 0;
      }
      default:
        return false;
    }
  } catch {
    return false;
  }
}

async function evaluateAutoTicks(runId: number, userId: number | null, eventId: number | null) {
  const items = await db.checklistRunItem.findMany({ where: { runId, done: false, autoRule: { not: null } } });
  for (const it of items) {
    if (!it.autoRule) continue;
    if (await ruleSatisfied(it.autoRule, userId, eventId)) {
      await db.checklistRunItem.update({
        where: { id: it.id },
        data: { done: true, auto: true, doneAt: new Date() },
      });
    }
  }
  // تکمیل خودکار چک‌لیست
  const rest = await db.checklistRunItem.count({ where: { runId, done: false } });
  if (rest === 0) {
    await db.checklistRun.update({ where: { id: runId }, data: { status: "تکمیل", completedAt: new Date() } }).catch(() => null);
  }
}

// =====================================================================
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  await ensureTemplates();

  const [templates, runsRaw] = await Promise.all([
    db.checklistTemplate.findMany({ where: { isActive: true }, orderBy: { id: "asc" } }),
    db.checklistRun.findMany({
      include: {
        items: { orderBy: { id: "asc" } },
        template: { select: { title: true, key: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
  ]);

  // ارزیابی تیک خودکار برای اجراهای باز
  const open = runsRaw.filter((r) => r.status === "در جریان");
  for (const r of open.slice(0, 30)) {
    await evaluateAutoTicks(r.id, r.userId, r.eventId);
  }
  if (open.length) {
    // پس از تیک خودکار، دوباره بخوان
    const refreshed = await db.checklistRun.findMany({
      include: { items: { orderBy: { id: "asc" } }, template: { select: { title: true, key: true } } },
      orderBy: { createdAt: "desc" }, take: 80,
    });
    return ok({
      templates: templates.map((t) => ({ ...t, items: JSON.parse(t.items || "[]") })),
      runs: refreshed.map(toRun),
      openCount: refreshed.filter((r) => r.status === "در جریان").length,
      openItems: refreshed.filter((r) => r.status === "در جریان").reduce((a, r) => a + r.items.filter((i) => !i.done).length, 0),
    });
  }

  return ok({
    templates: templates.map((t) => ({ ...t, items: JSON.parse(t.items || "[]") })),
    runs: runsRaw.map(toRun),
    openCount: runsRaw.filter((r) => r.status === "در جریان").length,
    openItems: runsRaw.filter((r) => r.status === "در جریان").reduce((a, r) => a + r.items.filter((i) => !i.done).length, 0),
  });
}

function toRun(r: {
  id: number; templateId: number; template: { title: string; key: string } | null;
  userId: number | null; eventId: number | null; title: string | null;
  status: string; createdAt: Date; completedAt: Date | null;
  items: { id: number; title: string; autoRule: string | null; done: boolean; auto: boolean; doneAt: Date | null }[];
}) {
  return {
    id: r.id, templateId: r.templateId, templateTitle: r.template?.title ?? r.title ?? "چک‌لیست",
    templateKey: r.template?.key ?? "",
    userId: r.userId, eventId: r.eventId, title: r.title,
    status: r.status, createdAt: r.createdAt, completedAt: r.completedAt,
    items: r.items,
    done: r.items.filter((i) => i.done).length, total: r.items.length,
    autoDone: r.items.filter((i) => i.auto).length,
  };
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const body = await req.json().catch(() => null);
  if (!body?.action) return fail("BAD_REQUEST");

  switch (body.action) {
    case "create": {
      await ensureTemplates();
      const tpl = await db.checklistTemplate.findUnique({ where: { key: String(body.templateKey ?? "") } });
      if (!tpl) return fail("الگو یافت نشد", 404);
      const items = JSON.parse(tpl.items || "[]") as ItemDef[];
      const run = await db.checklistRun.create({
        data: {
          templateId: tpl.id,
          userId: body.userId ? Number(body.userId) : null,
          eventId: body.eventId ? Number(body.eventId) : null,
          title: body.title ? String(body.title).slice(0, 120) : null,
          items: { create: items.map((i) => ({ title: i.title, autoRule: i.autoRule ?? null })) },
        },
      });
      await evaluateAutoTicks(run.id, run.userId, run.eventId);
      return ok({ id: run.id });
    }
    case "toggle": {
      const item = await db.checklistRunItem.findUnique({ where: { id: Number(body.itemId) }, include: { run: true } });
      if (!item) return fail("آیتم یافت نشد", 404);
      const done = Boolean(body.done);
      await db.checklistRunItem.update({
        where: { id: item.id },
        data: { done, auto: false, doneAt: done ? new Date() : null, doneById: done ? user.id : null },
      });
      const rest = await db.checklistRunItem.count({ where: { runId: item.runId, done: false } });
      await db.checklistRun.update({
        where: { id: item.runId },
        data: { status: rest === 0 ? "تکمیل" : "در جریان", completedAt: rest === 0 ? new Date() : null },
      });
      return ok();
    }
    case "deleteRun": {
      const runId = Number(body.runId);
      await db.checklistRunItem.deleteMany({ where: { runId } });
      await db.checklistRun.delete({ where: { id: runId } }).catch(() => null);
      return ok();
    }
    case "suggest": {
      // شناسایی هوشمند موارد نیازمند چک‌لیست و ایجاد خودکار (بدون تکرار)
      await ensureTemplates();
      let created = 0;
      const day14 = new Date(Date.now() - 14 * 86400000);

      // ۱) متقاضیان با اولین جلسهٔ اخیر و بدون چک‌لیست پذیرش
      const candidates = await db.user.findMany({
        where: { eventsAsClient: { some: { startDate: { gte: day14 } } } },
        select: { id: true, name: true, family: true },
        take: 30,
      });
      const withIntake = await db.checklistRun.findMany({
        where: { template: { key: "intake" }, userId: { in: candidates.map((c) => c.id) } },
        select: { userId: true },
      });
      const hasIntake = new Set(withIntake.map((r) => r.userId));
      const newClients = candidates.filter((c) => !hasIntake.has(c.id)).slice(0, 10);
      for (const u of newClients) {
        await createRunFor("intake", u.id, null, `${u.name} ${u.family}`);
        created++;
      }

      // ۲) موارد حاد شدت بالا اخیر
      const acuteEvents = await db.event.findMany({
        where: { ems: { some: { severity: "بالا", dateTime: { gte: day14 } } } },
        select: { id: true, userId: true, user: { select: { name: true, family: true } } },
        take: 10,
      });
      for (const ev of acuteEvents) {
        const has = await db.checklistRun.count({ where: { template: { key: "acute" }, eventId: ev.id } });
        if (!has) { await createRunFor("acute", ev.userId, ev.id, `${ev.user.name} ${ev.user.family} — مورد حاد`); created++; }
      }

      // ۳) جلسات معلق بیش از ۷ روز در چرخهٔ تایید
      const day7 = new Date(Date.now() - 7 * 86400000);
      const stuck = await db.event.findMany({
        where: {
          status: { contains: "در انتظار" },
          OR: [{ centerAdminConfirmDateTime: null, startDate: { lt: day7 } }, { centerAdminConfirmDateTime: { gte: day14, lt: day7 } }],
        },
        select: { id: true, trackingCode: true },
        take: 10,
      });
      for (const ev of stuck) {
        const has = await db.checklistRun.count({ where: { template: { key: "approval" }, eventId: ev.id } });
        if (!has) { await createRunFor("approval", null, ev.id, `جلسهٔ #${ev.id} (${ev.trackingCode ?? "بدون کد"})`); created++; }
      }

      return ok({ created });
    }
    default:
      return fail("عملیات نامعتبر");
  }
}

async function createRunFor(key: string, userId: number | null, eventId: number | null, title: string) {
  const tpl = await db.checklistTemplate.findUnique({ where: { key } });
  if (!tpl) return;
  const items = JSON.parse(tpl.items || "[]") as ItemDef[];
  const run = await db.checklistRun.create({
    data: {
      templateId: tpl.id, userId, eventId, title,
      items: { create: items.map((i) => ({ title: i.title, autoRule: i.autoRule ?? null })) },
    },
  });
  await evaluateAutoTicks(run.id, userId, eventId);
}
