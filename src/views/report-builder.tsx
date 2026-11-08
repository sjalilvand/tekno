"use client";
// گزارش‌ساز حرفه‌ای — انتخاب منبع داده، ستون‌ها، فیلترها، گروه‌بندی
// خروجی: جدول تعاملی + CSV (سازگار با اکسل فارسی) + چاپ A4 + قالب‌های ذخیره‌شده
import * as React from "react";
import { PageHeader, SectionCard, LoadingView } from "@/components/shared";
import { BarChartX } from "@/components/charts";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { faNum, faMoney, jDate, jDateTime } from "@/lib/jalali";
import { api, useQuery } from "@/lib/client";
import { BRAND } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CalendarCheck, Wallet, Users, CalendarClock, ArrowLeftRight, MessageSquareText,
  Play, Download, Printer, Save, FolderOpen, Trash2, FileBarChart2, X, Database, Info,
} from "lucide-react";

// ---------------- تعریف منابع گزارش ----------------
type DatasetKey = "events" | "finance" | "users" | "reserves" | "referrals" | "sms";

const DATASETS: { key: DatasetKey; label: string; desc: string; icon: React.ReactNode; statuses: string[]; hasFinance: boolean }[] = [
  { key: "events", label: "جلسات مشاوره", desc: "همهٔ جلسات با وضعیت، مراجع، خدمت و مرکز", icon: <CalendarCheck className="h-4.5 w-4.5" />, statuses: ["تایید نهایی", "در انتظار پذیرش", "در انتظار تایید مدیر مرکز", "در انتظار تایید مسئول فنی", "در انتظار تایید نظارت حرفه‌ای", "در انتظار تایید ناظر استان", "رد شده", "ناتمام"], hasFinance: true },
  { key: "finance", label: "مالی و تعرفه‌ها", desc: "تعرفه‌ها و سهم‌های مالی جلسات", icon: <Wallet className="h-4.5 w-4.5" />, statuses: ["تایید نهایی", "رد شده", "ناتمام"], hasFinance: true },
  { key: "users", label: "کاربران", desc: "مشتریان، مشاوران و کارمندان", icon: <Users className="h-4.5 w-4.5" />, statuses: [], hasFinance: false },
  { key: "reserves", label: "رزروها", desc: "رزروهای جلسات و وضعیت آن‌ها", icon: <CalendarClock className="h-4.5 w-4.5" />, statuses: [], hasFinance: false },
  { key: "referrals", label: "ارجاعات سها", desc: "ارجاع‌های دریافتی از سامانهٔ سها", icon: <ArrowLeftRight className="h-4.5 w-4.5" />, statuses: ["در انتظار", "پذیرش‌شده", "ارجاع‌شده", "منقضی"], hasFinance: false },
  { key: "sms", label: "پیامک‌ها", desc: "صف پیامک و وضعیت ارسال", icon: <MessageSquareText className="h-4.5 w-4.5" />, statuses: ["در صف", "ارسال شده", "ناموفق"], hasFinance: false },
];

type ReportResponse = {
  columns: Record<string, { label: string; type?: string }> | null;
  rows: any[];
  total: number;
  page?: number;
  pageSize?: number;
  summary?: { groupBy: { key: string; label: string }; metric: { key: string; label: string }; sourceRows: number; capped: boolean } | null;
  groupKeys?: Record<string, { label: string }> | null;
  metrics?: Record<string, { label: string }> | null;
};

type SavedPreset = { name: string; config: RunConfig };

type CoverageData = {
  sources: { key: string; label: string; count: number; first: string | null; last: string | null }[];
  checkedAt: string;
};

type RunConfig = {
  dataset: DatasetKey;
  mode: "detail" | "summary";
  columns: string[];
  filters: { q: string; status: string; serviceId: string; centerId: string; from: string; to: string };
  groupBy: string;
  metric: string;
  sortKey: string;
  sortDir: "asc" | "desc";
};

const EMPTY_FILTERS = { q: "", status: "", serviceId: "", centerId: "", from: "", to: "" };
const PRESET_KEY = "raz-report-presets";

