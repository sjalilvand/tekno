"use client";
// =====================================================================
// مدیریت جدول‌ها (نسخهٔ ۶.۱۸) — پوشش کامل جدول‌های سامانه
// • کاتالوگ همهٔ جدول‌ها (۷۵ جدول سامانهٔ قدیم + جدول‌های جدید) گروه‌بندی
//   بر اساس حوزهٔ کاری، با جستجو
// • مشاهده ردیف‌ها با جستجو و صفحه‌بندی
// • افزودن رکورد (فرم خودکار از ساختار جدول)
// • ویرایش رکورد
// • حذف رکورد با تأیید
// فقط مدیر سامانه — فیلدهای حساس (رمز/توکن) هرگز نمایش داده نمی‌شوند.
// =====================================================================
import * as React from "react";
import { PageHeader, LoadingView, SectionCard, DataTable, DateCell, type Column } from "@/components/shared";
import { api, useQuery } from "@/lib/client";
import { faNum } from "@/lib/jalali";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { useToast } from "@/hooks/use-toast";
import {
  Database, Table2, Plus, Pencil, Trash2, ArrowRight, Search, Loader2, Sparkles, Rows3,
} from "lucide-react";

type FieldMeta = {
  name: string;
  type: string; // Int | BigInt | Float | Boolean | String | DateTime
  required: boolean;
  hasDefault: boolean;
  isId: boolean;
  label: string;
  fk?: { model: string; hasLabel: boolean };
};

type TableInfo = {
  model: string;
  table: string;
  label: string;
  domain: string;
  isNew: boolean;
  idField: string;
  idType: string;
  fields: FieldMeta[];
};

type Catalog = { tables: TableInfo[]; total: number };

const LONG_TEXT = new Set(["description", "body", "answers", "payload", "text", "message", "comment", "note", "permissions", "recoveryCodes", "observations", "clinicalObservation"]);
const TEXTAREA_FIELDS = new Set(["topic", "title", "name", "field", "orientation", "status"]);

export function DataTablesView() {
  const { data, loading, error, refetch } = useQuery<Catalog>(() => api("/api/data-tables"), []);
  const [openTable, setOpenTable] = React.useState<TableInfo | null>(null);

  if (loading) return <LoadingView />;
  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="مدیریت جدول‌ها" subtitle="نمای همهٔ جدول‌های سامانه" icon={<Database className="h-5 w-5" />} />
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-rose-600 dark:text-rose-400">{error}</div>
      </div>
    );
  }

  if (openTable) {
    return <TableRowsView table={openTable} onBack={() => { setOpenTable(null); refetch(); }} />;
  }
  return <CatalogView tables={data?.tables ?? []} total={data?.total ?? 0} onOpen={setOpenTable} />;
}

