// =====================================================================
//  موتور مانیتورینگ و شبیه‌سازی فرایند — نسخهٔ ۶.۱
//  • زمان هر مرحله از مهر زمانی واقعی تاییدها استخراج می‌شود (نه حدس)
//  • گلوگاه = مرحله‌ای که میانگین انتظار آن بیش از SLA یا بیشترین است
//  • نتایج سنگین تا ۵ دقیقه کش می‌شوند (همان الگوی read_mysql)
// =====================================================================
import { db } from "@/lib/db";
import { cacheGet, cacheSet } from "@/lib/analytics";

export type ChainSpan = {
  key: string;
  name: string;
  bpmn: string; // شناسهٔ عنصر در نمودار BPMN برای شبیه‌سازی
  from: string | null; // ISO
  to: string | null; // ISO
  hours: number | null; // مدت مرحله (ساعت) — برای مرحلهٔ در انتظار تا «اکنون»
  state: "done" | "active" | "pending" | "rejected";
  overdue: boolean;
};

// زنجیرهٔ تایید — نگاشت مرحله به فیلد مهر زمانی و شناسهٔ BPMN
const CHAIN_FIELDS: { key: string; name: string; bpmn: string; ts: string; slaHours: number }[] = [
  { key: "session",      name: "برگزاری جلسه",              bpmn: "s",      ts: "startDate",                    slaHours: 3 },
  { key: "centerAdmin",  name: "تایید مدیر مرکز",           bpmn: "t1",     ts: "centerAdminConfirmDateTime",   slaHours: 24 },
  { key: "tech",         name: "تایید مسئول فنی",           bpmn: "t2",     ts: "centerTechConfirmDateTime",    slaHours: 24 },
  { key: "operator",     name: "نظارت حرفه‌ای",              bpmn: "t3",     ts: "operatorConfirmDateTime",      slaHours: 48 },
  { key: "province",     name: "تایید ناظر استان",          bpmn: "t4",     ts: "provinceSupervisorConfirmDateTime", slaHours: 48 },
  { key: "country",      name: "تایید نهایی ناظر کشور",     bpmn: "t5",     ts: "supervisorConfirmDateTime",    slaHours: 48 },
  { key: "settle",       name: "تسویهٔ مالی مشاور",          bpmn: "settle", ts: "__settled",                    slaHours: 24 },
];

const HOUR = 3600 * 1000;

function hoursBetween(a: Date | null, b: Date | null): number | null {
  if (!a || !b) return null;
  return Math.max(0, Math.round(((b.getTime() - a.getTime()) / HOUR) * 10) / 10);
}

/** استخراج مراحل زنجیرهٔ تایید برای یک ردیف Event (ورودی باید همین فیلدها را داشته باشد) */
export function chainSpans(ev: Record<string, any>): ChainSpan[] {
  const rejected = ev.status === "رد شده";
  const spans: ChainSpan[] = [];
  let prev: Date | null = ev.startDate ? new Date(ev.startDate) : null;
  for (let i = 0; i < CHAIN_FIELDS.length; i++) {
    const f = CHAIN_FIELDS[i];
    const isSettle = f.ts === "__settled";
    const raw = isSettle ? (ev.status === "تایید نهایی" ? ev.supervisorConfirmDateTime : null) : (ev as any)[f.ts];
    const to = raw ? new Date(raw) : null;
    if (rejected && i >= 1 && !to) {
      // روند رد شدن — مراحل بعد از آخرین تایید، رد‌شده حساب می‌شوند
      spans.push({ key: f.key, name: f.name, bpmn: f.bpmn, from: prev?.toISOString() ?? null, to: null, hours: null, state: "rejected", overdue: false });
      prev = null;
      continue;
    }
    if (to) {
      spans.push({ key: f.key, name: f.name, bpmn: f.bpmn, from: prev?.toISOString() ?? null, to: to.toISOString(), hours: hoursBetween(prev, to), state: "done", overdue: false });
      prev = to;
    } else if (prev) {
      // مرحلهٔ جاری — از آخرین تایید تا اکنون در انتظار است
      const hours = Math.max(0, Math.round(((Date.now() - prev.getTime()) / HOUR) * 10) / 10);
      spans.push({ key: f.key, name: f.name, bpmn: f.bpmn, from: prev.toISOString(), to: null, hours, state: "active", overdue: hours > f.slaHours });
      prev = null;
    } else {
      spans.push({ key: f.key, name: f.name, bpmn: f.bpmn, from: null, to: null, hours: null, state: "pending", overdue: false });
    }
  }
  return spans;
}

const SELECT_CHAIN = {
  id: true, status: true, startDate: true, endDate: true,
  centerAdminConfirmDateTime: true, centerTechConfirmDateTime: true,
  operatorConfirmDateTime: true, provinceSupervisorConfirmDateTime: true,
  supervisorConfirmDateTime: true,
} as const;

