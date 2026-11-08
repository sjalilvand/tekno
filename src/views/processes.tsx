"use client";
// =====================================================================
// فرایندهای سازمانی (BPMN) — نسخهٔ ۶.۱ با چهار زبانه:
//   ۱) نمودارها — ویوئر BPMN شش فرایند اصلی (زوم/جابه‌جایی)
//   ۲) شبیه‌سازی درخواست — پویانمایی توکن روی نمودار با زمان‌های واقعی
//   ۳) مانیتورینگ و گلوگاه‌ها — میانگین انتظار هر مرحله و شناسایی گلوگاه
//   ۴) فرایندهای سفارشی — تعریف فرایند، اجرا و پیگیری نمونه‌ها
// =====================================================================
import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-js.css";
import * as React from "react";
import { PageHeader, SectionCard, LoadingView, StatusBadge } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { api } from "@/lib/client";
import { faNum, jDate } from "@/lib/jalali";
import { cn } from "@/lib/utils";
import {
  Network, ZoomIn, ZoomOut, Maximize, Download, Printer, Loader2, Info,
  CalendarCheck, ShieldCheck, CalendarClock, ArrowLeftRight, Siren, Wallet,
  Play, Pause, FastForward, Gauge, Activity, Plus, Trash2, CircleDot, Flag, Search,
} from "lucide-react";

type BpmnViewerModule = new (opts: Record<string, unknown>) => {
  importXML: (xml: string) => Promise<{ warnings?: unknown[] }>;
  get: (id: string) => any;
  attachTo: (el: HTMLElement) => void;
  on: (event: string, cb: () => void) => void;
  destroy: () => void;
};

const PROCESSES = [
  { file: "01-register-session", icon: <CalendarCheck className="h-4.5 w-4.5" />, title: "ثبت و پذیرش جلسه مشاوره", desc: "مسیر درخواست مراجع تا ثبت جلسه: بررسی هویت، کنترل سهمیهٔ بودجه، تعیین خدمت/مرکز/مشاور، محاسبهٔ تعرفه و رزرو وقت." },
  { file: "02-approval-chain", icon: <ShieldCheck className="h-4.5 w-4.5" />, title: "زنجیرهٔ تایید پنج‌مرحله‌ای جلسات", desc: "مدیر مرکز ← مسئول فنی ← نظارت حرفه‌ای ← ناظر استان ← ناظر کشور؛ در هر مرحله امکان رد با ذکر دلیل و در پایان تسویهٔ مشاور." },
  { file: "03-reserve", icon: <CalendarClock className="h-4.5 w-4.5" />, title: "رزرو وقت و پیگیری حضور", desc: "درخواست رزرو کاربر، بررسی مدیر مرکز، پیامک اطلاع‌رسانی، تبدیل به جلسه یا تماس پیگیری ۲۴ ساعته و بستن رزرو بی‌نتیجه." },
  { file: "04-seha-referral", icon: <ArrowLeftRight className="h-4.5 w-4.5" />, title: "دریافت و اجرای ارجاع سها", desc: "دریافت ارجاع سازمانی، پذیرش/رد با دلیل، معرفی به مرکز، تعیین مشاور، اجرای جلسات تا تکمیل و اعلام نتیجه به سها." },
  { file: "05-ems-acute", icon: <Siren className="h-4.5 w-4.5" />, title: "مدیریت مورد حاد (آسیب به خود)", desc: "ثبت فرم EMS، ارزیابی شدت خطر (بالا/متوسط/کم)، اقدام فوری، ثبت اقدامات، درخواست و تایید کمک مالی و پیگیری مراجع." },
  { file: "06-finance-cycle", icon: <Wallet className="h-4.5 w-4.5" />, title: "چرخهٔ مالی و تسویهٔ جلسات", desc: "محاسبهٔ سهم‌های مالی پس از تایید نهایی، ثبت حقوق‌و‌دستمزد، مالیات ماهانهٔ مشاوران، گزارش تسویه و پرداخت." },
];

