"use client";
// گزارش‌ساز حرفه‌ای — مطابق read_mysql/presets.py + گزارش‌ساز آزاد
// • ۱۶ گزارش آمادهٔ مدیریتی در دسته‌بندی‌ها + ۱۲ منبع دادهٔ آزاد
// • حالت جزئیات (صفحه‌بندی‌شده) و خلاصه (گروه‌بندی + تجمیع داخل دیتابیس)
// • خروجی CSV سازگار با اکسل فارسی + اکسل XLSX راست‌به‌چپ + چاپ A4
// • قالب‌های ذخیره‌شدهٔ شخصی
import * as React from "react";
import { PageHeader, SectionCard, LoadingView } from "@/components/shared";
import { BarChartX } from "@/components/charts";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { faNum, faMoney, jDate, jDateTime } from "@/lib/jalali";
import { api, useQuery } from "@/lib/client";
import { BRAND } from "@/lib/brand";
import { REPORT_PRESETS, ReportPreset } from "@/lib/report-presets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CalendarCheck, Wallet, Users, CalendarClock, ArrowLeftRight, MessageSquareText,
  Play, Download, Printer, Save, FolderOpen, Trash2, FileBarChart2, X, Database, Info,
  Siren, UserSquare2, ScrollText, Receipt, Target, Inbox, FileSpreadsheet, Wrench,
} from "lucide-react";

// ---------------- تعریف منابع گزارش ----------------
type DatasetKey = "events" | "finance" | "users" | "reserves" | "referrals" | "sms" | "ems" | "group-events" | "logs" | "taxes" | "budgets" | "reserve-requests";

type DatasetDef = {
  key: DatasetKey; label: string; desc: string; icon: React.ReactNode;
  statuses: string[]; hasFinance?: boolean; hasCenter?: boolean; hasService?: boolean;
  hasDone?: boolean; severities?: string[];
};

