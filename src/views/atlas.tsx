"use client";
// =====================================================================
// اطلس مراکز رز — نسخهٔ ۶.۱۴ (بازطراحی بر اساس سایت مرجع ۱۳۰.۱۸۵.۷۳.۱۵۷)
//  • کروپلت: رنگ هر استان = شدت روند مشاوره (جلسات/متقاضیان/درآمد/موارد حاد)
//  • پین شماره‌دار تعداد مراکز هر استان — مثل نقشهٔ کلینیک‌های مرجع
//  • پاپ‌آپ مشخصات کامل هر کلینیک (نشانی/تلفن/مدیر/ساعات) «داخل خود نقشه»
//  • فیلتر «همهٔ استان‌ها» برای جدول و لیست
// =====================================================================
import * as React from "react";
import { PageHeader, SectionCard, StatCard, LoadingView, DataTable, Column, DotBadge } from "@/components/shared";
import { IranMap, RegionStat } from "@/components/iran-map";
import { faNum, faMoney, jDate } from "@/lib/jalali";
import { api, useQuery } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Map as MapIcon, Building2, CalendarCheck, Wallet, Users, Siren, Loader2, MapPin, Phone, Clock, UserRound, ExternalLink, Download, Mail, X, ChevronLeft, Filter } from "lucide-react";

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
  bankError?: string | null;
};

type MetricKey = "sessions" | "applicants" | "income" | "ems";

const METRICS: { key: MetricKey; label: string; unit: string; get: (c: AtlasCenter) => number; money?: boolean }[] = [
  { key: "sessions", label: "جلسات مشاوره", unit: "جلسه", get: (c) => c.confirmedSessions },
  { key: "applicants", label: "متقاضیان", unit: "نفر", get: (c) => c.applicants },
  { key: "income", label: "درآمد", unit: "ریال", get: (c) => c.income, money: true },
  { key: "ems", label: "موارد حاد", unit: "مورد", get: (c) => c.emsCount },
];

type ProvinceAgg = {
  provinceId: number; provinceTitle: string;
  centers: AtlasCenter[]; count: number;
  sessions: number; applicants: number; income: number; ems: number;
};

function faMoneyShort(v: number): string {
  if (v >= 1_000_000_000) return `${faNum(Math.round(v / 1_000_000_000))} میلیارد`;
  if (v >= 1_000_000) return `${faNum(Math.round(v / 1_000_000))} میلیون`;
  if (v >= 1_000) return `${faNum(Math.round(v / 1_000))} هزار`;
  return faNum(v);
}

