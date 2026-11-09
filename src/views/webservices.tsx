"use client";
// =====================================================================
// وب‌سرویس‌ساز — نسخهٔ ۶.۳ — سه محیط کاری:
//   ۱) سرویس‌ها — مدیریت سرویس‌های منتشرشده
//   ۲) استودیوی پرس‌وجو — SQL آزاد + Join گرافیکی + تست زندهٔ کوئری
//   ۳) تستر وب‌سرویس — محیطی مثل Postman برای فراخوانی سرویس بیرونی/داخلی
// =====================================================================
import * as React from "react";
import { PageHeader, LoadingView, SectionCard, Column, DataTable, DateCell } from "@/components/shared";
import { faNum } from "@/lib/jalali";
import { api, useQuery } from "@/lib/client";
import { PlugZap, Plus, Copy, Trash2, ExternalLink, ShieldCheck, KeyRound, Database, Play, Table2, Braces, Send, History, Globe, Save, Loader2, Layers, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type CatalogTable = { name: string; label: string | null; columns: string[]; rowCount: number | null };
type Service = {
  id: number; slug: string; title: string; table: string; columns: string; filters: string | null;
  format: string; authType: string; hasKey: boolean; apiKey: string | null; key?: string | null;
  rowLimit: number; orderBy: string | null; isActive: boolean; callCount: number;
  lastCallAt: string | null; sourceType?: string; sqlText?: string | null;
};

const FORMAT_LABEL: Record<string, string> = { json: "JSON", xml: "XML", csv: "CSV" };
const OPS = ["=", "!=", ">", ">=", "<", "<=", "LIKE"];

export function WebServicesView() {
  const { toast } = useToast();
  const [wizard, setWizard] = React.useState(false);
  const [testOpen, setTestOpen] = React.useState<Service | null>(null);
  const { data, loading, refetch } = useQuery<{ services: Service[]; catalog: CatalogTable[] }>(() => api("/api/web-services"), []);
  const { data: schemaData, loading: schemaLoading } = useQuery<{ tables: CatalogTable[] }>(() => api("/api/web-services/schema"), []);

  // شِمای زنده — برای ویزارد و استودیو؛ اگر در دسترس نبود از کاتالوگ داخلی استفاده می‌شود
  const liveTables: CatalogTable[] = React.useMemo(() => {
    if (schemaData?.tables?.length) return schemaData.tables;
    return (data?.catalog ?? []).map((t) => ({ ...t, rowCount: null }));
  }, [schemaData, data]);

  const del = async (s: Service) => {
    if (!confirm(`سرویس «${s.title}» حذف شود؟`)) return;
    await api(`/api/web-services?id=${s.id}`, { method: "DELETE" });
    toast({ title: "سرویس حذف شد" });
    refetch();
  };
  const toggle = async (s: Service) => {
    await api("/api/web-services", { method: "POST", body: JSON.stringify({ id: s.id, sourceType: s.sourceType ?? "table", sqlText: s.sourceType === "sql" ? s.sqlText ?? undefined : undefined, table: s.table, title: s.title, format: s.format, authType: s.authType, rowLimit: s.rowLimit, isActive: !s.isActive }) });
    refetch();
  };
  const regenKey = async (s: Service) => {
    await api("/api/web-services", { method: "POST", body: JSON.stringify({ id: s.id, sourceType: s.sourceType ?? "table", sqlText: s.sourceType === "sql" ? s.sqlText ?? undefined : undefined, table: s.table, title: s.title, format: s.format, authType: s.authType, rowLimit: s.rowLimit, isActive: s.isActive, regenerateKey: true }) });
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
    {
      header: "منبع",
      cell: (s) =>
        s.sourceType === "sql" ? (
          <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300 text-[10px]">پرس‌وجو</Badge>
        ) : (
          <Badge variant="outline" className="font-mono text-[10px]" dir="ltr">{s.table}</Badge>
        ),
    },
    { header: "فرمت", cell: (s) => <Badge variant="secondary" className="text-[10px]">{FORMAT_LABEL[s.format] ?? s.format}</Badge> },
    { header: "احراز", cell: (s) => s.authType === "none" ? <span className="text-[10px] text-amber-600">عمومی</span> : <span className="flex items-center gap-1 text-[10px] text-emerald-600"><KeyRound className="h-3 w-3" /> کلید API</span> },
    { header: "فراخوانی", cell: (s) => <span className="text-xs tabular-nums">{faNum(s.callCount)} بار</span> },
    { header: "آخرین", cell: (s) => <span className="text-xs text-muted-foreground">{s.lastCallAt ? <DateCell value={s.lastCallAt} /> : "—"}</span> },
    { header: "فعال", cell: (s) => <Switch checked={s.isActive} onCheckedChange={() => toggle(s)} /> },
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
        subtitle="ساخت REST API روی دیتابیس — جدولی یا با SQL آزاد + استودیوی پرس‌وجو و تستر وب‌سرویس"
        icon={<PlugZap className="h-5 w-5" />}
        actions={<Button size="sm" className="gap-1.5" onClick={() => setWizard(true)}><Plus className="h-4 w-4" /> سرویس جدید</Button>}
      />

      <Tabs defaultValue="services">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="services" className="gap-1.5"><Layers className="h-4 w-4" /> سرویس‌های من</TabsTrigger>
          <TabsTrigger value="studio" className="gap-1.5"><Database className="h-4 w-4" /> استودیوی پرس‌وجو</TabsTrigger>
          <TabsTrigger value="tester" className="gap-1.5"><Globe className="h-4 w-4" /> تستر وب‌سرویس</TabsTrigger>
        </TabsList>

        <TabsContent value="services" className="mt-4">
          <SectionCard title="سرویس‌های منتشرشده" subtitle="هر سرویس یک آدرس عمومی دارد که با پارامترهای فیلتر و فرمت فراخوانی می‌شود">
            <div className="rounded-2xl border bg-card shadow-sm">
              <DataTable columns={columns} rows={data?.services ?? []} loading={loading} />
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="studio" className="mt-4">
          <QueryStudio tables={liveTables} loading={schemaLoading} onSaved={() => { refetch(); toast({ title: "سرویس از پرس‌وجو ساخته شد" }); }} />
        </TabsContent>

        <TabsContent value="tester" className="mt-4">
          <ApiTester services={data?.services ?? []} />
        </TabsContent>
      </Tabs>

      <WizardDialog open={wizard} tables={liveTables} onClose={() => setWizard(false)} onSaved={() => { setWizard(false); refetch(); toast({ title: "سرویس ساخته شد" }); }} />
      <TestDialog service={testOpen} onClose={() => setTestOpen(null)} />
    </div>
  );
}

// ============================================================ استودیوی پرس‌وجو
type JoinRow = { type: "INNER JOIN" | "LEFT JOIN"; table: string; leftCol: string; rightCol: string };
type WhereRow = { col: string; op: string; value: string };

function QueryStudio({ tables, loading, onSaved }: { tables: CatalogTable[]; loading: boolean; onSaved: () => void }) {
  const { toast } = useToast();
  const [search, setSearch] = React.useState("");
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [sql, setSql] = React.useState("SELECT *\nFROM Users\nLIMIT 20");
  const [baseTable, setBaseTable] = React.useState("");
  const [joins, setJoins] = React.useState<JoinRow[]>([]);
  const [wheres, setWheres] = React.useState<WhereRow[]>([]);
  const [orderBy, setOrderBy] = React.useState("");
  const [orderDir, setOrderDir] = React.useState("ASC");
  const [result, setResult] = React.useState<{ columns: string[]; rows: Record<string, unknown>[]; total: number; elapsedMs: number; truncated: boolean } | null>(null);
  const [running, setRunning] = React.useState(false);
  const [runError, setRunError] = React.useState<string | null>(null);
  const [saveOpen, setSaveOpen] = React.useState(false);

  const colsOf = (t: string | null) => tables.find((x) => x.name === t)?.columns ?? [];
  const filtered = tables.filter((t) => !search || t.name.toLowerCase().includes(search.toLowerCase()) || (t.label ?? "").includes(search));

  const insertAtCursor = (text: string) => {
    setSql((prev) => `${prev}\n${text}`);
  };

  // تولید SQL از سازندهٔ گرافیکی
  const buildSql = () => {
    if (!baseTable) { toast({ title: "ابتدا جدول پایه را انتخاب کنید" }); return; }
    const parts: string[] = [`SELECT *`];
    parts.push(`FROM \`${baseTable}\``);
    for (const j of joins) parts.push(`${j.type} \`${j.table}\` ON \`${j.leftCol.split(".")[0] ?? ""}\`.\`${j.leftCol.split(".")[1] ?? ""}\` = \`${j.table}\`.\`${j.rightCol}\``);
    const w = wheres.filter((x) => x.col && x.value !== "");
    if (w.length) {
      parts.push("WHERE " + w.map((x) => {
        const v = x.value.replace(/'/g, "''");
        return `\`${x.col}\` ${x.op} ${x.op === "LIKE" ? `'%${v}%'` : `'${v}'`}`;
      }).join("\n  AND "));
    }
    if (orderBy) parts.push(`ORDER BY \`${orderBy}\` ${orderDir}`);
    parts.push("LIMIT 50");
    setSql(parts.join("\n"));
  };

  const run = React.useCallback(async () => {
    setRunning(true);
    setRunError(null);
    try {
      const r = await api<{ columns: string[]; rows: Record<string, unknown>[]; total: number; elapsedMs: number; truncated: boolean }>(
        "/api/web-services/query-run", { method: "POST", body: JSON.stringify({ sql }) }
      );
      setResult(r);
    } catch (e) {
      setRunError((e as Error).message);
      setResult(null);
    }
    setRunning(false);
  }, [sql]);

  // Ctrl+Enter برای اجرا
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); run(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [run]);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_1fr]">
      {/* کاوشگر جداول */}
      <SectionCard bodyClass="p-3" className="self-start">
        <div className="mb-2 flex items-center gap-2">
          <Table2 className="h-4 w-4 text-primary" />
          <p className="text-xs font-extrabold">جدول‌های دیتابیس ({faNum(tables.length)})</p>
        </div>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جستجوی جدول..." className="mb-2 h-8 text-xs" />
        <div className="max-h-[420px] space-y-1 overflow-auto pl-1">
          {loading && <LoadingView label="خواندن جدول‌ها..." />}
          {!loading && filtered.map((t) => (
            <div key={t.name} className="rounded-xl border bg-card">
              <button
                className="flex w-full items-center gap-2 px-2.5 py-2 text-right"
                onClick={() => setExpanded(expanded === t.name ? null : t.name)}
              >
                <Table2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[11px] font-bold" dir="ltr">{t.name}</span>
                  {t.label && <span className="block truncate text-[10px] text-muted-foreground">{t.label}</span>}
                </span>
                {t.rowCount != null && <span className="shrink-0 text-[9.5px] tabular-nums text-muted-foreground">{faNum(t.rowCount)}</span>}
              </button>
              {expanded === t.name && (
                <div className="flex flex-wrap gap-1 border-t bg-muted/30 p-2">
                  {t.columns.map((c) => (
                    <button
                      key={c}
                      onClick={() => insertAtCursor(`\`${t.name}\`.\`${c}\``)}
                      title="درج در پرس‌وجو"
                      className="rounded-md bg-card px-1.5 py-0.5 font-mono text-[9.5px] text-muted-foreground shadow-sm hover:bg-primary hover:text-white"
                      dir="ltr"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ویرایشگر + سازندهٔ گرافیکی + نتیجه */}
      <div className="space-y-4">
        {/* سازندهٔ گرافیکی Join */}
        <SectionCard title="سازندهٔ گرافیکی پرس‌وجو" subtitle="جدول‌ها را با هم متصل کنید — SQL به‌صورت خودکار ساخته می‌شود">
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <Label className="text-[11px]">جدول پایه</Label>
                <Select value={baseTable || "none"} onValueChange={(v) => { setBaseTable(v); setJoins([]); setWheres([]); setOrderBy(""); }}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="انتخاب کنید" /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value="none" disabled>انتخاب جدول</SelectItem>
                    {tables.map((t) => <SelectItem key={t.name} value={t.name}>{t.label ?? t.name} — <span dir="ltr" className="font-mono">{t.name}</span></SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px]">مرتب‌سازی بر اساس</Label>
                <Select value={orderBy || "none"} onValueChange={(v) => setOrderBy(v === "none" ? "" : v)}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent className="max-h-56">
                    <SelectItem value="none">بدون مرتب‌سازی</SelectItem>
                    {[...colsOf(baseTable), ...joins.flatMap((j) => colsOf(j.table).map((c) => `${j.table}.${c}`))].map((c) => (
                      <SelectItem key={c} value={c}><span dir="ltr" className="font-mono text-[10px]">{c}</span></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px]">ترتیب</Label>
                <Select value={orderDir} onValueChange={setOrderDir}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="ASC">صعودی ASC</SelectItem><SelectItem value="DESC">نزولی DESC</SelectItem></SelectContent>
                </Select>
              </div>
            </div>

            {/* Joinها */}
            {baseTable && (
              <div className="space-y-2">
                {joins.map((j, i) => {
                  const leftSources = [{ name: baseTable, columns: colsOf(baseTable) }, ...joins.slice(0, i).map((x) => ({ name: x.table, columns: colsOf(x.table) }))];
                  return (
                    <div key={i} className="grid grid-cols-[110px_1fr_1fr_36px] items-center gap-2 rounded-xl border bg-muted/20 p-2">
                      <Select value={j.type} onValueChange={(v) => setJoins((p) => p.map((x, k) => (k === i ? { ...x, type: v as JoinRow["type"] } : x)))}>
                        <SelectTrigger className="h-8 text-[10.5px]" dir="ltr"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="INNER JOIN">INNER</SelectItem><SelectItem value="LEFT JOIN">LEFT</SelectItem></SelectContent>
                      </Select>
                      <div className="grid grid-cols-2 gap-1.5">
                        <JoinTableSelect tables={tables} value={j.table} onChange={(v) => setJoins((p) => p.map((x, k) => (k === i ? { ...x, table: v, rightCol: "" } : x)))} />
                        <Select value={j.rightCol || "none"} onValueChange={(v) => setJoins((p) => p.map((x, k) => (k === i ? { ...x, rightCol: v } : x)))}>
                          <SelectTrigger className="h-8 text-[10.5px]" dir="ltr"><SelectValue placeholder="ستون" /></SelectTrigger>
                          <SelectContent className="max-h-52">{colsOf(j.table).map((c) => <SelectItem key={c} value={c}><span dir="ltr" className="font-mono text-[10px]">{c}</span></SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <Select value={j.leftCol.split(".")[0] || "none"} onValueChange={() => {}}>
                          <SelectTrigger className="h-8 text-[10.5px]" dir="ltr"><SelectValue placeholder="از جدول" /></SelectTrigger>
                          <SelectContent className="max-h-52">
                            {leftSources.map((s) => <SelectItem key={s.name} value={s.name}><span dir="ltr" className="font-mono text-[10px]">{s.name}</span></SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Select value={j.leftCol.includes(".") ? j.leftCol : "none"} onValueChange={(v) => setJoins((p) => p.map((x, k) => (k === i ? { ...x, leftCol: v } : x)))}>
                          <SelectTrigger className="h-8 text-[10.5px]" dir="ltr"><SelectValue placeholder="ستون" /></SelectTrigger>
                          <SelectContent className="max-h-52">
                            {leftSources.flatMap((s) => s.columns.map((c) => `${s.name}.${c}`)).map((c) => <SelectItem key={c} value={c}><span dir="ltr" className="font-mono text-[10px]">{c}</span></SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setJoins((p) => p.filter((_, k) => k !== i))}><X className="h-3.5 w-3.5 text-rose-500" /></Button>
                    </div>
                  );
                })}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="h-8 gap-1 text-[11px]" onClick={() => setJoins((p) => [...p, { type: "INNER JOIN", table: tables.find((t) => t.name !== baseTable)?.name ?? "", leftCol: "", rightCol: "" }])}>
                    <Plus className="h-3 w-3" /> افزودن Join
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 gap-1 text-[11px]" onClick={() => setWheres((p) => [...p, { col: colsOf(baseTable)[0] ?? "", op: "=", value: "" }])}>
                    <Plus className="h-3 w-3" /> افزودن شرط WHERE
                  </Button>
                  <Button size="sm" className="h-8 gap-1 text-[11px]" onClick={buildSql}><Braces className="h-3.5 w-3.5" /> ساخت SQL</Button>
                </div>
                {/* WHEREها */}
                {wheres.map((w, i) => (
                  <div key={`w${i}`} className="grid grid-cols-[1fr_90px_1fr_36px] items-center gap-2 rounded-xl border bg-muted/20 p-2">
                    <Select value={w.col || "none"} onValueChange={(v) => setWheres((p) => p.map((x, k) => (k === i ? { ...x, col: v } : x)))}>
                      <SelectTrigger className="h-8 text-[10.5px]" dir="ltr"><SelectValue placeholder="ستون" /></SelectTrigger>
                      <SelectContent className="max-h-52">
                        {[...colsOf(baseTable).map((c) => `${baseTable}.${c}`), ...joins.flatMap((j) => colsOf(j.table).map((c) => `${j.table}.${c}`))].map((c) => (
                          <SelectItem key={c} value={c}><span dir="ltr" className="font-mono text-[10px]">{c}</span></SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={w.op} onValueChange={(v) => setWheres((p) => p.map((x, k) => (k === i ? { ...x, op: v } : x)))}>
                      <SelectTrigger className="h-8 text-[10.5px]" dir="ltr"><SelectValue /></SelectTrigger>
                      <SelectContent>{OPS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input value={w.value} onChange={(e) => setWheres((p) => p.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)))} className="h-8 text-xs" placeholder="مقدار" dir="ltr" />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setWheres((p) => p.filter((_, k) => k !== i))}><X className="h-3.5 w-3.5 text-rose-500" /></Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SectionCard>

        {/* ویرایشگر SQL */}
        <SectionCard
          title="پرس‌وجوی SQL"
          subtitle="دستور SELECT آزاد — Ctrl+Enter برای اجرا | کلیک روی جدول/ستون در پنل کنار، نام آن درج می‌شود"
          actions={
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-8 gap-1 text-[11px]" onClick={() => setSaveOpen(true)} disabled={!result}><Save className="h-3.5 w-3.5" /> ساخت وب‌سرویس</Button>
              <Button size="sm" className="h-8 gap-1 text-[11px]" onClick={run} disabled={running}>
                {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} اجرا
              </Button>
            </div>
          }
        >
          <Textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            rows={7}
            dir="ltr"
            className="resize-y bg-slate-950 font-mono text-[12.5px] leading-6 text-slate-100 selection:bg-primary/40 focus-visible:ring-0"
            spellCheck={false}
          />
          {runError && (
            <p className="mt-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-[11.5px] text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">{runError}</p>
          )}
        </SectionCard>

        {/* نتیجه */}
        {result && (
          <SectionCard
            title="نتیجهٔ پرس‌وجو"
            subtitle={`${faNum(result.total)} ردیف — ${faNum(result.elapsedMs)} میلی‌ثانیه${result.truncated ? " — نمایش تا ۵۰۰ ردیف" : ""}`}
          >
            <div className="max-h-[420px] overflow-auto rounded-xl border">
              <table className="w-full border-collapse text-right text-[11px]" dir="rtl">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    {result.columns.map((c) => (
                      <th key={c} className="whitespace-nowrap border-b px-2.5 py-2 font-mono font-bold text-[10px]" dir="ltr">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r, i) => (
                    <tr key={i} className={i % 2 ? "bg-muted/25" : ""}>
                      {result.columns.map((c) => (
                        <td key={c} className="max-w-56 truncate border-b px-2.5 py-1.5" title={String(r[c] ?? "")}>{r[c] === null ? <span className="text-muted-foreground/50">NULL</span> : String(r[c] ?? "")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        )}
      </div>

      <SaveAsServiceDialog
        open={saveOpen}
        sql={sql}
        onClose={() => setSaveOpen(false)}
        onSaved={() => { setSaveOpen(false); onSaved(); }}
      />
    </div>
  );
}

function JoinTableSelect({ tables, value, onChange }: { tables: CatalogTable[]; value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value || "none"} onValueChange={onChange}>
      <SelectTrigger className="h-8 text-[10.5px]" dir="ltr"><SelectValue placeholder="جدول" /></SelectTrigger>
      <SelectContent className="max-h-52">
        {tables.map((t) => <SelectItem key={t.name} value={t.name}><span dir="ltr" className="font-mono text-[10px]">{t.name}</span></SelectItem>)}
      </SelectContent>
    </Select>
  );
}

// ------------------------------------------------- ذخیرهٔ پرس‌وجو به‌عنوان سرویس
function SaveAsServiceDialog({ open, sql, onClose, onSaved }: { open: boolean; sql: string; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [title, setTitle] = React.useState("");
  const [format, setFormat] = React.useState("json");
  const [authType, setAuthType] = React.useState("apikey");
  const [rowLimit, setRowLimit] = React.useState(1000);
  const [busy, setBusy] = React.useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const r = await api<{ slug: string }>("/api/web-services", {
        method: "POST",
        body: JSON.stringify({ sourceType: "sql", sqlText: sql, title, format, authType, rowLimit }),
      });
      toast({ title: `سرویس ساخته شد: /api/ws/${r.slug}` });
      onSaved();
    } catch (e) { toast({ title: (e as Error).message, variant: "destructive" }); }
    setBusy(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg p-6" dir="rtl">
        <DialogHeader><DialogTitle className="text-right">وب‌سرویس از پرس‌وجو</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">عنوان</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً: گزارش جلسات با نام مشاور" className="h-9" /></div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label className="text-xs">فرمت</Label>
              <Select value={format} onValueChange={setFormat}><SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="json">JSON</SelectItem><SelectItem value="xml">XML</SelectItem><SelectItem value="csv">CSV</SelectItem></SelectContent></Select>
            </div>
            <div><Label className="text-xs">احراز</Label>
              <Select value={authType} onValueChange={setAuthType}><SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="apikey">کلید API</SelectItem><SelectItem value="none">عمومی</SelectItem></SelectContent></Select>
            </div>
            <div><Label className="text-xs">سقف ردیف</Label><Input type="number" min={1} max={10000} value={rowLimit} onChange={(e) => setRowLimit(Number(e.target.value))} className="h-9" /></div>
          </div>
          <pre className="max-h-32 overflow-auto rounded-xl bg-slate-950 p-2.5 text-left font-mono text-[10px] text-slate-300" dir="ltr">{sql.slice(0, 400)}</pre>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>انصراف</Button>
            <Button size="sm" onClick={save} disabled={!title.trim() || busy}>ساخت سرویس</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================ تستر وب‌سرویس
type SendResult = { status: number; statusText: string; timeMs: number; size: number; headers: Record<string, string>; body: string };
type HistItem = { method: string; url: string; status: number; time: string };

function ApiTester({ services }: { services: Service[] }) {
  const [method, setMethod] = React.useState("GET");
  const [url, setUrl] = React.useState("");
  const [headers, setHeaders] = React.useState<{ k: string; v: string }[]>([{ k: "Content-Type", v: "application/json" }]);
  const [body, setBody] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [result, setResult] = React.useState<SendResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showHeaders, setShowHeaders] = React.useState(false);
  const [history, setHistory] = React.useState<HistItem[]>([]);

  React.useEffect(() => {
    try { setHistory(JSON.parse(localStorage.getItem("rz_api_history") ?? "[]")); } catch { /* noop */ }
  }, []);

  const send = async () => {
    setSending(true);
    setError(null);
    setResult(null);
    const started = Date.now();
    try {
      const h: Record<string, string> = {};
      for (const x of headers) if (x.k.trim()) h[x.k.trim()] = x.v;
      const r = await api<SendResult>("/api/api-client", {
        method: "POST",
        body: JSON.stringify({ method, url, headers: h, body: ["GET", "HEAD"].includes(method) ? undefined : body }),
      });
      setResult(r);
      const item: HistItem = { method, url, status: r.status, time: new Date().toLocaleTimeString("fa-IR") };
      const next = [item, ...history.filter((x) => !(x.url === url && x.method === method))].slice(0, 15);
      setHistory(next);
      localStorage.setItem("rz_api_history", JSON.stringify(next));
    } catch (e) {
      setError((e as Error).message);
    }
    setSending(false);
  };

  const pretty = React.useMemo(() => {
    if (!result) return "";
    try { return JSON.stringify(JSON.parse(result.body), null, 2); } catch { return result.body; }
  }, [result]);

  const fillOwn = (s: Service) => {
    setMethod("GET");
    setUrl(`${window.location.origin}/api/ws/${s.slug}?limit=5`);
    if (s.key) setHeaders((p) => [...p.filter((x) => x.k !== "X-API-Key"), { k: "X-API-Key", v: s.key! }]);
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        {/* نوار آدرس */}
        <SectionCard bodyClass="p-4">
          <div className="flex gap-2">
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="h-9 w-[110px] font-mono text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => <SelectItem key={m} value={m}><span dir="ltr" className="font-mono">{m}</span></SelectItem>)}
              </SelectContent>
            </Select>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="https://example.com/api/...  یا  /api/ws/..." className="h-9 flex-1 font-mono text-xs" dir="ltr" />
            <Button className="brand-gradient h-9 gap-1.5 px-4 text-white" onClick={send} disabled={sending || !url.trim()}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} ارسال
            </Button>
          </div>
          {/* دکمه‌های سریع هدر */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[
              { label: "+ Content-Type JSON", k: "Content-Type", v: "application/json" },
              { label: "+ Authorization Bearer", k: "Authorization", v: "Bearer " },
              { label: "+ X-API-Key", k: "X-API-Key", v: "" },
              { label: "+ Accept JSON", k: "Accept", v: "application/json" },
            ].map((q) => (
              <button key={q.label} onClick={() => setHeaders((p) => [...p, { ...q }])} className="rounded-full border px-2.5 py-1 text-[10px] text-muted-foreground hover:bg-accent">{q.label}</button>
            ))}
          </div>
        </SectionCard>

        {/* هدرها و بدنه */}
        <SectionCard title="هدرها و بدنهٔ درخواست">
          <div className="space-y-2">
            {headers.map((h, i) => (
              <div key={i} className="grid grid-cols-[1fr_1.4fr_36px] gap-2">
                <Input value={h.k} onChange={(e) => setHeaders((p) => p.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))} className="h-8 font-mono text-[11px]" dir="ltr" placeholder="Header" />
                <Input value={h.v} onChange={(e) => setHeaders((p) => p.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))} className="h-8 font-mono text-[11px]" dir="ltr" placeholder="Value" />
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setHeaders((p) => p.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5 text-rose-500" /></Button>
              </div>
            ))}
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-[11px]" onClick={() => setHeaders((p) => [...p, { k: "", v: "" }])}><Plus className="h-3 w-3" /> هدر جدید</Button>
            {!["GET", "HEAD"].includes(method) && (
              <div>
                <Label className="text-xs">بدنهٔ درخواست (Body)</Label>
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} dir="ltr" className="bg-slate-950 font-mono text-[12px] text-slate-100" placeholder='{"key": "value"}' spellCheck={false} />
              </div>
            )}
          </div>
        </SectionCard>

        {/* پاسخ */}
        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-[12.5px] text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">{error}</div>
        )}
        {result && (
          <SectionCard
            title="پاسخ"
            subtitle={`${faNum(result.timeMs)} میلی‌ثانیه — ${faNum(result.size)} کاراکتر`}
            actions={
              <div className="flex items-center gap-2">
                <Badge variant={result.status < 400 ? "secondary" : "destructive"} className="font-mono">HTTP {result.status} {result.statusText}</Badge>
                <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setShowHeaders((v) => !v)}>{showHeaders ? "بدنه" : "هدرهای پاسخ"}</Button>
                <Button size="sm" variant="ghost" className="h-7 gap-1 text-[11px]" onClick={() => { navigator.clipboard.writeText(pretty); }}><Copy className="h-3 w-3" /> کپی</Button>
              </div>
            }
          >
            {showHeaders ? (
              <div className="space-y-1 rounded-xl border bg-muted/30 p-3 font-mono text-[10.5px]" dir="ltr">
                {Object.entries(result.headers).map(([k, v]) => <p key={k}><b>{k}:</b> {v}</p>)}
              </div>
            ) : (
              <pre className="max-h-[420px] overflow-auto rounded-xl border bg-slate-950 p-3 text-left font-mono text-[11px] leading-5 text-slate-100" dir="ltr">{pretty}</pre>
            )}
          </SectionCard>
        )}
      </div>

      {/* ستون کنار: سرویس‌های خودم + تاریخچه */}
      <div className="space-y-4">
        <SectionCard title="سرویس‌های خودم" subtitle="کلیک = پر شدن آدرس و کلید">
          <div className="space-y-1.5">
            {services.length === 0 && <p className="text-[11px] text-muted-foreground">هنوز سرویسی نساخته‌اید.</p>}
            {services.slice(0, 8).map((s) => (
              <button key={s.id} onClick={() => fillOwn(s)} className="w-full rounded-xl border bg-card px-2.5 py-2 text-right hover:border-ring">
                <p className="truncate text-[11.5px] font-bold">{s.title}</p>
                <p className="font-mono text-[9.5px] text-muted-foreground" dir="ltr">/api/ws/{s.slug}</p>
              </button>
            ))}
          </div>
        </SectionCard>
        <SectionCard title="تاریخچه" subtitle="۱۵ فراخوانی آخر">
          {history.length === 0 ? <p className="text-[11px] text-muted-foreground">هنوز فراخوانی انجام نشده.</p> : (
            <div className="space-y-1">
              {history.map((h, i) => (
                <button key={i} onClick={() => { setMethod(h.method); setUrl(h.url); }} className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-right hover:bg-accent">
                  <Badge variant={h.status < 400 ? "secondary" : "destructive"} className="px-1 py-0 font-mono text-[9px]">{h.status}</Badge>
                  <span className="min-w-0 flex-1 truncate font-mono text-[10px]" dir="ltr">{h.url}</span>
                </button>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ wizard
function WizardDialog({ open, tables, onClose, onSaved }: { open: boolean; tables: CatalogTable[]; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = React.useState("");
  const [table, setTable] = React.useState("");
  const [columns, setColumns] = React.useState<string[]>([]);
  const [format, setFormat] = React.useState("json");
  const [authType, setAuthType] = React.useState("apikey");
  const [rowLimit, setRowLimit] = React.useState(1000);
  const [orderBy, setOrderBy] = React.useState("id DESC");
  const [filters, setFilters] = React.useState<{ col: string; op: string; value: string }[]>([]);
  const sel = tables.find((t) => t.name === table);

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
                  {tables.map((t) => <SelectItem key={t.name} value={t.name}>{t.label ?? t.name} (<span dir="ltr" className="font-mono">{t.name}</span>)</SelectItem>)}
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
                <Label className="text-xs">ستون‌ها (خالی = همهٔ ستون‌های جدول)</Label>
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
