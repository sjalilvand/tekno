"use client";
// ارجاعات سامانه سها
import * as React from "react";
import { PageHeader, FilterBar, DataTable, StatusBadge, Column, LoadingView } from "@/components/shared";
import { faNum, faDigits, jDate } from "@/lib/jalali";
import { api, useQuery } from "@/lib/client";
import { ArrowLeftRight, Search, MessageCircleMore } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type ReferrRow = {
  id: number; refId: number; userName: string | null; userNid: number | null; userMobile: number | null;
  description: string | null; sessionsCount: number; status: string; creationDate: string;
  service: { short: string; name: string };
};

const STATUSES = ["در انتظار", "پذیرش‌شده", "ارجاع‌شده", "منقضی"];

export function ReferralsView() {
  const { toast } = useToast();
  const [status, setStatus] = React.useState("");
  const [q, setQ] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<ReferrRow | null>(null);
  const [followup, setFollowup] = React.useState("");

  const { data, loading, refetch } = useQuery<{
    total: number; totalPages: number; referrs: ReferrRow[];
    statusAgg: { status: string; count: number }[];
  }>(() => api(`/api/referrals?status=${status}&q=${encodeURIComponent(q)}&page=${page}`), [status, q, page]);

  const accept = async (r: ReferrRow) => {
    await api("/api/referrals", { method: "PATCH", body: JSON.stringify({ id: r.id, action: "accept" }) });
    toast({ title: "ارجاع پذیرش شد" });
    refetch();
  };

  const sendFollowup = async () => {
    if (!selected || !followup.trim()) return;
    await api("/api/referrals", { method: "PATCH", body: JSON.stringify({ id: selected.id, action: "followup", comment: followup }) });
    toast({ title: "پیگیری ثبت شد" });
    setFollowup("");
    setSelected(null);
    refetch();
  };

  const columns: Column<ReferrRow>[] = [
    { header: "کد ارجاع", cell: (r) => <span className="text-xs font-bold tabular-nums text-primary">{faNum(r.refId)}</span> },
    {
      header: "کاربر",
      cell: (r) => (
        <div>
          <p className="text-[13px] font-semibold leading-5">{r.userName ?? "—"}</p>
          <p className="text-[10.5px] tabular-nums text-muted-foreground leading-4">{faDigits(r.userNid ?? "")}</p>
        </div>
      ),
    },
    { header: "خدمت", cell: (r) => <Badge variant="secondary" className="text-[10.5px] font-semibold">{r.service.short}</Badge> },
    { header: "توضیحات", cell: (r) => <span className="max-w-64 truncate text-xs text-muted-foreground">{r.description ?? "—"}</span> },
    { header: "جلسات", cell: (r) => <span className="text-xs font-bold tabular-nums">{faNum(r.sessionsCount)}</span> },
    { header: "تاریخ", cell: (r) => <span className="text-xs tabular-nums text-muted-foreground">{jDate(r.creationDate)}</span> },
    { header: "وضعیت", cell: (r) => <StatusBadge status={r.status} /> },
    {
      header: "عملیات",
      cell: (r) => (
        <div className="flex gap-1">
          {r.status === "در انتظار" && (
            <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px] text-emerald-600 hover:text-emerald-700" onClick={(e) => { e.stopPropagation(); accept(r); }}>
              پذیرش
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-[11px]" onClick={(e) => { e.stopPropagation(); setSelected(r); }}>
            <MessageCircleMore className="h-3.5 w-3.5" /> پیگیری
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="ارجاعات سها" subtitle={`پیگیری ${faNum(data?.total ?? 0)} ارجاع دریافتی از وزارت بهداشت`} icon={<ArrowLeftRight className="h-5 w-5" />} />

      <FilterBar className="mb-4">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="جستجوی کد ارجاع، نام یا کد ملی..." className="h-9 pr-9 text-sm" />
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => { setStatus(""); setPage(1); }}
            className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition-all ${!status ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}>
            همه
          </button>
          {STATUSES.map((s) => {
            const count = data?.statusAgg.find((x) => x.status === s)?.count ?? 0;
            return (
              <button key={s} onClick={() => { setStatus(s); setPage(1); }}
                className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition-all ${status === s ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}>
                {s} <span className="tabular-nums opacity-70">({faNum(count)})</span>
              </button>
            );
          })}
        </div>
      </FilterBar>

      <div className="rounded-2xl border bg-card shadow-sm">
        <DataTable columns={columns} rows={data?.referrs ?? []} loading={loading} page={data?.page} totalPages={data?.totalPages} onPageChange={setPage} />
      </div>

      <Dialog open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">ثبت پیگیری ارجاع {selected ? faNum(selected.refId) : ""}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">{selected?.description ?? ""}</p>
          <Textarea value={followup} onChange={(e) => setFollowup(e.target.value)} placeholder="متن پیگیری..." rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>انصراف</Button>
            <Button disabled={!followup.trim()} onClick={sendFollowup}>ثبت پیگیری</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
