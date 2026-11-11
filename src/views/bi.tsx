"use client";
// داشبوردهای مدیریتی — مطابق سامانهٔ گزارش‌گیری read_mysql
// • توصیفی: ۸ کارت KPI + ۱۴ نمودار با تفسیر خودکار + جدول سهمیه‌ها + خروجی CSV هر نمودار
// • تحلیلی / تفسیری / کشف خطا / پیشنهادی: از موتور تحلیل
// • هر بخش جداگانه رنگ می‌گیرد — صفحه هرگز روی همهٔ داده‌ها قفل نمی‌شود
import * as React from "react";
import { PageHeader, SectionCard, DataTable, DotBadge } from "@/components/shared";
import { BarChartX, DonutChart, GaugeChart, AreaChartX, CHART_COLORS } from "@/components/charts";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { faNum, faMoney, jDateTime, jDate } from "@/lib/jalali";
import { api, useQuery, navigate } from "@/lib/client";
import {
  BarChart3, FileText, LineChart, Lightbulb, Sparkles, TrendingUp,
  Building2, CalendarClock, UserRoundCheck, CalendarCheck, ShieldCheck, Scale, Clock,
  MessageSquareText, CalendarX, Users, TrendingDown, HeartHandshake, CheckCircle2,
  AlertTriangle, Activity, RefreshCw, Printer, ShieldAlert, Database, FilterX, Repeat2,
  Percent, Wallet, Hourglass, Ban, Info, ArrowLeftRight, Download, Loader2,
  CalendarCheck as CalendarCheckIcon, CheckCircle2 as CheckCircleIcon, Siren,
  UserRoundCheck as UserRoundCheckIcon, Map as MapIcon,
} from "lucide-react";
import { IranMap } from "@/components/iran-map";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ---------------- انواع — داشبورد توصیفی (مطابق bi-build.ts) ----------------
type BiChart =
  | { kind: "donut"; id: string; title: string; labels: string[]; values: number[]; total: number; insight?: string }
  | { kind: "bars"; id: string; title: string; labels: string[]; values: number[]; valueLabel?: string; insight?: string }
  | { kind: "bars2"; id: string; title: string; labels: string[]; values: number[]; values2: number[]; labelOk: string; labelWait: string; insight?: string }
  | { kind: "line"; id: string; title: string; labels: string[]; series: { name: string; values: number[]; color?: string }[]; insight?: string };

type BiKpi = { key: string; label: string; value: string; sub: string | null; icon: string; tone: string };
type BiPayload = {
  generatedAt: string;
  cached?: boolean;
  filters: { provinceId: number | null; from: string | null; to: string | null };
  scoped?: boolean;
  scopeName?: string | null;
  kpis: BiKpi[];
  charts: BiChart[];
  budgetTable: { headers: string[]; rows: string[][] };
};

type CoverageData = {
  sources: { key: string; label: string; count: number; first: string | null; last: string | null }[];
  checkedAt: string;
};

type InsightsData = {
  generatedAt: string;
  window?: { from: string; to: string; centerId: number | null };
  kpis: { events365: number; confirmed365: number; pending: number; rejected: number; undone: number; usersTotal: number; consultants: number; centersTotal: number; income365: number; ems365: number };
  daily: { key: string; label: string; count: number; income: number }[];
  monthly: { key: string; label: string; count: number; income: number }[];
  weekday: { name: string; count: number }[];
  hourly: { h: number; label: string; count: number }[];
  serviceStats: { name: string; value: number; income: number }[];
  centerStats: { name: string; value: number; income: number }[];
  consultantStats: { name: string; sessions: number; income: number }[];
  statusDist: { name: string; value: number }[];
  repeat: { newClients: number; repeatClients: number; repeatRate: number };
  conversion: { reserves: number; confirmed: number; pct: number };
  trend: { monthPct: number; weekPct: number; thisMonth: number; prevMonth: number; thisWeek: number; prevWeek: number };
  insights: { id: string; icon: string; tone: string; title: string; text: string }[];
  anomalies: { id: string; kind: string; severity: number; date: string; title: string; detail: string }[];
  quality: { score: number; checks: { id: string; name: string; ok: boolean; count: number; hint: string; route: string }[] };
  recommendations: { id: string; icon: string; tone: string; title: string; text: string; route?: string }[];
  scoped?: boolean;
  scopeName?: string | null;
};

const IMPORT_COMMAND = '.\\deploy.ps1 -Mode import -DbEngine mysql -MysqlUser root -MysqlDatabase rahe_zendegi -DataDir "D:\\Projects\\rahe_zendegi\\data"';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  TrendingUp, TrendingDown, Sparkles, Building2, CalendarClock, UserRoundCheck, CalendarCheck,
  ShieldCheck, Scale, Clock, MessageSquareText, CalendarX, Users, HeartHandshake, CheckCircle2,
  ShieldAlert, Lightbulb, Repeat2,
};

function InsightIcon({ name, className }: { name: string; className?: string }) {
  const I = ICONS[name] ?? Activity;
  return <I className={className} />;
}

const TONE_STYLES: Record<string, string> = {
  positive: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  warning: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  danger: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
  info: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900",
};

// آیکون‌های KPI توصیفی — مطابق bi-build.ts
const KPI_ICONS: Record<string, React.ReactNode> = {
  CalendarCheck: <CalendarCheckIcon className="h-5 w-5" />,
  CheckCircle2: <CheckCircleIcon className="h-5 w-5" />,
  Clock: <Clock className="h-5 w-5" />,
  Siren: <Siren className="h-5 w-5" />,
  Users: <Users className="h-5 w-5" />,
  UserRoundCheck: <UserRoundCheckIcon className="h-5 w-5" />,
  Wallet: <Wallet className="h-5 w-5" />,
  CalendarClock: <CalendarClock className="h-5 w-5" />,
};

