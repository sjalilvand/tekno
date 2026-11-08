"use client";
// سهمیه‌های خدماتی (بودجه)
import * as React from "react";
import { PageHeader, SectionCard, LoadingView, StatusBadge } from "@/components/shared";
import { faNum, jDate } from "@/lib/jalali";
import { api, useQuery } from "@/lib/client";
import { Target, Plus } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type BudgetRow = {
  id: number; title: string; kind: string; amount: number; used: number;
  reserved: number; remained: number; startDate: string | null; endDate: string | null; isActive: boolean;
  provinces: { id: number; amount: number; used: number; remained: number; reserved: number; province: { title: string } }[];
};

export function BudgetsView() {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ title: "", kind: "فردی", amount: "" });
  const { data, loading, refetch } = useQuery<{ budgets: BudgetRow[] }>(() => api("/api/budgets"), []);

  const create = async () => {
    if (!form.title || !form.amount) return;
    await api("/api/budgets", { method: "POST", body: JSON.stringify(form) });
    toast({ title: "سهمیه جدید ایجاد شد" });
    setOpen(false);
    setForm({ title: "", kind: "فردی", amount: "" });
    refetch();
  };

  if (loading) return <LoadingView />;

  return (
    <div>
      <PageHeader
        title="سهمیه‌های خدماتی"
        subtitle="مدیریت سهمیه‌های کشوری و تخصیص استانی"
        icon={<Target className="h-5 w-5" />}
        actions={
          <Button className="gap-1.5" size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> سهمیه جدید
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        {data?.budgets.map((b) => {
          const pct = b.amount ? Math.round((b.used / b.amount) * 100) : 0;
          const reservedPct = b.amount ? Math.round((b.reserved / b.amount) * 100) : 0;
          return (
            <SectionCard
              key={b.id}
              title={b.title}
              subtitle={`${faNum(b.startDate ? jDate(b.startDate) : "—")} تا ${faNum(b.endDate ? jDate(b.endDate) : "—")}`}
              actions={<StatusBadge status={b.isActive ? "تایید شده" : "منقضی"} />}
            >
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-2xl font-extrabold tabular-nums">{faNum(b.used)}</span>
                <span className="text-xs text-muted-foreground">از {faNum(b.amount)} جلسه</span>
              </div>
              <div className="relative">
                <Progress value={Math.min(100, pct + reservedPct)} className="h-2.5" />
              </div>
              <div className="mt-2 flex justify-between text-[10.5px]">
                <span className="text-emerald-600 font-bold">مصرف {faNum(pct)}٪</span>
                <span className="text-amber-600 font-bold">رزرو {faNum(reservedPct)}٪</span>
                <span className="text-muted-foreground font-bold">مانده {faNum(b.remained)}</span>
              </div>

              <div className="mt-4 space-y-1.5 border-t pt-3.5">
                <p className="mb-1 text-[11px] font-bold text-muted-foreground">تخصیص به استان‌ها ({faNum(b.provinces.length)} استان)</p>
                {b.provinces.slice(0, 4).map((p) => {
                  const pp = p.amount ? Math.round((p.used / p.amount) * 100) : 0;
                  return (
                    <div key={p.id} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 truncate text-[11px] font-semibold">{p.province.title}</span>
                      <Progress value={pp} className="h-1.5 flex-1" />
                      <span className="w-10 shrink-0 text-left text-[10.5px] tabular-nums text-muted-foreground">{faNum(pp)}٪</span>
                    </div>
                  );
                })}
                {b.provinces.length > 4 && (
                  <p className="pt-1 text-[10px] text-muted-foreground">+ {faNum(b.provinces.length - 4)} استان دیگر</p>
                )}
              </div>
            </SectionCard>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle className="text-right">ایجاد سهمیه جدید</DialogTitle></DialogHeader>
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label className="text-xs">عنوان سهمیه</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="مثال: سهمیه خدمات فردی ۱۴۰۶" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">نوع</Label>
                <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="فردی">فردی</SelectItem>
                    <SelectItem value="گروهی">گروهی</SelectItem>
                    <SelectItem value="شغلی">شغلی</SelectItem>
                    <SelectItem value="بحران">بحران</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">سقف (تعداد جلسه)</Label>
                <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="10000" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>انصراف</Button>
            <Button disabled={!form.title || !form.amount} onClick={create}>ایجاد</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
