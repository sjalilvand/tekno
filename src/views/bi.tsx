"use client";
// تحلیل مدیریتی BI
import * as React from "react";
import { PageHeader, SectionCard, LoadingView } from "@/components/shared";
import { BarChartX, DonutChart, GaugeChart, CHART_COLORS } from "@/components/charts";
import { faNum, faMoney } from "@/lib/jalali";
import { api, useQuery } from "@/lib/client";
import { BarChart3, TrendingUp, Siren, Target } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type BiData = {
  provinceStats: { name: string; value: number }[];
  serviceStats: { name: string; value: number }[];
  centerStats: { name: string; province: string; sessions: number; income: number; consultantFee: number }[];
  statusDist: { name: string; value: number }[];
  genderDist: { name: string; value: number }[];
  emsSev: { name: string; value: number }[];
  budgetStats: { title: string; amount: number; used: number; reserved: number; pct: number; provinces: { title: string; amount: number; used: number; pct: number }[] }[];
};

export function BiView() {
  const { data, loading, error } = useQuery<BiData>(() => api("/api/bi"), []);
  if (loading) return <LoadingView />;
  if (error || !data) return <div className="p-10 text-center text-sm text-rose-500">{error}</div>;

  const totalSessions = data.provinceStats.reduce((s, p) => s + p.value, 0);
  const topCenter = data.centerStats[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="تحلیل مدیریتی BI"
        subtitle="نمای کلی عملکرد خدمات در سطح کشور، استان‌ها و مراکز"
        icon={<BarChart3 className="h-5 w-5" />}
      />

      {/* گوس‌ها */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SectionCard bodyClass="p-3">
          <GaugeChart value={totalSessions} max={Math.max(totalSessions * 1.2, 1)} label="جلسات کشور (تایید نهایی)" />
        </SectionCard>
        <SectionCard bodyClass="p-3">
          <GaugeChart value={data.statusDist.find((s) => s.name === "تایید نهایی")?.value ?? 0} max={Math.max(...data.statusDist.map((s) => s.value), 1)} label="سهم جلسات مکتمل" color="#10b981" />
        </SectionCard>
        <SectionCard bodyClass="p-3">
          <GaugeChart value={data.budgetStats[0]?.pct ?? 0} max={100} label={`مصرف ${data.budgetStats[0]?.title ?? "سهمیه"}`} color="#f59e0b" />
        </SectionCard>
        <SectionCard bodyClass="p-3">
          <GaugeChart value={data.emsSev.find((s) => s.name === "بالا")?.value ?? 0} max={Math.max(...data.emsSev.map((s) => s.value), 1)} label="موارد حاد پرخطر" color="#f43f5e" />
        </SectionCard>
      </div>

      <Tabs defaultValue="provinces" dir="rtl">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="provinces" className="gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> استان‌ها</TabsTrigger>
          <TabsTrigger value="services">خدمات</TabsTrigger>
          <TabsTrigger value="centers">مراکز برتر</TabsTrigger>
          <TabsTrigger value="budgets" className="gap-1.5"><Target className="h-3.5 w-3.5" /> سهمیه‌ها</TabsTrigger>
          <TabsTrigger value="ems" className="gap-1.5"><Siren className="h-3.5 w-3.5" /> موارد حاد</TabsTrigger>
        </TabsList>

        <TabsContent value="provinces" className="mt-4 grid gap-4 lg:grid-cols-3">
          <SectionCard title="جلسات تاییدشده به تفکیک استان" subtitle="۱۲ استان پرکار" className="lg:col-span-2">
            <BarChartX data={data.provinceStats} xKey="name" bars={[{ key: "value", name: "جلسات" }]} height={340} layout="vertical" />
          </SectionCard>
          <SectionCard title="ترکیب جنسیتی کاربران" subtitle="کل سامانه">
            <DonutChart data={data.genderDist} height={340} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="services" className="mt-4">
          <SectionCard title="عملکرد خدمات" subtitle="۱۰ خدمت پرتقاضا بر اساس جلسات تاییدشده">
            <BarChartX data={data.serviceStats} xKey="name" bars={[{ key: "value", name: "جلسات" }]} height={360} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="centers" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <SectionCard title="مراکز پرکار" subtitle="بر اساس تعداد جلسات" className="lg:col-span-2">
              <BarChartX data={data.centerStats.map((c) => ({ name: c.name, value: c.sessions }))} xKey="name" bars={[{ key: "value", name: "جلسات" }]} height={340} layout="vertical" />
            </SectionCard>
            <SectionCard title="درآمد برترین مرکز" subtitle={topCenter?.name}>
              <div className="space-y-3 pt-2">
                <MiniStat label="جلسات تاییدشده" value={faNum(topCenter?.sessions ?? 0)} />
                <MiniStat label="درآمد کل (ریال)" value={faMoney(topCenter?.income ?? 0)} />
                <MiniStat label="حق‌الزحمه مشاوران" value={faMoney(topCenter?.consultantFee ?? 0)} />
                <MiniStat label="استان" value={topCenter?.province ?? "—"} />
              </div>
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="budgets" className="mt-4 space-y-4">
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
        </TabsContent>

        <TabsContent value="ems" className="mt-4 grid gap-4 lg:grid-cols-2">
          <SectionCard title="موارد حاد به تفکیک شدت" subtitle="کل موارد ثبت‌شده">
            <DonutChart data={data.emsSev.map((s) => ({ name: s.name === "بالا" ? "شدت بالا" : s.name === "متوسط" ? "شدت متوسط" : "شدت کم", value: s.value }))} height={300} />
          </SectionCard>
          <SectionCard title="توزیع وضعیت جلسات" subtitle="مقایسه زنجیره تایید">
            <DonutChart data={data.statusDist} height={300} />
          </SectionCard>
        </TabsContent>
      </Tabs>
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