export type ChainStats = {
  stages: {
    key: string; name: string; bpmn: string; slaHours: number;
    avgHours: number; maxHours: number; doneCount: number;
    overdueAvg: boolean; activeCount: number; overdueActive: number; bottleneck: boolean;
  }[];
  worst: { key: string; name: string; avgHours: number; slaHours: number } | null;
  activeTotal: number; overdueActiveTotal: number;
  scannedEvents: number;
  windowDays: number;
  generatedAt: string;
};

/** آمار مرحله‌به‌مرحلهٔ زنجیرهٔ تایید — کش ۵ دقیقه‌ای */
export async function getChainStats(windowDays = 180): Promise<ChainStats> {
  const key = `monitoring:chain:${windowDays}`;
  const hit = cacheGet<ChainStats>(key);
  if (hit) return hit;

  const since = new Date(Date.now() - windowDays * 86400000);
  const events = await db.event.findMany({
    where: { startDate: { gte: since } },
    select: SELECT_CHAIN,
    take: 20000,
  });

  // جمع‌آوری در JS — دادهٔ ۱۸۰ روزه پس از SELECT سبک (۹ ستون) کوچک است
  const acc = new Map<string, { sum: number; max: number; count: number }>();
  const active = new Map<string, number>();
  const overdueActive = new Map<string, number>();
  let activeTotal = 0, overdueTotal = 0;

  for (const ev of events) {
    const spans = chainSpans(ev);
    for (const s of spans) {
      const f = CHAIN_FIELDS.find((x) => x.key === s.key)!;
      if (s.state === "done" && s.hours !== null) {
        const a = acc.get(s.key) ?? { sum: 0, max: 0, count: 0 };
        a.sum += s.hours; a.count += 1; a.max = Math.max(a.max, s.hours);
        acc.set(s.key, a);
      }
      if (s.state === "active") {
        activeTotal += 1;
        active.set(s.key, (active.get(s.key) ?? 0) + 1);
        if (s.overdue) { overdueTotal += 1; overdueActive.set(s.key, (overdueActive.get(s.key) ?? 0) + 1); }
      }
    }
  }

  const stages = CHAIN_FIELDS.map((f) => {
    const a = acc.get(f.key);
    const avg = a ? Math.round((a.sum / a.count) * 10) / 10 : 0;
    return {
      key: f.key, name: f.name, bpmn: f.bpmn, slaHours: f.slaHours,
      avgHours: avg, maxHours: a?.max ?? 0, doneCount: a?.count ?? 0,
      overdueAvg: avg > f.slaHours,
      activeCount: active.get(f.key) ?? 0,
      overdueActive: overdueActive.get(f.key) ?? 0,
      bottleneck: false,
    };
  });

  // گلوگاه اصلی: بالاترین نسبت میانگین به SLA (حداقل ۳ نمونهٔ انجام‌شده)
  let worst: ChainStats["worst"] = null;
  let worstRatio = 0;
  for (const s of stages) {
    if (s.doneCount >= 3 && s.avgHours > 0) {
      const r = s.avgHours / Math.max(1, s.slaHours);
      if (r > worstRatio) { worstRatio = r; worst = { key: s.key, name: s.name, avgHours: s.avgHours, slaHours: s.slaHours }; }
    }
  }
  if (worst) {
    const st = stages.find((s) => s.key === worst!.key);
    if (st) st.bottleneck = true;
  }

  const out: ChainStats = {
    stages, worst, activeTotal, overdueActiveTotal: overdueTotal,
    scannedEvents: events.length, windowDays,
    generatedAt: new Date().toISOString(),
  };
  cacheSet(key, out);
  return out;
}

/** آمار فرایندهای سفارشی (ProcessStepLog) — کش ۵ دقیقه‌ای */
export async function getCustomProcessStats() {
  const key = "monitoring:custom";
  const hit = cacheGet<Awaited<ReturnType<typeof customStats>>>(key);
  if (hit) return hit;
  const out = await customStats();
  cacheSet(key, out);
  return out;
}

