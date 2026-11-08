"use client";
// داشبوردهای مدیریتی — توصیفی / تحلیلی / تفسیری / کشف خطا / پیشنهادی
import * as React from "react";
import { PageHeader, SectionCard, LoadingView, DataTable, DotBadge } from "@/components/shared";
import { BarChartX, DonutChart, GaugeChart, AreaChartX, CHART_COLORS } from "@/components/charts";
import { faNum, faMoney, jDateTime } from "@/lib/jalali";
import { api, useQuery, navigate } from "@/lib/client";
import {
  BarChart3, TrendingUp, Siren, Target, FileText, LineChart, Lightbulb, Sparkles,
  Building2, CalendarClock, UserRoundCheck, CalendarCheck, ShieldCheck, Scale, Clock,
  MessageSquareText, CalendarX, Users, TrendingDown, HeartHandshake, CheckCircle2,
  AlertTriangle, Activity, RefreshCw, Printer, ShieldAlert,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

// ---------------- انواع ----------------
type BiData = {
  provinceStats: { name: string; value: number }[];
  serviceStats: { name: string; value: number }[];
  centerStats: { name: string; province: string; sessions: number; income: number; consultantFee: number }[];
  statusDist: { name: string; value: number }[];
  genderDist: { name: string; value: number }[];
  emsSev: { name: string; value: number }[];
  budgetStats: { title: string; amount: number; used: number; reserved: number; pct: number; provinces: { title: string; amount: number; used: number; pct: number }[] }[];
};

type InsightsData = {
  generatedAt: string;
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
};

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  TrendingUp, TrendingDown, Sparkles, Building2, CalendarClock, UserRoundCheck, CalendarCheck,
  ShieldCheck, Scale, Clock, MessageSquareText, CalendarX, Users, HeartHandshake, CheckCircle2,
  ShieldAlert, Lightbulb,
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

// ============================================================
export function BiView() {
  const bi = useQuery<BiData>(() => api("/api/bi"), []);
  const ins = useQuery<InsightsData>(() => api("/api/bi/insights"), []);

  if (bi.loading || ins.loading) return <LoadingView label="در حال محاسبهٔ داشبوردهای مدیریتی..." />;
  if (!bi.data && !ins.data)
    return (
      <div className="p-10 text-center">
        <p className="text-sm text-rose-500">{bi.error ?? ins.error ?? "خطا در بارگذاری داده‌ها"}</p>
        <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => { bi.refetch(); ins.refetch(); }}>
          <RefreshCw className="h-3.5 w-3.5" /> تلاش دوباره
        </Button>
      </div>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="داشبوردهای مدیریتی"
        subtitle={`توصیفی، تحلیلی، تفسیری، کشف خطا و پیشنهادی — آخرین محاسبه: ${ins.data ? jDateTime(ins.data.generatedAt) : "—"}`}
        icon={<BarChart3 className="h-5 w-5" />}
        actions={
          <Button variant="outline" size="sm" className="gap-1.5 no-print" onClick={() => { bi.refetch(); ins.refetch(); }}>
            <RefreshCw className="h-3.5 w-3.5" /> به‌روزرسانی
          </Button>
        }
      />

      {/* نوار KPI سراسری */}
      {ins.data && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6 no-print">
          <Kpi title="جلسات ۱۲ ماه" value={faNum(ins.data.kpis.events365)} icon={<CalendarCheck className="h-4 w-4" />} />
          <Kpi title="تایید نهایی" value={faNum(ins.data.kpis.confirmed365)} icon={<CheckCircle2 className="h-4 w-4" />} tone="emerald" />
          <Kpi title="در انتظار" value={faNum(ins.data.kpis.pending)} icon={<Clock className="h-4 w-4" />} tone="amber" />
          <Kpi title="درآمد ثبت‌شده" value={faMoney(ins.data.kpis.income365) + " ریال"} icon={<TrendingUp className="h-4 w-4" />} tone="rose" />
          <Kpi title="مشاوران فعال" value={faNum(ins.data.kpis.consultants)} icon={<UserRoundCheck className="h-4 w-4" />} tone="violet" />
          <Kpi title="سلامت داده" value={`${faNum(ins.data.quality.score)}٪`} icon={<ShieldCheck className="h-4 w-4" />} tone={ins.data.quality.score >= 80 ? "emerald" : ins.data.quality.score >= 50 ? "amber" : "rose"} />
        </div>
      )}

      <Tabs defaultValue="descriptive" dir="rtl">
        <TabsList className="h-auto flex-wrap no-print">
          <TabsTrigger value="descriptive" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> توصیفی</TabsTrigger>
          <TabsTrigger value="analytic" className="gap-1.5"><LineChart className="h-3.5 w-3.5" /> تحلیلی</TabsTrigger>
          <TabsTrigger value="interpret" className="gap-1.5"><Lightbulb className="h-3.5 w-3.5" /> تفسیری</TabsTrigger>
          <TabsTrigger value="anomaly" className="gap-1.5"><ShieldAlert className="h-3.5 w-3.5" /> کشف خطا</TabsTrigger>
          <TabsTrigger value="advice" className="gap-1.5"><Sparkles className="h-3.5 w-3.5" /> پیشنهادی</TabsTrigger>
        </TabsList>

        {/* ---------------- توصیفی ---------------- */}
        <TabsContent value="descriptive" className="mt-4 space-y-4">
          {bi.data ? <DescriptiveTab data={bi.data} /> : <p className="p-6 text-center text-xs text-muted-foreground">دادهٔ توصیفی در دسترس نیست</p>}
        </TabsContent>

        {/* ---------------- تحلیلی ---------------- */}
        <TabsContent value="analytic" className="mt-4 space-y-4">
          {ins.data ? <AnalyticTab data={ins.data} /> : null}
        </TabsContent>

        {/* ---------------- تفسیری ---------------- */}
        <TabsContent value="interpret" className="mt-4">
          {ins.data ? <InterpretTab data={ins.data} /> : null}
        </TabsContent>

        {/* ---------------- کشف خطا ---------------- */}
        <TabsContent value="anomaly" className="mt-4 space-y-4">
          {ins.data ? <AnomalyTab data={ins.data} /> : null}
        </TabsContent>

        {/* ---------------- پیشنهادی ---------------- */}
        <TabsContent value="advice" className="mt-4">
          {ins.data ? <AdviceTab data={ins.data} /> : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------- تب توصیفی ----------------
function DescriptiveTab({ data }: { data: BiData }) {
  const totalSessions = data.provinceStats.reduce((s, p) => s + p.value, 0);
  const topCenter = data.centerStats[0];
  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SectionCard bodyClass="p-3">
          <GaugeChart value={totalSessions} max={Math.max(totalSessions * 1.2, 1)} label="جلسات کشور (تایید نهایی)" />
        </SectionCard>
        <SectionCard bodyClass="p-3">
          <GaugeChart value={data.statusDist.find((s) => s.name === "تایید نهایی")?.value ?? 0} max={Math.max(...data.statusDist.map((s) => s.value), 1)} label="سهم جلسات مکتمل" color="#10b981" />
        </SectionCard>
        <SectionCard bodyClass="p-3">
          <GaugeChart value={data.budgetStats[0]?.pct ?? 0} max={100} label={`مصرف ${data.budgetStats[0]?.title ?? "سهمیه"}`} color="#c99a5b" />
        </SectionCard>
        <SectionCard bodyClass="p-3">
          <GaugeChart value={data.emsSev.find((s) => s.name === "بالا")?.value ?? 0} max={Math.max(...data.emsSev.map((s) => s.value), 1)} label="موارد حاد پرخطر" color="#a83a54" />
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="جلسات تاییدشده به تفکیک استان" subtitle="۱۲ استان پرکار" className="lg:col-span-2">
          <BarChartX data={data.provinceStats} xKey="name" bars={[{ key: "value", name: "جلسات" }]} height={340} layout="vertical" />
        </SectionCard>
        <SectionCard title="ترکیب جنسیتی کاربران" subtitle="کل سامانه">
          <DonutChart data={data.genderDist} height={340} />
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="عملکرد خدمات" subtitle="۱۰ خدمت پرتقاضا بر اساس جلسات تاییدشده">
          <BarChartX data={data.serviceStats} xKey="name" bars={[{ key: "value", name: "جلسات" }]} height={360} />
        </SectionCard>
        <SectionCard title="مراکز پرکار" subtitle="بر اساس تعداد جلسات">
          <BarChartX data={data.centerStats.map((c) => ({ name: c.name, value: c.sessions }))} xKey="name" bars={[{ key: "value", name: "جلسات" }]} height={360} layout="vertical" />
        </SectionCard>
      </div>

      {topCenter && (
        <SectionCard title="نشانهٔ مرکز برتر" subtitle={topCenter.name}>
          <div className="grid gap-3 sm:grid-cols-4">
            <MiniStat label="جلسات تاییدشده" value={faNum(topCenter.sessions)} />
            <MiniStat label="درآمد کل (ریال)" value={faMoney(topCenter.income)} />
            <MiniStat label="حق‌الزحمه مشاوران" value={faMoney(topCenter.consultantFee)} />
            <MiniStat label="استان" value={topCenter.province || "—"} />
          </div>
        </SectionCard>
      )}

      {data.budgetStats.length > 0 && (
        <div className="space-y-4">
          {data.budgetStats.map((b) => (
            <SectionCard key={b.title} title={b.title} subtitle={`سقف: ${faNum(b.amount)} — مصرف: ${faNum(b.used)} — رزرو: ${faNum(b.reserved)}`}>
              <Progress value={b.pct} className="h-2.5" />
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
                {b.provinces.map((p) => (
                  <div key={p.title} className="rounded-lg border bg-muted/40 p-2.5">
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <span className="truncate">{p.title}</span>
                      <span className="tabular-nums">{faNum(p.pct)}٪</span>
                    </div>
                    <Progress value={p.pct} className="mt-1.5 h-1" />
                  </div>
                ))}
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </>
  );
}

// ---------------- تب تحلیلی ----------------
function AnalyticTab({ data }: { data: InsightsData }) {
  const weekdayPeak = [...data.weekday].sort((a, b) => b.count - a.count)[0];
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="روند ماهانهٔ جلسات و درآمد" subtitle="۱۲ ماه اخیر — جلسات تاییدشده" className="lg:col-span-2">
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
                <p className="text-[11px] text-muted-foreground">نرخ تبدیل رزرو به جلسه</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <Progress value={data.conversion.pct} className="h-2 flex-1" />
                  <span className="text-xs font-extrabold tabular-nums">{faNum(data.conversion.pct)}٪</span>
                </div>
                <p className="mt-1.5 text-[10.5px] text-muted-foreground">{faNum(data.conversion.confirmed)} جلسهٔ قطعی از {faNum(data.conversion.reserves)} رزرو</p>
              </div>
              <div className="rounded-xl border bg-muted/40 p-3">
                <p className="text-[11px] text-muted-foreground">بازگشت مراجعان (Retation)</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <Progress value={data.repeat.repeatRate} className="h-2 flex-1" />
                  <span className="text-xs font-extrabold tabular-nums">{faNum(data.repeat.repeatRate)}٪</span>
                </div>
                <p className="mt-1.5 text-[10.5px] text-muted-foreground">{faNum(data.repeat.repeatClients)} مراجع تکراری — {faNum(data.repeat.newClients)} مراجع جدید</p>
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
        <SectionCard title="درآمد خدمات برتر" subtitle="جمع تعرفهٔ ثبت‌شده در ۱۲ ماه">
          <BarChartX data={data.serviceStats.map((s) => ({ name: s.name, value: s.income }))} xKey="name" bars={[{ key: "value", name: "درآمد (ریال)" }]} height={320} layout="vertical" />
        </SectionCard>
        <SectionCard title="پرکارترین مشاوران" subtitle="بر اساس جلسات تاییدشده ۱۲ ماه اخیر" bodyClass="p-0">
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

// ---------------- تب تفسیری ----------------
function InterpretTab({ data }: { data: InsightsData }) {
  return (
    <div className="space-y-4">
      <SectionCard title="خلاصهٔ اجرایی" subtitle="جمع‌بندی خودکار وضعیت مرکز بر اساس داده‌های ۱۲ ماه اخیر">
        <p className="text-[13.5px] leading-8 text-foreground/90">
          {data.insights
            .filter((i) => ["trend", "service-share", "repeat", "quality"].includes(i.id))
            .map((i) => i.text)
            .join(" ")}
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
function Kpi({ title, value, icon, tone = "rose" }: { title: string; value: string; icon: React.ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    rose: "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
    violet: "bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
  };
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tones[tone] ?? tones.rose}`}>{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-[11px] text-muted-foreground">{title}</p>
        <p className="text-sm font-extrabold tabular-nums">{value}</p>
      </div>
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border bg-muted/40 px-4 py-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-extrabold tabular-nums">{value}</span>
    </div>
  );
}