// ================================================================ زبانهٔ نمودارها
function DiagramsTab() {
  const [active, setActive] = React.useState(0);
  const canvasRef = React.useRef<HTMLDivElement>(null);
  const viewerRef = React.useRef<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const proc = PROCESSES[active];

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const mod = await import("bpmn-js/lib/NavigatedViewer");
        if (!alive || !canvasRef.current) return;
        if (viewerRef.current) { try { viewerRef.current.destroy(); } catch {} viewerRef.current = null; }
        const ViewerCtor = ((mod as unknown as { default?: unknown }).default ?? mod) as unknown as BpmnViewerModule;
        const viewer = new ViewerCtor({ container: canvasRef.current, keyboard: { bindTo: document } });
        viewerRef.current = viewer;
        const res = await fetch(`/bpmn/${proc.file}.bpmn`, { cache: "no-store" });
        if (!res.ok) throw new Error("فایل نمودار یافت نشد");
        const xml = await res.text();
        const { warnings } = await viewer.importXML(xml);
        if (warnings?.length) console.warn("bpmn warnings:", warnings);
        if (!alive) return;
        setLoading(false);
        viewer.get("canvas").zoom("fit-viewport", "auto");
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "خطا در بارگذاری نمودار");
        setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [active, proc.file]);

  React.useEffect(() => () => {
    if (viewerRef.current) { try { viewerRef.current.destroy(); } catch {} viewerRef.current = null; }
  }, []);

  const zoom = (d: number) => {
    const canvas = viewerRef.current?.get("canvas");
    if (!canvas) return;
    canvas.zoom(Math.max(0.2, Math.min(4, canvas.zoom() + d)));
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3 no-print">
        {PROCESSES.map((p, i) => (
          <button key={p.file} onClick={() => setActive(i)}
            className={`flex items-start gap-2.5 rounded-xl border p-3 text-right transition-all ${active === i ? "border-ring bg-accent shadow-sm" : "bg-card hover:border-ring/60"}`}>
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${active === i ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{p.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="text-xs font-extrabold">{p.title}</span>
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">{faNum(i + 1)}</span>
              </span>
              <span className="mt-1 block text-[10px] leading-4 text-muted-foreground">{p.desc}</span>
            </span>
          </button>
        ))}
      </div>

      <SectionCard title={proc.title} subtitle="شرح فرایند" bodyClass="p-4">
        <div className="flex items-start gap-2.5 text-[12.5px] leading-7 text-foreground/85">
          <Info className="mt-1 h-4 w-4 shrink-0 text-primary" />
          <p>{proc.desc}</p>
        </div>
      </SectionCard>

      <SectionCard bodyClass="p-2">
        <div className="flex items-center gap-1.5 border-b px-3 pb-2 no-print">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => zoom(0.15)} aria-label="بزرگ‌نمایی"><ZoomIn className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => zoom(-0.15)} aria-label="کوچک‌نمایی"><ZoomOut className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => viewerRef.current?.get("canvas").zoom("fit-viewport", "auto")}><Maximize className="h-3.5 w-3.5" /> اندازهٔ صفحه</Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => window.open(`/bpmn/${proc.file}.bpmn`, "_blank")}><Download className="h-3.5 w-3.5" /> XML</Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => window.print()}><Printer className="h-3.5 w-3.5" /> چاپ</Button>
          {loading && <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> بارگذاری نمودار...</span>}
          {error && <span className="text-[11px] text-rose-500">{error}</span>}
          <span className="mr-auto text-[10px] text-muted-foreground">استاندارد BPMN 2.0 — کشیدن با ماوس برای جابه‌جایی</span>
        </div>
        <div ref={canvasRef} dir="ltr"
          className="bpmn-canvas h-[520px] w-full overflow-hidden rounded-b-xl bg-[repeating-linear-gradient(45deg,#fafafa_0px,#fafafa_10px,#f5f5f5_10px,#f5f5f5_20px)] dark:bg-[repeating-linear-gradient(45deg,#18181b_0px,#18181b_10px,#141416_10px,#141416_20px)]" />
      </SectionCard>
    </div>
  );
}

// ================================================================ زبانهٔ شبیه‌سازی
type SimSpan = { key: string; name: string; bpmn: string; from: string | null; to: string | null; hours: number | null; state: string; overdue: boolean };
type SimResult = {
  event: { id: number; trackingCode: number | null; status: string; client: string; service: string; center: string; isEms: boolean; startDate: string | null; endDate: string | null };
  timeline: SimSpan[];
  currentIndex: number;
  reserves: { id: number; date: string }[];
  ems: { id: number; severity: string; dateTime: string; paymentStatus: string; paymentAmount: number } | null;
};

