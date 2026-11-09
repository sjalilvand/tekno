"use client";
// پیامک‌ها و ارسال گروهی
import * as React from "react";
import { PageHeader, FilterBar, DataTable, StatCard, Column, LoadingView, StatusBadge, ApplicantCell } from "@/components/shared";
import { faNum, jDateTime } from "@/lib/jalali";
import { api, useQuery } from "@/lib/client";
import { MessageSquareText, Search, SendHorizonal, CheckCheck, Clock, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

type SmsRow = {
  id: number; message: string; status: string; number: number | null; createTime: string;
  sender: { name: string; family: string };
  receiver: { id: number; name: string; family: string; mobile: number; nid: number };
};

export function SmsView() {
  const { toast } = useToast();
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ message: "", targetRole: "همه", targetProvinceId: "all" });
  const [sending, setSending] = React.useState(false);

  const meta = useQuery<{ roles: { id: number; title: string }[]; provinces: { id: number; title: string }[] }>(() => api("/api/meta"), []);
  const { data, loading, refetch } = useQuery<{
    total: number; totalPages: number; sms: SmsRow[];
    statusAgg: { status: string; count: number }[];
  }>(() => api(`/api/sms?q=${encodeURIComponent(q)}&status=${status}&page=${page}`), [q, status, page]);

  const send = async () => {
    if (!form.message.trim()) return;
    setSending(true);
    try {
      const res = await api<{ count: number }>("/api/sms", {
        method: "POST",
        body: JSON.stringify({
          message: form.message,
          targetRole: form.targetRole === "همه" ? undefined : form.targetRole,
          targetProvinceId: form.targetProvinceId === "all" ? undefined : form.targetProvinceId,
        }),
      });
      toast({ title: `پیامک برای ${faNum(res.count)} کاربر در صف ارسال قرار گرفت` });
      setOpen(false);
      setForm({ message: "", targetRole: "همه", targetProvinceId: "all" });
      refetch();
    } catch (e) {
      toast({ title: "خطا", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const sent = data?.statusAgg.find((s) => s.status === "ارسال شده")?.count ?? 0;
  const queued = data?.statusAgg.find((s) => s.status === "در صف")?.count ?? 0;
  const failed = data?.statusAgg.find((s) => s.status === "ناموفق")?.count ?? 0;

  const columns: Column<SmsRow>[] = [
    {
      header: "گیرنده",
      cell: (s) => (
        <ApplicantCell userId={s.receiver.id} name={s.receiver.name} family={s.receiver.family} nid={s.receiver.nid} mobile={s.receiver.mobile} />
      ),
    },
    { header: "متن پیامک", cell: (s) => <span className="block max-w-sm truncate text-xs text-muted-foreground" title={s.message}>{s.message}</span> },
    { header: "فرستنده", cell: (s) => <span className="text-xs text-muted-foreground">{s.sender.name} {s.sender.family}</span> },
    { header: "زمان", cell: (s) => <span className="text-xs tabular-nums text-muted-foreground">{jDateTime(s.createTime)}</span> },
    { header: "وضعیت", cell: (s) => <StatusBadge status={s.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="پیامک‌ها"
        subtitle="گزارش پیامک‌ها و ارسال گروهی"
        icon={<MessageSquareText className="h-5 w-5" />}
        actions={
          <Button className="gap-1.5" size="sm" onClick={() => setOpen(true)}>
            <SendHorizonal className="h-4 w-4" /> ارسال گروهی
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard title="کل پیامک‌ها" value={faNum(data?.total ?? 0)} icon={<MessageSquareText className="h-5 w-5" />} tone="slate" />
        <StatCard title="ارسال موفق" value={faNum(sent)} icon={<CheckCheck className="h-5 w-5" />} tone="emerald" />
        <StatCard title="در صف" value={faNum(queued)} icon={<Clock className="h-5 w-5" />} tone="amber" />
        <StatCard title="ناموفق" value={faNum(failed)} icon={<XCircle className="h-5 w-5" />} tone="rose" />
      </div>

      <FilterBar className="mb-4">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="جستجو در متن پیامک..." className="h-9 pr-9 text-sm" />
        </div>
        <Select value={status || "all"} onValueChange={(v) => { setStatus(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="h-9 w-36 text-sm"><SelectValue placeholder="همه وضعیت‌ها" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه وضعیت‌ها</SelectItem>
            <SelectItem value="ارسال شده">ارسال شده</SelectItem>
            <SelectItem value="در صف">در صف</SelectItem>
            <SelectItem value="ناموفق">ناموفق</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>

      <div className="rounded-2xl border bg-card shadow-sm">
        <DataTable columns={columns} rows={data?.sms ?? []} loading={loading} page={data?.page} totalPages={data?.totalPages} onPageChange={setPage} />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader><DialogTitle className="text-right">ارسال پیامک گروهی</DialogTitle></DialogHeader>
          <div className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">گروه هدف</Label>
                <Select value={form.targetRole} onValueChange={(v) => setForm({ ...form, targetRole: v })}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="همه">همه کاربران</SelectItem>
                    {meta.data?.roles.map((r) => <SelectItem key={r.id} value={r.title}>{r.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">استان</Label>
                <Select value={form.targetProvinceId} onValueChange={(v) => setForm({ ...form, targetProvinceId: v })}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="all">همه استان‌ها</SelectItem>
                    {meta.data?.provinces.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">متن پیامک</Label>
              <Textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={4} placeholder="متن پیامک..." />
              <p className="text-left text-[10px] tabular-nums text-muted-foreground">{faNum(form.message.length)} / ۲۵۶ کاراکتر</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>انصراف</Button>
            <Button onClick={send} disabled={sending || !form.message.trim()}>
              <SendHorizonal className="h-4 w-4" /> {sending ? "در حال ارسال..." : "ارسال"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
