"use client";
// لاگ فعالیت کاربران
import * as React from "react";
import { PageHeader, FilterBar, DataTable, NameAvatar, StatCard, Column, LoadingView } from "@/components/shared";
import { faNum, jDateTime } from "@/lib/jalali";
import { api, useQuery } from "@/lib/client";
import { ScrollText, Search, Info, AlertTriangle, OctagonAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type LogRow = {
  id: number; category: string; description: string | null; level: number;
  ip: string | null; timestamp: string;
  user: { name: string; family: string; avatarColor: string | null } | null;
};

const LEVELS = [
  { value: 1, label: "اطلاعات", icon: Info, cls: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300" },
  { value: 2, label: "هشدار", icon: AlertTriangle, cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300" },
  { value: 3, label: "خطا", icon: OctagonAlert, cls: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300" },
];

export function LogsView() {
  const [q, setQ] = React.useState("");
  const [level, setLevel] = React.useState("");
  const [page, setPage] = React.useState(1);

  const { data, loading } = useQuery<{
    total: number; totalPages: number; logs: LogRow[];
    categories: string[]; levelAgg: { level: number; count: number }[];
  }>(() => api(`/api/logs?q=${encodeURIComponent(q)}&level=${level}&page=${page}`), [q, level, page]);

  const columns: Column<LogRow>[] = [
    {
      header: "کاربر",
      cell: (l) => (
        <div className="flex items-center gap-2.5">
          <NameAvatar name={l.user?.name ?? "سامانه"} family={l.user?.family} color={l.user?.avatarColor} size={30} />
          <p className="text-xs font-semibold">{l.user ? `${l.user.name} ${l.user.family}` : "سامانه"}</p>
        </div>
      ),
    },
    { header: "دسته", cell: (l) => <Badge variant="secondary" className="text-[10px] font-bold">{l.category}</Badge> },
    { header: "توضیح", cell: (l) => <span className="max-w-md truncate text-xs text-muted-foreground">{l.description ?? "—"}</span> },
    {
      header: "سطح",
      cell: (l) => {
        const lv = LEVELS.find((x) => x.value === l.level) ?? LEVELS[0];
        return <span className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-bold ${lv.cls}`}>{lv.label}</span>;
      },
    },
    { header: "IP", cell: (l) => <span className="text-[11px] tabular-nums text-muted-foreground" dir="ltr">{l.ip ?? "—"}</span> },
    { header: "زمان", cell: (l) => <span className="text-xs tabular-nums text-muted-foreground">{jDateTime(l.timestamp)}</span> },
  ];

  return (
    <div>
      <PageHeader title="لاگ فعالیت کاربران" subtitle={`${faNum(data?.total ?? 0)} رخداد ثبت‌شده`} icon={<ScrollText className="h-5 w-5" />} />

      <div className="mb-4 grid grid-cols-3 gap-4">
        {LEVELS.map((lv) => (
          <StatCard
            key={lv.value}
            title={`سطح ${lv.label}`}
            value={faNum(data?.levelAgg.find((a) => a.level === lv.value)?.count ?? 0)}
            icon={<lv.icon className="h-5 w-5" />}
            tone={lv.value === 1 ? "cyan" : lv.value === 2 ? "amber" : "rose"}
          />
        ))}
      </div>

      <FilterBar className="mb-4">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="جستجو در لاگ‌ها..." className="h-9 pr-9 text-sm" />
        </div>
        <Select value={level || "all"} onValueChange={(v) => { setLevel(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="h-9 w-36 text-sm"><SelectValue placeholder="همه سطوح" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه سطوح</SelectItem>
            {LEVELS.map((lv) => <SelectItem key={lv.value} value={String(lv.value)}>{lv.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </FilterBar>

      <div className="rounded-2xl border bg-card shadow-sm">
        <DataTable columns={columns} rows={data?.logs ?? []} loading={loading} page={data?.page} totalPages={data?.totalPages} onPageChange={setPage} />
      </div>
    </div>
  );
}