function SimulationTab() {
  const [q, setQ] = React.useState("");
  const [options, setOptions] = React.useState<{ id: number; trackingCode: number | null; status: string; client: string; service: string; center: string; startDate: string | null; isEms: boolean }[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [sim, setSim] = React.useState<SimResult | null>(null);
  const [simLoading, setSimLoading] = React.useState(false);
  const [step, setStep] = React.useState(0); // مرحلهٔ جاری پویانمایی
  const [playing, setPlaying] = React.useState(false);
  const [speed, setSpeed] = React.useState(1);
  const canvasRef = React.useRef<HTMLDivElement>(null);
  const viewerRef = React.useRef<any>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [viewerReady, setViewerReady] = React.useState(0); // شمارندهٔ آماده‌شدن بوم برای اعمال نشانگرها

  const search = async () => {
    setSearching(true);
    try {
      const d = await api<{ events: typeof options }>(`/api/processes/simulate?q=${encodeURIComponent(q)}`);
      setOptions(d.events);
    } catch { setOptions([]); }
    setSearching(false);
  };

  React.useEffect(() => { search(); /* فهرست اولیه */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // بارگذاری نمودار BPMN زنجیرهٔ تایید — وقتی بوم رندر شده باشد (پس از انتخاب درخواست)
  const hasSim = sim !== null;
  React.useEffect(() => {
    if (!hasSim) return;
    let alive = true;
    (async () => {
      try {
        const mod = await import("bpmn-js/lib/NavigatedViewer");
        if (!alive || !canvasRef.current) return;
        const ViewerCtor = ((mod as unknown as { default?: unknown }).default ?? mod) as unknown as BpmnViewerModule;
        const viewer = new ViewerCtor({ container: canvasRef.current });
        viewerRef.current = viewer;
        const res = await fetch("/bpmn/02-approval-chain.bpmn", { cache: "no-store" });
        const xml = await res.text();
        await viewer.importXML(xml);
        if (!alive) return;
        viewer.get("canvas").zoom("fit-viewport", "auto");
        setViewerReady((r) => r + 1);
      } catch (e) {
        console.error("bpmn sim load failed:", e);
      }
    })();
    return () => { alive = false; if (viewerRef.current) { try { viewerRef.current.destroy(); } catch {} viewerRef.current = null; } };
  }, [hasSim]);

  const clearMarkers = () => {
    const reg = viewerRef.current?.get("elementRegistry");
    const canvas = viewerRef.current?.get("canvas");
    if (!reg || !canvas) return;
    for (const el of reg.getAll()) {
      for (const cls of ["sim-done", "sim-active", "sim-pending", "sim-rejected"]) {
        try { canvas.removeMarker(el.id, cls); } catch {}
      }
    }
    // حذف توکن قبلی
    const layers = viewerRef.current?.get("canvas")?.getActiveLayer?.();
    if (layers?.querySelectorAll) layers.querySelectorAll(".sim-token").forEach((n: Element) => n.remove());
  };

  const applyMarkers = (upto: number) => {
    const canvas = viewerRef.current?.get("canvas");
    if (!canvas || !sim) return;
    clearMarkers();
    sim.timeline.forEach((s, i) => {
      if (s.state === "rejected" && i <= upto) { canvas.addMarker(s.bpmn, "sim-rejected"); return; }
      if (i < upto) canvas.addMarker(s.bpmn, "sim-done");
      else if (i === upto && s.state !== "pending") canvas.addMarker(s.bpmn, "sim-active");
      else canvas.addMarker(s.bpmn, "sim-pending");
    });
    // توکن متحرک روی عنصر فعال
    try {
      const el = viewerRef.current.get("elementRegistry").get(sim.timeline[Math.min(upto, sim.timeline.length - 1)]?.bpmn);
      if (el) {
        const layer = viewerRef.current.get("canvas").getActiveLayer();
        if (layer && el.x != null) {
          const ns = "http://www.w3.org/2000/svg";
          const circle = document.createElementNS(ns, "circle");
          const cx = el.x + (el.width ?? 60) / 2, cy = el.y - 6;
          circle.setAttribute("cx", String(cx)); circle.setAttribute("cy", String(cy));
          circle.setAttribute("r", "7"); circle.setAttribute("fill", "#f59e0b");
          circle.setAttribute("class", "sim-token");
          layer.appendChild(circle);
        }
      }
    } catch { /* توکن اختیاری است */ }
  };

  // پویانمایی خودکار
  React.useEffect(() => {
    if (!playing || !sim) return;
    if (step >= sim.timeline.length - 1) { setPlaying(false); return; }
    const span = sim.timeline[step + 1];
    const hours = span?.hours ?? 2;
    const dur = Math.min(2600, Math.max(700, (hours / 12) * 1000)) / speed;
    timerRef.current = setTimeout(() => {
      setStep((s) => Math.min(s + 1, sim.timeline.length - 1));
    }, dur);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [playing, step, sim, speed]);

  // اعمال نشانگرها هنگام تغییر مرحله یا آماده‌شدن بوم
  React.useEffect(() => {
    if (sim && viewerReady > 0) applyMarkers(step);
  }, [step, sim, viewerReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const openSim = async (eventId: number) => {
    setSimLoading(true);
    setPlaying(false);
    try {
      const d = await api<SimResult>(`/api/processes/simulate?eventId=${eventId}`);
      setSim(d);
      // تا آخرین مرحلهٔ واقعاً انجام‌شده + یکی
      setStep(Math.max(0, Math.min(d.currentIndex + 1, d.timeline.length - 1)));
    } catch { setSim(null); }
    setSimLoading(false);
  };

  const jumpEnd = () => {
    if (!sim) return;
    setPlaying(false);
    const lastReal = sim.timeline.findLastIndex((s) => s.state === "done" || s.state === "rejected");
    setStep(Math.max(0, lastReal < 0 ? sim.timeline.length - 1 : Math.min(lastReal + 1, sim.timeline.length - 1)));
  };

  const fmtH = (h: number | null) => {
    if (h === null) return "—";
    return h >= 24 ? `${faNum((h / 24).toFixed(1).replace(/\.0$/, ""))} روز` : `${faNum(Math.round(h))} ساعت`;
  };

  return (
    <div className="space-y-4">
      <SectionCard
        title="انتخاب درخواست"
        subtitle="کد پیگیری، شناسهٔ جلسه یا نام متقاضی را جستجو کنید و روی نمودار BPMN شبیه‌سازی را ببینید"
        bodyClass="p-4"
      >
        <div className="flex gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="مثلاً ۱۲۳۴۵ یا نام خانوادگی متقاضی..." className="h-9 text-[13px]" />
          <Button className="brand-gradient h-9 gap-1.5 px-4 text-white" onClick={search}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} جستجو
          </Button>
        </div>
        {options.length > 0 && (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {options.map((o) => (
              <button key={o.id} onClick={() => openSim(o.id)}
                className={cn("rounded-xl border p-2.5 text-right transition-all hover:border-ring", sim?.event.id === o.id && "border-ring bg-accent")}>
                <p className="text-[12px] font-bold">{o.client}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  #{faNum(o.id)} {o.trackingCode ? `— کد ${faNum(o.trackingCode)}` : ""} — {o.service} — {o.startDate ?? "بدون تاریخ"}
                </p>
                <div className="mt-1"><StatusBadge status={o.status} /></div>
              </button>
            ))}
          </div>
        )}
        {options.length === 0 && !searching && (
          <p className="mt-3 text-[11.5px] text-muted-foreground">نتیجه‌ای یافت نشد — «در انتظار» بگذارید تا جلسات فعال بیاید، یا عبارت دیگری بزنید.</p>
        )}
      </SectionCard>

      {simLoading && <LoadingView label="در حال آماده‌سازی شبیه‌سازی..." />}

      {sim && !simLoading && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
          <SectionCard
            title={`شبیه‌سازی جلسهٔ #${faNum(sim.event.id)} — ${sim.event.client}`}
            subtitle={`${sim.event.service} — ${sim.event.center}${sim.event.isEms ? " — مورد حاد" : ""}`}
            bodyClass="p-2"
            actions={<StatusBadge status={sim.event.status} />}
          >
            <div className="flex items-center gap-1.5 border-b px-3 pb-2">
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setPlaying((p) => !p)}>
                {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />} {playing ? "توقف" : "پخش"}
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={jumpEnd}><FastForward className="h-3.5 w-3.5" /> تا وضعیت فعلی</Button>
              <select className="h-8 rounded-xl border bg-background px-2 text-[11.5px]" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="سرعت پخش">
                <option value={1}>سرعت ۱×</option>
                <option value={2}>سرعت ۲×</option>
                <option value={4}>سرعت ۴×</option>
              </select>
              <span className="mr-auto text-[10px] text-muted-foreground">مدت هر مرحله متناسب با زمان واقعی آن مقیاس شده است</span>
            </div>
            <div ref={canvasRef} dir="ltr" className="bpmn-canvas h-[440px] w-full overflow-hidden rounded-b-xl bg-[repeating-linear-gradient(45deg,#fafafa_0px,#fafafa_10px,#f5f5f5_10px,#f5f5f5_20px)] dark:bg-[repeating-linear-gradient(45deg,#18181b_0px,#18181b_10px,#141416_10px,#141416_20px)]" />
          </SectionCard>

          <div className="space-y-3">
            {/* خط زمانی مراحل */}
            <SectionCard title="مراحل و زمان واقعی" bodyClass="p-4">
              <ol className="space-y-2">
                {sim.timeline.map((s, i) => (
                  <li key={i}>
                    <button
                      onClick={() => { setPlaying(false); setStep(i); }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-right transition-all",
                        i === step ? "border-ring bg-accent" : "bg-card hover:border-ring/50",
                        s.state === "rejected" && "border-rose-200"
                      )}
                    >
                      <CircleDot className={cn("h-3.5 w-3.5 shrink-0",
                        s.state === "done" ? "text-emerald-500" : s.state === "active" ? "text-amber-500" : s.state === "rejected" ? "text-rose-500" : "text-muted-foreground/40")} />
                      <span className="flex-1 text-[12px] font-bold">{s.name}</span>
                      <span className={cn("text-[10.5px] tabular-nums", s.overdue ? "font-bold text-rose-600" : "text-muted-foreground")}>
                        {s.state === "active" ? `در انتظار ${fmtH(s.hours)}` : fmtH(s.hours)}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </SectionCard>

            {/* رزروها و EMS */}
            {sim.reserves.length > 0 && (
              <SectionCard title="رزروهای این جلسه" bodyClass="p-4">
                <ul className="space-y-1.5">
                  {sim.reserves.map((r) => (
                    <li key={r.id} className="flex items-center gap-2 text-[12px]">
                      <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" /> {jDate(r.date)}
                    </li>
                  ))}
                </ul>
              </SectionCard>
            )}
            {sim.ems && (
              <SectionCard title="مورد حاد مرتبط" bodyClass="p-4">
                <p className="text-[12px]">شدت: <b className={sim.ems.severity === "بالا" ? "text-rose-600" : sim.ems.severity === "متوسط" ? "text-amber-600" : "text-emerald-600"}>{sim.ems.severity}</b></p>
                <p className="mt-1 text-[11.5px] text-muted-foreground">ثبت: {jDate(sim.ems.dateTime)} — کمک مالی: {sim.ems.paymentStatus}</p>
              </SectionCard>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ================================================================ زبانهٔ مانیتورینگ
type ChainStats = {
  stages: { key: string; name: string; slaHours: number; avgHours: number; maxHours: number; doneCount: number; overdueAvg: boolean; activeCount: number; overdueActive: number; bottleneck: boolean }[];
  worst: { key: string; name: string; avgHours: number; slaHours: number } | null;
  activeTotal: number; overdueActiveTotal: number; scannedEvents: number; windowDays: number;
};
type CustomStats = {
  id: number; key: string; title: string; bpmnFile?: string | null;
  instancesTotal: number; instancesActive: number;
  steps: { name: string; slaHours: number; avgHours: number | null; overdue: boolean; activeCount: number }[];
  bottleneck: { name: string; avgHours: number | null } | null;
}[];

function MonitoringTab() {
  const [data, setData] = React.useState<{ chain: ChainStats; custom: CustomStats } | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try { setData(await api("/api/processes/monitoring")); } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  if (loading) return <LoadingView label="در حال تحلیل مراحل فرایند..." />;
  if (!data) return <SectionCard bodyClass="p-8"><p className="text-center text-xs text-muted-foreground">خطا در بارگذاری دادهٔ مانیتورینگ.</p></SectionCard>;

  const chain = data.chain;
  const maxAvg = Math.max(1, ...chain.stages.map((s) => s.avgHours));

  return (
    <div className="space-y-4">
      {/* خلاصهٔ گلوگاه */}
      <div className={cn(
        "rounded-2xl border p-5 shadow-sm",
        chain.worst ? "border-rose-200 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/30" : "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30"
      )}>
        <div className="flex items-start gap-3">
          {chain.worst ? <Siren className="mt-0.5 h-6 w-6 shrink-0 text-rose-600" /> : <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />}
          <div>
            <h2 className="text-[14.5px] font-extrabold">
              {chain.worst ? `گلوگاه اصلی فرایند: «${chain.worst.name}»` : "گلوگاه فعالی شناسایی نشد ✓"}
            </h2>
            <p className="mt-1 text-[12.5px] leading-6 text-foreground/85">
              تحلیل {faNum(chain.scannedEvents)} جلسه در {faNum(chain.windowDays)} روز اخیر:
              {chain.worst
                ? ` میانگین انتظار این مرحله ${faNum(chain.worst.avgHours)} ساعت است، در حالی که حد مجاز ${faNum(chain.worst.slaHours)} ساعت است.`
                : " همهٔ مراحل در محدودهٔ حد مجاز (SLA) خود عمل می‌کنند."}
              {chain.overdueActiveTotal > 0 && ` در همین حال ${faNum(chain.overdueActiveTotal)} درخواست خارج از مهلت در چرخه متوقف مانده است.`}
            </p>
          </div>
        </div>
      </div>

      {/* نمودار میانگین انتظار */}
      <SectionCard title="میانگین انتظار هر مرحله (ساعت)" subtitle="بر اساس فاصلهٔ واقعی بین تایید مرحلهٔ قبلی و مرحلهٔ بعدی">
        <div className="flex flex-col gap-2" dir="rtl">
          {chain.stages.map((s) => (
            <div key={s.key} className="flex items-center gap-2">
              <span className="w-[150px] shrink-0 truncate text-[11.5px]">{s.name}</span>
              <div className="relative h-5 flex-1 rounded-md bg-muted/60">
                {/* خط SLA */}
                <div className="absolute inset-y-0 border-r-2 border-dashed border-cyan-500" style={{ right: `${Math.min(100, (s.slaHours / maxAvg) * 100)}%` }} title="حد مجاز" />
                <div className={cn("h-full rounded-md transition-all", s.overdueAvg ? "bg-rose-500" : "bg-emerald-500")} style={{ width: `${(s.avgHours / maxAvg) * 100}%` }} />
              </div>
              <span className="w-16 shrink-0 text-left text-[11px] font-bold tabular-nums">{faNum(s.avgHours)}</span>
              <span className="w-20 shrink-0 text-left text-[10px] text-muted-foreground">SLA {faNum(s.slaHours)}h</span>
              {s.bottleneck && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[9.5px] font-bold text-rose-700">گلوگاه</span>}
            </div>
          ))}
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
          <Gauge className="h-3.5 w-3.5" /> خط‌چین آبی = حد مجاز (SLA) هر مرحله؛ میلهٔ قرمز یعنی میانگین از حد مجاز گذشته است.
        </p>
      </SectionCard>

      {/* جدول مراحل */}
      <SectionCard title="جزئیات مرحله‌به‌مرحله" bodyClass="p-0">
        <div className="overflow-x-auto">
          <table className="soft-table w-full text-[12px]">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-2.5 text-right font-bold">مرحله</th>
                <th className="px-4 py-2.5 text-right font-bold">میانگین</th>
                <th className="px-4 py-2.5 text-right font-bold">حداکثر</th>
                <th className="px-4 py-2.5 text-right font-bold">تعداد انجام‌شده</th>
                <th className="px-4 py-2.5 text-right font-bold">در جریان</th>
                <th className="px-4 py-2.5 text-right font-bold">خارج از مهلت</th>
              </tr>
            </thead>
            <tbody>
              {chain.stages.map((s) => (
                <tr key={s.key} className="border-b last:border-0">
                  <td className="px-4 py-2.5 font-bold">{s.name} {s.bottleneck && <span className="text-rose-500">⚠</span>}</td>
                  <td className={cn("px-4 py-2.5 tabular-nums", s.overdueAvg && "font-bold text-rose-600")}>{faNum(s.avgHours)} ساعت</td>
                  <td className="px-4 py-2.5 tabular-nums">{faNum(s.maxHours)} ساعت</td>
                  <td className="px-4 py-2.5 tabular-nums">{faNum(s.doneCount)}</td>
                  <td className="px-4 py-2.5 tabular-nums">{faNum(s.activeCount)}</td>
                  <td className={cn("px-4 py-2.5 tabular-nums", s.overdueActive > 0 && "font-bold text-rose-600")}>{faNum(s.overdueActive)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* فرایندهای سفارشی */}
      {data.custom.length > 0 && (
        <SectionCard title="مانیتورینگ فرایندهای سفارشی" bodyClass="p-4">
          <div className="space-y-3">
            {data.custom.map((c) => (
              <div key={c.id} className="rounded-2xl border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[13px] font-extrabold">{c.title}</h3>
                  <span className="text-[10.5px] text-muted-foreground">{faNum(c.instancesTotal)} نمونه — {faNum(c.instancesActive)} در جریان</span>
                  {c.bottleneck && (
                    <span className="mr-auto rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                      گلوگاه: {c.bottleneck.name}
                    </span>
                  )}
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {c.steps.map((s, i) => (
                    <div key={i} className={cn("rounded-xl border px-3 py-2 text-[11px]", s.overdue ? "border-rose-200 bg-rose-50/60" : "bg-muted/40")}>
                      <p className="font-bold">{s.name}</p>
                      <p className="mt-0.5 text-muted-foreground tabular-nums">
                        میانگین: {s.avgHours === null ? "بدون داده" : `${faNum(s.avgHours)} ساعت`} — در جریان: {faNum(s.activeCount)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ================================================================ زبانهٔ فرایندهای سفارشی
type DefRow = { id: number; key: string; title: string; desc?: string | null; bpmnFile?: string | null; steps: { name: string; slaHours: number }[]; isActive: boolean };
type InstRow = {
  id: number; processId: number; processTitle: string; bpmnFile?: string | null;
  steps: { name: string; slaHours: number }[]; refType: string; refId: number; title?: string | null;
  currentStep: number; status: string; startedAt: string; completedAt?: string | null;
  logs: { stepIdx: number; name: string; enteredAt: string; exitedAt?: string | null; durationMin?: number | null }[];
};

function CustomTab() {
  const [defs, setDefs] = React.useState<DefRow[]>([]);
  const [instances, setInstances] = React.useState<InstRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [draft, setDraft] = React.useState<{ title: string; desc: string; bpmnFile: string; steps: { name: string; slaHours: number }[] }>({ title: "", desc: "", bpmnFile: "", steps: [{ name: "", slaHours: 24 }] });
  const [startForm, setStartForm] = React.useState<{ processId: string; refType: string; refId: string; title: string }>({ processId: "", refType: "Event", refId: "", title: "" });

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const d = await api<{ definitions: DefRow[]; instances: InstRow[] }>("/api/processes");
      setDefs(d.definitions);
      setInstances(d.instances);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const saveDef = async () => {
    if (!draft.title.trim() || draft.steps.some((s) => !s.name.trim())) return;
    await api("/api/processes", {
      method: "POST",
      body: JSON.stringify({
        action: "create",
        title: draft.title, desc: draft.desc,
        bpmnFile: draft.bpmnFile || null,
        steps: draft.steps.map((s) => ({ name: s.name.trim(), slaHours: Number(s.slaHours) || 24 })),
      }),
    });
    setCreating(false);
    setDraft({ title: "", desc: "", bpmnFile: "", steps: [{ name: "", slaHours: 24 }] });
    await load();
  };

  const deleteDef = async (id: number) => {
    if (!confirm("فرایند و همهٔ نمونه‌های اجرای آن حذف شود؟")) return;
    await api("/api/processes", { method: "POST", body: JSON.stringify({ action: "delete", id }) });
    await load();
  };

  const startInstance = async () => {
    if (!startForm.processId || !startForm.refId) return;
    try {
      await api("/api/processes", {
        method: "POST",
        body: JSON.stringify({
          action: "start",
          processId: Number(startForm.processId), refType: startForm.refType,
          refId: Number(startForm.refId), title: startForm.title || null,
        }),
      });
      setStartForm({ processId: "", refType: "Event", refId: "", title: "" });
      await load();
    } catch (e: any) { alert(e.message); }
  };

  const act = async (action: string, instanceId: number) => {
    await api("/api/processes", { method: "POST", body: JSON.stringify({ action, instanceId }) });
    await load();
  };

  if (loading) return <LoadingView label="در حال بارگذاری فرایندهای سفارشی..." />;

  return (
    <div className="space-y-4">
      <SectionCard
        title="تعریف فرایند سفارشی"
        subtitle="مرحله‌های فرایند را تعریف کنید (نام + حد مجاز زمانی) — آمار و گلوگاه در زبانهٔ مانیتورینگ محاسبه می‌شود"
        actions={<Button className="brand-gradient gap-2 text-white" size="sm" onClick={() => setCreating((c) => !c)}><Plus className="h-4 w-4" /> فرایند جدید</Button>}
        bodyClass="p-4"
      >
        {creating && (
          <div className="rounded-2xl border bg-muted/30 p-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-[11.5px] font-bold">عنوان فرایند *</label>
                <Input className="h-9 text-[12.5px]" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="مثلاً پیگیری پس از جلسه" />
              </div>
              <div>
                <label className="mb-1 block text-[11.5px] font-bold">توضیح</label>
                <Input className="h-9 text-[12.5px]" value={draft.desc} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-[11.5px] font-bold">دیاگرام BPMN مرتبط (اختیاری)</label>
                <select className="h-9 w-full rounded-xl border bg-background px-2 text-[12.5px]" value={draft.bpmnFile} onChange={(e) => setDraft({ ...draft, bpmnFile: e.target.value })}>
                  <option value="">— بدون دیاگرام —</option>
                  {PROCESSES.map((p) => <option key={p.file} value={`${p.file}.bpmn`}>{p.title}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {draft.steps.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[11px] font-extrabold text-primary">{faNum(i + 1)}</span>
                  <Input className="h-9 flex-1 text-[12.5px]" placeholder="نام مرحله" value={s.name}
                    onChange={(e) => setDraft({ ...draft, steps: draft.steps.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })} />
                  <Input className="h-9 w-24 text-[12.5px]" type="number" min={1} placeholder="SLA ساعت" value={s.slaHours}
                    onChange={(e) => setDraft({ ...draft, steps: draft.steps.map((x, j) => j === i ? { ...x, slaHours: Number(e.target.value) } : x) })} />
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500" onClick={() => setDraft({ ...draft, steps: draft.steps.filter((_, j) => j !== i) })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" className="gap-1.5 text-[11.5px]" onClick={() => setDraft({ ...draft, steps: [...draft.steps, { name: "", slaHours: 24 }] })}>
                <Plus className="h-3.5 w-3.5" /> افزودن مرحله
              </Button>
            </div>
            <Button className="brand-gradient mt-4 gap-2 text-white" size="sm" onClick={saveDef} disabled={!draft.title.trim()}>
              <Plus className="h-4 w-4" /> ذخیرهٔ فرایند
            </Button>
          </div>
        )}

        {/* شروع نمونهٔ اجرا */}
        {defs.length > 0 && (
          <div className="mt-3 flex flex-wrap items-end gap-2 rounded-2xl border border-dashed p-3">
            <span className="flex items-center gap-1.5 text-[11.5px] font-bold text-muted-foreground"><Play className="h-3.5 w-3.5" /> شروع نمونهٔ اجرا:</span>
            <select className="h-9 rounded-xl border bg-background px-2 text-[12.5px]" value={startForm.processId} onChange={(e) => setStartForm({ ...startForm, processId: e.target.value })}>
              <option value="">انتخاب فرایند...</option>
              {defs.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
            <select className="h-9 rounded-xl border bg-background px-2 text-[12.5px]" value={startForm.refType} onChange={(e) => setStartForm({ ...startForm, refType: e.target.value })}>
              <option value="Event">جلسه</option>
              <option value="User">متقاضی</option>
              <option value="GroupEvent">جلسهٔ گروهی</option>
            </select>
            <Input className="h-9 w-28 text-[12.5px]" placeholder="شناسهٔ مرجع" dir="ltr" value={startForm.refId} onChange={(e) => setStartForm({ ...startForm, refId: e.target.value })} />
            <Input className="h-9 w-44 text-[12.5px]" placeholder="برچسب نمایشی" value={startForm.title} onChange={(e) => setStartForm({ ...startForm, title: e.target.value })} />
            <Button size="sm" className="h-9 gap-1.5" onClick={startInstance} disabled={!startForm.processId || !startForm.refId}>
              <Flag className="h-3.5 w-3.5" /> شروع
            </Button>
          </div>
        )}
      </SectionCard>

      {/* فهرست تعریف‌ها */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {defs.length === 0 && (
          <SectionCard bodyClass="p-10 lg:col-span-2 xl:col-span-3">
            <p className="text-center text-xs text-muted-foreground">فرایند سفارشی‌ای تعریف نشده است.</p>
          </SectionCard>
        )}
        {defs.map((d) => (
          <SectionCard key={d.id} bodyClass="p-4" className={cn(!d.isActive && "opacity-70")}>
            <div className="flex items-center gap-2">
              <h3 className="text-[13px] font-extrabold">{d.title}</h3>
              <span className="mr-auto text-[10px] text-muted-foreground">{faNum(d.steps.length)} مرحله</span>
              <button onClick={() => deleteDef(d.id)} className="text-muted-foreground hover:text-rose-500" aria-label="حذف فرایند"><Trash2 className="h-4 w-4" /></button>
            </div>
            {d.desc && <p className="mt-1 text-[11px] text-muted-foreground">{d.desc}</p>}
            <ol className="mt-2 space-y-1">
              {d.steps.map((s, i) => (
                <li key={i} className="flex items-center gap-2 text-[11.5px]">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-muted text-[9.5px] font-bold">{faNum(i + 1)}</span>
                  {s.name} <span className="text-muted-foreground">(حد {faNum(s.slaHours)} ساعت)</span>
                </li>
              ))}
            </ol>
          </SectionCard>
        ))}
      </div>

      {/* نمونه‌های اجرا */}
      <SectionCard title="نمونه‌های اجرا" subtitle={`${faNum(instances.filter((i) => i.status === "در جریان").length)} در جریان از ${faNum(instances.length)}`} bodyClass="p-4">
        {instances.length === 0 && <p className="text-center text-xs text-muted-foreground">نمونه‌ای شروع نشده است.</p>}
        <div className="space-y-3">
          {instances.slice(0, 15).map((inst) => (
            <div key={inst.id} className="rounded-2xl border p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-[12.5px] font-extrabold">{inst.processTitle}</h4>
                {inst.title && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{inst.title}</span>}
                <span className="text-[10px] text-muted-foreground">مرجع: {inst.refType} #{faNum(inst.refId)} — شروع {jDate(inst.startedAt)}</span>
                <span className={cn("mr-auto rounded-full px-2 py-0.5 text-[10px] font-bold",
                  inst.status === "تکمیل" ? "bg-emerald-100 text-emerald-700" : inst.status === "متوقف" ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-700")}>
                  {inst.status}
                </span>
              </div>
              {/* مراحل */}
              <div className="mt-2.5 flex items-center gap-1 overflow-x-auto">
                {inst.steps.map((s, i) => {
                  const log = inst.logs.find((l) => l.stepIdx === i);
                  const done = Boolean(log?.exitedAt) || inst.status === "تکمیل";
                  const active = i === inst.currentStep && inst.status === "در جریان";
                  return (
                    <div key={i} className="flex min-w-[90px] flex-1 flex-col items-center">
                      <span className={cn("h-1.5 w-full rounded-full",
                        done ? "bg-emerald-500" : active ? "bg-amber-500 animate-pulse" : "bg-muted")} />
                      <span className={cn("mt-1 text-[9.5px] leading-3", active ? "font-bold text-amber-600" : "text-muted-foreground")}>{s.name}</span>
                      {log?.durationMin != null && <span className="text-[9px] text-muted-foreground">{faNum(Math.round(log.durationMin / 60))} ساعت</span>}
                    </div>
                  );
                })}
              </div>
              {inst.status === "در جریان" && (
                <div className="mt-2.5 flex gap-1.5">
                  <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={() => act("advance", inst.id)}>
                    <FastForward className="h-3 w-3" /> تکمیل مرحلهٔ {faNum(inst.currentStep + 1)}
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={() => act("complete", inst.id)}>
                    <CheckIcon /> پایان فرایند
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-[11px] text-muted-foreground" onClick={() => act("stop", inst.id)}>
                    توقف
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function CheckIcon() { return <Activity className="h-3 w-3" />; }

// ================================================================ صفحهٔ اصلی
export function ProcessesView() {
  // پشتیبانی از لینک‌های عمیق: #/processes?tab=simulation
  const initialTab = (() => {
    const m = typeof window !== "undefined" ? window.location.hash.match(/processes\?tab=(\w+)/) : null;
    const t = m?.[1];
    return t === "simulation" || t === "monitoring" || t === "custom" ? t : "diagrams";
  })();

  return (
    <div className="space-y-5">
      <PageHeader
        title="فرایندهای سازمانی (BPMN)"
        subtitle="مدل‌سازی، شبیه‌سازی هر درخواست، مانیتورینگ و شناسایی گلوگاه‌ها — نسخهٔ ۶.۱"
        icon={<Network className="h-5 w-5" />}
      />
      <Tabs defaultValue={initialTab}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="diagrams" className="gap-1.5"><Network className="h-4 w-4" /> نمودارها</TabsTrigger>
          <TabsTrigger value="simulation" className="gap-1.5"><Play className="h-4 w-4" /> شبیه‌سازی درخواست</TabsTrigger>
          <TabsTrigger value="monitoring" className="gap-1.5"><Gauge className="h-4 w-4" /> مانیتورینگ و گلوگاه‌ها</TabsTrigger>
          <TabsTrigger value="custom" className="gap-1.5"><Plus className="h-4 w-4" /> فرایندهای سفارشی</TabsTrigger>
        </TabsList>
        <TabsContent value="diagrams" className="mt-5"><DiagramsTab /></TabsContent>
        <TabsContent value="simulation" className="mt-5"><SimulationTab /></TabsContent>
        <TabsContent value="monitoring" className="mt-5"><MonitoringTab /></TabsContent>
        <TabsContent value="custom" className="mt-5"><CustomTab /></TabsContent>
      </Tabs>
    </div>
  );
}