const KPI_TONES: Record<string, string> = {
  p: "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
  g: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  o: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  r: "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300",
  b: "bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
};

// ---------------- خروجی CSV سمت کلاینت ----------------
function csvEsc(v: unknown): string {
  const s = String(v ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function downloadCsv(filename: string, lines: string[]) {
  const csv = "\uFEFF" + lines.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
function chartToCsv(ch: BiChart): string[] {
  const lines: string[] = [];
  if (ch.kind === "donut" || ch.kind === "bars") {
    lines.push("عنوان,تعداد");
    ch.labels.forEach((lb, i) => lines.push(`${csvEsc(lb)},${ch.values[i]}`));
  } else if (ch.kind === "bars2") {
    lines.push("عنوان,تاییدشده,در انتظار");
    ch.labels.forEach((lb, i) => lines.push(`${csvEsc(lb)},${ch.values[i]},${ch.values2[i]}`));
  } else {
    lines.push(`ماه,${ch.series.map((s) => s.name).join(",")}`);
    ch.labels.forEach((lb, i) => lines.push(`${csvEsc(lb)},${ch.series.map((s) => s.values[i]).join(",")}`));
  }
  return lines;
}

// ============================================================
export function BiView() {
  // فیلترها — اعمال با دکمه تا محاسبات سنگین هر بار اجرا نشود
  const [fromIso, setFromIso] = React.useState("");
  const [toIso, setToIso] = React.useState("");
  const [provinceId, setProvinceId] = React.useState("");
  const [applied, setApplied] = React.useState({ from: "", to: "", provinceId: "" });

  const meta = useQuery<any>(() => api("/api/meta"), []);
  const coverage = useQuery<CoverageData>(() => api("/api/bi/coverage"), []);
  const biParams = new URLSearchParams({
    ...(applied.from && { from: applied.from }),
    ...(applied.to && { to: applied.to }),
    ...(applied.provinceId && { provinceId: applied.provinceId }),
  }).toString();
  const bi = useQuery<BiPayload>(() => api(`/api/bi?${biParams}`), [applied.from, applied.to, applied.provinceId]);
  const insParams = new URLSearchParams({
    ...(applied.from && { from: applied.from }),
    ...(applied.to && { to: applied.to }),
  }).toString();
  const ins = useQuery<InsightsData>(() => api(`/api/bi/insights?${insParams}`), [applied.from, applied.to]);

  const activeFilterCount = [applied.from, applied.to, applied.provinceId].filter(Boolean).length;
  const eventsCoverage = coverage.data?.sources.find((s) => s.key === "events");
  const hasAnyData = (coverage.data?.sources ?? []).some((s) => s.count > 0);
  const hasEvents = (eventsCoverage?.count ?? 0) > 0;

  const applyFilters = () => setApplied({ from: fromIso, to: toIso, provinceId });
  const resetFilters = () => { setFromIso(""); setToIso(""); setProvinceId(""); setApplied({ from: "", to: "", provinceId: "" }); };

  const refreshAll = () => { bi.refetch(); ins.refetch(); coverage.refetch(); };

  return (
    <div className="space-y-5">
      <PageHeader
        title={bi.data?.scoped ? "داشبورد شخصی" : "داشبوردهای مدیریتی"}
        subtitle={bi.data?.scoped
          ? `فقط دادهٔ جلسات شما نمایش داده می‌شود — آخرین محاسبه: ${bi.data ? jDateTime(bi.data.generatedAt) : "…"}`
          : `توصیفی، تحلیلی، تفسیری، کشف خطا و پیشنهادی — آخرین محاسبه: ${bi.data ? jDateTime(bi.data.generatedAt) : "…"}`}
        icon={<BarChart3 className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2 no-print">
            {bi.data?.cached && <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">نسخهٔ کش‌شده</span>}
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5" /> چاپ / PDF
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={refreshAll}>
              <RefreshCw className="h-3.5 w-3.5" /> به‌روزرسانی
            </Button>
          </div>
        }
      />

      {/* هشدار اسکوپ شخصی — مشاور فقط دادهٔ خودش را می‌بیند (نسخهٔ ۶.۹) */}
      {bi.data?.scoped && (
        <div className="flex items-center gap-2 rounded-2xl border border-sky-300 bg-sky-50 px-4 py-2.5 text-xs font-bold text-sky-800 no-print dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          این داشبورد فقط آمار جلسات و مراجعان شما را نمایش می‌دهد — دادهٔ سایر مشاوران پنهان است.
        </div>
      )}

      {/* پوشش داده‌ها / هشدار خالی بودن */}
      {coverage.data && (
        hasAnyData ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border bg-card px-4 py-2.5 text-[11.5px] text-muted-foreground no-print">
            <span className="flex items-center gap-1.5 font-bold text-foreground"><Database className="h-3.5 w-3.5 text-primary" /> پوشش داده‌ها:</span>
            {coverage.data.sources.filter((s) => s.count > 0).slice(0, 6).map((s) => (
              <span key={s.key} className="tabular-nums">{s.label}: <b className="text-foreground">{faNum(s.count)}</b></span>
            ))}
            {eventsCoverage?.last && <span className="text-[10.5px]">آخرین جلسه: {jDate(eventsCoverage.last)}</span>}
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/40">
            <div className="flex items-start gap-3">
              <Database className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold text-amber-800 dark:text-amber-300">داده‌ای در سامانه ثبت یا منتقل نشده است</p>
                <p className="mt-1 text-xs leading-6 text-amber-700/90 dark:text-amber-200/80">
                  داشبوردها و گزارش‌ها از پایگاه‌دادهٔ MySQL خوانده می‌شوند. برای انتقال پشتیبان SQLite (پوشهٔ داده) به MySQL، این دستور را در PowerShell اجرا کنید؛ بعد از پایان انتقال، همین صفحه را به‌روزرسانی کنید:
                </p>
                <code dir="ltr" className="mt-2 block overflow-x-auto rounded-lg border bg-background px-3 py-2 text-[11px] leading-5 text-foreground">{IMPORT_COMMAND}</code>
              </div>
            </div>
          </div>
        )
      )}
      {coverage.data && hasAnyData && !hasEvents && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          کاربران منتقل شده‌اند اما هیچ جلسه‌ای یافت نشد — احتمالاً انتقال داده ناتمام مانده است. ادامهٔ انتقال با همان دستور وارد کردن داده (حالت import) انجام می‌شود.
        </div>
      )}

      {/* نوار فیلتر — تاریخ شمسی و استان */}
      <SectionCard bodyClass="p-4 no-print">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-muted-foreground">از تاریخ (شمسی)</p>
            <JalaliDatePicker value={fromIso} onChange={setFromIso} placeholder="ابتدای بازه" className="w-[180px]" />
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-muted-foreground">تا تاریخ (شمسی)</p>
            <JalaliDatePicker value={toIso} onChange={setToIso} placeholder="انتهای بازه" className="w-[180px]" />
          </div>
          <div className="w-[210px] space-y-1">
            <p className="text-[11px] font-bold text-muted-foreground">استان</p>
            <Select value={provinceId || "all"} onValueChange={(v) => setProvinceId(v === "all" ? "" : v)}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="همهٔ استان‌ها" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همهٔ استان‌ها</SelectItem>
                {(meta.data?.provinces ?? []).map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" className="gap-1.5 h-9" onClick={applyFilters}><FilterX className="h-3.5 w-3.5 rotate-180" /> اعمال فیلتر</Button>
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" className="gap-1.5 h-9 text-xs" onClick={resetFilters}>
              <RefreshCw className="h-3.5 w-3.5" /> حذف فیلترها ({faNum(activeFilterCount)})
            </Button>
          )}
          {ins.data?.window && (
            <span className="mr-auto text-[10.5px] text-muted-foreground">
              بازهٔ تحلیل: {ins.data.window.from ? jDate(ins.data.window.from) : "—"} تا {ins.data.window.to ? jDate(ins.data.window.to) : "—"}
            </span>
          )}
        </div>
      </SectionCard>

      {/* نوار KPI توصیفی — ۸ کارت مطابق read_mysql */}
      {bi.loading && !bi.data ? (
        <KpiSkeleton />
      ) : bi.data ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-4">
          {bi.data.kpis.map((kpi) => (
            <div key={kpi.key} className="rounded-2xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${KPI_TONES[kpi.tone] ?? KPI_TONES.p}`}>
                  {KPI_ICONS[kpi.icon] ?? <Activity className="h-5 w-5" />}
                </span>
                <p className="text-xl font-black tabular-nums">{kpi.value}</p>
              </div>
              <p className="mt-2.5 text-xs font-bold">{kpi.label}</p>
              {kpi.sub && <p className="mt-0.5 text-[10px] text-muted-foreground">{kpi.sub}</p>}
            </div>
          ))}
        </div>
      ) : null}

      <Tabs defaultValue="descriptive" dir="rtl">
        <TabsList className="h-auto flex-wrap no-print">
          <TabsTrigger value="descriptive" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> توصیفی</TabsTrigger>
          <TabsTrigger value="analytic" className="gap-1.5"><LineChart className="h-3.5 w-3.5" /> تحلیلی</TabsTrigger>
          <TabsTrigger value="interpret" className="gap-1.5"><Lightbulb className="h-3.5 w-3.5" /> تفسیری</TabsTrigger>
          <TabsTrigger value="anomaly" className="gap-1.5"><ShieldAlert className="h-3.5 w-3.5" /> کشف خطا</TabsTrigger>
          <TabsTrigger value="advice" className="gap-1.5"><Sparkles className="h-3.5 w-3.5" /> پیشنهادی</TabsTrigger>
          <TabsTrigger value="map" className="gap-1.5"><MapIcon className="h-3.5 w-3.5" /> نقشهٔ مراکز</TabsTrigger>
        </TabsList>

        <TabsContent value="descriptive" className="mt-4 space-y-4">
          {bi.loading && !bi.data ? (
            <ChartSkeleton />
          ) : bi.data ? (
            <DescriptiveTab data={bi.data} />
          ) : (
            <p className="p-6 text-center text-xs text-muted-foreground">{bi.error ?? "دادهٔ توصیفی در دسترس نیست"}</p>
          )}
        </TabsContent>
        <TabsContent value="analytic" className="mt-4 space-y-4">
          {ins.loading && !ins.data ? <ChartSkeleton /> : ins.data ? <AnalyticTab data={ins.data} /> : null}
        </TabsContent>
        <TabsContent value="interpret" className="mt-4">
          {ins.loading && !ins.data ? <ChartSkeleton /> : ins.data ? <InterpretTab data={ins.data} /> : null}
        </TabsContent>
        <TabsContent value="anomaly" className="mt-4 space-y-4">
          {ins.loading && !ins.data ? <ChartSkeleton /> : ins.data ? <AnomalyTab data={ins.data} /> : null}
        </TabsContent>
        <TabsContent value="advice" className="mt-4">
          {ins.loading && !ins.data ? <ChartSkeleton /> : ins.data ? <AdviceTab data={ins.data} /> : null}
        </TabsContent>
        <TabsContent value="map" className="mt-4">
          <BiMapTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------- اسکلت بارگذاری ----------------
function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl border bg-card p-4">
          <div className="h-10 w-10 animate-pulse rounded-xl bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-2xl border bg-card p-5">
          <div className="mb-4 h-4 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-56 animate-pulse rounded-xl bg-muted/60" />
        </div>
      ))}
    </div>
  );
}

