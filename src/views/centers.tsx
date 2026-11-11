"use client";
// مراکز و کلینیک‌ها — با واردات ۳۱ مرکز رز از نقشهٔ ایران (نسخهٔ ۶.۱۲)
import * as React from "react";
import { PageHeader, FilterBar, DataTable, DotBadge, Column, LoadingView } from "@/components/shared";
import { faNum, faDigits } from "@/lib/jalali";
import { api, useQuery } from "@/lib/client";
import { Building2, Search, MapPin, Phone, Download, Loader2, UserRound, Clock, MapPinned } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

type CenterRow = {
  id: number; title: string; isEnabled: boolean; address: string | null; tel: string | null;
  cityTitle: string; provinceTitle: string; category: { title: string } | null;
  postalCode: string | null; managerName: string | null; managerPhone: string | null;
  workingHours: string | null; latitude: number | null; longitude: number | null; mapUrl: string | null;
  _count: { events: number };
};

export function CentersView() {
  const { toast } = useToast();
  const [q, setQ] = React.useState("");
  const [provinceId, setProvinceId] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [importing, setImporting] = React.useState(false);
  const [detail, setDetail] = React.useState<CenterRow | null>(null);

  const meQ = useQuery<{ user: { roles: string[] } }>(() => api("/api/auth/me"), []);
  const isAdmin = (meQ.data?.user.roles ?? []).some((r) => /مدیر|ادمین|admin/i.test(r));
  const meta = useQuery<{ provinces: { id: number; title: string }[] }>(() => api("/api/meta"), []);
  const { data, loading, refetch } = useQuery<{ total: number; totalPages: number; page?: number; centers: CenterRow[] }>(
    () => api(`/api/centers?q=${encodeURIComponent(q)}&provinceId=${provinceId}&page=${page}`),
    [q, provinceId, page]
  );

  const geoMissing = React.useMemo(() => {
    const rows = data?.centers ?? [];
    return rows.length > 0 && rows.every((c) => c.latitude === null && c.longitude === null);
  }, [data]);

  const importRose = async () => {
    setImporting(true);
    try {
      const r = await api<{ imported: number; updated: number }>("/api/centers", {
        method: "POST", body: JSON.stringify({ action: "import-rose" }),
      });
      toast({ title: `مراکز رز بارگذاری شد — ${faNum(r.imported)} جدید، ${faNum(r.updated)} به‌روزرسانی` });
      refetch();
    } catch (e: any) {
      toast({ title: e?.message ?? "خطا در بارگذاری مراکز", variant: "destructive" as never });
    } finally {
      setImporting(false);
    }
  };

  const toggle = async (c: CenterRow) => {
    await api("/api/centers", { method: "PATCH", body: JSON.stringify({ id: c.id, isEnabled: !c.isEnabled }) });
    toast({ title: c.isEnabled ? "مرکز غیرفعال شد" : "مرکز فعال شد" });
    refetch();
  };

  const columns: Column<CenterRow>[] = [
    {
      header: "مرکز",
      cell: (c) => (
        <button className="flex items-center gap-2.5 text-right" onClick={() => setDetail(c)}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <Building2 className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[13px] font-semibold leading-5 hover:text-primary">{c.title}</p>
            <p className="text-[10.5px] text-muted-foreground leading-4">{c.category?.title ?? "—"}</p>
          </div>
        </button>
      ),
    },
    {
      header: "موقعیت",
      cell: (c) => (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3" /> {c.provinceTitle} / {c.cityTitle}
          {c.latitude !== null && <MapPinned className="h-3 w-3 text-emerald-500" aria-label="دارای مختصات" />}
        </span>
      ),
    },
    { header: "تلفن", cell: (c) => <span className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground" dir="ltr">{c.tel ? faDigits(c.tel) : "—"}</span> },
    { header: "مدیر مرکز", cell: (c) => <span className="text-xs">{c.managerName ?? "—"}</span> },
    { header: "ساعات کاری", cell: (c) => <span className="text-[11px] text-muted-foreground">{c.workingHours ?? "—"}</span> },
    { header: "جلسات", cell: (c) => <span className="text-xs font-bold tabular-nums">{faNum(c._count.events)}</span> },
    { header: "وضعیت", cell: (c) => <DotBadge label={c.isEnabled ? "فعال" : "غیرفعال"} ok={c.isEnabled} /> },
    {
      header: "تغییر وضعیت",
      cell: (c) => <Switch checked={c.isEnabled} onCheckedChange={() => toggle(c)} aria-label="تغییر وضعیت مرکز" />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="مراکز و کلینیک‌ها"
        subtitle={`${faNum(data?.total ?? 0)} مرکز خدمات سراسر کشور`}
        icon={<Building2 className="h-5 w-5" />}
      />

      {isAdmin && geoMissing && (
        <div className="mb-4 rounded-2xl border border-sky-300 bg-sky-50 px-4 py-3 dark:border-sky-900 dark:bg-sky-950/40">
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex-1 text-xs font-bold text-sky-800 dark:text-sky-300">
              نشانی، تلفن، مدیر و مختصات ۳۱ کلینیک رز از نقشهٔ ایران بارگذاری نشده است.
            </p>
            <Button size="sm" className="gap-1.5" onClick={importRose} disabled={importing}>
              {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              بارگذاری ۳۱ مرکز رز
            </Button>
          </div>
        </div>
      )}

      <FilterBar className="mb-4">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="جستجوی نام مرکز..." className="h-9 pr-9 text-sm" />
        </div>
        <Select value={provinceId || "all"} onValueChange={(v) => { setProvinceId(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="h-9 w-44 text-sm"><SelectValue placeholder="همه استان‌ها" /></SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="all">همه استان‌ها</SelectItem>
            {meta.data?.provinces.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.title}</SelectItem>)}
          </SelectContent>
        </Select>
      </FilterBar>

      <div className="rounded-2xl border bg-card shadow-sm">
        <DataTable columns={columns} rows={data?.centers ?? []} loading={loading} page={data?.page} totalPages={data?.totalPages} onPageChange={setPage} />
      </div>

      {/* جزئیات کامل مرکز */}
      <Dialog open={Boolean(detail)} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-right">{detail?.title}</DialogTitle>
            <DialogDescription className="text-right">
              {detail?.provinceTitle} / {detail?.cityTitle}
              {detail?.latitude != null && ` — عرض ${detail.latitude}، طول ${detail.longitude}`}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-2 text-xs">
              {[
                { icon: <MapPin className="h-3.5 w-3.5" />, label: "نشانی", value: detail.address ?? "—" },
                { icon: <Phone className="h-3.5 w-3.5" />, label: "تلفن", value: detail.tel ? faDigits(detail.tel) : "—", ltr: true },
                { icon: <UserRound className="h-3.5 w-3.5" />, label: "مدیر مرکز", value: detail.managerName ?? "—" },
                { icon: <Phone className="h-3.5 w-3.5" />, label: "تلفن مدیر", value: detail.managerPhone ? faDigits(detail.managerPhone) : "—", ltr: true },
                { icon: <Clock className="h-3.5 w-3.5" />, label: "ساعات کاری", value: detail.workingHours ?? "—" },
                { icon: <Building2 className="h-3.5 w-3.5" />, label: "کد پستی", value: detail.postalCode ? faDigits(detail.postalCode) : "—", ltr: true },
              ].map((row, i) => (
                <div key={i} className="flex items-start gap-2 rounded-xl border bg-muted/40 px-3 py-2">
                  <span className="mt-0.5 text-primary">{row.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold text-muted-foreground">{row.label}</p>
                    <p className="mt-0.5 leading-5">{row.value}</p>
                  </div>
                </div>
              ))}
              {detail.mapUrl && (
                <a href={detail.mapUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-[11px] font-bold text-accent-foreground hover:opacity-85">
                  <MapPin className="h-3.5 w-3.5" /> مشاهده روی نقشهٔ نشانیاب
                </a>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
