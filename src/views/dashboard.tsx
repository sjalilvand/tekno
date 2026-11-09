"use client";
// داشبورد اصلی — نسخهٔ ۶.۲: شاخص‌های کلیدی با تفسیر + امتیاز سلامت داده
import * as React from "react";
import { PageHeader, StatCard, SectionCard, StatusBadge, NameAvatar, DateCell, LoadingView, DataTable } from "@/components/shared";
import { AreaChartX, DonutChart, GaugeChart, CHART_COLORS } from "@/components/charts";
import { faNum, jLong, jTime } from "@/lib/jalali";
import { api, useQuery, navigate } from "@/lib/client";
import {
  CalendarCheck, Users, Building2, ArrowLeftRight, Siren, ClipboardCheck,
  Clock, UserRoundCheck, TrendingUp, CalendarClock, ChevronLeft, FileBarChart2,
  ShieldCheck, Info, Sparkles,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type DashboardData = {
  kpis: {
    totalEvents: { value: number; trend: number };
    confirmedEvents: number; pendingEvents: number; rejectedEvents: number; undoneEvents: number;
    totalUsers: number; totalCenters: number; totalConsultants: number;
    pendingReferrals: number; openEms: number;
  };
  health: { score: number; computedAt: string; checks: { id: string; name: string; ok: boolean; count: number; hint: string; route: string; severity: string }[] };
  kpiCards: { key: string; label: string; value: number; tone: string; title: string; text: string }[];
  budgets: { id: number; title: string; amount: number; used: number; remained: number; pct: number }[];
  serviceDist: { name: string; value: number }[];
  statusDist: { name: string; value: number }[];
  monthlySeries: { month: string; value: number }[];
  recentEvents: RecentEvent[];
  upcomingReserves: UpcomingReserve[];
};

type RecentEvent = {
  id: number; trackingCode: number; startDate: string; status: string; topic: string | null;
  user: { name: string; family: string; avatarColor: string | null };
  service: { short: string };
  center: { cityTitle: string };
};

type UpcomingReserve = {
  id: number; date: string;
  event: { id: number; trackingCode: number | null; user: { name: string; family: string } };
};

export function DashboardView() {
  const { data, loading, error } = useQuery<DashboardData>(() => api("/api/dashboard"), []);
  const [kpiDialog, setKpiDialog] = React.useState<{ title: string; text: string } | null>(null);

  if (loading) return <LoadingView />;
  if (error || !data)
    return (
      <div className="flex flex-col items-center gap-3 p-10 text-center">
        <p className="text-sm text-rose-500">{error ?? "خطا در بارگذاری داده‌ها"}</p>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.location.reload()}>
          تلاش دوباره
        </Button>
      </div>
    );

  const k = data.kpis;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "صبح بخیر" : hour < 18 ? "ظهر بخیر" : "شب بخیر";

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting}، ${"مدیر عزیز"} 👋`}
        subtitle={jLong(new Date())}
      />

      {/* کارت‌های کلیدی */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard title="کل جلسات" value={faNum(k.totalEvents.value)} icon={<CalendarCheck className="h-5 w-5" />} tone="teal" trend={k.totalEvents.trend} hint="۳۰ روز اخیر" />
        <StatCard title="تایید نهایی" value={faNum(k.confirmedEvents)} icon={<ClipboardCheck className="h-5 w-5" />} tone="emerald" hint="جلسات مکتمل" />
        <StatCard title="در انتظار تایید" value={faNum(k.pendingEvents)} icon={<Clock className="h-5 w-5" />} tone="amber" hint="در زنجیره تایید" />
        <StatCard title="کاربران" value={faNum(k.totalUsers)} icon={<Users className="h-5 w-5" />} tone="cyan" hint={`${faNum(k.totalConsultants)} مشاور فعال`} />
        <StatCard title="مراکز فعال" value={faNum(k.totalCenters)} icon={<Building2 className="h-5 w-5" />} tone="slate" hint="سراسر کشور" />
        <StatCard title="موارد حاد باز" value={faNum(k.openEms)} icon={<Siren className="h-5 w-5" />} tone="rose" hint="نیازمند بررسی" />
      </div>

      {/* شاخص‌های کلیدی با تفسیر + سلامت داده (۶.۲) */}
      {data.kpiCards?.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <SectionCard title="شاخص‌های کلیدی" subtitle="روی هر شاخص بزنید تا تفسیر خودکار نمایش داده شود">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {data.kpiCards.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setKpiDialog({ title: c.title, text: c.text })}
                  className="group rounded-xl border bg-muted/30 p-3.5 text-right transition-all hover:-translate-y-0.5 hover:border-ring hover:shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-muted-foreground">{c.label}</span>
                    <Info className="h-3.5 w-3.5 text-muted-foreground/50 transition-colors group-hover:text-primary" />
                  </div>
                  <p className="mt-1.5 text-xl font-extrabold tabular-nums">
                    <span className={c.value === 0 ? "text-muted-foreground" : c.tone === "rose" ? "text-rose-600" : c.tone === "amber" ? "text-amber-600" : c.tone === "emerald" ? "text-emerald-600" : "text-foreground"}>
                      {faNum(String(c.value))}٪
                    </span>
                  </p>
                </button>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="امتیاز سلامت داده" subtitle={`${faNum(data.health?.checks?.filter((c) => c.ok).length ?? 0)} از ${faNum(data.health?.checks?.length ?? 0)} بررسی سالم`}>
            <div className="flex flex-col items-center">
              <GaugeChart value={data.health?.score ?? 0} label={`${faNum(String(data.health?.score ?? 0))} از ۱۰۰`} color={(data.health?.score ?? 0) >= 80 ? "#0d9488" : (data.health?.score ?? 0) >= 50 ? "#d97706" : "#dc2626"} />
              <div className="mt-3 w-full space-y-1.5">
                {(data.health?.checks ?? []).filter((c) => !c.ok).slice(0, 4).map((c) => (
                  <button key={c.id} onClick={() => navigate(c.route)} className="flex w-full items-center justify-between rounded-lg bg-rose-50 px-3 py-1.5 text-[10.5px] transition-colors hover:bg-rose-100 dark:bg-rose-950/40">
                    <span className="font-semibold text-rose-700 dark:text-rose-300">{c.name}</span>
                    <span className="font-bold tabular-nums text-rose-600">{faNum(c.count)}</span>
                  </button>
                ))}
                {(data.health?.checks ?? []).every((c) => c.ok) && data.health?.checks?.length ? (
                  <p className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-50 py-2 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <ShieldCheck className="h-4 w-4" /> همهٔ بررسی‌های کیفیت داده سالم هستند
                  </p>
                ) : null}
                <button onClick={() => navigate("bi")} className="flex w-full items-center justify-center gap-1 pt-1 text-[10.5px] font-bold text-primary">
                  خطایابی کامل و پنل پیشنهادی <ChevronLeft className="h-3 w-3" />
                </button>
              </div>
            </div>
          </SectionCard>
        </div>
      )}

      {/* نمودار روند + توزیع خدمت */}
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="روند جلسات تاییدشده" subtitle="۱۱ ماه اخیر" className="lg:col-span-2">
          <AreaChartX data={data.monthlySeries} xKey="month" areas={[{ key: "value", name: "جلسات" }]} height={270} />
        </SectionCard>
        <SectionCard title="توزیع خدمات" subtitle="سهم هر خدمت از جلسات تاییدشده">
          <DonutChart data={data.serviceDist} height={270} />
        </SectionCard>
      </div>

      {/* وضعیت جلسات + سهمیه‌ها */}
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="وضعیت زنجیره تایید" subtitle="بر اساس وضعیت فعلی جلسات">
          <ul className="space-y-3.5 mt-2">
            {data.statusDist
              .sort((a, b) => b.value - a.value)
              .map((s, i) => {
                const max = Math.max(...data.statusDist.map((x) => x.value));
                return (
                  <li key={s.name}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <StatusBadge status={s.name} />
                      <span className="font-bold tabular-nums">{faNum(s.value)}</span>
                    </div>
                    <Progress value={(s.value / max) * 100} className="h-1.5" />
                  </li>
                );
              })}
          </ul>
        </SectionCard>

        <SectionCard title="مصرف سهمیه‌ها" subtitle="بودجه‌های فعال جاری" className="lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.budgets.map((b) => (
              <div key={b.id} className="rounded-xl border bg-muted/40 p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-bold leading-5">{b.title}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${b.pct > 80 ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400" : b.pct > 50 ? "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"}`}>
                    {faNum(b.pct)}٪
                  </span>
                </div>
                <Progress value={b.pct} className="mt-2.5 h-2" />
                <div className="mt-2 flex justify-between text-[10.5px] text-muted-foreground">
                  <span>مصرف: <b className="tabular-nums">{faNum(b.used)}</b></span>
                  <span>مانده: <b className="tabular-nums">{faNum(b.remained)}</b></span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* آخرین جلسات + رزروهای پیش‌رو */}
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard
          title="آخرین جلسات ثبت‌شده"
          className="lg:col-span-2"
          bodyClass="p-0"
          actions={<Button variant="ghost" size="sm" className="gap-1 text-xs text-primary" onClick={() => navigate("events")}>همه جلسات <ChevronLeft className="h-3.5 w-3.5" /></Button>}
        >
          <DataTable
            columns={[
              {
                header: "مراجع",
                cell: (row: RecentEvent) => (
                  <div className="flex items-center gap-2.5">
                    <NameAvatar name={row.user.name} family={row.user.family} color={row.user.avatarColor} size={32} />
                    <div>
                      <p className="text-[13px] font-semibold leading-4">{row.user?.name ?? "—"} {row.user?.family ?? ""}</p>
                      <p className="text-[10.5px] text-muted-foreground leading-4">{row.service?.short ?? "سایر"} — {row.center?.cityTitle ?? "—"}</p>
                    </div>
                  </div>
                ),
              },
              { header: "موضوع", cell: (row: RecentEvent) => <span className="text-xs">{row.topic ?? "—"}</span> },
              { header: "تاریخ", cell: (row: RecentEvent) => <DateCell value={row.startDate} /> },
              { header: "ساعت", cell: (row: RecentEvent) => <span className="text-xs tabular-nums text-muted-foreground">{jTime(row.startDate)}</span> },
              { header: "وضعیت", cell: (row: RecentEvent) => <StatusBadge status={row.status} /> },
            ]}
            rows={data.recentEvents}
            onRowClick={() => navigate("events")}
          />
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="رزروهای پیش‌رو" subtitle="نزدیک‌ترین وقت‌های رزروشده" bodyClass="p-0">
            <ul className="divide-y">
              {data.upcomingReserves.length === 0 && (
                <li className="p-6 text-center text-xs text-muted-foreground">رزروی در آینده ثبت نشده است</li>
              )}
              {data.upcomingReserves.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                    <CalendarClock className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{r.event?.user?.name ?? "—"} {r.event?.user?.family ?? ""}</p>
                    <p className="text-[10.5px] text-muted-foreground">کد رهگیری {faNum(r.event?.trackingCode ?? "—")}</p>
                  </div>
                  <div className="text-left">
                    <DateCell value={r.date} />
                    <p className="text-[10.5px] tabular-nums text-muted-foreground">{jTime(r.date)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="دسترسی سریع">
            <div className="grid grid-cols-2 gap-2.5">
              <QuickBtn icon={<ArrowLeftRight className="h-4 w-4" />} label="ارجاعات در انتظار" count={k.pendingReferrals} onClick={() => navigate("referrals")} />
              <QuickBtn icon={<Siren className="h-4 w-4" />} label="موارد حاد" count={k.openEms} onClick={() => navigate("ems")} />
              <QuickBtn icon={<Clock className="h-4 w-4" />} label="جلسات ناتمام" count={k.undoneEvents} onClick={() => navigate("events")} />
              <QuickBtn icon={<TrendingUp className="h-4 w-4" />} label="داشبوردهای مدیریتی" onClick={() => navigate("bi")} />
              <QuickBtn icon={<FileBarChart2 className="h-4 w-4" />} label="گزارش‌ساز" onClick={() => navigate("reports")} />
              <QuickBtn icon={<Sparkles className="h-4 w-4" />} label="دستیار هوشمند" onClick={() => window.dispatchEvent(new CustomEvent("rz-open-chat"))} />
            </div>
          </SectionCard>
        </div>
      </div>

      {/* دیالوگ تفسیر شاخص */}
      <Dialog open={kpiDialog !== null} onOpenChange={(o) => !o && setKpiDialog(null)}>
        <DialogContent className="max-w-md p-6" dir="rtl">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-right"><Info className="h-5 w-5 text-primary" /> {kpiDialog?.title}</DialogTitle></DialogHeader>
          <p className="text-[13px] leading-7 text-muted-foreground">{kpiDialog?.text}</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QuickBtn({ icon, label, count, onClick }: { icon: React.ReactNode; label: string; count?: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group flex items-center gap-2.5 rounded-xl border bg-card p-3 text-right transition-all hover:-translate-y-0.5 hover:border-ring hover:shadow-sm">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-transform group-hover:scale-110">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-semibold">{label}</span>
        {count !== undefined && <span className="block text-[10px] tabular-nums text-muted-foreground">{faNum(count)} مورد</span>}
      </span>
    </button>
  );
}
