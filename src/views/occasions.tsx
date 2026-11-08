"use client";
// مناسبت‌ها و راهنما
import * as React from "react";
import { PageHeader, LoadingView, SectionCard } from "@/components/shared";
import { faNum, jLong } from "@/lib/jalali";
import { api, useQuery } from "@/lib/client";
import { CalendarHeart, BookOpen, Plus, Download, PartyPopper } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

type Occasion = { id: number; title: string; displayDate: string; isActive: boolean };
type Help = { id: number; title: string; fileUrl: string | null };

const BANNER_COLORS = ["from-teal-500 to-emerald-600", "from-rose-500 to-pink-600", "from-amber-500 to-orange-600", "from-cyan-500 to-sky-600"];

export function OccasionsView() {
  const { toast } = useToast();
  const { data, loading, refetch } = useQuery<{ occasions: Occasion[]; helps: Help[] }>(() => api("/api/occasions"), []);
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [date, setDate] = React.useState("");

  const toggle = async (o: Occasion) => {
    await api("/api/occasions", { method: "PATCH", body: JSON.stringify({ id: o.id, isActive: !o.isActive }) });
    refetch();
  };

  const create = async () => {
    if (!title || !date) return;
    await api("/api/occasions", { method: "POST", body: JSON.stringify({ title, displayDate: date }) });
    toast({ title: "مناسبت جدید ثبت شد" });
    setOpen(false);
    setTitle("");
    setDate("");
    refetch();
  };

  if (loading) return <LoadingView />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="مناسبت‌ها"
        subtitle="بنرهای نمایشی مناسبت‌های رسمی"
        icon={<CalendarHeart className="h-5 w-5" />}
        actions={
          <Button className="gap-1.5" size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> مناسبت جدید
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {data?.occasions.map((o, i) => (
          <div key={o.id} className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${BANNER_COLORS[i % 4]} p-5 text-white shadow-md transition-transform hover:-translate-y-1`}>
            <PartyPopper className="absolute -left-4 -top-4 h-20 w-20 rotate-12 opacity-15" />
            <p className="text-sm font-extrabold">{o.title}</p>
            <p className="mt-1.5 text-[11px] text-white/80">{jLong(o.displayDate)}</p>
            <div className="mt-4 flex items-center justify-between">
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${o.isActive ? "bg-white/25" : "bg-black/20"}`}>
                {o.isActive ? "نمایش فعال" : "غیرفعال"}
              </span>
              <Switch checked={o.isActive} onCheckedChange={() => toggle(o)} aria-label="تغییر وضعیت نمایش" />
            </div>
          </div>
        ))}
        {data?.occasions.length === 0 && (
          <p className="col-span-full rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">مناسبتی ثبت نشده است</p>
        )}
      </div>

      <SectionCard title="راهنماهای سامانه" subtitle="فایل‌های راهنمای هر نقش">
        <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {data?.helps.map((h) => (
            <li key={h.id} className="group flex items-center gap-3 rounded-xl border bg-muted/40 px-4 py-3 transition-colors hover:border-ring hover:bg-card">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <BookOpen className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold">{h.title}</p>
                <p className="text-[10px] text-muted-foreground">PDF</p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100" aria-label="دانلود">
                <Download className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      </SectionCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle className="text-right">مناسبت جدید</DialogTitle></DialogHeader>
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label className="text-xs">عنوان</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: هفته سلامت روان" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">تاریخ نمایش</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>انصراف</Button>
            <Button onClick={create} disabled={!title || !date}>ثبت</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
