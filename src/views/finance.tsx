"use client";
// =====================================================================
// مالی و حسابداری — خلاصهٔ عملکرد، دفتر تراکنش‌ها و گزارش حسابداری (نسخهٔ ۶.۱۲)
// درآمد جلسات تاییدشده + تراکنش‌های دستی درآمد/هزینه + تراز و تفکیک دسته‌ها
// =====================================================================
import * as React from "react";
import { PageHeader, SectionCard, StatCard, LoadingView, DataTable, Column, DateCell } from "@/components/shared";
import { AreaChartX, BarChartX } from "@/components/charts";
import { faNum, faMoney, jDate } from "@/lib/jalali";
import { api, useQuery } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import {
  Wallet, TrendingUp, TrendingDown, Users, Building2, Receipt, Plus, Trash2,
  Loader2, Scale, BookOpenCheck, ArrowDownLeft, ArrowUpRight,
} from "lucide-react";

type FinanceData = {
  totals: {
    gross: number; consultantFees: number; supervisorFees: number; centerFees: number;
    adminFees: number; secretaryFees: number; events: number; emsPaid: number; emsCount: number;
    txIncome: number; txIncomeCount: number; txExpense: number; txExpenseCount: number;
    balance: number;
  };
  series: { month: string; income: number; fee: number; center: number; expense: number }[];
  centerIncome: { name: string; income: number; sessions: number }[];
  contractTotal: number;
  categories: { kind: string; category: string; amount: number; count: number }[];
};

type TxRow = {
  id: number; kind: "income" | "expense"; title: string; category: string;
  amount: number; method: string | null; centerId: number | null; centerTitle: string | null;
  eventId: number | null; occurredAt: string; description: string | null;
};

const METHOD_LABELS: Record<string, string> = {
  cash: "نقدی", card: "کارت‌خوان", transfer: "انتقال بانکی", cheque: "چک", online: "درگاه آنلاین",
};

const EXPENSE_CATEGORIES = ["اجاره", "حقوق و دستمزد", "تبلیغات", "تجهیزات", "آموزش", "مجوز و مالیات", "تعمیر و نگهداری", "متفرقه"];
const INCOME_CATEGORIES = ["شهریه دوره", "آزمون", "قرارداد سازمانی", "هدیه و کمک", "سایر خدمات", "متفرقه"];