type BudgetRow = { id: number; cells: string[] };

// ---------------- تب توصیفی — شبکهٔ نمودارها مطابق read_mysql ----------------
function DescriptiveTab({ data }: { data: BiPayload }) {
  return (
    <>
      {data.charts.length === 0 && (
        <div className="rounded-2xl border bg-muted/40 p-8 text-center text-sm text-muted-foreground">
          با فیلترهای فعلی داده‌ای برای نمایش نیست — اگر انتقال داده اجرا نشده، از پوشش داده‌ها در بالای صفحه راهنما بگیرید.
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        {data.charts.map((ch) => <ChartCard key={ch.id} chart={ch} />)}
      </div>

      {/* جدول سهمیه‌ها */}
      {data.budgetTable.rows.length > 0 && (
        <SectionCard title="سهمیه‌های خدمات (بودجه)" subtitle="سقف، مصرف و درصد مصرف هر سهمیه" bodyClass="p-0">
          <DataTable
            columns={data.budgetTable.headers.map((h, i) => ({
              header: h,
              cell: (row: BudgetRow) => <span className="text-xs tabular-nums">{row.cells[i]}</span>,
            }))}
            rows={data.budgetTable.rows.map((cells, id) => ({ id, cells }))}
          />
        </SectionCard>
      )}
    </>
  );
}

// ---------------- کارت نمودار — با تفسیر خودکار و CSV ----------------
function ChartCard({ chart }: { chart: BiChart }) {
  const [showInsight, setShowInsight] = React.useState(true);
  const sub =
    chart.kind === "donut" ? `مجموع: ${faNum(chart.total)}` :
    chart.kind === "line" ? `${faNum(chart.labels.length)} ماه` :
    chart.kind === "bars2" ? `${chart.labelOk} / ${chart.labelWait}` : undefined;

  const exportCsv = () => downloadCsv(`chart-${chart.id}.csv`, chartToCsv(chart));

  return (
    <SectionCard
      title={chart.title}
      subtitle={sub}
      actions={
        <div className="flex items-center gap-1">
          {chart.insight && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowInsight((v) => !v)} aria-label="تفسیر" title="تفسیر خودکار">
              <Info className={`h-3.5 w-3.5 ${showInsight ? "text-primary" : "text-muted-foreground"}`} />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={exportCsv} aria-label="خروجی CSV" title="خروجی CSV">
            <Download className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      }
    >
      <ChartBody chart={chart} />
      {chart.insight && showInsight && (
        <p className="mt-3 rounded-xl border border-dashed bg-muted/30 px-3.5 py-2.5 text-[11.5px] leading-6 text-foreground/80">
          <Lightbulb className="mb-0.5 ml-1 inline h-3.5 w-3.5 text-amber-500" />
          {chart.insight}
        </p>
      )}
    </SectionCard>
  );
}

// ---------------- بدنهٔ نمودار بر اساس نوع ----------------
function ChartBody({ chart }: { chart: BiChart }) {
  if (chart.kind === "donut") {
    const data = chart.labels.map((name, i) => ({ name, value: chart.values[i] }));
    return (
      <div className="grid gap-2 lg:grid-cols-[1fr_auto]">
        <DonutChart data={data} height={280} />
        <div className="grid max-h-[280px] grid-cols-1 content-start gap-1.5 overflow-y-auto pl-1 lg:w-44">
          {data.map((d, i) => (
            <div key={d.name} className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-2.5 py-1.5">
              <span className="flex items-center gap-1.5 truncate text-[10.5px]">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: CHART_COLOR(i) }} />
                {d.name}
              </span>
              <span className="text-[11px] font-extrabold tabular-nums">{faNum(d.value)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (chart.kind === "bars") {
    const data = chart.labels.map((name, i) => ({ name, value: chart.values[i] }));
    return <BarChartX data={data} xKey="name" bars={[{ key: "value", name: chart.valueLabel ?? "تعداد" }]} height={Math.min(460, 160 + data.length * 22)} layout="vertical" />;
  }
  if (chart.kind === "bars2") {
    const data = chart.labels.map((name, i) => ({ name, ok: chart.values[i], wait: chart.values2[i] }));
    return (
      <BarChartX
        data={data} xKey="name" stacked height={300}
        bars={[{ key: "ok", name: chart.labelOk, color: "#16a34a" }, { key: "wait", name: chart.labelWait, color: "#c99a5b" }]}
      />
    );
  }
  // line — سری‌های چندگانه
  const data = chart.labels.map((label, i) => {
    const row: Record<string, string | number> = { label };
    chart.series.forEach((s, si) => { row[`s${si}`] = s.values[i]; });
    return row;
  });
  const areas = chart.series.map((s, si) => ({ key: `s${si}`, name: s.name, color: s.color }));
  return <AreaChartX data={data} xKey="label" areas={areas} height={300} />;
}

// رنگ نمودار از پالت
const CHART_COLOR = (i: number) => CHART_COLORS[i % CHART_COLORS.length];

// ---------------- تب تحلیلی ----------------
function AnalyticTab({ data }: { data: InsightsData }) {
  const weekdayPeak = [...data.weekday].sort((a, b) => b.count - a.count)[0];
  const totalEvents = Math.max(data.kpis.events365, 1);
  const clients = data.repeat.newClients + data.repeat.repeatClients;
  const completion = Math.round((data.kpis.confirmed365 / totalEvents) * 100);
  const rejection = Math.round((data.kpis.rejected / totalEvents) * 100);
  const undoneShare = Math.round((data.kpis.undone / totalEvents) * 100);
  const avgPerClient = clients > 0 ? Math.round((data.kpis.confirmed365 / clients) * 10) / 10 : 0;
  const avgSessionIncome = data.kpis.confirmed365 > 0 ? Math.round(data.kpis.income365 / data.kpis.confirmed365) : 0;

  return (
    <>
      {/* کارت‌های نرخ */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <RateTile label="نرخ تکمیل جلسات" value={completion} icon={<CheckCircle2 className="h-4 w-4" />} />
        <RateTile label="نرخ رد شدن" value={rejection} icon={<Ban className="h-4 w-4" />} invert />
        <RateTile label="نرخ ناتمام" value={undoneShare} icon={<CalendarX className="h-4 w-4" />} invert />
        <RateTile label="نرخ بازگشت مراجع" value={data.repeat.repeatRate} icon={<Repeat2 className="h-4 w-4" />} />
        <RateTile label="نرخ تبدیل رزرو" value={data.conversion.pct} icon={<Percent className="h-4 w-4" />} />
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground"><UserRoundCheck className="h-4 w-4" /><p className="text-[11px]">جلسه به ازای هر مراجع</p></div>
          <p className="mt-2 text-lg font-black tabular-nums">{faNum(avgPerClient)}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{faNum(clients)} مراجع در بازه</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="روند ماهانهٔ جلسات و درآمد" subtitle="۱۲ ماه اخیر — جلسات بازهٔ انتخابی" className="lg:col-span-2">
          <AreaChartX
            data={data.monthly}
            xKey="label"
            areas={[{ key: "count", name: "جلسات" }, { key: "income", name: "درآمد (ریال)", color: "#c99a5b" }]}
            height={300}
          />
        </SectionCard>
        <div className="space-y-4">
          <SectionCard title="مقایسهٔ دوره‌ای">
            <div className="space-y-3 pt-1">
              <TrendRow label="این ماه در برابر ماه قبل" value={data.trend.thisMonth} ref={data.trend.prevMonth} pct={data.trend.monthPct} />
              <TrendRow label="این هفته در برابر هفتهٔ قبل" value={data.trend.thisWeek} ref={data.trend.prevWeek} pct={data.trend.weekPct} />
              <div className="rounded-xl border bg-muted/40 p-3">
                <p className="text-[11px] text-muted-foreground">میانگین درآمد هر جلسه</p>
                <p className="mt-1 text-sm font-extrabold tabular-nums">{faMoney(avgSessionIncome)} ریال</p>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="پذیرش به تفکیک روز هفته" subtitle={`روز اوج: ${weekdayPeak?.name ?? "—"}`}>
          <BarChartX data={data.weekday} xKey="name" bars={[{ key: "count", name: "جلسات" }]} height={260} />
        </SectionCard>
        <SectionCard title="پذیرش به تفکیک ساعت روز" subtitle="ساعات اوج برای ظرفیت‌گذاری">
          <BarChartX data={data.hourly.filter((h) => h.h >= 7 && h.h <= 22)} xKey="label" bars={[{ key: "count", name: "جلسات" }]} height={260} />
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="درآمد خدمات برتر" subtitle="جمع تعرفهٔ ثبت‌شده در بازهٔ انتخابی">
          <BarChartX data={data.serviceStats.map((s) => ({ name: s.name, value: s.income }))} xKey="name" bars={[{ key: "value", name: "درآمد (ریال)" }]} height={320} layout="vertical" />
        </SectionCard>
        <SectionCard title="پرکارترین مشاوران" subtitle="بر اساس جلسات تاییدشدهٔ بازهٔ انتخابی" bodyClass="p-0">
          <DataTable
            columns={[
              { header: "مشاور", cell: (r: any) => <span className="text-xs font-semibold">{r.name}</span> },
              { header: "جلسات", cell: (r: any) => <span className="text-xs tabular-nums font-bold">{faNum(r.sessions)}</span> },
              { header: "حق‌الزحمه (ریال)", cell: (r: any) => <span className="text-xs tabular-nums">{faMoney(r.income)}</span> },
            ]}
            rows={data.consultantStats}
          />
        </SectionCard>
      </div>
    </>
  );
}

// ---------------- تب تفسیری — گیج با دکمهٔ تفسیر ----------------
function InterpretTab({ data }: { data: InsightsData }) {
  const totalEvents = Math.max(data.kpis.events365, 1);
  const gauges = [
    {
      id: "completion", label: "نرخ تکمیل جلسات", value: Math.round((data.kpis.confirmed365 / totalEvents) * 100),
      color: "#10b981",
      good: (v: number) => v >= 90,
      tafsir: (v: number) => v >= 90
        ? "بیشتر جلسات به مرحلهٔ تایید نهایی رسیده‌اند؛ فرایند پذیرش و تایید مرکز سلامت است."
        : `${100 - v}٪ جلسات تایید نشده‌اند — زنجیرهٔ تایید یا وضعیت «در انتظار/ناتمام» را در بخش جلسات بررسی کنید.`,
    },
    {
      id: "rejection", label: "نرخ رد شدن جلسات", value: Math.round((data.kpis.rejected / totalEvents) * 100),
      color: "#a83a54",
      good: (v: number) => v <= 5,
      tafsir: (v: number) => v <= 5
        ? "سهم رد شدن ناچیز است؛ رضایت پذیرش مراجعان در سطح خوبی قرار دارد."
        : `${v}٪ جلسات رد شده‌اند — دلایل رد (عدم حضور، نقص مدارک، عدم تطابق خدمت) در گزارش جلسات قابل ردیابی است.`,
    },
    {
      id: "repeat", label: "نرخ بازگشت مراجعان", value: data.repeat.repeatRate,
      color: "#5c4a6e",
      good: (v: number) => v >= 40,
      tafsir: (v: number) => v >= 40
        ? "بیش از ۴۰٪ مراجعان جلسهٔ دوم ثبت کرده‌اند؛ اعتماد و رضایت مراجعان بالاست."
        : "بازگشت مراجعان پایین است — پیامک پیگیری پس از جلسه و پیشنهاد دورهٔ بعدی توسط مشاور پیشنهاد می‌شود.",
    },
    {
      id: "conversion", label: "نرخ تبدیل رزرو به جلسه", value: data.conversion.pct,
      color: "#c99a5b",
      good: (v: number) => v >= 60,
      tafsir: (v: number) => data.conversion.reserves === 0
        ? "در بازهٔ انتخابی رزروی ثبت نشده است؛ اگر رزرو آنلاین فعال است، وضعیت وب‌سرویس را بررسی کنید."
        : v >= 60
          ? "بخش بزرگی از رزروها به جلسهٔ قطعی رسیده‌اند؛ مسیر رزرو → پذیرش کارآمد است."
          : "تعداد قابل توجهی رزرو بی‌نتیجه مانده — تماس پیگیری ۲۴ ساعت پس از رزرو، نرخ تبدیل را بالا می‌برد.",
    },
    {
      id: "quality", label: "سلامت داده‌ها", value: data.quality.score,
      color: data.quality.score >= 80 ? "#10b981" : data.quality.score >= 50 ? "#c99a5b" : "#a83a54",
      good: (v: number) => v >= 80,
      tafsir: (v: number) => v >= 80
        ? "کنترل‌های کیفیت داده عمدتاً بی‌نقص‌اند؛ گزارش‌های مدیریتی قابل اتکا هستند."
        : "برخی کنترل‌های کیفیت نکته‌دار هستند — فهرست موارد در تب «کشف خطا» آمده و اصلاح هر مورد دقت گزارش‌ها را بالا می‌برد.",
    },
    {
      id: "pending", label: "سهم جلسات در انتظار تایید", value: Math.round((data.kpis.pending / totalEvents) * 100),
      color: "#c99a5b",
      good: (v: number) => v <= 15,
      tafsir: (v: number) => v <= 15
        ? "صف تایید جمع‌شدگی معقولی دارد."
        : `${v}٪ جلسات در انتظار تایید مانده‌اند — ظرفیت تیم تایید یا زمان‌بندی تاییدها بازبینی شود.`,
    },
    {
      id: "ems", label: "سهم موارد حاد (EMS)", value: Math.round((data.kpis.ems365 / totalEvents) * 100),
      color: "#7c2740",
      good: () => true,
      tafsir: (v: number) => v > 0
        ? `${v}٪ از جلسات بازه، مورد حاد بوده‌اند — پروتکل ارجاع فوری و مستندسازی موارد حاد باید کامل رعایت شود.`
        : "در بازهٔ انتخابی مورد حادی ثبت نشده است.",
    },
    {
      id: "trend", label: "رشد ماهانهٔ پذیرش", value: Math.min(100, Math.max(0, 50 + data.trend.monthPct / 2)),
      display: `${data.trend.monthPct >= 0 ? "+" : ""}${faNum(data.trend.monthPct)}٪`,
      color: data.trend.monthPct >= 0 ? "#10b981" : "#a83a54",
      good: () => data.trend.monthPct >= 0,
      tafsir: () => data.trend.monthPct >= 0
        ? `پذیرش این ماه ${faNum(data.trend.monthPct)}٪ بیشتر از ماه قبل است؛ روند رشد ادامه دارد.`
        : `پذیرش این ماه ${faNum(Math.abs(data.trend.monthPct))}٪ کمتر از ماه قبل است — بررسی ظرفیت مشاوران و تعطیلات دورهٔ اخیر پیشنهاد می‌شود.`,
    },
  ];

  return (
    <div className="space-y-4">
      <SectionCard title="شاخص‌های کلیدی سلامت سامانه" subtitle="هر شاخص را با دکمهٔ «تفسیر» باز و بسته کنید — تحلیل خودکار بر اساس دادهٔ بازهٔ انتخابی" bodyClass="p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {gauges.map((g) => <GaugeWithTafsir key={g.id} gauge={g} />)}
        </div>
      </SectionCard>

      <SectionCard title="خلاصهٔ اجرایی" subtitle="جمع‌بندی خودکار وضعیت مرکز">
        <p className="text-[13.5px] leading-8 text-foreground/90">
          {data.insights.length
            ? data.insights.map((i) => i.text).join(" ")
            : "بر اساس دادهٔ بازهٔ انتخابی، نکتهٔ اجرایی خاصی یافت نشد."}
        </p>
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.insights.map((i) => (
          <div key={i.id} className={`rounded-2xl border p-5 ${TONE_STYLES[i.tone] ?? TONE_STYLES.info}`}>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/70 dark:bg-black/20">
                <InsightIcon name={i.icon} className="h-4.5 w-4.5" />
              </span>
              <h3 className="text-sm font-extrabold">{i.title}</h3>
            </div>
            <p className="mt-3 text-xs leading-6 opacity-90">{i.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function GaugeWithTafsir({ gauge }: { gauge: { id: string; label: string; value: number; display?: string; color: string; good: (v: number) => boolean; tafsir: (v: number) => string } }) {
  const [open, setOpen] = React.useState(false);
  const isGood = gauge.good(gauge.value);
  return (
    <div className={cnCard(isGood)}>
      <GaugeChart value={gauge.value} max={100} label={gauge.label} color={gauge.color} />
      {gauge.display && (
        <p className="-mt-6 text-center text-[11px] font-extrabold text-muted-foreground">{gauge.display}</p>
      )}
      <Button
        variant="outline"
        size="sm"
        className={cnBtn(isGood)}
        onClick={() => setOpen((v) => !v)}
      >
        <Info className="h-3.5 w-3.5" /> {open ? "بستن تفسیر" : "تفسیر"}
      </Button>
      {open && (
        <p className="mt-2 rounded-xl bg-background/70 p-3 text-[11.5px] leading-6 text-foreground/85 border">
          {gauge.tafsir(gauge.value)}
        </p>
      )}
    </div>
  );
}

function cnCard(isGood: boolean) {
  return isGood
    ? "flex flex-col items-center rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900 dark:bg-emerald-950/30"
    : "flex flex-col items-center rounded-2xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/30";
}
function cnBtn(isGood: boolean) {
  return isGood
    ? "mt-2 w-full max-w-[130px] gap-1 text-[11px] border-emerald-300 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950"
    : "mt-2 w-full max-w-[130px] gap-1 text-[11px] border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950";
}

// ---------------- تب کشف خطا ----------------
function AnomalyTab({ data }: { data: InsightsData }) {
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="امتیاز سلامت داده‌ها" subtitle="نتایج ۱۰ کنترل خودکار کیفیت">
          <GaugeChart value={data.quality.score} max={100} label="کیفیت داده" color={data.quality.score >= 80 ? "#10b981" : data.quality.score >= 50 ? "#c99a5b" : "#a83a54"} />
        </SectionCard>
        <SectionCard title="کنترل‌های کیفیت داده" subtitle="موارد قرمز نیازمند اصلاح‌اند" className="lg:col-span-2" bodyClass="p-0">
          <div className="max-h-[340px] overflow-y-auto">
            <table className="soft-table w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 text-right font-semibold">کنترل</th>
                  <th className="px-4 py-2.5 text-right font-semibold">وضعیت</th>
                  <th className="px-4 py-2.5 text-right font-semibold">تعداد</th>
                  <th className="px-4 py-2.5 text-right font-semibold">راهنما</th>
                </tr>
              </thead>
              <tbody>
                {data.quality.checks.map((c) => (
                  <tr key={c.id} className="cursor-pointer border-b border-border/60 last:border-0" onClick={() => navigate(c.route)}>
                    <td className="px-4 py-2.5 text-xs font-medium">{c.name}</td>
                    <td className="px-4 py-2.5"><DotBadge label={c.ok ? "سالم" : "نیازمند بررسی"} ok={c.ok} /></td>
                    <td className="px-4 py-2.5 text-xs tabular-nums font-bold">{faNum(c.count)}</td>
                    <td className="px-4 py-2.5 text-[11px] text-muted-foreground">{c.hint}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="ناهنجاری‌های کشف‌شده در روند روزانه" subtitle="تشخیص جهش/سقوط با انحراف معیار (z-score) روی ۶۰ روز اخیر" bodyClass="p-5">
        {data.anomalies.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <p className="text-sm font-medium text-muted-foreground">ناهنجاری قابل توجهی در ۶۰ روز اخیر یافت نشد</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {data.anomalies.map((a) => (
              <div key={a.id} className={`rounded-xl border p-4 ${a.severity >= 3 ? TONE_STYLES.danger : TONE_STYLES.warning}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    <p className="text-xs font-extrabold">{a.title}</p>
                  </div>
                  <span className="text-[10.5px] font-bold opacity-75">{a.date}</span>
                </div>
                <p className="mt-2 text-[11.5px] leading-6 opacity-90">{a.detail}</p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </>
  );
}

// ---------------- تب پیشنهادی ----------------
function AdviceTab({ data }: { data: InsightsData }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {data.recommendations.map((r) => (
        <div key={r.id} className={`flex flex-col rounded-2xl border p-5 ${TONE_STYLES[r.tone] ?? TONE_STYLES.info}`}>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/70 dark:bg-black/20">
              <InsightIcon name={r.icon} className="h-4.5 w-4.5" />
            </span>
            <h3 className="text-sm font-extrabold">{r.title}</h3>
          </div>
          <p className="mt-3 flex-1 text-xs leading-6 opacity-90">{r.text}</p>
          {r.route && (
            <Button variant="outline" size="sm" className="mt-3 gap-1 self-start border-current/30 bg-white/60 text-xs hover:bg-white dark:bg-black/20 dark:hover:bg-black/30" onClick={() => navigate(r.route!)}>
              بررسی در سامانه
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------- اجزای کوچک ----------------
function RateTile({ label, value, icon, invert }: { label: string; value: number; icon: React.ReactNode; invert?: boolean }) {
  const ok = invert ? value <= 10 : value >= 50;
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-muted-foreground">{icon}<p className="text-[11px]">{label}</p></div>
      <p className={`mt-2 text-2xl font-black tabular-nums ${ok ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>{faNum(value)}٪</p>
      <Progress value={Math.min(value, 100)} className="mt-2 h-1" />
    </div>
  );
}

function TrendRow({ label, value, ref: refValue, pct }: { label: string; value: number; ref: number; pct: number }) {
  return (
    <div className="rounded-xl border bg-muted/40 p-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${pct >= 0 ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400" : "bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400"}`}>
          {pct >= 0 ? "▲" : "▼"} {faNum(Math.abs(pct))}٪
        </span>
      </div>
      <p className="mt-1 text-sm font-extrabold tabular-nums">
        {faNum(value)} <span className="text-[10px] font-normal text-muted-foreground">در برابر {faNum(refValue)}</span>
      </p>
    </div>
  );
}

// ---------------- تب نقشهٔ مراکز — اطلس عملکرد بر پایهٔ /api/atlas (نسخهٔ ۶.۱۲) ----------------
function BiMapTab() {
  const atlas = useQuery<{ items: any[]; totals: any }>(() => api("/api/atlas"), []);
  const [selectedProvince, setSelectedProvince] = React.useState<number | null>(null);

  if (atlas.loading && !atlas.data) {
    return <div className="flex items-center justify-center gap-2 rounded-2xl border bg-card py-16 text-xs text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> در حال بارگذاری نقشهٔ مراکز...
    </div>;
  }
  if (atlas.error || !atlas.data) {
    return <p className="rounded-2xl border border-dashed py-12 text-center text-xs text-muted-foreground">{atlas.error ?? "اطلاعات مراکز در دسترس نیست"}</p>;
  }

  const items = atlas.data.items as Array<{
    id: number; title: string; provinceId: number; provinceTitle: string; cityTitle: string; isEnabled: boolean;
    confirmedSessions: number; income: number; applicants: number; emsCount: number; lastActivity: string | null;
  }>;

  // تجمیع استانی — رنگ استان = شدت روند مشاوره (نسخهٔ ۶.۱۴)
  const provAgg = new Map<number, { provinceId: number; provinceTitle: string; count: number; sessions: number; income: number; applicants: number; ems: number }>();
  for (const c of items) {
    let p = provAgg.get(c.provinceId);
    if (!p) {
      p = { provinceId: c.provinceId, provinceTitle: c.provinceTitle, count: 0, sessions: 0, income: 0, applicants: 0, ems: 0 };
      provAgg.set(c.provinceId, p);
    }
    p.count++;
    p.sessions += c.confirmedSessions;
    p.income += c.income;
    p.applicants += c.applicants;
    p.ems += c.emsCount;
  }
  const provinces = [...provAgg.values()].sort((a, b) => b.sessions - a.sessions);
  const selProv = selectedProvince != null ? provAgg.get(selectedProvince) ?? null : null;
  const top = [...items].sort((a, b) => b.confirmedSessions - a.confirmedSessions || b.income - a.income).slice(0, 5);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <SectionCard title="روند مشاوره روی نقشهٔ ایران" subtitle="رنگ استان = شدت جلسات — پین = تعداد مراکز — کلیک برای جزئیات" className="lg:col-span-2">
        <IranMap
          regions={provinces.map((p) => ({ provinceId: p.provinceId, value: p.sessions, count: p.count }))}
          metricLabel="جلسات مشاوره"
          metricUnit="جلسه"
          selectedProvince={selectedProvince}
          onSelectProvince={(id) => setSelectedProvince(id == null ? null : Number(id))}
        />
      </SectionCard>
      <div className="space-y-4">
        {selProv ? (
          <SectionCard title={`استان ${selProv.provinceTitle}`} subtitle={`${faNum(selProv.count)} مرکز رز`}>
            <div className="grid grid-cols-2 gap-2 text-center">
              {[
                { label: "جلسات تاییدشده", value: faNum(selProv.sessions) },
                { label: "درآمد (ریال)", value: faMoney(selProv.income) },
                { label: "متقاضیان", value: faNum(selProv.applicants) },
                { label: "موارد حاد", value: faNum(selProv.ems) },
              ].map((k) => (
                <div key={k.label} className="rounded-xl border bg-muted/40 px-2 py-2.5">
                  <p className="text-sm font-black tabular-nums">{k.value}</p>
                  <p className="mt-0.5 text-[9.5px] text-muted-foreground">{k.label}</p>
                </div>
              ))}
            </div>
          </SectionCard>
        ) : null}
        <SectionCard title="برترین مراکز" subtitle="بر اساس جلسات تاییدشده">
          <ul className="space-y-2">
            {top.map((c, i) => (
              <li key={c.id}>
                <button
                  onClick={() => setSelectedProvince(c.provinceId)}
                  className="flex w-full items-center gap-2.5 rounded-xl border bg-muted/40 px-3 py-2 text-right transition-colors hover:bg-accent"
                >
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-black ${i === 0 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300" : "bg-muted text-muted-foreground"}`}>{faNum(i + 1)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px] font-bold">{c.title}</span>
                    <span className="block text-[9px] text-muted-foreground">{c.provinceTitle}</span>
                  </span>
                  <span className="text-[11px] font-black tabular-nums">{faNum(c.confirmedSessions)}</span>
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