export function ReportBuilderView() {
  const meta = useQuery<any>(() => api("/api/meta"), []);
  const coverage = useQuery<CoverageData>(() => api("/api/bi/coverage"), []);

  const [dataset, setDataset] = React.useState<DatasetKey>("events");
  const [mode, setMode] = React.useState<"detail" | "summary">("detail");
  const [columns, setColumns] = React.useState<string[]>(["startDate", "userName", "service", "center", "status", "userTariff"]);
  const [filters, setFilters] = React.useState({ ...EMPTY_FILTERS });
  const [groupBy, setGroupBy] = React.useState("status");
  const [metric, setMetric] = React.useState("count");
  const [sortKey, setSortKey] = React.useState("startDate");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);

  const [result, setResult] = React.useState<ReportResponse | null>(null);
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [presets, setPresets] = React.useState<SavedPreset[]>([]);
  const [presetName, setPresetName] = React.useState("");
  const [presetMenu, setPresetMenu] = React.useState(false);

  React.useEffect(() => {
    try {
      setPresets(JSON.parse(localStorage.getItem(PRESET_KEY) ?? "[]"));
    } catch {}
  }, []);

  const ds = DATASETS.find((d) => d.key === dataset)!;
  const colDefs = result?.columns ?? null;
  const groupKeys = result?.groupKeys ?? null;
  const metrics = result?.metrics ?? null;

  const run = async (p = 1) => {
    setRunning(true);
    setError(null);
    setPage(p);
    try {
      const data = await api<ReportResponse>("/api/report", {
        method: "POST",
        body: JSON.stringify({
          dataset, mode, columns,
          filters: {
            ...filters,
            serviceId: filters.serviceId || undefined,
            centerId: filters.centerId || undefined,
          },
          groupBy, metric,
          sort: { key: sortKey, dir: sortDir },
          page: p, pageSize,
        }),
      });
      setResult(data);
    } catch (e: any) {
      setError(e?.message ?? "خطا در تولید گزارش");
      setResult(null);
    } finally {
      setRunning(false);
    }
  };

  const changeDataset = (key: DatasetKey) => {
    setDataset(key);
    setResult(null);
    setError(null);
    setPage(1);
    const d = DATASETS.find((x) => x.key === key)!;
    if (key === "users") { setColumns(["nid", "name", "family", "mobile", "gender", "signupDate"]); setSortKey("id"); setGroupBy("gender"); }
    else if (key === "reserves") { setColumns(["date", "userName", "eventTrackingCode", "eventStatus"]); setSortKey("date"); setGroupBy("month"); }
    else if (key === "referrals") { setColumns(["refId", "creationDate", "userName", "service", "sessionsCount", "status"]); setSortKey("id"); setGroupBy("status"); }
    else if (key === "sms") { setColumns(["createTime", "number", "receiverName", "message", "status"]); setSortKey("id"); setGroupBy("status"); }
    else if (key === "finance") { setColumns(["startDate", "userName", "service", "center", "userTariff", "acceptorFee", "centerFee"]); setSortKey("startDate"); setGroupBy("month"); setMetric("sum:userTariff"); }
    else { setColumns(["startDate", "userName", "service", "center", "status", "userTariff"]); setSortKey("startDate"); setGroupBy("status"); setMetric("count"); }
    if (!d.statuses.includes(filters.status)) setFilters((f) => ({ ...f, status: "" }));
  };

  // ---------------- CSV ----------------
  const exportCsv = () => {
    if (!result?.rows?.length) return;
    let header: string[], lines: string[];
    if (mode === "detail" && colDefs) {
      header = Array.from(columns).map((c) => colDefs[c]?.label ?? c);
      lines = result.rows.map((r) => columns.map((c) => csvCell(r[c], colDefs[c]?.type)).join(","));
    } else {
      header = [result.summary?.groupBy.label ?? "گروه", result.summary?.metric.label ?? "مقدار"];
      lines = result.rows.map((r) => `${csvCell(r.name)},${csvCell(r.value)}`);
    }
    const bom = "\uFEFF";
    const csv = bom + [header.map(csvCell).join(","), ...lines].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `report-${dataset}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ---------------- قالب‌های ذخیره‌شده ----------------
  const savePreset = () => {
    const name = presetName.trim() || `قالب ${presets.length + 1}`;
    const next = [...presets.filter((p) => p.name !== name), { name, config: { dataset, mode, columns, filters, groupBy, metric, sortKey, sortDir } }];
    setPresets(next);
    localStorage.setItem(PRESET_KEY, JSON.stringify(next));
    setPresetName("");
    setPresetMenu(false);
  };
  const loadPreset = (p: SavedPreset) => {
    const c = p.config;
    setDataset(c.dataset); setMode(c.mode); setColumns(c.columns); setFilters({ ...EMPTY_FILTERS, ...c.filters });
    setGroupBy(c.groupBy); setMetric(c.metric); setSortKey(c.sortKey); setSortDir(c.sortDir);
    setResult(null); setPresetMenu(false);
  };
  const deletePreset = (p: SavedPreset) => {
    const next = presets.filter((x) => x.name !== p.name);
    setPresets(next);
    localStorage.setItem(PRESET_KEY, JSON.stringify(next));
  };

  const totalPages = result?.page && result?.pageSize ? Math.ceil((result.total ?? 0) / result.pageSize) : 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="گزارش‌ساز حرفه‌ای"
        subtitle="منبع داده، ستون‌ها، فیلترها و گروه‌بندی را انتخاب کنید — خروجی CSV و چاپ A4"
        icon={<FileBarChart2 className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2 no-print">
            {presets.length > 0 && (
              <div className="relative">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setPresetMenu((v) => !v)}>
                  <FolderOpen className="h-3.5 w-3.5" /> قالب‌های من ({faNum(presets.length)})
                </Button>
                {presetMenu && (
                  <div className="absolute left-0 top-full z-20 mt-1 w-64 rounded-xl border bg-popover p-2 shadow-lg">
                    {presets.map((p) => (
                      <div key={p.name} className="flex items-center gap-1">
                        <button className="flex-1 rounded-lg px-2.5 py-1.5 text-right text-xs font-medium hover:bg-accent" onClick={() => loadPreset(p)}>
                          {p.name}
                        </button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-500" onClick={() => deletePreset(p)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-1">
              <Input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="نام قالب..." className="h-8 w-32 text-xs" />
              <Button variant="outline" size="sm" className="gap-1.5" onClick={savePreset}>
                <Save className="h-3.5 w-3.5" /> ذخیره
              </Button>
            </div>
          </div>
        }
      />

      {/* ۱) منبع داده */}
      <SectionCard title="۱) منبع داده" bodyClass="p-4">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
          {DATASETS.map((d) => {
            const cov = coverage.data?.sources.find((s) => s.key === d.key);
            return (
              <button
                key={d.key}
                onClick={() => changeDataset(d.key)}
                className={`rounded-xl border p-3 text-right transition-all ${dataset === d.key ? "border-ring bg-accent shadow-sm" : "bg-card hover:border-ring/60"}`}
              >
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${dataset === d.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {d.icon}
                </span>
                <p className="mt-2 text-xs font-bold">{d.label}</p>
                <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{d.desc}</p>
                <span className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${cov && cov.count > 0 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" : "bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300"}`}>
                  <Database className="h-3 w-3" />
                  {cov ? `${faNum(cov.count)} رکورد` : "..."}
                </span>
              </button>
            );
          })}
        </div>
      </SectionCard>

      {/* ۲) فیلترها */}
      <SectionCard title="۲) فیلترها" bodyClass="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-[11px]">جستجو</Label>
            <Input value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} placeholder="نام، کد، موضوع..." className="h-9 text-xs" />
          </div>
          {ds.statuses.length > 0 && (
            <div className="space-y-1">
              <Label className="text-[11px]">وضعیت</Label>
              <Select value={filters.status || "all"} onValueChange={(v) => setFilters((f) => ({ ...f, status: v === "all" ? "" : v }))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه</SelectItem>
                  {ds.statuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {ds.hasFinance && (
            <div className="space-y-1">
              <Label className="text-[11px]">خدمت</Label>
              <Select value={filters.serviceId || "all"} onValueChange={(v) => setFilters((f) => ({ ...f, serviceId: v === "all" ? "" : v }))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه</SelectItem>
                  {(meta.data?.services ?? []).map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.short || s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {ds.hasFinance && (
            <div className="space-y-1">
              <Label className="text-[11px]">مرکز</Label>
              <Select value={filters.centerId || "all"} onValueChange={(v) => setFilters((f) => ({ ...f, centerId: v === "all" ? "" : v }))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه</SelectItem>
                  {(meta.data?.centers ?? []).map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-[11px]">از تاریخ (شمسی)</Label>
            <JalaliDatePicker value={filters.from} onChange={(v) => setFilters((f) => ({ ...f, from: v }))} placeholder="انتخاب تاریخ" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">تا تاریخ (شمسی)</Label>
            <JalaliDatePicker value={filters.to} onChange={(v) => setFilters((f) => ({ ...f, to: v }))} placeholder="انتخاب تاریخ" />
          </div>
          {mode === "summary" && (
            <>
              <div className="space-y-1">
                <Label className="text-[11px]">گروه‌بندی بر اساس</Label>
                <Select value={groupBy} onValueChange={setGroupBy}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(groupKeys ?? {}).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">شاخص</Label>
                <Select value={metric} onValueChange={setMetric}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(metrics ?? {}).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          {mode === "detail" && (
            <>
              <div className="space-y-1">
                <Label className="text-[11px]">مرتب‌سازی</Label>
                <Select value={sortKey} onValueChange={setSortKey}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(colDefs ?? {})).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">ترتیب</Label>
                <Select value={sortDir} onValueChange={(v) => setSortDir(v as "asc" | "desc")}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">نزولی</SelectItem>
                    <SelectItem value="asc">صعودی</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>

        {/* حالت و ستون‌ها */}
        <div className="mt-4 border-t pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border p-0.5">
              <button onClick={() => setMode("detail")} className={`rounded-md px-3 py-1.5 text-xs font-bold ${mode === "detail" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>جزئیات</button>
              <button onClick={() => setMode("summary")} className={`rounded-md px-3 py-1.5 text-xs font-bold ${mode === "summary" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>خلاصه (گروه‌بندی)</button>
            </div>
            {mode === "summary" && !groupKeys && <span className="text-[10.5px] text-muted-foreground">برای انتخاب گروه‌بندی، ابتدا یک‌بار گزارش را اجرا کنید</span>}
          </div>

          {mode === "detail" && colDefs && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {Object.entries(colDefs).map(([k, v]) => {
                const active = columns.includes(k);
                return (
                  <button
                    key={k}
                    onClick={() => setColumns((c) => (active ? c.filter((x) => x !== k) : [...c, k]))}
                    className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${active ? "border-primary bg-accent text-accent-foreground" : "bg-card text-muted-foreground hover:border-ring"}`}
                  >
                    {v.label}
                  </button>
                );
              })}
            </div>
          )}
          {mode === "detail" && !colDefs && (
            <p className="mt-3 text-[11px] text-muted-foreground">فهرست ستون‌ها پس از اولین اجرا نمایش داده می‌شود (بر اساس منبع داده انتخابی).</p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button className="gap-1.5" onClick={() => run(1)} disabled={running}>
            {running ? <LoadingSpinner /> : <Play className="h-4 w-4" />}
            اجرای گزارش
          </Button>
          {result && (
            <>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv}>
                <Download className="h-3.5 w-3.5" /> خروجی CSV
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
                <Printer className="h-3.5 w-3.5" /> چاپ / PDF
              </Button>
            </>
          )}
          {filters !== EMPTY_FILTERS && (filters.q || filters.status || filters.from || filters.to) && (
            <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground" onClick={() => setFilters({ ...EMPTY_FILTERS })}>
              <X className="h-3.5 w-3.5" /> پاک‌کردن فیلترها
            </Button>
          )}
        </div>
      </SectionCard>

      {/* ۳) نتیجه */}
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-600 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      )}
      {running && !result && <LoadingView label="در حال تولید گزارش..." />}

      {result && !error && (
        <div className="print-area">
          <div className="mb-3 hidden text-center print:block">
            <h2 className="text-lg font-black">{ds.label} — {BRAND.name}</h2>
            <p className="text-xs text-gray-500">تاریخ گزارش: {jDateTime(new Date())} — تعداد رکورد: {faNum(result.total)}</p>
          </div>
          {mode === "summary" && result.summary && (
            <SectionCard
              title={`${result.summary.metric.label} بر اساس ${result.summary.groupBy.label}`}
              subtitle={`${faNum(result.summary.sourceRows)} ردیف مبدأ${result.summary.capped ? " (نمایش سقف مجاز)" : ""}`}
              actions={
                <Button variant="outline" size="sm" className="gap-1.5 no-print" onClick={exportCsv}>
                  <Download className="h-3.5 w-3.5" /> CSV
                </Button>
              }
            >
              <BarChartX data={result.rows.slice(0, 12)} xKey="name" bars={[{ key: "value", name: result.summary.metric.label }]} height={300} layout="vertical" />
            </SectionCard>
          )}
          <SectionCard
            title={mode === "detail" ? "نتایج گزارش" : "جدول خلاصه"}
            subtitle={`${faNum(result.total)} ${mode === "detail" ? "رکورد" : "گروه"}`}
            bodyClass="p-0"
          >
            <ResultTable result={result} mode={mode} columns={columns} />
            {mode === "detail" && totalPages > 1 && (
              <div className="flex items-center justify-between border-t px-4 py-3">
                <span className="text-xs text-muted-foreground">
                  صفحه {faNum(result.page ?? 1)} از {faNum(totalPages)}
                </span>
                <div className="flex gap-1.5 no-print">
                  <Button variant="outline" size="sm" disabled={(result.page ?? 1) <= 1} onClick={() => run((result.page ?? 1) - 1)}>قبلی</Button>
                  <Button variant="outline" size="sm" disabled={(result.page ?? 1) >= totalPages} onClick={() => run((result.page ?? 1) + 1)}>بعدی</Button>
                </div>
              </div>
            )}
          </SectionCard>
        </div>
      )}
    </div>
  );
}

// ---------------- جدول نتیجه ----------------
function ResultTable({ result, mode, columns }: { result: ReportResponse; mode: "detail" | "summary"; columns: string[] }) {
  const rows = result.rows ?? [];
  if (!rows.length) {
    return (
      <div className="flex flex-col items-center gap-2 p-10 text-center">
        <Info className="h-7 w-7 text-muted-foreground/50" />
        <p className="text-sm font-bold">رکوردی با این فیلترها یافت نشد</p>
        <p className="max-w-md text-xs leading-6 text-muted-foreground">
          اگر تعداد رکورد منبع بالای صفحه صفر است یعنی دادهٔ این منبع در پایگاه‌داده وجود ندارد (انتقال داده اجرا نشده). اگر منبع داده دارد، بازهٔ تاریخ یا فیلتر وضعیت را بردارید و دوباره اجرا کنید.
        </p>
      </div>
    );
  }
  if (mode === "summary") {
    return (
      <div className="overflow-x-auto">
        <table className="soft-table w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="px-4 py-3 text-right font-semibold">{result.summary?.groupBy.label}</th>
              <th className="px-4 py-3 text-right font-semibold">{result.summary?.metric.label}</th>
              <th className="px-4 py-3 text-right font-semibold">سهم</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const total = rows.reduce((s, x) => s + x.value, 0) || 1;
              return (
                <tr key={r.name} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2.5 text-xs font-semibold">{r.name}</td>
                  <td className="px-4 py-2.5 text-xs tabular-nums font-bold">{faMoney(r.value)}</td>
                  <td className="px-4 py-2.5 text-xs tabular-nums text-muted-foreground">{faNum(Math.round((r.value / total) * 100))}٪</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }
  const defs = result.columns ?? {};
  return (
    <div className="overflow-x-auto">
      <table className="soft-table w-full text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            {columns.map((c) => <th key={c} className="px-4 py-3 text-right font-semibold whitespace-nowrap">{defs[c]?.label ?? c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id ?? i} className="border-b border-border/60 last:border-0">
              {columns.map((c) => (
                <td key={c} className="px-4 py-2.5 align-middle text-xs whitespace-nowrap">
                  <CellValue value={row[c]} type={defs[c]?.type} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CellValue({ value, type }: { value: any; type?: string }) {
  if (value === null || value === undefined || value === "") return <span className="text-muted-foreground">—</span>;
  if (type === "date") return <span className="tabular-nums text-muted-foreground">{jDate(value)}</span>;
  if (type === "money") return <span className="tabular-nums">{faMoney(Number(value))}</span>;
  if (type === "bool") return value ? <span className="font-bold text-primary">بله</span> : <span className="text-muted-foreground">خیر</span>;
  return <span>{String(value)}</span>;
}

function csvCell(v: any, type?: string): string {
  if (v === null || v === undefined) return "";
  let s: string;
  if (type === "date") s = jDate(v);
  else if (typeof v === "object") s = String(v);
  else s = String(v);
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function LoadingSpinner() {
  return (
    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
  );
}