function TransactionFormDialog({
  open, onClose, centers, onSaved,
}: {
  open: boolean; onClose: () => void; centers: { id: number; title: string }[]; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [kind, setKind] = React.useState<"income" | "expense">("income");
  const [form, setForm] = React.useState({ title: "", category: "", amount: "", method: "cash", centerId: "", occurredAt: "", description: "" });
  const [saving, setSaving] = React.useState(false);

  const cats = kind === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const save = async () => {
    if (!form.title.trim() || !form.amount) {
      toast({ title: "عنوان و مبلغ الزامی است", variant: "destructive" as never });
      return;
    }
    setSaving(true);
    try {
      await api("/api/finance", {
        method: "POST",
        body: JSON.stringify({
          kind, title: form.title, category: form.category || "عمومی",
          amount: Number(form.amount.replace(/[^\d]/g, "")),
          method: form.method, centerId: form.centerId || undefined,
          occurredAt: form.occurredAt || undefined, description: form.description || undefined,
        }),
      });
      toast({ title: kind === "income" ? "درآمد ثبت شد" : "هزینه ثبت شد" });
      setForm({ title: "", category: "", amount: "", method: "cash", centerId: "", occurredAt: "", description: "" });
      onSaved();
      onClose();
    } catch (e: any) {
      toast({ title: e?.message ?? "خطا در ثبت تراکنش", variant: "destructive" as never });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-right">ثبت تراکنش مالی</DialogTitle>
          <DialogDescription className="text-right">درآمد یا هزینهٔ مستقل از جلسات — به ریال</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-2">
            {([
              { key: "income", label: "درآمد", icon: ArrowDownLeft, cls: "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300" },
              { key: "expense", label: "هزینه", icon: ArrowUpRight, cls: "border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300" },
            ] as const).map((k) => (
              <button
                key={k.key}
                onClick={() => { setKind(k.key); setForm((f) => ({ ...f, category: "" })); }}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-extrabold transition-all",
                  kind === k.key ? k.cls : "border-border bg-card text-muted-foreground hover:bg-muted"
                )}
              >
                <k.icon className="h-4 w-4" /> {k.label}
              </button>
            ))}
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">عنوان تراکنش</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="h-9 text-sm" placeholder="مثلاً اجارهٔ بهمن‌ماه کلینیک کرج" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px]">مبلغ (ریال)</Label>
              <Input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="h-9 text-sm" dir="ltr" inputMode="numeric" placeholder="5,000,000" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">دسته</Label>
              <Select value={form.category || "none"} onValueChange={(v) => setForm({ ...form, category: v === "none" ? "" : v })}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">عمومی</SelectItem>
                  {cats.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px]">روش پرداخت</Label>
              <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(METHOD_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">مرکز (اختیاری)</Label>
              <Select value={form.centerId || "none"} onValueChange={(v) => setForm({ ...form, centerId: v === "none" ? "" : v })}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-56">
                  <SelectItem value="none">مرکزی ندارد</SelectItem>
                  {centers.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">تاریخ (شمسی)</Label>
            <JalaliDatePicker value={form.occurredAt} onChange={(v) => setForm({ ...form, occurredAt: v })} placeholder="امروز" className="w-full" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">توضیحات</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="min-h-16 text-sm" />
          </div>
          <Button className="gap-1.5" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} ثبت تراکنش
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function FinanceView() {
  const { toast } = useToast();
  const [tab, setTab] = React.useState("summary");
  const [txOpen, setTxOpen] = React.useState(false);
  const [txPage, setTxPage] = React.useState(1);
  const [txKind, setTxKind] = React.useState("");
  const [txQ, setTxQ] = React.useState("");
  const [deleting, setDeleting] = React.useState<number | null>(null);

  const summary = useQuery<FinanceData>(() => api("/api/finance"), [tab]);
  const txList = useQuery<{ total: number; totalPages: number; page: number; sum: number; items: TxRow[] }>(
    () => api(`/api/finance?list=1&page=${txPage}&kind=${txKind}&q=${encodeURIComponent(txQ)}`),
    [tab, txPage, txKind, txQ]
  );
  const centersMeta = useQuery<{ centers: { id: number; title: string }[] }>(() => api("/api/centers?pageSize=100"), []);
  const meta = useQuery<{ provinces: { id: number; title: string }[] }>(() => api("/api/meta"), []);

  const t = summary.data?.totals;

  const removeTx = async (id: number) => {
    setDeleting(id);
    try {
      await api(`/api/finance?id=${id}`, { method: "DELETE" });
      toast({ title: "تراکنش حذف شد" });
      txList.refetch();
      summary.refetch();
    } catch (e: any) {
      toast({ title: e?.message ?? "حذف ناموفق — دسترسی حذف برای نقش شما باز نیست", variant: "destructive" as never });
    } finally {
      setDeleting(null);
    }
  };

  const txColumns: Column<TxRow>[] = [
    {
      header: "نوع",
      cell: (r) => r.kind === "income" ? (
        <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400"><ArrowDownLeft className="h-3.5 w-3.5" /> درآمد</span>
      ) : (
        <span className="flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400"><ArrowUpRight className="h-3.5 w-3.5" /> هزینه</span>
      ),
    },
    {
      header: "عنوان",
      cell: (r) => (
        <div>
          <p className="text-[12.5px] font-semibold leading-5">{r.title}</p>
          <p className="text-[10px] text-muted-foreground">{r.category}{r.centerTitle ? ` — ${r.centerTitle}` : ""}</p>
        </div>
      ),
    },
    { header: "مبلغ (ریال)", cell: (r) => <span className={cn("text-xs font-black tabular-nums", r.kind === "income" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>{faNum(r.amount)}</span> },
    { header: "روش", cell: (r) => <span className="text-[11px] text-muted-foreground">{r.method ? METHOD_LABELS[r.method] ?? r.method : "—"}</span> },
    { header: "تاریخ", cell: (r) => <DateCell value={r.occurredAt} /> },
    {
      header: "حذف",
      cell: (r) => (
        <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-500 hover:text-rose-600" onClick={() => removeTx(r.id)} aria-label="حذف تراکنش">
          {deleting === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="مالی و حسابداری"
        subtitle="درآمد، هزینه، تراز حسابداری و تفکیک سهم‌ها"
        icon={<Wallet className="h-5 w-5" />}
      />

      {/* کارت‌های خلاصه — همیشه بالای صفحه */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard title="درآمد جلسات (ریال)" value={faMoney(t?.gross ?? 0)} icon={<TrendingUp className="h-5 w-5" />} tone="teal" hint={`${faNum(t?.events ?? 0)} جلسه تاییدشده`} />
        <StatCard title="درآمد مستقل (ریال)" value={faMoney(t?.txIncome ?? 0)} icon={<ArrowDownLeft className="h-5 w-5" />} tone="cyan" hint={`${faNum(t?.txIncomeCount ?? 0)} تراکنش`} />
        <StatCard title="هزینه‌ها (ریال)" value={faMoney(t?.txExpense ?? 0)} icon={<TrendingDown className="h-5 w-5" />} tone="rose" hint={`${faNum(t?.txExpenseCount ?? 0)} تراکنش`} />
        <StatCard title="تراز کل (ریال)" value={faMoney(t?.balance ?? 0)} icon={<Scale className="h-5 w-5" />} tone="emerald" hint="درآمد جلسات + مستقل − هزینه‌ها" />
        <StatCard title="حق‌الزحمه مشاوران" value={faMoney(t?.consultantFees ?? 0)} icon={<Users className="h-5 w-5" />} tone="amber" />
        <StatCard title="کمک‌هزینه موارد حاد" value={faMoney(t?.emsPaid ?? 0)} icon={<Receipt className="h-5 w-5" />} tone="rose" hint={`${faNum(t?.emsCount ?? 0)} مورد پرداخت‌شده`} />
      </div>

      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <div className="flex flex-wrap items-center gap-2">
          <TabsList>
            <TabsTrigger value="summary" className="gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> خلاصهٔ عملکرد</TabsTrigger>
            <TabsTrigger value="transactions" className="gap-1.5"><BookOpenCheck className="h-3.5 w-3.5" /> دفتر تراکنش‌ها</TabsTrigger>
            <TabsTrigger value="report" className="gap-1.5"><Building2 className="h-3.5 w-3.5" /> گزارش حسابداری</TabsTrigger>
          </TabsList>
          <span className="flex-1" />
          <Button size="sm" className="gap-1.5" onClick={() => setTxOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> ثبت تراکنش جدید
          </Button>
        </div>

        {/* ── خلاصهٔ عملکرد ── */}
        <TabsContent value="summary" className="mt-4 space-y-4">
          {summary.loading && !summary.data ? (
            <LoadingView />
          ) : summary.data ? (
            <div className="grid gap-4 lg:grid-cols-3">
              <SectionCard title="روند مالی" subtitle="درآمد، حق‌الزحمه و هزینه در ۱۱ ماه اخیر (ریال)" className="lg:col-span-2">
                <AreaChartX
                  data={summary.data.series} xKey="month" height={300}
                  areas={[
                    { key: "income", name: "درآمد کل" },
                    { key: "fee", name: "حق مشاوران" },
                    { key: "expense", name: "هزینه‌ها" },
                  ]}
                />
              </SectionCard>

              <SectionCard title="تفکیک درآمد" subtitle="سهم هر بخش از گردش مالی">
                <ul className="mt-2 space-y-3.5">
                  {[
                    { label: "حق‌الزحمه مشاوران", value: summary.data.totals.consultantFees, color: "bg-teal-500" },
                    { label: "حق نظارت حرفه‌ای", value: summary.data.totals.supervisorFees, color: "bg-cyan-500" },
                    { label: "سهم مراکز", value: summary.data.totals.centerFees, color: "bg-emerald-500" },
                    { label: "سهم مدیریت", value: summary.data.totals.adminFees, color: "bg-amber-500" },
                    { label: "حق دبیرخانه", value: summary.data.totals.secretaryFees, color: "bg-rose-500" },
                  ].map((item) => {
                    const pct = summary.data!.totals.gross ? Math.round((item.value / summary.data!.totals.gross) * 100) : 0;
                    return (
                      <li key={item.label}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${item.color}`} /> {item.label}</span>
                          <span className="font-bold tabular-nums">{faMoney(item.value)} <span className="text-muted-foreground">({faNum(pct)}٪)</span></span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className={`h-full rounded-full ${item.color}`} style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </SectionCard>
            </div>
          ) : (
            <div className="p-10 text-center text-sm text-rose-500">{summary.error}</div>
          )}
        </TabsContent>

        {/* ── دفتر تراکنش‌ها ── */}
        <TabsContent value="transactions" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-56 flex-1">
              <Input value={txQ} onChange={(e) => { setTxQ(e.target.value); setTxPage(1); }} placeholder="جستجو در عنوان، توضیح یا دسته..." className="h-9 text-sm" />
            </div>
            <Select value={txKind || "all"} onValueChange={(v) => { setTxKind(v === "all" ? "" : v); setTxPage(1); }}>
              <SelectTrigger className="h-9 w-36 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">درآمد و هزینه</SelectItem>
                <SelectItem value="income">فقط درآمد</SelectItem>
                <SelectItem value="expense">فقط هزینه</SelectItem>
              </SelectContent>
            </Select>
            <BadgeSum label="جمع صفحهٔ فعلی" value={txList.data?.sum ?? 0} />
          </div>

          <div className="rounded-2xl border bg-card shadow-sm">
            <DataTable
              columns={txColumns} rows={txList.data?.items ?? []} loading={txList.loading}
              page={txList.data?.page} totalPages={txList.data?.totalPages} onPageChange={setTxPage}
            />
          </div>
        </TabsContent>

        {/* ── گزارش حسابداری ── */}
        <TabsContent value="report" className="mt-4 space-y-4">
          {summary.loading && !summary.data ? (
            <LoadingView />
          ) : summary.data ? (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <SectionCard title="صورت سود و زیان ساده" subtitle="مبالغ به ریال — دورهٔ کل">
                  <table className="w-full text-xs">
                    <tbody>
                      {[
                        { label: "درآمد جلسات تاییدشده", value: summary.data.totals.gross, sign: 1 },
                        { label: "درآمدهای مستقل", value: summary.data.totals.txIncome, sign: 1 },
                        { label: "جمع درآمدها", value: summary.data.totals.gross + summary.data.totals.txIncome, sign: 1, bold: true },
                        { label: "هزینه‌های ثبت‌شده", value: -summary.data.totals.txExpense, sign: -1 },
                        { label: "حق‌الزحمه مشاوران", value: -summary.data.totals.consultantFees, sign: -1 },
                        { label: "حق نظارت حرفه‌ای", value: -summary.data.totals.supervisorFees, sign: -1 },
                        { label: "سهم مراکز", value: -summary.data.totals.centerFees, sign: -1 },
                        { label: "حق دبیرخانه", value: -summary.data.totals.secretaryFees, sign: -1 },
                        { label: "کمک‌هزینه موارد حاد", value: -summary.data.totals.emsPaid, sign: -1 },
                      ].map((row, i) => (
                        <tr key={i} className={cn("border-b last:border-0", row.bold && "bg-accent/50 font-black")}>
                          <td className="py-2 pl-2">{row.label}</td>
                          <td className={cn("py-2 text-left tabular-nums", row.value < 0 && "text-rose-600 dark:text-rose-400")}>{faNum(row.value)}</td>
                        </tr>
                      ))}
                      <tr className="bg-primary/10 font-black">
                        <td className="py-2.5 pl-2">تراز نهایی (سود خالص)</td>
                        <td className="py-2.5 text-left tabular-nums">
                          {faNum(summary.data.totals.gross + summary.data.totals.txIncome - summary.data.totals.txExpense - summary.data.totals.consultantFees - summary.data.totals.supervisorFees - summary.data.totals.centerFees - summary.data.totals.secretaryFees - summary.data.totals.emsPaid)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </SectionCard>

                <SectionCard title="تفکیک هزینه‌ها و درآمدهای مستقل بر اساس دسته">
                  {summary.data.categories.length === 0 ? (
                    <p className="py-8 text-center text-xs text-muted-foreground">هنوز تراکنشی ثبت نشده است</p>
                  ) : (
                    <ul className="mt-2 space-y-2.5">
                      {summary.data.categories.map((c) => (
                        <li key={`${c.kind}-${c.category}`} className="flex items-center justify-between rounded-xl border bg-muted/40 px-3.5 py-2.5 text-xs">
                          <span className="flex items-center gap-2">
                            <span className={cn("h-2 w-2 rounded-full", c.kind === "income" ? "bg-emerald-500" : "bg-rose-500")} />
                            <span className="font-bold">{c.category}</span>
                            <Badge variant="outline" className="text-[9px]">{c.kind === "income" ? "درآمد" : "هزینه"}</Badge>
                          </span>
                          <span className="tabular-nums font-black">{faMoney(c.amount)} <span className="text-muted-foreground">({faNum(c.count)})</span></span>
                        </li>
                      ))}
                    </ul>
                  )}
                </SectionCard>
              </div>

              <SectionCard title="درآمد مراکز برتر" subtitle="بر اساس گردش مالی جلسات تاییدشده (ریال)">
                <BarChartX
                  data={summary.data.centerIncome.map((c) => ({ name: c.name, value: c.income }))}
                  xKey="name" bars={[{ key: "value", name: "درآمد" }]} height={320} layout="vertical"
                />
              </SectionCard>
            </>
          ) : (
            <div className="p-10 text-center text-sm text-rose-500">{summary.error}</div>
          )}
        </TabsContent>
      </Tabs>

      <TransactionFormDialog
        open={txOpen}
        onClose={() => setTxOpen(false)}
        centers={centersMeta.data?.centers ?? []}
        onSaved={() => { txList.refetch(); summary.refetch(); }}
      />
    </div>
  );
}

function BadgeSum({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex items-center gap-2 rounded-full border bg-muted/50 px-3 py-1.5 text-[10.5px]">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-black tabular-nums">{faMoney(value)} ریال</span>
    </span>
  );
}
