"use client";
// فرایندهای سازمانی — نمایش BPMN با bpmn-js (ویوئر ناوبری: زوم/جابه‌جایی)
// شش فرایند اصلی مرکز مشاوره رز؛ فایل‌های XML در public/bpmn/
import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-js.css";
import * as React from "react";
import { PageHeader, SectionCard, LoadingView } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client";
import { faNum } from "@/lib/jalali";
import {
  Network, ZoomIn, ZoomOut, Maximize, Download, Printer, Loader2,
  CalendarCheck, ShieldCheck, CalendarClock, ArrowLeftRight, Siren, Wallet, Info,
} from "lucide-react";

const PROCESSES = [
  {
    file: "01-register-session", icon: <CalendarCheck className="h-4.5 w-4.5" />,
    title: "ثبت و پذیرش جلسه مشاوره",
    desc: "مسیر درخواست مراجع تا ثبت جلسه: بررسی هویت، کنترل سهمیهٔ بودجه، تعیین خدمت/مرکز/مشاور، محاسبهٔ تعرفه و رزرو وقت.",
  },
  {
    file: "02-approval-chain", icon: <ShieldCheck className="h-4.5 w-4.5" />,
    title: "زنجیرهٔ تایید پنج‌مرحله‌ای جلسات",
    desc: "مدیر مرکز ← مسئول فنی ← نظارت حرفه‌ای ← ناظر استان ← ناظر کشور؛ در هر مرحله امکان رد با ذکر دلیل و در پایان تسویهٔ مشاور.",
  },
  {
    file: "03-reserve", icon: <CalendarClock className="h-4.5 w-4.5" />,
    title: "رزرو وقت و پیگیری حضور",
    desc: "درخواست رزرو کاربر، بررسی مدیر مرکز، پیامک اطلاع‌رسانی، تبدیل به جلسه یا تماس پیگیری ۲۴ ساعته و بستن رزرو بی‌نتیجه.",
  },
  {
    file: "04-seha-referral", icon: <ArrowLeftRight className="h-4.5 w-4.5" />,
    title: "دریافت و اجرای ارجاع سها",
    desc: "دریافت ارجاع سازمانی، پذیرش/رد با دلیل، معرفی به مرکز، تعیین مشاور، اجرای جلسات تا تکمیل و اعلام نتیجه به سها.",
  },
  {
    file: "05-ems-acute", icon: <Siren className="h-4.5 w-4.5" />,
    title: "مدیریت مورد حاد (آسیب به خود)",
    desc: "ثبت فرم EMS، ارزیابی شدت خطر (بالا/متوسط/کم)، اقدام فوری، ثبت اقدامات، درخواست و تایید کمک مالی و پیگیری مراجع.",
  },
  {
    file: "06-finance-cycle", icon: <Wallet className="h-4.5 w-4.5" />,
    title: "چرخهٔ مالی و تسویهٔ جلسات",
    desc: "محاسبهٔ سهم‌های مالی پس از تایید نهایی، ثبت حقوق‌و‌دستمزد، مالیات ماهانهٔ مشاوران، گزارش تسویه و پرداخت.",
  },
];

type BpmnViewerModule = new (opts: Record<string, unknown>) => {
  importXML: (xml: string) => Promise<{ warnings?: unknown[] }>;
  get: (id: string) => { zoom: (v: number | string, focus?: unknown) => number };
  attachTo: (el: HTMLElement) => void;
  on: (event: string, cb: () => void) => void;
  destroy: () => void;
};

export function ProcessesView() {
  const [active, setActive] = React.useState(0);
  const canvasRef = React.useRef<HTMLDivElement>(null);
  const viewerRef = React.useRef<InstanceType<BpmnViewerModule> | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const proc = PROCESSES[active];

  // بارگذاری ویوئر و فایل XML — هر بار تغییر فرایند
  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const mod = await import("bpmn-js/lib/NavigatedViewer");
        if (!alive || !canvasRef.current) return;
        // ویوئر قبلی را نابود کن
        if (viewerRef.current) {
          try { viewerRef.current.destroy(); } catch {}
          viewerRef.current = null;
        }
        // bpmn-js خروجی default دارد — در باندل CJS/ESM هر دو حالت پوشش داده می‌شود
        const ViewerCtor = ((mod as unknown as { default?: unknown }).default ?? mod) as unknown as BpmnViewerModule;
        const viewer = new ViewerCtor({
          container: canvasRef.current,
          keyboard: { bindTo: document },
        });
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
    return () => {
      alive = false;
    };
  }, [active, proc.file]);

  React.useEffect(() => () => {
    if (viewerRef.current) {
      try { viewerRef.current.destroy(); } catch {}
      viewerRef.current = null;
    }
  }, []);

  const zoom = (d: number) => {
    const canvas = viewerRef.current?.get("canvas");
    if (!canvas) return;
    const cur = canvas.zoom();
    canvas.zoom(Math.max(0.2, Math.min(4, cur + d)));
  };
  const fit = () => viewerRef.current?.get("canvas").zoom("fit-viewport", "auto");

  const downloadXml = () => {
    window.open(`/bpmn/${proc.file}.bpmn`, "_blank");
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="فرایندهای سازمانی (BPMN)"
        subtitle="مدل‌سازی استاندارد فرایندهای مرکز مشاوره رز — با قابلیت زوم و جابه‌جایی؛ خروجی XML استاندارد BPMN 2.0"
        icon={<Network className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2 no-print">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={downloadXml}>
              <Download className="h-3.5 w-3.5" /> دانلود XML
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5" /> چاپ / PDF
            </Button>
          </div>
        }
      />

      {/* انتخاب فرایند */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3 no-print">
        {PROCESSES.map((p, i) => (
          <button
            key={p.file}
            onClick={() => setActive(i)}
            className={`flex items-start gap-2.5 rounded-xl border p-3 text-right transition-all ${active === i ? "border-ring bg-accent shadow-sm" : "bg-card hover:border-ring/60"}`}
          >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${active === i ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {p.icon}
            </span>
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

      {/* توضیح فرایند فعال */}
      <SectionCard title={proc.title} subtitle="شرح فرایند" bodyClass="p-4">
        <div className="flex items-start gap-2.5 text-[12.5px] leading-7 text-foreground/85">
          <Info className="mt-1 h-4 w-4 shrink-0 text-primary" />
          <p>{proc.desc}</p>
        </div>
      </SectionCard>

      {/* بوم BPMN */}
      <SectionCard bodyClass="p-2">
        <div className="flex items-center gap-1.5 border-b px-3 pb-2 no-print">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => zoom(0.15)} aria-label="بزرگ‌نمایی"><ZoomIn className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => zoom(-0.15)} aria-label="کوچک‌نمایی"><ZoomOut className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={fit}><Maximize className="h-3.5 w-3.5" /> اندازهٔ صفحه</Button>
          {loading && <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> در حال بارگذاری نمودار...</span>}
          {error && <span className="text-[11px] text-rose-500">{error}</span>}
          <span className="mr-auto text-[10px] text-muted-foreground">استاندارد BPMN 2.0 — کشیدن با ماوس برای جابه‌جایی</span>
        </div>
        <div
          ref={canvasRef}
          className="bpmn-canvas h-[520px] w-full overflow-hidden rounded-b-xl bg-[repeating-linear-gradient(45deg,#fafafa_0px,#fafafa_10px,#f5f5f5_10px,#f5f5f5_20px)] dark:bg-[repeating-linear-gradient(45deg,#18181b_0px,#18181b_10px,#141416_10px,#141416_20px)]"
          dir="ltr"
        />
      </SectionCard>
    </div>
  );
}
