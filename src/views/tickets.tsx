"use client";
// تیکت پشتیبانی
import * as React from "react";
import { PageHeader, DataTable, StatusBadge, NameAvatar, Column, LoadingView, SectionCard } from "@/components/shared";
import { faNum, jDateTime } from "@/lib/jalali";
import { api, useQuery } from "@/lib/client";
import { LifeBuoy, Plus, Clock, CheckCircle2, CircleDot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

type Ticket = {
  id: number; subject: string; text: string | null; status: string; priority: string;
  createdAt: string; updatedAt: string;
  user: { name: string; family: string; avatarColor: string | null };
};

export function TicketsView() {
  const { toast } = useToast();
  const { data, loading, refetch } = useQuery<{ tickets: Ticket[] }>(() => api("/api/tickets"), []);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ subject: "", text: "", priority: "متوسط" });

  const create = async () => {
    if (!form.subject.trim()) return;
    await api("/api/tickets", { method: "POST", body: JSON.stringify(form) });
    toast({ title: "تیکت شما ثبت شد" });
    setOpen(false);
    setForm({ subject: "", text: "", priority: "متوسط" });
    refetch();
  };

  const setStatus = async (id: number, status: string) => {
    await api("/api/tickets", { method: "PATCH", body: JSON.stringify({ id, status }) });
    toast({ title: "وضعیت تیکت تغییر کرد" });
    refetch();
  };

  const open_ = data?.tickets.filter((t) => t.status === "باز").length ?? 0;
  const doing = data?.tickets.filter((t) => t.status === "در حال بررسی").length ?? 0;
  const closed = data?.tickets.filter((t) => t.status === "بسته").length ?? 0;

  const columns: Column<Ticket>[] = [
    {
      header: "ثبت‌کننده",
      cell: (t) => (
        <div className="flex items-center gap-2.5">
          <NameAvatar name={t.user.name} family={t.user.family} color={t.user.avatarColor} size={32} />
          <p className="text-xs font-semibold">{t.user.name} {t.user.family}</p>
        </div>
      ),
    },
    {
      header: "موضوع",
      cell: (t) => (
        <div className="max-w-md">
          <p className="truncate text-[13px] font-semibold">{t.subject}</p>
          <p className="truncate text-[11px] text-muted-foreground">{t.text}</p>
        </div>
      ),
    },
    {
      header: "اولویت",
      cell: (t) => <span className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-bold ${t.priority === "بالا" ? "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300" : t.priority === "متوسط" ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{t.priority}</span>,
    },
    { header: "ثبت", cell: (t) => <span className="text-xs tabular-nums text-muted-foreground">{jDateTime(t.createdAt)}</span> },
    { header: "وضعیت", cell: (t) => <StatusBadge status={t.status} /> },
    {
      header: "عملیات",
      cell: (t) => (
        <div className="flex gap-1">
          {t.status !== "در حال بررسی" && t.status !== "بسته" && (
            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={(e) => { e.stopPropagation(); setStatus(t.id, "در حال بررسی"); }}>بررسی</Button>
          )}
          {t.status !== "بسته" && (
            <Button size="sm" variant="outline" className="h-7 text-[11px] text-emerald-600" onClick={(e) => { e.stopPropagation(); setStatus(t.id, "بسته"); }}>بستن</Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="تیکت پشتیبانی"
        subtitle="مدیریت درخواست‌های پشتیبانی کاربران"
        icon={<LifeBuoy className="h-5 w-5" />}
        actions={
          <Button className="gap-1.5" size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> تیکت جدید
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-4">
        <SectionCard bodyClass="p-4"><MiniCount icon={<CircleDot className="h-4 w-4 text-amber-500" />} label="باز" value={open_} /></SectionCard>
        <SectionCard bodyClass="p-4"><MiniCount icon={<Clock className="h-4 w-4 text-cyan-500" />} label="در حال بررسی" value={doing} /></SectionCard>
        <SectionCard bodyClass="p-4"><MiniCount icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />} label="بسته" value={closed} /></SectionCard>
      </div>

      <div className="rounded-2xl border bg-card shadow-sm">
        <DataTable columns={columns} rows={data?.tickets ?? []} loading={loading} emptyText="تیکتی ثبت نشده است" />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle className="text-right">ثبت تیکت جدید</DialogTitle></DialogHeader>
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label className="text-xs">موضوع</Label>
              <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">اولویت</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="کم">کم</SelectItem>
                  <SelectItem value="متوسط">متوسط</SelectItem>
                  <SelectItem value="بالا">بالا</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">توضیحات</Label>
              <Textarea value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>انصراف</Button>
            <Button onClick={create} disabled={!form.subject.trim()}>ثبت تیکت</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MiniCount({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">{icon}</span>
      <div>
        <p className="text-lg font-extrabold tabular-nums">{faNum(value)}</p>
        <p className="text-[11px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