const DATASETS: DatasetDef[] = [
  { key: "events", label: "جلسات مشاوره", desc: "همهٔ جلسات با وضعیت، مراجع، خدمت و مرکز", icon: <CalendarCheck className="h-4.5 w-4.5" />, statuses: ["تایید نهایی", "در انتظار پذیرش", "در انتظار تایید مدیر مرکز", "در انتظار تایید مسئول فنی", "در انتظار تایید نظارت حرفه‌ای", "در انتظار تایید ناظر استان", "رد شده", "ناتمام"], hasFinance: true, hasCenter: true, hasService: true, hasDone: true },
  { key: "finance", label: "مالی و تعرفه‌ها", desc: "تعرفه‌ها و سهم‌های مالی جلسات", icon: <Wallet className="h-4.5 w-4.5" />, statuses: ["تایید نهایی", "رد شده", "ناتمام"], hasFinance: true, hasCenter: true, hasService: true },
  { key: "group-events", label: "جلسات گروهی", desc: "جلسات گروهی با تعداد حاضران و موضوع", icon: <UserSquare2 className="h-4.5 w-4.5" />, statuses: ["تایید نهایی", "در انتظار تایید", "رد شده"], hasFinance: true, hasCenter: true, hasService: true, hasDone: true },
  { key: "ems", label: "موارد حاد", desc: "موارد حاد با شدت خطر و وضعیت پرداخت", icon: <Siren className="h-4.5 w-4.5" />, statuses: [], severities: ["کم", "متوسط", "بالا"] },
  { key: "users", label: "کاربران", desc: "مشتریان، مشاوران و کارمندان", icon: <Users className="h-4.5 w-4.5" />, statuses: [] },
  { key: "reserves", label: "رزروها", desc: "رزروهای جلسات و وضعیت آن‌ها", icon: <CalendarClock className="h-4.5 w-4.5" />, statuses: [] },
  { key: "reserve-requests", label: "درخواست‌های رزرو", desc: "درخواست‌های رزرو کاربران و بررسی آن‌ها", icon: <Inbox className="h-4.5 w-4.5" />, statuses: ["در انتظار بررسی", "تایید شده", "رد شده"] },
  { key: "referrals", label: "ارجاعات سها", desc: "ارجاع‌های دریافتی از سامانهٔ سها", icon: <ArrowLeftRight className="h-4.5 w-4.5" />, statuses: ["در انتظار", "پذیرش‌شده", "ارجاع‌شده", "منقضی"] },
  { key: "sms", label: "پیامک‌ها", desc: "صف پیامک و وضعیت ارسال", icon: <MessageSquareText className="h-4.5 w-4.5" />, statuses: ["در صف", "ارسال شده", "ناموفق"] },
  { key: "logs", label: "لاگ فعالیت", desc: "رویدادهای سامانه با دسته و سطح", icon: <ScrollText className="h-4.5 w-4.5" />, statuses: [] },
  { key: "taxes", label: "مالیات مشاوران", desc: "مالیات ماهانهٔ محاسبه‌شدهٔ مشاوران", icon: <Receipt className="h-4.5 w-4.5" />, statuses: [] },
  { key: "budgets", label: "سهمیه‌های خدماتی", desc: "سقف، مصرف و درصد مصرف سهمیه‌ها", icon: <Target className="h-4.5 w-4.5" />, statuses: [] },
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

type RunConfig = {
  dataset: DatasetKey;
  mode: "detail" | "summary";
  columns: string[];
  filters: { q: string; status: string; serviceId: string; centerId: string; from: string; to: string; severity: string; doneOnly: string };
  groupBy: string;
  metric: string;
  sortKey: string;
  sortDir: "asc" | "desc";
};

type CoverageData = {
  sources: { key: string; label: string; count: number; first: string | null; last: string | null }[];
  checkedAt: string;
};

const EMPTY_FILTERS = { q: "", status: "", serviceId: "", centerId: "", from: "", to: "", severity: "", doneOnly: "" };
const PRESET_KEY = "raz-report-presets";

// حالت پیش‌فرض هر منبع — ستون‌ها و مرتب‌سازی
const DATASET_DEFAULTS: Record<DatasetKey, { columns: string[]; sortKey: string; groupBy: string; metric: string }> = {
  events: { columns: ["startDate", "userName", "service", "center", "status", "userTariff"], sortKey: "startDate", groupBy: "status", metric: "count" },
  finance: { columns: ["startDate", "userName", "service", "center", "userTariff", "acceptorFee", "centerFee"], sortKey: "startDate", groupBy: "month", metric: "sum:userTariff" },
  "group-events": { columns: ["startDate", "topic", "groupTitle", "membersCount", "center", "adviser", "status"], sortKey: "startDate", groupBy: "status", metric: "count" },
  ems: { columns: ["date", "userName", "province", "adviser", "emsType", "severity", "payStatus", "amount"], sortKey: "date", groupBy: "severity", metric: "count" },
  users: { columns: ["nid", "name", "family", "mobile", "gender", "signupDate"], sortKey: "id", groupBy: "gender", metric: "count" },
  reserves: { columns: ["date", "userName", "eventTrackingCode", "eventStatus"], sortKey: "date", groupBy: "month", metric: "count" },
  "reserve-requests": { columns: ["creationDate", "userName", "province", "center", "status"], sortKey: "creationDate", groupBy: "status", metric: "count" },
  referrals: { columns: ["refId", "creationDate", "userName", "service", "sessionsCount", "status"], sortKey: "id", groupBy: "status", metric: "count" },
  sms: { columns: ["createTime", "number", "receiverName", "message", "status"], sortKey: "id", groupBy: "status", metric: "count" },
  logs: { columns: ["timestamp", "userName", "category", "description", "level"], sortKey: "timestamp", groupBy: "category", metric: "count" },
  taxes: { columns: ["userName", "nid", "year", "month", "taxAmount", "totalPayment"], sortKey: "createdAt", groupBy: "year", metric: "sum:taxAmount" },
  budgets: { columns: ["title", "kind", "amount", "used", "reserved", "remained", "pct"], sortKey: "id", groupBy: "kind", metric: "sum:used" },
};

const PRESET_LABEL: Record<string, string> = Object.fromEntries(REPORT_PRESETS.map((p) => [p.key, p.title]));

export function ReportBuilderView() {
  const meta = useQuery<any>(() => api("/api/meta"), []);
  const coverage = useQuery<CoverageData>(() => api("/api/bi/coverage"), []);

  const [dataset, setDataset] = React.useState<DatasetKey>("events");
  const [mode, setMode] = React.useState<"detail" | "summary">("detail");
  const [columns, setColumns] = React.useState<string[]>(DATASET_DEFAULTS.events.columns);
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
  const [activePreset, setActivePreset] = React.useState<string | null>(null);

  React.useEffect(() => {
    try {
      setPresets(JSON.parse(localStorage.getItem(PRESET_KEY) ?? "[]"));
    } catch {}
  }, []);

  const ds = DATASETS.find((d) => d.key === dataset)!;
  const colDefs = result?.columns ?? null;
  const groupKeys = result?.groupKeys ?? null;
  const metrics = result?.metrics ?? null;

  const buildBody = (p: number, size: number) => ({
    dataset, mode, columns,
    filters: {
      ...filters,
      serviceId: filters.serviceId || undefined,
      centerId: filters.centerId || undefined,
      severity: filters.severity || undefined,
      doneOnly: filters.doneOnly || undefined,
    },
    groupBy, metric,
    sort: { key: sortKey, dir: sortDir },
    page: p, pageSize: size,
  });

  const run = async (p = 1) => {
    setRunning(true);
    setError(null);
    setPage(p);
    try {
      const data = await api<ReportResponse>("/api/report", {
        method: "POST",
        body: JSON.stringify(buildBody(p, pageSize)),
      });
      setResult(data);
    } catch (e: any) {
      setError(e?.message ?? "خطا در تولید گزارش");
      setResult(null);
    } finally {
      setRunning(false);
    }
  };

  // اجرای یک پیکربندی کامل (برای گزارش‌های آماده)
  const runConfig = async (cfg: RunConfig, presetKey: string | null) => {
    setRunning(true);
    setError(null);
    setActivePreset(presetKey);
    setDataset(cfg.dataset); setMode(cfg.mode); setColumns(cfg.columns);
    setFilters({ ...EMPTY_FILTERS, ...cfg.filters });
    setGroupBy(cfg.groupBy); setMetric(cfg.metric);
    setSortKey(cfg.sortKey); setSortDir(cfg.sortDir);
    try {
      const data = await api<ReportResponse>("/api/report", {
        method: "POST",
        body: JSON.stringify({
          dataset: cfg.dataset, mode: cfg.mode, columns: cfg.columns,
          filters: {
            ...cfg.filters,
            serviceId: cfg.filters.serviceId || undefined,
            centerId: cfg.filters.centerId || undefined,
            severity: cfg.filters.severity || undefined,
            doneOnly: cfg.filters.doneOnly || undefined,
          },
          groupBy: cfg.groupBy, metric: cfg.metric,
          sort: { key: cfg.sortKey, dir: cfg.sortDir },
          page: 1, pageSize,
        }),
      });
      setResult(data);
      window.scrollTo({ top: 0, behavior: "smooth" });
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
    setActivePreset(null);
    setPage(1);
    const d = DATASET_DEFAULTS[key];
    setColumns(d.columns);
    setSortKey(d.sortKey);
    setGroupBy(d.groupBy);
    setMetric(d.metric);
  };

  // ---------------- خروجی فایل از سرور (همهٔ ردیف‌ها) ----------------
  const exportFile = async (format: "csv" | "xlsx") => {
    setError(null);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...buildBody(page, pageSize), format }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "خطا در تولید فایل خروجی");
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${PRESET_LABEL[activePreset ?? ""] ?? `report-${dataset}`}-${new Date().toISOString().slice(0, 10)}.${format}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e: any) {
      setError(e?.message ?? "خطا در تولید فایل خروجی");
    }
  };

  // خروجی CSV سمت کلاینت (سریع، از دادهٔ صفحهٔ فعلی)
  const exportCsvClient = () => {
    if (!result?.rows?.length) return;
    let header: string[], lines: string[];
    if (mode === "detail" && colDefs) {
      header = Array.from(columns).map((c) => colDefs[c]?.label ?? c);
      lines = result.rows.map((r) => columns.map((c) => csvCell(r[c], colDefs[c]?.type)).join(","));
    } else {
      header = [result.summary?.groupBy.label ?? "گروه", result.summary?.metric.label ?? "مقدار"];
      lines = result.rows.map((r) => `${csvCell(r.name)},${csvCell(r.value)}`);
    }
    const csv = "\uFEFF" + [header.map(csvCell).join(","), ...lines].join("\r\n");
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
    setResult(null); setPresetMenu(false); setActivePreset(null);
  };
  const deletePreset = (p: SavedPreset) => {
    const next = presets.filter((x) => x.name !== p.name);
    setPresets(next);
    localStorage.setItem(PRESET_KEY, JSON.stringify(next));
  };

  // ---------------- گزارش‌های آماده — گروه‌بندی دسته‌ای ----------------
  const presetCategories = Array.from(new Set(REPORT_PRESETS.map((p) => p.category)));

  const applyPreset = (p: ReportPreset) => {
    const cfg: RunConfig = {
      dataset: p.config.dataset as DatasetKey,
      mode: p.config.mode,
      columns: p.config.columns,
      filters: { ...EMPTY_FILTERS, ...(p.config.filters as any) },
      groupBy: p.config.groupBy ?? "",
      metric: p.config.metric ?? "count",
      sortKey: p.config.columns[0] ?? "id",
      sortDir: "desc",
    };
    runConfig(cfg, p.key);
  };

  const totalPages = result?.page && result?.pageSize ? Math.ceil((result.total ?? 0) / result.pageSize) : 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="گزارش‌ساز حرفه‌ای"
        subtitle="۱۶ گزارش آمادهٔ مدیریتی + گزارش‌ساز آزاد با فیلتر، گروه‌بندی و خروجی CSV/اکسل"
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

      {/* ۰) گزارش‌های آمادهٔ مدیریتی */}
      <SectionCard
        title="گزارش‌های آمادهٔ مدیریتی"
        subtitle="۱۶ گزارش مطابق صفحات سامانهٔ اصلی — با یک کلیک اجرا و بعد در گزارش‌ساز آزاد قابل تغییر است"
        bodyClass="p-4"
      >
        <div className="space-y-3">
          {presetCategories.map((cat) => (
            <div key={cat}>
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold text-muted-foreground">
                <Wrench className="h-3 w-3" /> {cat}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {REPORT_PRESETS.filter((p) => p.category === cat).map((p) => (
                  <button
                    key={p.key}
                    onClick={() => applyPreset(p)}
                    className={`group flex items-start gap-2.5 rounded-xl border p-3 text-right transition-all ${activePreset === p.key ? "border-ring bg-accent shadow-sm" : "bg-card hover:border-ring/60 hover:shadow-sm"}`}
                  >
                    <span className="mt-0.5 text-lg leading-none">{p.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-bold">{p.title}</span>
                      <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">{p.desc}</span>
                    </span>
                    <Play className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-primary" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ۱) منبع داده */}
      <SectionCard title="گزارش‌ساز آزاد — منبع داده" bodyClass="p-4">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
          {DATASETS.map((d) => {
            const cov = coverage.data?.sources.find((s) => s.key === d.key);
            return (
              <button
                key={d.key}
                onClick={() => changeDataset(d.key)}
                className={`rounded-xl border p-3 text-right transition-all ${dataset === d.key && !activePreset ? "border-ring bg-accent shadow-sm" : "bg-card hover:border-ring/60"}`}
              >
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${dataset === d.key && !activePreset ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
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
      <SectionCard title="فیلترها" bodyClass="p-4">
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
          {ds.severities && (
            <div className="space-y-1">
              <Label className="text-[11px]">شدت خطر</Label>
              <Select value={filters.severity || "all"} onValueChange={(v) => setFilters((f) => ({ ...f, severity: v === "all" ? "" : v }))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه</SelectItem>
                  {ds.severities.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {ds.hasDone && (
            <div className="space-y-1">
              <Label className="text-[11px]">وضعیت جلسه</Label>
              <Select value={filters.doneOnly || "all"} onValueChange={(v) => setFilters((f) => ({ ...f, doneOnly: v === "all" ? "" : v }))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه</SelectItem>
                  <SelectItem value="1">انجام‌شده (پایان‌یافته)</SelectItem>
                  <SelectItem value="0">ناتمام</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {ds.hasService && (
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
          {ds.hasCenter && (
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
                    {Object.entries(groupKeys ?? DEFAULT_GROUP_LABELS[dataset] ?? {}).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">شاخص</Label>
                <Select value={metric} onValueChange={setMetric}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(metrics ?? DEFAULT_METRIC_LABELS[dataset] ?? {}).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
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
            {mode === "summary" && !groupKeys && <span className="text-[10.5px] text-muted-foreground">گروه‌بندی پیش‌فرض منبع داده اعمال شده — پس از اجرا دقیق‌تر می‌شود</span>}
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
          <Button className="gap-1.5" onClick={() => { setActivePreset(null); run(1); }} disabled={running}>
            {running ? <LoadingSpinner /> : <Play className="h-4 w-4" />}
            اجرای گزارش
          </Button>
          {result && (
            <>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportFile("xlsx")}>
                <FileSpreadsheet className="h-3.5 w-3.5" /> اکسل (XLSX)
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsvClient}>
                <Download className="h-3.5 w-3.5" /> CSV این صفحه
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportFile("csv")}>
                <Download className="h-3.5 w-3.5" /> CSV کامل
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
                <Printer className="h-3.5 w-3.5" /> چاپ / PDF
              </Button>
            </>
          )}
          {(filters.q || filters.status || filters.from || filters.to || filters.severity || filters.doneOnly) && (
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
            <h2 className="text-lg font-black">{PRESET_LABEL[activePreset ?? ""] ?? ds.label} — {BRAND.name}</h2>
            <p className="text-xs text-gray-500">تاریخ گزارش: {jDateTime(new Date())} — تعداد رکورد: {faNum(result.total)}</p>
          </div>
          {mode === "summary" && result.summary && (
            <SectionCard
              title={`${result.summary.metric.label} بر اساس ${result.summary.groupBy.label}`}
              subtitle={`${faNum(result.summary.sourceRows)} ردیف مبدأ${result.summary.capped ? " (نمایش سقف مجاز)" : ""}`}
              actions={
                <Button variant="outline" size="sm" className="gap-1.5 no-print" onClick={() => exportFile("xlsx")}>
                  <FileSpreadsheet className="h-3.5 w-3.5" /> اکسل
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
                  صفحه {faNum(result.page ?? 1)} از {faNum(totalPages)} — اندازهٔ صفحه:
                  <select
                    className="mx-1 rounded border bg-card px-1 py-0.5 text-xs"
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                  >
                    {[10, 20, 50, 100].map((s) => <option key={s} value={s}>{faNum(s)}</option>)}
                  </select>
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

// برچسب‌های گروه‌بندی/شاخص پیش‌فرض هر منبع — تا قبل از اولین اجرا هم منو پر باشد
const DEFAULT_GROUP_LABELS: Record<DatasetKey, Record<string, { label: string }> | undefined> = {
  events: { status: { label: "وضعیت" }, service: { label: "خدمت" }, center: { label: "مرکز" }, adviser: { label: "مشاور" }, month: { label: "ماه شمسی" } },
  finance: { status: { label: "وضعیت" }, service: { label: "خدمت" }, center: { label: "مرکز" }, month: { label: "ماه شمسی" } },
  "group-events": { status: { label: "وضعیت" }, center: { label: "مرکز" }, adviser: { label: "مشاور" }, month: { label: "ماه شمسی" } },
  ems: { severity: { label: "شدت خطر" }, payStatus: { label: "وضعیت پرداخت" }, month: { label: "ماه شمسی" } },
  users: { gender: { label: "جنسیت" }, blocked: { label: "وضعیت مسدودی" }, month: { label: "ماه عضویت" } },
  reserves: { eventStatus: { label: "وضعیت جلسه" }, month: { label: "ماه شمسی" } },
  "reserve-requests": { status: { label: "وضعیت" }, province: { label: "استان" }, center: { label: "مرکز" }, month: { label: "ماه شمسی" } },
  referrals: { status: { label: "وضعیت" }, service: { label: "خدمت" }, month: { label: "ماه شمسی" } },
  sms: { status: { label: "وضعیت" }, month: { label: "ماه شمسی" } },
  logs: { category: { label: "دستهٔ رویداد" }, level: { label: "سطح" }, month: { label: "ماه شمسی" } },
  taxes: { year: { label: "سال" }, month: { label: "ماه" }, user: { label: "مشاور" } },
  budgets: { kind: { label: "نوع خدمت" }, month: { label: "ماه شروع" } },
};

const DEFAULT_METRIC_LABELS: Record<DatasetKey, Record<string, { label: string }> | undefined> = {
  events: { count: { label: "تعداد جلسات" }, "sum:userTariff": { label: "جمع تعرفه (ریال)" }, "sum:acceptorFee": { label: "جمع حق مشاور (ریال)" }, "avg:userTariff": { label: "میانگین تعرفه (ریال)" } },
  finance: { count: { label: "تعداد جلسات" }, "sum:userTariff": { label: "جمع تعرفه (ریال)" }, "sum:acceptorFee": { label: "جمع حق مشاور (ریال)" }, "sum:centerFee": { label: "جمع سهم مرکز (ریال)" }, "sum:adminFee": { label: "جمع سهم سامانه (ریال)" } },
  "group-events": { count: { label: "تعداد جلسات" }, "sum:userTariff": { label: "جمع تعرفه (ریال)" }, "sum:acceptorFee": { label: "جمع حق مشاور (ریال)" } },
  ems: { count: { label: "تعداد موارد" }, "sum:hadPaymentAmount": { label: "جمع مبلغ پرداخت (ریال)" } },
  users: { count: { label: "تعداد کاربران" } },
  reserves: { count: { label: "تعداد رزروها" } },
  "reserve-requests": { count: { label: "تعداد درخواست‌ها" } },
  referrals: { count: { label: "تعداد ارجاعات" }, "sum:sessionsCount": { label: "جمع جلسات پیش‌بینی‌شده" } },
  sms: { count: { label: "تعداد پیامک" } },
  logs: { count: { label: "تعداد رویدادها" } },
  taxes: { count: { label: "تعداد رکورد" }, "sum:taxAmount": { label: "جمع مالیات (ریال)" }, "sum:totalPayment": { label: "جمع پرداخت (ریال)" } },
  budgets: { count: { label: "تعداد سهمیه" }, "sum:amount": { label: "جمع سقف" }, "sum:used": { label: "جمع مصرف" } },
};

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
                  <td className="px-4 py-2.5 text-xs tabular-nums font-bold">{faNum(Number(r.value))}</td>
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
