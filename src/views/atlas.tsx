"use client";
// =====================================================================
// اطلس مراکز رز — نقشهٔ ایران + وضعیت و عملکرد هر مرکز/کلینیک (نسخهٔ ۶.۱۲)
// =====================================================================
import * as React from "react";
import { PageHeader, SectionCard, StatCard, LoadingView, DataTable, Column, DotBadge } from "@/components/shared";
import { IranMap, MapMarker, toneForPerformance, markerValue } from "@/components/iran-map";
import { faNum, faMoney, jDate } from "@/lib/jalali";
import { api, useQuery } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Map, Building2, CalendarCheck, Wallet, Users, Siren, Loader2, MapPin, Phone, Clock, UserRound, ExternalLink, Download, Mail } from "lucide-react";

type AtlasCenter = {
  id: number; title: string; isEnabled: boolean;
  provinceId: number; provinceTitle: string; cityTitle: string;
  address: string | null; tel: string | null; postalCode: string | null;
  managerName: string | null; managerPhone: string | null; workingHours: string | null;
  latitude: number | null; longitude: number | null; mapUrl: string | null;
  staffCount: number; totalEvents: number; confirmedSessions: number;
  income: number; emsCount: number; applicants: number; lastActivity: string | null;
};

type AtlasData = {
  items: AtlasCenter[];
  totals: { centers: number; active: number; sessions: number; income: number; applicants: number; ems: number; staff: number; provinces: number };
};