async function customStats() {
  const defs = await db.processDefinition.findMany({ where: { isActive: true }, orderBy: { id: "asc" } });
  const result = [];
  for (const d of defs) {
    const steps = JSON.parse(d.steps || "[]") as { name: string; slaHours: number }[];
    const instances = await db.processInstance.findMany({
      where: { processId: d.id },
      include: { stepLogs: { orderBy: { stepIdx: "asc" } } },
    });
    const stepStats = steps.map((s, i) => {
      const durations = instances.flatMap((inst) =>
        inst.stepLogs.filter((l) => l.stepIdx === i && l.durationMin !== null).map((l) => l.durationMin as number)
      );
      const avgMin = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;
      return {
        name: s.name, slaHours: s.slaHours ?? 24,
        avgHours: avgMin === null ? null : Math.round((avgMin / 60) * 10) / 10,
        overdue: avgMin !== null && avgMin / 60 > (s.slaHours ?? 24),
        activeCount: instances.filter((inst) => inst.currentStep === i && inst.status === "در جریان").length,
      };
    });
    const bottleneck = stepStats.filter((s) => s.overdue).sort((a, b) => (b.avgHours ?? 0) - (a.avgHours ?? 0))[0] ?? null;
    result.push({
      id: d.id, key: d.key, title: d.title, bpmnFile: d.bpmnFile,
      instancesTotal: instances.length,
      instancesActive: instances.filter((i) => i.status === "در جریان").length,
      steps: stepStats, bottleneck,
    });
  }
  return result;
}

// --------------------------------------------------------------- شبیه‌سازی
export type SimulationResult = {
  event: {
    id: number; trackingCode: number | null; status: string;
    client: string; service: string; center: string; isEms: boolean;
    startDate: string | null; endDate: string | null;
  };
  timeline: ChainSpan[];
  currentIndex: number; // آخرین مرحلهٔ done
  reserves: { id: number; date: string; acceptorId: number | null }[];
  ems: { id: number; severity: string; dateTime: string; paymentStatus: string; paymentAmount: number } | null;
};

/** شبیه‌سازی یک درخواست واقعی — زمان‌بندی مرحله‌ها از مهر زمانی تاییدها */
export async function simulateEvent(eventId: number): Promise<SimulationResult | null> {
  const ev = await db.event.findUnique({
    where: { id: eventId },
    select: {
      ...SELECT_CHAIN, trackingCode: true, isEms: true,
      user: { select: { name: true, family: true } },
      service: { select: { name: true, short: true } },
      center: { select: { title: true } },
      reserves: { select: { id: true, date: true, acceptorId: true }, orderBy: { date: "asc" } },
      ems: { select: { id: true, severity: true, dateTime: true, hadPaymentStatus: true, hadPaymentAmount: true }, orderBy: { dateTime: "desc" }, take: 1 },
    },
  });
  if (!ev) return null;
  const timeline = chainSpans(ev);
  let currentIndex = -1;
  for (let i = 0; i < timeline.length; i++) if (timeline[i].state === "done") currentIndex = i;
  const emsRow = (ev as any).ems?.[0];
  return {
    event: {
      id: ev.id, trackingCode: ev.trackingCode, status: ev.status,
      client: `${ev.user.name} ${ev.user.family}`,
      service: ev.service?.name ?? ev.service?.short ?? "—",
      center: ev.center?.title ?? "—",
      isEms: ev.isEms,
      startDate: ev.startDate ? new Date(ev.startDate).toISOString() : null,
      endDate: ev.endDate ? new Date(ev.endDate).toISOString() : null,
    },
    timeline,
    currentIndex,
    reserves: ev.reserves.map((r) => ({ id: r.id, date: new Date(r.date).toISOString(), acceptorId: r.acceptorId })),
    ems: emsRow ? {
      id: emsRow.id, severity: emsRow.severity, dateTime: new Date(emsRow.dateTime).toISOString(),
      paymentStatus: emsRow.hadPaymentStatus ?? "بدون درخواست", paymentAmount: Number(emsRow.hadPaymentAmount ?? 0),
    } : null,
  };
}

/** خلاصهٔ متنی برای چت هوشمند */
export function bottleneckSummaryText(stats: ChainStats): string {
  const f = (n: number | string) => String(n).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
  const lines: string[] = [];
  lines.push(`تحلیل ${f(stats.scannedEvents)} جلسهٔ ${f(stats.windowDays)} روز اخیر:`);
  if (stats.worst) {
    lines.push(`• گلوگاه اصلی: «${stats.worst.name}» با میانگین ${faH(stats.worst.avgHours)} انتظار (حد مجاز ${faH(stats.worst.slaHours)})`);
  } else {
    lines.push("• گلوگاه مشخصی یافت نشد — همهٔ مراحل در محدودهٔ مجاز خود هستند ✓");
  }
  const stuck = stats.stages.filter((s) => s.overdueActive > 0);
  if (stuck.length) {
    for (const s of stuck.slice(0, 3)) {
      lines.push(`• ${f(s.overdueActive)} درخواست در مرحلهٔ «${s.name}» بیش از حد مجاز متوقف مانده است`);
    }
  } else {
    lines.push("• هیچ درخواستی خارج از مهلت متوقف نمانده است ✓");
  }
  return lines.join("\n");
}

function faH(h: number): string {
  const txt = h >= 24 ? `${(h / 24).toFixed(1).replace(/\.0$/, "")} روز` : `${Math.round(h)} ساعت`;
  return txt.replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}
