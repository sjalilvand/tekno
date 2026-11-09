"use client";
// موارد حاد (EMS) — فهرست + ثبت مورد حاد جدید + بررسی کمیسیون
import * as React from "react";
import { PageHeader, FilterBar, DataTable, StatusBadge, NameAvatar, LoadingView, Column, StatCard } from "@/components/shared";
import { NewAcuteDialog } from "@/components/record-dialogs";
import { faNum, faMoney, jDate } from "@/lib/jalali";
import { api, useQuery } from "@/lib/client";
import { Siren, Search, ClipboardCheck, Banknote, AlertTriangle, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type EmsRow = {
  id: number; severity: string; hadPaymentStatus: string | null; hadPaymentAmount: number;
  emsType: string | null; suicidalFrom: string | null; actionsTaken: string | null;
  financialAssistanceRequest: number; dateTime: string; hadPaymentDescription: string | null;
  comments: { id: number; comment: string; date: string }[];
  event: {
    id: number; trackingCode: number | null; startDate: string;
    user: { name: string; family: string; avatarColor: string | null; nid: number };
    center: { title: string; cityTitle: string };
  };
};

function parseJson(v: string | null): string[] {
  if (!v) return [];
  try {
    const arr = JSON.parse(v);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

const SEV_STYLE: Record<string, string> = {
  "بالا": "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900",
  "متوسط": "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900",
  "کم": "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900",
};

export function EmsView() {
  const { toast } = useToast();
  const [q, setQ] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<EmsRow | null>(null);
  const [payStatus, setPayStatus] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [comment, setComment] = React.useState("");
  const [newOpen, setNewOpen] = React.useState(false);

  const { data, loading, refetch } = useQuery<{
    total: number; totalPages: number; ems: EmsRow[];
    sevAgg: { severity: string; count: number }[];
    payAgg: { hadPaymentStatus: string | null; count: number; _sum?: { hadPaymentAmount: number } }[];
  }>(() => api(`/api/ems?q=${encodeURIComponent(q)}&page=${page}`), [q, page]);

  const save = async () => {
    if (!selected) return;
    await api("/api/ems", {
      method: "PATCH",
      body: JSON.stringify({ id: selected.id, status: payStatus || undefined, amount: amount ? Number(amount) : undefined, comment: comment || undefined }),
    });
    toast({ title: "بررسی مورد حاد ذخیره شد" });
    setSelected(null);
    setAmount("");
    setComment("");
    refetch();
  };

  const high = data?.sevAgg.find((s) => s.severity === "بالا")?.count ?? 0;
  const paid = data?.payAgg.find((s) => s.hadPaymentStatus === "پرداخت شده")?._sum?.hadPaymentAmount ?? 0;
  const waiting = data?.payAgg.filter((s) => s.hadPaymentStatus === "در انتظار بررسی" || s.hadPaymentStatus === "تایید شده").reduce((a, b) => a + b.count, 0) ?? 0;

  const columns: Column<EmsRow>[] = [
    {
      header: "مراجع",
      cell: (r) => (
        <div className="flex items-center gap-2.5">
          <NameAvatar name={r.event.user.name} family={r.event.user.family} color={r.event.user.avatarColor} size={32} />
          <div>
            <p className="text-[13px] font-semibold leading-5">{r.event.user.name} {r.event.user.family}</p>
            <p className="text-[10.5px] text-muted-foreground leading-4">{r.event.center.cityTitle}</p>
          </div>
        </div>
      ),
    },
    {
      header: "نوع مورد",
      cell: (r) => (
        <div className="flex max-w-44 flex-wrap gap-1">
          {parseJson(r.emsType).slice(0, 2).map((t) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
        </div>
      ),
    },
    {
      header: "شدت",
      cell: (r) => <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${SEV_STYLE[r.severity] ?? ""}`}>{r.severity}</span>,
    },
    { header: "تاریخ", cell: (r) => <span className="text-xs tabular-nums text-muted-foreground">{jDate(r.dateTime)}</span> },
    { header: "درخواست کمک", cell: (r) => r.financialAssistanceRequest === 1 ? <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 text-[10px]">دارد</Badge> : <span className="text-xs text-muted-foreground">—</span> },
    { header: "مبلغ پرداخت", cell: (r) => <span className="text-xs font-bold tabular-nums">{r.hadPaymentAmount ? `${faMoney(r.hadPaymentAmount)} ریال` : "—"}</span> },
    { header: "وضعیت پرداخت", cell: (r) => <StatusBadge status={r.hadPaymentStatus} /> },
    {
      header: "عملیات",
      cell: (r) => (
        <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={(e) => { e.stopPropagation(); setSelected(r); setPayStatus(r.hadPaymentStatus ?? ""); setAmount(r.hadPaymentAmount ? String(r.hadPaymentAmount) : ""); setComment(r.hadPaymentDescription ?? ""); }}>
          <ClipboardCheck className="h-3 w-3" /> بررسی
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="موارد حاد"
        subtitle="مدیریت کیس‌های حاد، بررسی کمیسیون و پرداخت کمک‌هزینه"
        icon={<Siren className="h-5 w-5 text-rose-500" />}
        actions={
          <Button className="gap-1.5 bg-rose-600 text-white hover:bg-rose-700" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" /> ثبت مورد حاد جدید
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard title="کل موارد" value={faNum(data?.total ?? 0)} icon={<Siren className="h-5 w-5" />} tone="slate" />
        <StatCard title="شدت بالا" value={faNum(high)} icon={<AlertTriangle className="h-5 w-5" />} tone="rose" hint="اولویت بررسی فوری" />
        <StatCard title="در انتظار بررسی" value={faNum(waiting)} icon={<ClipboardCheck className="h-5 w-5" />} tone="amber" />
        <StatCard title="پرداخت‌شده" value={`${faMoney(paid)} ریال`} icon={<Banknote className="h-5 w-5" />} tone="emerald" />
      </div>

      <FilterBar className="mb-4">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="جستجوی نام مراجع..." className="h-9 pr-9 text-sm" />
        </div>
      </FilterBar>

      <div className="rounded-2xl border bg-card shadow-sm">
        <DataTable columns={columns} rows={data?.ems ?? []} loading={loading} page={data?.page} totalPages={data?.totalPages} onPageChange={setPage} emptyText="مورد حادی یافت نشد" />
      </div>

      <Dialog open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right flex items-center gap-2">
              <Siren className="h-5 w-5 text-rose-500" />
              بررسی مورد حاد — {selected?.event.user.name} {selected?.event.user.family}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3.5">
              <div className="rounded-xl border bg-muted/40 p-3.5 space-y-1.5">
                <p className="text-xs"><b>نوع:</b> {parseJson(selected.emsType).join("، ") || "—"}</p>
                <p className="text-xs"><b>عوامل:</b> {parseJson(selected.suicidalFrom).join("، ") || "—"}</p>
                <p className="text-xs leading-6"><b>اقدامات:</b> {selected.actionsTaken ?? "—"}</p>
                {selected.comments[0] && <p className="rounded-lg bg-accent/50 px-3 py-2 text-[11px]">{selected.comments[0].comment}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <p className="text-[11px] font-bold">وضعیت پرداخت</p>
                  <Select value={payStatus} onValueChange={setPayStatus}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="انتخاب..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="بدون درخواست">بدون درخواست</SelectItem>
                      <SelectItem value="در انتظار بررسی">در انتظار بررسی</SelectItem>
                      <SelectItem value="تایید شده">تایید شده</SelectItem>
                      <SelectItem value="پرداخت شده">پرداخت شده</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <p className="text-[11px] font-bold">مبلغ (ریال)</p>
                  <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-9 text-xs" />
                </div>
              </div>
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="توضیحات بررسی کمیسیون..." rows={2} className="text-xs" />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>انصراف</Button>
            <Button onClick={save}>ذخیره بررسی</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ثبت مورد حاد جدید — نسخهٔ ۶.۱۱ */}
      <NewAcuteDialog open={newOpen} onClose={() => setNewOpen(false)} onSaved={refetch} />
    </div>
  );
}
