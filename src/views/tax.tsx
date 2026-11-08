"use client";
// مالیات مشاوران
import * as React from "react";
import { PageHeader, FilterBar, DataTable, NameAvatar, StatCard, Column, LoadingView } from "@/components/shared";
import { faNum, faMoney, faDigits } from "@/lib/jalali";
import { api, useQuery } from "@/lib/client";
import { Receipt, Search, Percent } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type TaxRow = {
  id: number; nid: number; year: number; month: number; taxAmount: number;
  exemptionMonths: number; multiEmployerMonth: number; totalPayment: number;
  user: { name: string; family: string; avatarColor: string | null } | null;
};

const MONTHS_FA = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];

export function TaxView() {
  const [q, setQ] = React.useState("");
  const [year, setYear] = React.useState("");
  const [page, setPage] = React.useState(1);

  const { data, loading } = useQuery<{
    total: number; totalPages: number; taxes: TaxRow[]; years: number[];
    sums: { taxAmount: number; totalPayment: number };
  }>(() => api(`/api/tax?q=${encodeURIComponent(q)}&year=${year}&page=${page}`), [q, year, page]);

  const columns: Column<TaxRow>[] = [
    {
      header: "مشاور",
      cell: (t) => (
        <div className="flex items-center gap-2.5">
          <NameAvatar name={t.user?.name ?? "؟"} family={t.user?.family} color={t.user?.avatarColor} size={32} />
          <div>
            <p className="text-[13px] font-semibold leading-5">{t.user ? `${t.user.name} ${t.user.family}` : "—"}</p>
            <p className="text-[10.5px] tabular-nums text-muted-foreground leading-4">{faDigits(t.nid)}</p>
          </div>
        </div>
      ),
    },
    { header: "دوره", cell: (t) => <span className="text-xs font-bold">{faNum(t.year)} — {MONTHS_FA[t.month - 1] ?? faNum(t.month)}</span> },
    { header: "حق‌الزحمه (ریال)", cell: (t) => <span className="text-xs tabular-nums">{faNum(t.totalPayment)}</span> },
    { header: "مالیات (ریال)", cell: (t) => <span className="text-xs font-bold tabular-nums text-rose-600 dark:text-rose-400">{faNum(t.taxAmount)}</span> },
    { header: "معافیت (ماه)", cell: (t) => <span className="text-xs tabular-nums">{faNum(t.exemptionMonths)}</span> },
    { header: "چند کارفرما", cell: (t) => <span className="text-xs tabular-nums text-muted-foreground">{t.multiEmployerMonth ? `${faNum(t.multiEmployerMonth)}/${faNum(t.multiEmployerYear)}` : "—"}</span> },
    {
      header: "نرخ مؤثر",
      cell: (t) => {
        const rate = t.totalPayment ? Math.round((t.taxAmount / t.totalPayment) * 100) : 0;
        return <span className="text-xs font-bold tabular-nums">{faNum(rate)}٪</span>;
      },
    },
  ];

  return (
    <div>
      <PageHeader title="مالیات مشاوران" subtitle="محاسبه و پایش مالیات ماهانه مشاوران" icon={<Receipt className="h-5 w-5" />} />

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard title="کل حق‌الزحمه (ریال)" value={faMoney(data?.sums.totalPayment ?? 0)} icon={<Receipt className="h-5 w-5" />} tone="teal" />
        <StatCard title="کل مالیات (ریال)" value={faMoney(data?.sums.taxAmount ?? 0)} icon={<Percent className="h-5 w-5" />} tone="rose" />
        <StatCard title="رکوردها" value={faNum(data?.total ?? 0)} icon={<Receipt className="h-5 w-5" />} tone="slate" />
      </div>

      <FilterBar className="mb-4">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="جستجوی نام یا کد ملی..." className="h-9 pr-9 text-sm" />
        </div>
        <Select value={year || "all"} onValueChange={(v) => { setYear(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="h-9 w-32 text-sm"><SelectValue placeholder="همه سال‌ها" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه سال‌ها</SelectItem>
            {data?.years.map((y) => <SelectItem key={y} value={String(y)}>{faNum(y)}</SelectItem>)}
          </SelectContent>
        </Select>
      </FilterBar>

      <div className="rounded-2xl border bg-card shadow-sm">
        <DataTable columns={columns} rows={data?.taxes ?? []} loading={loading} page={data?.page} totalPages={data?.totalPages} onPageChange={setPage} />
      </div>
    </div>
  );
}