export function AtlasView() {
  const { toast } = useToast();
  const { data, loading, error, refetch } = useQuery<AtlasData>(() => api("/api/atlas"), []);
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [importing, setImporting] = React.useState(false);
  const [isAdmin, setIsAdmin] = React.useState(false);

  React.useEffect(() => {
    api<{ user: { roles: string[] } }>("/api/auth/me")
      .then((d) => setIsAdmin(d.user.roles.some((r) => /مدیر|ادمین|admin/i.test(r))))
      .catch(() => {});
  }, []);

  const importRose = async () => {
    setImporting(true);
    try {
      const r = await api<{ imported: number; updated: number; errors: string[] }>("/api/centers", {
        method: "POST", body: JSON.stringify({ action: "import-rose" }),
      });
      toast({ title: `مراکز رز بارگذاری شد — ${r.imported} جدید، ${r.updated} به‌روزرسانی` });
      refetch();
    } catch (e: any) {
      toast({ title: e?.message ?? "خطا در بارگذاری مراکز", variant: "destructive" as never });
    } finally {
      setImporting(false);
    }
  };

  if (loading) return <LoadingView label="در حال بارگذاری اطلس..." />;
  if (error || !data) return <div className="p-10 text-center text-sm text-rose-500">{error}</div>;

  const items = data.items;
  const selected = items.find((i) => i.id === selectedId) ?? null;
  const markers: MapMarker[] = items.map((c) => ({
    id: c.id, title: c.title, provinceId: c.provinceId,
    tone: toneForPerformance(c.income, c.confirmedSessions, c.isEnabled),
    value: markerValue(c.confirmedSessions, c.income),
    sub: `${c.provinceTitle} / ${c.cityTitle} — درآمد ${faMoney(c.income)} ریال`,
  }));
  const noGeo = items.length > 0 && items.every((i) => i.latitude === null && i.longitude === null);

  const top = [...items].sort((a, b) => b.confirmedSessions - a.confirmedSessions || b.income - a.income).slice(0, 6);

  const columns: Column<AtlasCenter>[] = [
    {
      header: "مرکز",
      cell: (c) => (
        <button className="text-right" onClick={() => setSelectedId(c.id)}>
          <p className="text-[13px] font-semibold leading-5 hover:text-primary">{c.title}</p>
          <p className="text-[10.5px] text-muted-foreground leading-4">{c.provinceTitle} / {c.cityTitle}</p>
        </button>
      ),
    },
    { header: "جلسات تاییدشده", cell: (c) => <span className="text-xs font-bold tabular-nums">{faNum(c.confirmedSessions)}</span> },
    { header: "متقاضیان", cell: (c) => <span className="text-xs tabular-nums">{faNum(c.applicants)}</span> },
    { header: "درآمد (ریال)", cell: (c) => <span className="text-xs font-bold tabular-nums">{faMoney(c.income)}</span> },
    { header: "موارد حاد", cell: (c) => <span className="text-xs tabular-nums">{faNum(c.emsCount)}</span> },
    { header: "آخرین فعالیت", cell: (c) => <span className="text-xs text-muted-foreground">{c.lastActivity ? jDate(c.lastActivity) : "—"}</span> },
    { header: "وضعیت", cell: (c) => <DotBadge label={c.isEnabled ? "فعال" : "غیرفعال"} ok={c.isEnabled} /> },
    {
      header: "عملکرد",
      cell: (c) => {
        const tone = toneForPerformance(c.income, c.confirmedSessions, c.isEnabled);
        const map = { emerald: ["بالا", "ok"], amber: ["متوسط", "warn"], rose: ["نیازمند توجه", "bad"], slate: ["—", "off"] } as const;
        const [label, kind] = map[tone];
        return kind === "ok" ? <DotBadge label={label} ok /> : kind === "warn" ? <DotBadge label={label} ok={false} /> : <span className="text-[11px] text-muted-foreground">{label}</span>;
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="اطلس مراکز رز"
        subtitle="نقشهٔ ایران — وضعیت، عملکرد و مشخصات هر کلینیک"
        icon={<Map className="h-5 w-5" />}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <StatCard title="کل مراکز" value={faNum(data.totals.centers)} icon={<Building2 className="h-5 w-5" />} tone="rose" hint={`${faNum(data.totals.active)} فعال`} />
        <StatCard title="استان‌های تحت پوشش" value={faNum(data.totals.provinces)} icon={<Map className="h-5 w-5" />} tone="slate" />
        <StatCard title="جلسات تاییدشده" value={faNum(data.totals.sessions)} icon={<CalendarCheck className="h-5 w-5" />} tone="teal" />
        <StatCard title="درآمد کل (ریال)" value={faMoney(data.totals.income)} icon={<Wallet className="h-5 w-5" />} tone="emerald" />
        <StatCard title="متقاضیان" value={faNum(data.totals.applicants)} icon={<Users className="h-5 w-5" />} tone="cyan" />
        <StatCard title="موارد حاد" value={faNum(data.totals.ems)} icon={<Siren className="h-5 w-5" />} tone="rose" />
        <StatCard title="کارکنان مراکز" value={faNum(data.totals.staff)} icon={<UserRound className="h-5 w-5" />} tone="amber" />
      </div>

      {noGeo && isAdmin && (
        <div className="rounded-2xl border border-sky-300 bg-sky-50 px-4 py-3 dark:border-sky-900 dark:bg-sky-950/40">
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex-1 text-xs font-bold text-sky-800 dark:text-sky-300">
              آدرس و مختصات مراکز رز از نقشهٔ ایران هنوز بارگذاری نشده است — با یک کلیک، ۳۱ کلینیک رز در سراسر کشور همراه با نشانی، تلفن، مدیر و مختصات جغرافیایی ثبت می‌شود.
            </p>
            <Button size="sm" className="gap-1.5" onClick={importRose} disabled={importing}>
              {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              بارگذاری ۳۱ مرکز رز
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="نقشهٔ مراکز" subtitle="روی نشانگر هر استان کلیک کنید" className="lg:col-span-2">
          <IranMap markers={markers} selectedId={selectedId} onSelect={(id) => setSelectedId(Number(id))} />
        </SectionCard>

        <div className="space-y-4">
          {selected ? (
            <SectionCard title={selected.title} subtitle={`${selected.provinceTitle} / ${selected.cityTitle}`}>
              <div className="space-y-2.5 text-xs">
                {[
                  { icon: <MapPin className="h-3.5 w-3.5" />, label: "نشانی", value: selected.address ?? "—" },
                  { icon: <Phone className="h-3.5 w-3.5" />, label: "تلفن", value: selected.tel ?? "—", ltr: true },
                  { icon: <UserRound className="h-3.5 w-3.5" />, label: "مدیر مرکز", value: selected.managerName ?? "—" },
                  { icon: <Phone className="h-3.5 w-3.5" />, label: "تلفن مدیر", value: selected.managerPhone ?? "—", ltr: true },
                  { icon: <Clock className="h-3.5 w-3.5" />, label: "ساعات کاری", value: selected.workingHours ?? "—" },
                  { icon: <Mail className="h-3.5 w-3.5" />, label: "کد پستی", value: selected.postalCode ?? "—", ltr: true },
                ].map((row, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-xl border bg-muted/40 px-3 py-2">
                    <span className="mt-0.5 text-primary">{row.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold text-muted-foreground">{row.label}</p>
                      <p className="mt-0.5 leading-5" dir={row.ltr ? "ltr" : undefined} style={{ textAlign: "right" }}>{row.value}</p>
                    </div>
                  </div>
                ))}
                {selected.mapUrl && (
                  <a href={selected.mapUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-[11px] font-bold text-accent-foreground transition-opacity hover:opacity-85">
                    <ExternalLink className="h-3.5 w-3.5" /> مشاهده روی نقشهٔ نشانیاب
                  </a>
                )}
              </div>
            </SectionCard>
          ) : (
            <SectionCard title="برترین مراکز" subtitle="بر اساس جلسات تاییدشده">
              <ul className="space-y-2">
                {top.map((c, i) => (
                  <li key={c.id}>
                    <button
                      onClick={() => setSelectedId(c.id)}
                      className="flex w-full items-center gap-3 rounded-xl border bg-muted/40 px-3 py-2.5 text-right transition-colors hover:bg-accent"
                    >
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-black ${i === 0 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300" : "bg-muted text-muted-foreground"}`}>
                        {faNum(i + 1)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold">{c.title}</p>
                        <p className="text-[10px] text-muted-foreground">{c.provinceTitle} — {faNum(c.applicants)} متقاضی</p>
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-black tabular-nums">{faNum(c.confirmedSessions)}</p>
                        <p className="text-[9.5px] text-muted-foreground">جلسه</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          {selected && (
            <SectionCard title="عملکرد این مرکز">
              <div className="grid grid-cols-2 gap-2.5 text-center">
                {[
                  { label: "جلسات تاییدشده", value: faNum(selected.confirmedSessions) },
                  { label: "درآمد (ریال)", value: faMoney(selected.income) },
                  { label: "متقاضیان", value: faNum(selected.applicants) },
                  { label: "موارد حاد", value: faNum(selected.emsCount) },
                  { label: "کارکنان", value: faNum(selected.staffCount) },
                  { label: "آخرین فعالیت", value: selected.lastActivity ? jDate(selected.lastActivity) : "—" },
                ].map((k) => (
                  <div key={k.label} className="rounded-xl border bg-muted/40 px-2 py-2.5">
                    <p className="text-sm font-black tabular-nums">{k.value}</p>
                    <p className="mt-0.5 text-[9.5px] text-muted-foreground">{k.label}</p>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </div>
      </div>

      <SectionCard title="جدول کامل مراکز" subtitle={`${faNum(items.length)} مرکز — کلیک روی عنوان برای نمایش جزئیات`}>
        <DataTable columns={columns} rows={items} loading={loading} />
      </SectionCard>
    </div>
  );
}
