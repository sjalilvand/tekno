"use client";
// =====================================================================
// وب‌سرویس‌ساز — ساخت REST API روی دیتابیس با فرمت JSON / XML / CSV
// =====================================================================
import * as React from "react";
import { PageHeader, LoadingView, SectionCard, Column, DataTable, DateCell } from "@/components/shared";
import { faNum } from "@/lib/jalali";
import { api, useQuery } from "@/lib/client";
import { PlugZap, Plus, Copy, Trash2, ExternalLink, ShieldCheck, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

type CatalogTable = { name: string; label: string; columns: string[] };
type Service = {
  id: number; slug: string; title: string; table: string; columns: string; filters: string | null;
  format: string; authType: string; hasKey: boolean; apiKey: string | null; rowLimit: number;
  orderBy: string | null; isActive: boolean; callCount: number; lastCallAt: string | null;
};

const FORMAT_LABEL: Record<string, string> = { json: "JSON", xml: "XML", csv: "CSV" };
const OPS = ["=", "!=", ">", ">=", "<", "<=", "LIKE"];

export function WebServicesView() {
  const { toast } = useToast();
  const [wizard, setWizard] = React.useState(false);
  const [testOpen, setTestOpen] = React.useState<Service | null>(null);
  const { data, loading, refetch } = useQuery<{ services: Service[]; catalog: CatalogTable[] }>(() => api("/api/web-services"), []);

  const del = async (s: Service) => {
    if (!confirm(`سرویس «${s.title}» حذف شود؟`)) return;
    await api(`/api/web-services?id=${s.id}`, { method: "DELETE" });
    toast({ title: "سرویس حذف شد" });
    refetch();
  };
  const toggle = async (s: Service) => {
    await api("/api/web-services", { method: "POST", body: JSON.stringify({ id: s.id, table: s.table, title: s.title, format: s.format, authType: s.authType, rowLimit: s.rowLimit, isActive: !s.isActive }) });
    refetch();
  };
  const regenKey = async (s: Service) => {
    await api("/api/web-services", { method: "POST", body: JSON.stringify({ id: s.id, table: s.table, title: s.title, format: s.format, authType: s.authType, rowLimit: s.rowLimit, isActive: s.isActive, regenerateKey: true }) });
    toast({ title: "کلید جدید ساخته شد — آن را از آزمایش کپی کنید" });
    refetch();
  };

  const columns: Column<Service>[] = [
    {
      header: "سرویس",
      cell: (s) => (
        <div>
          <p className="text-[13px] font-semibold">{s.title}</p>
          <p className="font-mono text-[10px] text-muted-foreground" dir="ltr">/api/ws/{s.slug}</p>
        </div>
      ),
    },
    { header: "جدول", cell: (s) => <Badge variant="outline" className="font-mono text-[10px]" dir="ltr">{s.table}</Badge> },
    { header: "فرمت", cell: (s) => <Badge variant="secondary" className="text-[10px]">{FORMAT_LABEL[s.format] ?? s.format}</Badge> },
    { header: "احراز", cell: (s) => s.authType === "none" ? <span className="text-[10px] text-amber-600">عمومی</span> : <span className="flex items-center gap-1 text-[10px] text-emerald-600"><KeyRound className="h-3 w-3" /> کلید API</span> },
    { header: "فراخوانی", cell: (s) => <span className="text-xs tabular-nums">{faNum(s.callCount)} بار</span> },
    { header: "آخرین", cell: (s) => <span className="text-xs text-muted-foreground">{s.lastCallAt ? <DateCell value={s.lastCallAt} /> : "—"}</span> },
    {
      header: "فعال",
      cell: (s) => <Switch checked={s.isActive} onCheckedChange={() => toggle(s)} />,
    },
    {
      header: "عملیات",
      cell: (s) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" title="آزمایش و مستندات" onClick={() => setTestOpen(s)}><ExternalLink className="h-4 w-4 text-primary" /></Button>
          {s.authType === "apikey" && <Button variant="ghost" size="icon" className="h-8 w-8" title="ساخت کلید جدید" onClick={() => regenKey(s)}><KeyRound className="h-4 w-4" /></Button>}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => del(s)}><Trash2 className="h-3.5 w-3.5 text-rose-500" /></Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="وب‌سرویس‌ساز"
        subtitle="ساخت REST API روی جداول دیتابیس با فرمت JSON، XML و CSV + کلید اختصاصی"
        icon={<PlugZap className="h-5 w-5" />}
        actions={<Button size="sm" className="gap-1.5" onClick={() => setWizard(true)}><Plus className="h-4 w-4" /> سرویس جدید</Button>}
      />

      <SectionCard title="سرویس‌های منتشرشده" subtitle="هر سرویس یک آدرس عمومی دارد که با پارامترهای فیلتر و فرمت فراخوانی می‌شود">
        <div className="rounded-2xl border bg-card shadow-sm">
          <DataTable columns={columns} rows={data?.services ?? []} loading={loading} />
        </div>
      </SectionCard>

      <WizardDialog open={wizard} catalog={data?.catalog ?? []} onClose={() => setWizard(false)} onSaved={() => { setWizard(false); refetch(); toast({ title: "سرویس ساخته شد" }); }} />
      <TestDialog service={testOpen} onClose={() => setTestOpen(null)} />
    </div>
  );
}

// ------------------------------------------------------------ wizard
function WizardDialog({ open, catalog, onClose, onSaved }: { open: boolean; catalog: CatalogTable[]; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = React.useState("");
  const [table, setTable] = React.useState("");
  const [columns, setColumns] = React.useState<string[]>([]);
  const [format, setFormat] = React.useState("json");
  const [authType, setAuthType] = React.useState("apikey");
  const [rowLimit, setRowLimit] = React.useState(1000);
  const [orderBy, setOrderBy] = React.useState("id DESC");
  const [filters, setFilters] = React.useState<{ col: string; op: string; value: string }[]>([]);
  const sel = catalog.find((t) => t.name === table);

  React.useEffect(() => { if (table) { setColumns([]); setFilters([]); setOrderBy("id DESC"); } }, [table]);

  const save = async () => {
    try {
      const r = await api<{ slug: string }>("/api/web-services", {
        method: "POST",
        body: JSON.stringify({ title, table, columns, format, authType, rowLimit, orderBy, filters }),
      });
      toast({ title: `سرویس ساخته شد: /api/ws/${r.slug}` });
      onSaved();
    } catch (e) { alert((e as Error).message); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl p-6" dir="rtl">
        <DialogHeader><DialogTitle className="text-right">سرویس وب جدید</DialogTitle></DialogHeader>
        <div className="max-h-[65vh] space-y-3.5 overflow-auto">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">عنوان سرویس</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً: فهرست جلسات برای اپ موبایل" className="h-9" />
            </div>
            <div>
              <Label className="text-xs">جدول دیتابیس</Label>
              <Select value={table || "none"} onValueChange={setTable}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="انتخاب جدول" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="none" disabled>انتخاب جدول</SelectItem>
                  {catalog.map((t) => <SelectItem key={t.name} value={t.name}>{t.label} ({t.name})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label className="text-xs">فرمت خروجی</Label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="xml">XML</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">احراز هویت</Label>
              <Select value={authType} onValueChange={setAuthType}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="apikey">کلید API (توصیه‌شده)</SelectItem>
                  <SelectItem value="none">عمومی (بدون کلید)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">سقف ردیف</Label>
              <Input type="number" min={1} max={10000} value={rowLimit} onChange={(e) => setRowLimit(Number(e.target.value))} className="h-9" />
            </div>
          </div>
          {sel && (
            <>
              <div>
                <Label className="text-xs">ستون‌ها (خالی = همهٔ ستون‌های مجاز)</Label>
                <div className="flex max-h-28 flex-wrap gap-1.5 overflow-auto rounded-xl border bg-muted/30 p-2.5">
                  {sel.columns.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColumns((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))}
                      className={`rounded-full px-2.5 py-1 font-mono text-[10px] transition-colors ${columns.includes(c) ? "bg-primary text-white" : "bg-card text-muted-foreground hover:bg-accent"}`}
                      dir="ltr"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <Label className="text-xs">فیلترهای ثابت (اختیاری)</Label>
                  <Button size="sm" variant="ghost" className="h-7 gap-1 text-[11px]" onClick={() => setFilters((f) => [...f, { col: sel.columns[0], op: "=", value: "" }])}><Plus className="h-3 w-3" /> فیلتر</Button>
                </div>
                <div className="space-y-1.5">
                  {filters.map((f, i) => (
                    <div key={i} className="grid grid-cols-[1fr_80px_1fr_36px] items-center gap-2">
                      <Select value={f.col} onValueChange={(v) => setFilters((p) => p.map((x, j) => (j === i ? { ...x, col: v } : x)))}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent className="max-h-56">{sel.columns.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                      <Select value={f.op} onValueChange={(v) => setFilters((p) => p.map((x, j) => (j === i ? { ...x, op: v } : x)))}>
                        <SelectTrigger className="h-8 text-xs" dir="ltr"><SelectValue /></SelectTrigger>
                        <SelectContent>{OPS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                      </Select>
                      <Input value={f.value} onChange={(e) => setFilters((p) => p.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} className="h-8 text-xs" placeholder="مقدار" dir="ltr" />
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setFilters((p) => p.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5 text-rose-500" /></Button>
                    </div>
                  ))}
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">مصرف‌کنندهٔ سرویس می‌تواند فیلتر ثابت را با ?f_ستون=مقدار و فیلتر پویا با ?q_ستون=مقدار override کند.</p>
              </div>
            </>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>انصراف</Button>
            <Button size="sm" onClick={save} disabled={!table || !title.trim()}>ساخت سرویس</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------ test
function TestDialog({ service, onClose }: { service: Service | null; onClose: () => void }) {
  const [format, setFormat] = React.useState("");
  const [result, setResult] = React.useState<string>("");
  const [status, setStatus] = React.useState<number | null>(null);
  if (!service) return null;
  const url = `/api/ws/${service.slug}?limit=5${format ? `&format=${format}` : ""}`;

  const run = async () => {
    setStatus(null);
    try {
      const res = await fetch(url);
      setStatus(res.status);
      const text = await res.text();
      try { setResult(JSON.stringify(JSON.parse(text), null, 2)); } catch { setResult(text.slice(0, 4000)); }
    } catch (e) { setResult((e as Error).message); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl p-6" dir="rtl">
        <DialogHeader><DialogTitle className="text-right">آزمایش سرویس: {service.title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-xl border bg-muted/30 p-3 text-xs">
            <p className="mb-1.5 flex items-center gap-1.5 font-bold"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> مستندات فراخوانی</p>
            <div className="space-y-1 font-mono text-[11px]" dir="ltr">
              <p>GET {url}</p>
              {service.authType === "apikey" && <p className="text-muted-foreground">Header: X-API-Key: [کلید سرویس]  یا  ?key=[کلید]</p>}
              <p className="text-muted-foreground">limit: 1..10000 — format: json|xml|csv (override)</p>
              <p className="text-muted-foreground">q_[column]=value — فیلتر پویا | f_[column]=value — override فیلتر ثابت</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={format || "default"} onValueChange={(v) => setFormat(v === "default" ? "" : v)}>
              <SelectTrigger className="h-9 w-40 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="default">فرمت پیش‌فرض</SelectItem>
                <SelectItem value="json">JSON</SelectItem>
                <SelectItem value="xml">XML</SelectItem>
                <SelectItem value="csv">CSV</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" className="gap-1.5" onClick={run}><ExternalLink className="h-4 w-4" /> اجرای آزمایشی</Button>
            {status !== null && <Badge variant={status === 200 ? "secondary" : "destructive"}>HTTP {status}</Badge>}
          </div>
          {result && (
            <pre className="max-h-72 overflow-auto rounded-xl border bg-slate-950 p-3 text-left font-mono text-[11px] leading-5 text-slate-100" dir="ltr">
              {result}
            </pre>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
