"use client";
// جلسات گروهی
import * as React from "react";
import { PageHeader, DataTable, StatusBadge, SectionCard, Column, LoadingView } from "@/components/shared";
import { faNum, jDate, jTime } from "@/lib/jalali";
import { api, useQuery } from "@/lib/client";
import { Users2, UsersRound, CalendarDays, CalendarRange } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

type GroupEventRow = {
  id: number; topic: string; description: string | null; startDate: string | null;
  sessionNumber: number; status: string; weight: number;
  group: { id: number; title: string };
  _count: { members: number };
};

type GroupRow = {
  id: number; title: string; address: string | null; tel: string | null;
  _count: { members: number; events: number };
};

export function GroupEventsView() {
  const { data, loading } = useQuery<{ total: number; groups: GroupEventRow[]; groupList: GroupRow[] }>(
    () => api("/api/group-events?page=1&pageSize=50"), []
  );

  const columns: Column<GroupEventRow>[] = [
    {
      header: "گروه",
      cell: (g) => (
        <div>
          <p className="text-[13px] font-semibold leading-5">{g.group.title}</p>
          <p className="text-[10.5px] text-muted-foreground leading-4">جلسه {faNum(g.sessionNumber)}</p>
        </div>
      ),
    },
    { header: "موضوع", cell: (g) => <span className="text-xs font-semibold">{g.topic}</span> },
    { header: "شرح", cell: (g) => <span className="block max-w-56 truncate text-xs text-muted-foreground">{g.description ?? "—"}</span> },
    {
      header: "زمان",
      cell: (g) => (
        <div className="text-xs">
          <p className="tabular-nums">{jDate(g.startDate)}</p>
          <p className="tabular-nums text-[10.5px] text-muted-foreground">{jTime(g.startDate)}</p>
        </div>
      ),
    },
    {
      header: "حضور",
      cell: (g) => (
        <Badge variant="secondary" className="gap-1 text-[10.5px] font-bold">
          <UsersRound className="h-3 w-3" /> {faNum(g._count.members)} نفر
        </Badge>
      ),
    },
    { header: "وضعیت", cell: (g) => <StatusBadge status={g.status} /> },
  ];

  return (
    <div>
      <PageHeader title="جلسات گروهی" subtitle={`${faNum(data?.total ?? 0)} جلسه گروهی برگزارشده`} icon={<Users2 className="h-5 w-5" />} />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
        {data?.groupList.slice(0, 5).map((g) => (
          <div key={g.id} className="rounded-2xl border bg-card p-4 shadow-sm">
            <p className="truncate text-xs font-bold">{g.title}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">{faNum(g._count.members)} عضو — {faNum(g._count.events)} جلسه</p>
            <Progress value={Math.min(100, (g._count.events / 6) * 100)} className="mt-2 h-1.5" />
          </div>
        ))}
      </div>

      <div className="rounded-2xl border bg-card shadow-sm">
        <DataTable columns={columns} rows={data?.groups ?? []} loading={loading} emptyText="جلسه گروهی یافت نشد" />
      </div>
    </div>
  );
}