// ---------------------------------------------------------------------
// کاتالوگ جدول‌ها
// ---------------------------------------------------------------------
function CatalogView({ tables, total, onOpen }: { tables: TableInfo[]; total: number; onOpen: (t: TableInfo) => void }) {
  const [q, setQ] = React.useState("");
  const filtered = React.useMemo(() => {
    const s = q.trim();
    if (!s) return tables;
    return tables.filter((t) => t.label.includes(s) || t.table.toLowerCase().includes(s.toLowerCase()) || t.domain.includes(s));
  }, [tables, q]);

  const domains = React.useMemo(() => {
    const map = new Map<string, TableInfo[]>();
    for (const t of filtered) {
      if (!map.has(t.domain)) map.set(t.domain, []);
      map.get(t.domain)!.push(t);
    }
    return [...map.entries()];
  }, [filtered]);

  const newCount = tables.filter((t) => t.isNew).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="مدیریت جدول‌ها"
        subtitle={`نمای همهٔ ${faNum(total)} جدول سامانه — مشاهده، افزودن، ویرایش و حذف رکورد`}
        icon={<Database className="h-5 w-5" />}
        actions={
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی جدول..." className="w-56 pr-9" />
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline" className="gap-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          <Sparkles className="h-3 w-3" /> {faNum(newCount)} جدول تازه‌افزوده (نسخهٔ ۶.۱۸)
        </Badge>
        <span>برای مدیریت ردیف‌ها روی جدول کلیک کنید.</span>
      </div>

      {domains.map(([domain, items]) => (
        <SectionCard key={domain} title={domain} subtitle={`${faNum(items.length)} جدول`}>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((t) => (
              <button
                key={t.model}
                onClick={() => onOpen(t)}
                className="group flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-right transition-all hover:border-ring hover:shadow-sm"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-transform group-hover:scale-110">
                  <Table2 className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-bold">{t.label}</span>
                    {t.isNew && <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">جدید</span>}
                  </span>
                  <span className="block truncate text-[10px] text-muted-foreground" dir="ltr">{t.table}</span>
                </span>
              </button>
            ))}
          </div>
        </SectionCard>
      ))}
      {filtered.length === 0 && (
        <p className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">جدولی با این نام یافت نشد</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// ردیف‌های یک جدول — جستجو، صفحه‌بندی، افزودن/ویرایش/حذف
// ---------------------------------------------------------------------
type Row = Record<string, unknown> & { id?: number | string };

function TableRowsView({ table, onBack }: { table: TableInfo; onBack: () => void }) {
  const { toast } = useToast();
  const [page, setPage] = React.useState(1);
  const [q, setQ] = React.useState("");
  const [appliedQ, setAppliedQ] = React.useState("");
  const pageSize = 20;

  const rowsQ = useQuery<{ count: number; rows: Row[] }>(
    () => api(`/api/data-tables/${table.model}?page=${page}&pageSize=${pageSize}&q=${encodeURIComponent(appliedQ)}`),
    [table.model, page, appliedQ]
  );
  const totalPages = Math.max(1, Math.ceil((rowsQ.data?.count ?? 0) / pageSize));

  const [editing, setEditing] = React.useState<{ row: Row | null } | null>(null); // null = افزودن
  const [deleting, setDeleting] = React.useState<Row | null>(null);
  const [busyDelete, setBusyDelete] = React.useState(false);

  React.useEffect(() => { setPage(1); setAppliedQ(""); setQ(""); }, [table.model]);

  const doDelete = async () => {
    if (!deleting) return;
    setBusyDelete(true);
    try {
      await api(`/api/data-tables/${table.model}?id=${encodeURIComponent(String(deleting[table.idField] ?? deleting.id))}`, { method: "DELETE" });
      toast({ title: "رکورد حذف شد" });
      setDeleting(null);
      rowsQ.refetch();
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setBusyDelete(false);
    }
  };

  const visibleFields = table.fields.slice(0, 7);
  const columns: Column<Row>[] = [
    ...visibleFields.map((f) => ({
      header: f.label,
      cell: (row: Row) => <CellValue field={f} value={row[f.name]} />,
    })),
    {
      header: "",
      cell: (row: Row) => (
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setEditing({ row }); }} aria-label="ویرایش">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-600 hover:text-rose-700" onClick={(e) => { e.stopPropagation(); setDeleting(row); }} aria-label="حذف">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onBack}>
          <ArrowRight className="h-4 w-4" /> بازگشت به جدول‌ها
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-base font-extrabold">
            <Table2 className="h-4.5 w-4.5 text-primary" />
            {table.label}
            <span className="text-xs font-normal text-muted-foreground" dir="ltr">({table.table})</span>
          </h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Rows3 className="h-3.5 w-3.5" />
            {rowsQ.loading ? "..." : `${faNum(rowsQ.data?.count ?? 0)} رکورد`} — حوزه: {table.domain}
          </p>
        </div>
        <div className="relative">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setPage(1); setAppliedQ(q); } }}
            placeholder="جستجو در ردیف‌ها..."
            className="w-56 pr-9"
          />
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setEditing({ row: null })}>
          <Plus className="h-4 w-4" /> افزودن رکورد
        </Button>
      </div>

      <SectionCard>
        <DataTable
          columns={columns}
          rows={rowsQ.data?.rows ?? []}
          loading={rowsQ.loading}
          error={rowsQ.error}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          onRowClick={(row) => setEditing({ row })}
        />
      </SectionCard>

      {editing !== null && (
        <RecordEditor
          table={table}
          row={editing.row}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); rowsQ.refetch(); }}
        />
      )}

      <Dialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader><DialogTitle className="text-right">حذف رکورد</DialogTitle></DialogHeader>
          <p className="text-sm leading-6 text-muted-foreground">
            رکورد با شناسه <b dir="ltr">{String(deleting?.[table.idField] ?? deleting?.id ?? "")}</b> از جدول «{table.label}» برای همیشه حذف می‌شود. مطمئن هستید؟
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>انصراف</Button>
            <Button variant="destructive" onClick={doDelete} disabled={busyDelete} className="gap-1.5">
              {busyDelete && <Loader2 className="h-4 w-4 animate-spin" />} حذف قطعی
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** نمایش مقدار سلول بر اساس نوع فیلد */
function CellValue({ field, value }: { field: FieldMeta; value: unknown }) {
  if (value === null || value === undefined || value === "") return <span className="text-muted-foreground">—</span>;
  if (field.type === "Boolean") {
    return <Badge variant="outline" className={value ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300" : ""}>{value ? "بله" : "خیر"}</Badge>;
  }
  if (field.type === "DateTime") return <DateCell value={value as string} />;
  if (field.fk) return <span className="tabular-nums" dir="ltr">{String(value)}</span>;
  const s = String(value);
  return <span className="block max-w-[280px] truncate" title={s} dir={/^[\u0600-\u06FF\s.,،؛:!?()«»-]+$/.test(s) ? "rtl" : "ltr"}>{s}</span>;
}

// ---------------------------------------------------------------------
// فرم افزودن / ویرایش رکورد — خودکار از ساختار جدول
// ---------------------------------------------------------------------
function RecordEditor({ table, row, onClose, onSaved }: { table: TableInfo; row: Row | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const isEdit = row !== null;
  const [values, setValues] = React.useState<Record<string, string | boolean>>({});
  const [fkOptions, setFkOptions] = React.useState<Record<string, { id: string; label: string }[]>>({});
  const [busy, setBusy] = React.useState(false);
  const [manualFk, setManualFk] = React.useState<Record<string, boolean>>({});

  // مقداردهی اولیه
  React.useEffect(() => {
    const init: Record<string, string | boolean> = {};
    for (const f of table.fields) {
      if (f.isId) { init[f.name] = isEdit ? String(row![f.name] ?? "") : ""; continue; }
      const v = row ? row[f.name] : undefined;
      if (f.type === "Boolean") init[f.name] = v === undefined || v === null ? false : Boolean(v);
      else if (f.type === "DateTime") init[f.name] = v ? String(v).slice(0, 10) : "";
      else init[f.name] = v === null || v === undefined ? "" : String(v);
    }
    setValues(init);
  }, [table.model, row]);

  // بارگذاری گزینه‌های فیلدهای ارتباطی
  React.useEffect(() => {
    const fks = table.fields.filter((f) => f.fk);
    if (!fks.length) return;
    for (const f of fks) {
      api<{ options: { id: string; label: string }[] }>(`/api/data-tables/${table.model}?options=${f.name}`)
        .then((d) => setFkOptions((p) => ({ ...p, [f.name]: d.options })))
        .catch(() => setFkOptions((p) => ({ ...p, [f.name]: [] })));
    }
  }, [table.model]);

  const setVal = (name: string, v: string | boolean) => setValues((p) => ({ ...p, [name]: v }));

  const save = async () => {
    setBusy(true);
    try {
      const data: Record<string, unknown> = {};
      for (const f of table.fields) {
        const v = values[f.name];
        if (f.isId) {
          if (!isEdit && v !== "") data[f.name] = f.type === "Int" ? Number(v) : String(v);
          continue;
        }
        if (f.type === "Boolean") { data[f.name] = Boolean(v); continue; }
        if (f.type === "DateTime") { data[f.name] = v ? new Date(`${v}T12:00:00`).toISOString() : null; continue; }
        data[f.name] = v === "" || v === "none" ? null : v;
      }
      if (isEdit) {
        await api(`/api/data-tables/${table.model}`, { method: "PATCH", body: JSON.stringify({ id: row![table.idField] ?? row!.id, data }) });
        toast({ title: "رکورد با موفقیت ویرایش شد" });
      } else {
        await api(`/api/data-tables/${table.model}`, { method: "POST", body: JSON.stringify({ data }) });
        toast({ title: "رکورد جدید ثبت شد" });
      }
      onSaved();
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right">
            {isEdit ? `ویرایش رکورد — ${table.label}` : `افزودن رکورد — ${table.label}`}
          </DialogTitle>
        </DialogHeader>
        <div className="grid max-h-[60vh] gap-3.5 overflow-y-auto pl-1 sm:grid-cols-2">
          {table.fields.map((f) => (
            <FieldInput
              key={f.name}
              field={f}
              value={values[f.name]}
              options={fkOptions[f.name]}
              manual={Boolean(manualFk[f.name])}
              onManual={() => setManualFk((p) => ({ ...p, [f.name]: true }))}
              onChange={(v) => setVal(f.name, v)}
              disabled={f.isId && isEdit}
            />
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>انصراف</Button>
          <Button onClick={save} disabled={busy} className="gap-1.5">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? "ذخیرهٔ تغییرات" : "ثبت رکورد"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldInput({ field, value, options, manual, onManual, onChange, disabled }: {
  field: FieldMeta;
  value: string | boolean | undefined;
  options?: { id: string; label: string }[];
  manual: boolean;
  onManual: () => void;
  onChange: (v: string | boolean) => void;
  disabled?: boolean;
}) {
  const textarea = LONG_TEXT.has(field.name);
  const req = field.required && !field.hasDefault;

  return (
    <div className={textarea ? "sm:col-span-2" : ""}>
      <Label className="mb-1.5 flex items-center gap-1 text-[12px] font-bold">
        {field.label}
        {req && <span className="text-rose-500">*</span>}
        <span className="text-[9.5px] font-normal text-muted-foreground" dir="ltr">{field.type}</span>
      </Label>

      {field.isId ? (
        <Input value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder={disabled ? "—" : "خودکار"} dir="ltr" className="text-xs" />
      ) : field.type === "Boolean" ? (
        <div className="flex h-9 items-center">
          <Switch checked={Boolean(value)} onCheckedChange={(v) => onChange(v)} disabled={disabled} />
        </div>
      ) : field.type === "DateTime" ? (
        <JalaliDatePicker value={String(value ?? "")} onChange={(v) => onChange(v)} className="w-full" />
      ) : field.fk && !manual ? (
        <div className="flex items-center gap-1.5">
          <Select value={String(value ?? "")} onValueChange={(v) => onChange(v)} disabled={disabled}>
            <SelectTrigger className="h-9 flex-1"><SelectValue placeholder="انتخاب شناسه..." /></SelectTrigger>
            <SelectContent dir="rtl" className="max-h-60">
              <SelectItem value="none"><span className="text-muted-foreground">— خالی —</span></SelectItem>
              {(options ?? []).map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.label} <span className="text-muted-foreground" dir="ltr">#{o.id}</span></SelectItem>
              ))}
              {options === undefined && <div className="flex items-center justify-center gap-1.5 py-4 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> بارگذاری...</div>}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" className="h-9 shrink-0 text-[10px] text-muted-foreground" onClick={onManual}>ورود دستی</Button>
        </div>
      ) : field.type === "Int" || field.type === "BigInt" || field.type === "Float" ? (
        <Input type="number" step={field.type === "Float" ? "any" : "1"} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} dir="ltr" className="text-xs" placeholder={field.hasDefault ? "پیش‌فرض" : ""} disabled={disabled} />
      ) : textarea ? (
        <Textarea value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className="min-h-[72px] text-xs" disabled={disabled} />
      ) : (
        <Input value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className="text-xs" placeholder={field.hasDefault ? "پیش‌فرض" : ""} disabled={disabled} />
      )}
    </div>
  );
}
