"use client";
// مراکز و کلینیک‌ها
import * as React from "react";
import { PageHeader, FilterBar, DataTable, DotBadge, Column, LoadingView } from "@/components/shared";
import { faNum } from "@/lib/jalali";
import { api, useQuery } from "@/lib/client";
import { Building2, Search, MapPin, Phone } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

type CenterRow = {
  id: number; title: string; isEnabled: boolean; address: string | null; tel: string | null;
  cityTitle: string; provinceTitle: string; category: { title: string } | null;
  _count: { events: number };
};

export function CentersView() {
  const { toast } = useToast();
  const [q, setQ] = React.useState("");
  const [provinceId, setProvinceId] = React.useState("");
  const [page, setPage] = React.useState(1);

  const meta = useQuery<{ provinces: { id: number; title: string }[] }>(() => api("/api/meta"), []);
  const { data, loading, refetch } = useQuery<{ total: number; totalPages: number; centers: CenterRow[] }>(
    () => api(`/api/centers?q=${encodeURIComponent(q)}&provinceId=${provinceId}&page=${page}`),
    [q, provinceId, page]
  );

  const toggle = async (c: CenterRow) => {
    await api("/api/centers", { method: "PATCH", body: JSON.stringify({ id: c.id, isEnabled: !c.isEnabled }) });
    toast({ title: c.isEnabled ? "مرکز غیرفعال شد" : "مرکز فعال شد" });
    refetch();
  };

  const columns: Column<CenterRow>[] = [
    {
      header: "مرکز",
      cell: (c) => (
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <Building2 className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[13px] font-semibold leading-5">{c.title}</p>
            <p className="text-[10.5px] text-muted-foreground leading-4">{c.category?.title ?? "—"}</p>
          </div>
        </div>
      ),
    },
    {
      header: "موقعیت",
      cell: (c) => (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3" /> {c.provinceTitle} / {c.cityTitle}
        </span>
      ),
    },
    { header: "تلفن", cell: (c) => <span className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground" dir="ltr">{c.tel ?? "—"}</span> },
    { header: "جلسات", cell: (c) => <span className="text-xs font-bold tabular-nums">{faNum(c._count.events)}</span> },
    { header: "وضعیت", cell: (c) => <DotBadge label={c.isEnabled ? "فعال" : "غیرفعال"} ok={c.isEnabled} /> },
    {
      header: "تغییر وضعیت",
      cell: (c) => <Switch checked={c.isEnabled} onCheckedChange={() => toggle(c)} aria-label="تغییر وضعیت مرکز" />,
    },
  ];

  return (
    <div>
      <PageHeader title="مراکز و کلینیک‌ها" subtitle={`${faNum(data?.total ?? 0)} مرکز خدمات سراسر کشور`} icon={<Building2 className="h-5 w-5" />} />

      <FilterBar className="mb-4">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="جستجوی نام مرکز..." className="h-9 pr-9 text-sm" />
        </div>
        <Select value={provinceId || "all"} onValueChange={(v) => { setProvinceId(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="h-9 w-44 text-sm"><SelectValue placeholder="همه استان‌ها" /></SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="all">همه استان‌ها</SelectItem>
            {meta.data?.provinces.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.title}</SelectItem>)}
          </SelectContent>
        </Select>
      </FilterBar>

      <div className="rounded-2xl border bg-card shadow-sm">
        <DataTable columns={columns} rows={data?.centers ?? []} loading={loading} page={data?.page} totalPages={data?.totalPages} onPageChange={setPage} />
      </div>
    </div>
  );
}
