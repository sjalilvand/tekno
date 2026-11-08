"use client";
// رزرو مشاوره
import * as React from "react";
import { PageHeader, DataTable, StatusBadge, NameAvatar, Column, LoadingView, SectionCard } from "@/components/shared";
import { faNum, jDate, jTime } from "@/lib/jalali";
import { api, useQuery } from "@/lib/client";
import { CalendarClock, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type ReserveRow = {
  id: number; date: string;
  event: { id: number; trackingCode: number | null; status: string; topic: string | null; user: { name: string; family: string; avatarColor: string | null }; service: { short: string } };
};

type ByConsultant = { id: number; name: string; family: string; avatarColor: string | null; count: number };

export function ReservesView() {
  const [q, setQ] = React.useState("");
  const { data, loading } = useQuery<{ total: number; totalPages: number; reserves: ReserveRow[]; byConsultant: ByConsultant[] }>(
    () => api(`/api/reserves?q=${encodeURIComponent(q)}&page=1&pageSize=50`), [q]
  );

  const columns: Column<ReserveRow>[] = [
    {
      header: "مراجع",
      cell: (r) => (
        <div className="flex items-center gap-2.5">
          <NameAvatar name={r.event.user.name} family={r.event.user.family} color={r.event.user.avatarColor} size={32} />
          <p className="text-[13px] font-semibold">{r.event.user.name} {r.event.user.family}</p>
        </div>
      ),
    },
    { header: "خدمت", cell: (r) => <Badge variant="secondary" className="text-[10.5px] font-semibold">{r.event.service.short}</Badge> },
    { header: "موضوع", cell: (r) => <span className="text-xs">{r.event.topic ?? "—"}</span> },
    { header: "کد رهگیری", cell: (r) => <span className="text-xs font-bold tabular-nums text-primary">{faNum(r.event.trackingCode ?? 0)}</span> },
    {
      header: "زمان رزرو",
      cell: (r) => (
        <div className="text-xs">
          <span className="tabular-nums">{jDate(r.date)}</span>
          <span className="mr-2 tabular-nums text-muted-foreground">ساعت {jTime(r.date)}</span>
        </div>
      ),
    },
    { header: "وضعیت جلسه", cell: (r) => <StatusBadge status={r.event.status} /> },
  ];

  return (
    <div>
      <PageHeader title="رزرو مشاوره" subtitle={`${faNum(data?.total ?? 0)} رزرو ثبت‌شده`} icon={<CalendarClock className="h-5 w-5" />} />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {data?.byConsultant.slice(0, 4).map((c) => (
          <SectionCard key={c.id} bodyClass="p-4">
            <div className="flex items-center gap-2.5">
              <NameAvatar name={c.name} family={c.family} color={c.avatarColor} size={38} />
              <div className="min-w-0">
                <p className="truncate text-xs font-bold">{c.name} {c.family}</p>
                <p className="text-[10.5px] tabular-nums text-muted-foreground">{faNum(c.count)} رزرو فعال</p>
              </div>
            </div>
          </SectionCard>
        ))}
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو بر اساس نام یا کد رهگیری..." className="h-9 pr-9 text-sm" />
      </div>

      <div className="rounded-2xl border bg-card shadow-sm">
        <DataTable columns={columns} rows={data?.reserves ?? []} loading={loading} emptyText="رزروی یافت نشد" />
      </div>
    </div>
  );
}
