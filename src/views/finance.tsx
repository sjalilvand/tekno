"use client";
// عملکرد مالی
import * as React from "react";
import { PageHeader, SectionCard, StatCard, LoadingView } from "@/components/shared";
import { AreaChartX, BarChartX } from "@/components/charts";
import { faNum, faMoney } from "@/lib/jalali";
import { api, useQuery } from "@/lib/client";
import { Wallet, TrendingUp, Users, Building2, Crown, Receipt } from "lucide-react";

type FinanceData = {
  totals: {
    gross: number; consultantFees: number; supervisorFees: number; centerFees: number;
    adminFees: number; secretaryFees: number; events: number; emsPaid: number; emsCount: number;
  };
  series: { month: string; income: number; fee: number; center: number }[];
  centerIncome: { name: string; income: number; sessions: number }[];
  contractTotal: number;
};

export function FinanceView() {
  const { data, loading, error } = useQuery<FinanceData>(() => api("/api/finance"), []);
  if (loading) return <LoadingView />;
  if (error || !data) return <div className="p-10 text-center text-sm text-rose-500">{error}</div>;

  const t = data.totals;

  return (
    <div className="space-y-6">
      <PageHeader title="عملکرد مالی" subtitle="تراز درآمد و حق‌الزحمه‌های خدمات تاییدشده" icon={<Wallet className="h-5 w-5" />} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard title="گردش کل (ریال)" value={faMoney(t.gross)} icon={<TrendingUp className="h-5 w-5" />} tone="teal" hint={`${faNum(t.events)} جلسه تاییدشده`} />
        <StatCard title="حق‌الزحمه مشاوران" value={faMoney(t.consultantFees)} icon={<Users className="h-5 w-5" />} tone="cyan" />
        <StatCard title="سهم مراکز" value={faMoney(t.centerFees)} icon={<Building2 className="h-5 w-5" />} tone="emerald" />
        <StatCard title="کمک‌هزینه موارد حاد" value={faMoney(t.emsPaid)} icon={<Receipt className="h-5 w-5" />} tone="rose" hint={`${faNum(t.emsCount)} مورد پرداخت‌شده`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="روند مالی" subtitle="درآمد و حق‌الزحمه در ۱۱ ماه اخیر (ریال)" className="lg:col-span-2">
          <AreaChartX
            data={data.series} xKey="month" height={300}
            areas={[
              { key: "income", name: "درآمد کل" },
              { key: "fee", name: "حق مشاوران" },
              { key: "center", name: "سهم مراکز" },
            ]}
          />
        </SectionCard>

        <SectionCard title="تفکیک درآمد" subtitle="سهم هر بخش از گردش مالی">
          <ul className="mt-2 space-y-3.5">
            {[
              { label: "حق‌الزحمه مشاوران", value: t.consultantFees, color: "bg-teal-500" },
              { label: "حق نظارت حرفه‌ای", value: t.supervisorFees, color: "bg-cyan-500" },
              { label: "سهم مراکز", value: t.centerFees, color: "bg-emerald-500" },
              { label: "سهم مدیریت", value: t.adminFees, color: "bg-amber-500" },
              { label: "حق دبیرخانه", value: t.secretaryFees, color: "bg-rose-500" },
            ].map((item) => {
              const pct = t.gross ? Math.round((item.value / t.gross) * 100) : 0;
              return (
                <li key={item.label}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${item.color}`} /> {item.label}</span>
                    <span className="font-bold tabular-nums">{faMoney(item.value)} <span className="text-muted-foreground">({faNum(pct)}٪)</span></span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full ${item.color}`} style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </SectionCard>
      </div>

      <SectionCard title="درآمد مراکز برتر" subtitle="بر اساس گردش مالی جلسات تاییدشده (ریال)">
        <BarChartX
          data={data.centerIncome.map((c) => ({ name: c.name, value: c.income }))}
          xKey="name" bars={[{ key: "value", name: "درآمد" }]} height={320} layout="vertical"
        />
      </SectionCard>
    </div>
  );
}