export function AtlasView() {
  const { toast } = useToast();
  const { data, loading, error, refetch } = useQuery<AtlasData>(() => api("/api/atlas"), []);
  const [metric, setMetric] = React.useState<MetricKey>("sessions");
  const [selectedProvince, setSelectedProvince] = React.useState<number | null>(null);
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [provinceFilter, setProvinceFilter] = React.useState<number | "">("");
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
      toast({ title: `مراکز رز بارگذاری شد — ${faNum(r.imported)} جدید، ${faNum(r.updated)} به‌روزرسانی` });
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
  const mDef = METRICS.find((m) => m.key === metric)!;

  // تجمیع استانی — پایهٔ کروپلت و پاپ‌آپ داخل نقشه
  const provAgg = new Map<number, ProvinceAgg>();
  for (const c of items) {
    let p = provAgg.get(c.provinceId);
    if (!p) {
      p = { provinceId: c.provinceId, provinceTitle: c.provinceTitle, centers: [], count: 0, sessions: 0, applicants: 0, income: 0, ems: 0 };
      provAgg.set(c.provinceId, p);
    }
    p.centers.push(c);
    p.count++;
    p.sessions += c.confirmedSessions;
    p.applicants += c.applicants;
    p.income += c.income;
    p.ems += c.emsCount;
  }
  const provinces = [...provAgg.values()].sort((a, b) => b[mDef.key === "income" ? "income" : mDef.key] - a[mDef.key === "income" ? "income" : mDef.key]);

  const regions: RegionStat[] = provinces.map((p) => ({
    provinceId: p.provinceId,
    value: metric === "income" ? p.income : metric === "applicants" ? p.applicants : metric === "ems" ? p.ems : p.sessions,
    count: p.count,
  }));

  const selProvince = selectedProvince != null ? provAgg.get(selectedProvince) ?? null : null;
  const selCenter = selectedId != null ? items.find((i) => i.id === selectedId) ?? null : null;

  const noGeo = items.length > 0 && items.every((i) => i.latitude === null && i.longitude === null);
  const filtered = provinceFilter === "" ? items : items.filter((i) => i.provinceId === provinceFilter);
  const top = [...items].sort((a, b) => (mDef.get(b) - mDef.get(a))).slice(0, 6);

  const columns: Column<AtlasCenter>[] = [
    {
      header: "مرکز",
      cell: (c) => (
        <button className="text-right" onClick={() => { setSelectedId(c.id); setSelectedProvince(c.provinceId); }}>
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
  ];

  // ---------- پاپ‌آپ داخل نقشه: جزئیات کلینیک ----------
  const centerPopup = selCenter && (
    <div className="absolute inset-x-2 bottom-2 top-2 z-30 flex sm:inset-y-2 sm:right-2 sm:left-auto sm:w-72">
      <div className="flex max-h-full w-full flex-col overflow-hidden rounded-2xl border bg-popover/95 shadow-2xl backdrop-blur">
        <div className="flex items-start justify-between gap-2 border-b px-3.5 py-3">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-extrabold leading-5">{selCenter.title}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{selCenter.provinceTitle} / {selCenter.cityTitle}</p>
          </div>
          <button
            className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted"
            onClick={() => setSelectedId(null)}
            aria-label="بستن"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto px-3.5 py-3 text-xs">
          <div className="grid grid-cols-3 gap-1.5 text-center">
            {[
              { label: "جلسه", value: faNum(selCenter.confirmedSessions) },
              { label: "متقاضی", value: faNum(selCenter.applicants) },
              { label: "موارد حاد", value: faNum(selCenter.emsCount) },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border bg-muted/40 px-1 py-2">
                <p className="text-[13px] font-black tabular-nums">{k.value}</p>
                <p className="mt-0.5 text-[8.5px] text-muted-foreground">{k.label}</p>
              </div>
            ))}
          </div>
          {[
            { icon: <MapPin className="h-3.5 w-3.5" />, label: "نشانی", value: selCenter.address ?? "—" },
            { icon: <Phone className="h-3.5 w-3.5" />, label: "تلفن", value: selCenter.tel ?? "—", ltr: true },
            { icon: <UserRound className="h-3.5 w-3.5" />, label: "مدیر مرکز", value: selCenter.managerName ?? "—" },
            { icon: <Phone className="h-3.5 w-3.5" />, label: "تلفن مدیر", value: selCenter.managerPhone ?? "—", ltr: true },
            { icon: <Clock className="h-3.5 w-3.5" />, label: "ساعات کاری", value: selCenter.workingHours ?? "—" },
            { icon: <Mail className="h-3.5 w-3.5" />, label: "کد پستی", value: selCenter.postalCode ?? "—", ltr: true },
          ].map((row, i) => (
            <div key={i} className="flex items-start gap-2 rounded-xl border bg-muted/40 px-3 py-2">
              <span className="mt-0.5 shrink-0 text-primary">{row.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[9.5px] font-bold text-muted-foreground">{row.label}</p>
                <p className="mt-0.5 leading-5" dir={row.ltr ? "ltr" : undefined} style={{ textAlign: "right" }}>{row.value}</p>
              </div>
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground">
            درآمد این مرکز: <span className="font-bold">{faMoney(selCenter.income)}</span> ریال
            {selCenter.lastActivity ? ` — آخرین فعالیت: ${jDate(selCenter.lastActivity)}` : ""}
          </p>
          {selCenter.mapUrl && (
            <a href={selCenter.mapUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-[11px] font-bold text-accent-foreground transition-opacity hover:opacity-85">
              <ExternalLink className="h-3.5 w-3.5" /> مشاهده روی نقشهٔ نشانیاب
            </a>
          )}
        </div>
      </div>
    </div>
  );

  // ---------- پاپ‌آپ داخل نقشه: خلاصهٔ استان + لیست کلینیک‌ها ----------
  const provincePopup = !selCenter && selProvince && (
    <div className="absolute inset-x-2 bottom-2 top-2 z-30 flex sm:inset-y-2 sm:right-2 sm:left-auto sm:w-64">
      <div className="flex max-h-full w-full flex-col overflow-hidden rounded-2xl border bg-popover/95 shadow-2xl backdrop-blur">
        <div className="flex items-start justify-between gap-2 border-b px-3.5 py-3">
          <div className="min-w-0">
            <p className="text-[13px] font-extrabold leading-5">استان {selProvince.provinceTitle}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{faNum(selProvince.count)} مرکز رز</p>
          </div>
          <button
            className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted"
            onClick={() => setSelectedProvince(null)}
            aria-label="بستن"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1.5 px-3.5 pt-3 text-center">
          {[
            { label: "جلسات", value: faNum(selProvince.sessions) },
            { label: "متقاضیان", value: faNum(selProvince.applicants) },
            { label: "درآمد", value: faMoneyShort(selProvince.income) },
            { label: "موارد حاد", value: faNum(selProvince.ems) },
          ].map((k) => (
            <div key={k.label} className="rounded-xl border bg-muted/40 px-1 py-1.5">
              <p className="text-[12.5px] font-black tabular-nums">{k.value}</p>
              <p className="mt-0.5 text-[8.5px] text-muted-foreground">{k.label}</p>
            </div>
          ))}
        </div>
        <div className="mt-2 flex-1 space-y-1.5 overflow-y-auto px-3.5 pb-3">
          <p className="pt-1 text-[10px] font-bold text-muted-foreground">کلینیک‌های این استان — برای جزئیات کلیک کنید:</p>
          {selProvince.centers
            .sort((a, b) => b.confirmedSessions - a.confirmedSessions)
            .map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className="flex w-full items-center gap-2 rounded-xl border bg-muted/40 px-2.5 py-2 text-right transition-colors hover:bg-accent"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: "#962b44" }}>
                  <Building2 className="h-3 w-3" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-bold leading-4">{c.title}</p>
                  <p className="truncate text-[9px] text-muted-foreground">{c.cityTitle} — {faNum(c.confirmedSessions)} جلسه</p>
                </div>
                <ChevronLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="اطلس مراکز رز"
        subtitle="نقشهٔ ایران — روند مشاوره، وضعیت و مشخصات کامل هر کلینیک"
        icon={<MapIcon className="h-5 w-5" />}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <StatCard title="کل مراکز" value={faNum(data.totals.centers)} icon={<Building2 className="h-5 w-5" />} tone="rose" hint={`${faNum(data.totals.active)} فعال`} />
        <StatCard title="استان‌های تحت پوشش" value={faNum(data.totals.provinces)} icon={<MapIcon className="h-5 w-5" />} tone="slate" />
        <StatCard title="جلسات تاییدشده" value={faNum(data.totals.sessions)} icon={<CalendarCheck className="h-5 w-5" />} tone="teal" />
        <StatCard title="درآمد کل (ریال)" value={faMoney(data.totals.income)} icon={<Wallet className="h-5 w-5" />} tone="emerald" />
        <StatCard title="متقاضیان" value={faNum(data.totals.applicants)} icon={<Users className="h-5 w-5" />} tone="cyan" />
        <StatCard title="موارد حاد" value={faNum(data.totals.ems)} icon={<Siren className="h-5 w-5" />} tone="rose" />
        <StatCard title="کارکنان مراکز" value={faNum(data.totals.staff)} icon={<UserRound className="h-5 w-5" />} tone="amber" />
      </div>

      {data.bankError && (
        <div className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-[11.5px] font-bold leading-6 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          خطا در بارگذاری خودکار مراکز رز: {data.bankError}
        </div>
      )}

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

      <SectionCard
        title="نقشهٔ روند مشاوره"
        subtitle="رنگ هر استان = شدت روند مشاوره — پین = تعداد مراکز — کلیک: مشخصات کامل داخل نقشه"
      >
        {/* کلید انتخاب شاخص رنگ */}
        <div className="mb-3 flex flex-wrap items-center justify-center gap-1.5">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-[11px] font-bold transition-all",
                metric === m.key
                  ? "border-transparent bg-[#5b1e2e] text-white shadow-md"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        <IranMap
          regions={regions}
          metricLabel={mDef.label}
          metricUnit={mDef.unit}
          selectedProvince={selectedProvince}
          onSelectProvince={(id) => { setSelectedProvince(id == null ? null : Number(id)); setSelectedId(null); }}
          overlay={selCenter ? centerPopup : provincePopup}
        />
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionCard
            title="جدول کامل مراکز"
            subtitle={`${faNum(filtered.length)} مرکز${provinceFilter !== "" ? ` — استان ${provAgg.get(Number(provinceFilter))?.provinceTitle ?? ""}` : " در همهٔ استان‌ها"}`}
          >
            {/* فیلتر استان — مثل نوار «همهٔ استان‌ها» سایت مرجع */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
                <Filter className="h-3.5 w-3.5" /> استان:
              </span>
              <div className="flex max-w-full flex-wrap gap-1.5 overflow-y-auto" style={{ maxHeight: 92 }}>
                <button
                  onClick={() => setProvinceFilter("")}
                  className={cn(
                    "rounded-full border px-3 py-1 text-[11px] font-bold transition-colors",
                    provinceFilter === "" ? "border-transparent bg-[#5b1e2e] text-white" : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  همهٔ استان‌ها
                </button>
                {provinces.map((p) => (
                  <button
                    key={p.provinceId}
                    onClick={() => setProvinceFilter(p.provinceId === provinceFilter ? "" : p.provinceId)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-[11px] font-bold transition-colors",
                      provinceFilter === p.provinceId ? "border-transparent bg-[#5b1e2e] text-white" : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {p.provinceTitle} ({faNum(p.count)})
                  </button>
                ))}
              </div>
            </div>
            <DataTable columns={columns} rows={filtered} loading={loading} />
          </SectionCard>
        </div>

        <SectionCard title={`برترین مراکز — ${mDef.label}`} subtitle="بر اساس شاخص انتخابی نقشه">
          <ul className="space-y-2">
            {top.map((c, i) => (
              <li key={c.id}>
                <button
                  onClick={() => { setSelectedId(c.id); setSelectedProvince(c.provinceId); }}
                  className="flex w-full items-center gap-3 rounded-xl border bg-muted/40 px-3 py-2.5 text-right transition-colors hover:bg-accent"
                >
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-black ${i === 0 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300" : "bg-muted text-muted-foreground"}`}>
                    {faNum(i + 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold">{c.title}</p>
                    <p className="text-[10px] text-muted-foreground">{c.provinceTitle} — {c.cityTitle}</p>
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-black tabular-nums">{mDef.money ? faMoneyShort(mDef.get(c)) : faNum(mDef.get(c))}</p>
                    <p className="text-[9.5px] text-muted-foreground">{mDef.unit}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
