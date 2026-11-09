"use client";
// =====================================================================
// کارتابل کامل متقاضی — نسخهٔ ۶.۱
// همهٔ اطلاعات متقاضی + سوابق اجرایی (خط زمانی) + توصیه‌ها و پیشنهادهای
// هوشمند + تیک‌های هوشمند + وضعیت چرخهٔ تایید هر جلسه — در یک نگاه.
// =====================================================================
import * as React from "react";
import { api, navigate } from "@/lib/client";
import { faNum, faDigits, jDate } from "@/lib/jalali";
import { cn } from "@/lib/utils";
import { PageHeader, SectionCard, StatCard, StatusBadge, LoadingView, NameAvatar } from "@/components/shared";
import { NewSessionDialog, NewReserveDialog, NewAcuteDialog, QuestionnaireDialog } from "@/components/record-dialogs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  FolderOpen, Search, User, CalendarCheck, CalendarPlus, CalendarClock, ClipboardList, History, Lightbulb, FileText,
  Wallet, Siren, ShieldCheck, Clock, FileImage, Pill, CheckCircle2, XCircle,
  AlertTriangle, ArrowLeftRight, Mail, Smartphone, ExternalLink, Loader2,
  Copy, IdCard, Smartphone as MobileIcon, ArrowRight,
} from "lucide-react";

export function CopyChip({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); } catch { /* نادیده */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={copy}
      title="کپی"
      className={cn(
        "group flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-extrabold tabular-nums ring-1 transition-colors",
        copied
          ? "bg-emerald-500 text-white ring-emerald-500"
          : "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900"
      )}
    >
      {icon}
      {label} {value}
      {copied ? <CheckCircle2 className="h-3 w-3" /> : <Copy className="h-3 w-3 opacity-50 group-hover:opacity-100" />}
    </button>
  );
}

type SearchRow = {
  id: number; name: string; family: string; nid: number; mobile: number;
  avatarColor: string | null; gender: string | null;
  sessions: number; pending: number; confirmed: number; lastSession: string | null;
};

type Rec = { severity: string; title: string; reason: string; action: string };

type Dossier = {
  person: {
    id: number; nid: number; nidMissing?: boolean; username: string; name: string; family: string; father?: string;
    gender?: string; birthday?: string | null; marriage?: { name: string } | null;
    education?: { name: string } | null; religion?: string | null; mobile: number; mobile2?: number | null;
    phone?: number | null; email?: string | null; address?: string | null;
    province?: { title: string } | null; signupDate: string; lastLogin?: string | null;
    blocked: boolean; roleTitles: (string | null)[];
  };
  stats: {
    sessions: number; confirmed: number; pending: number; rejected: number;
    acute: number; acuteHigh: number; totalTariff: number; lastSession: string | null;
  };
  events: {
    id: number; trackingCode: number | null; status: string; isEms: boolean; isGroup: boolean;
    userTariff: number; topic?: string | null;
    service?: { name: string; short?: string | null } | null;
    center?: { title: string; cityTitle: string } | null;
    acceptor?: { name: string; family: string; consultantLevel: number | null } | null;
    startDate: string | null; endDate: string | null;
    medicines: { id: number; name: string; dosage?: string | null; duration?: string | null }[];
    disorders: { id: number; title: string }[];
  }[];
  chainStatus: { eventId: number; status: string; spans: { key: string; name: string; state: string; hours: number | null }[] }[];
  timeline: { at: string; kind: string; title: string; detail?: string; ref?: string }[];
  files: { id: number; name: string; uploadDateTime: string }[];
  questionnaires: { id: number; title: string; createdAt: string; data: Record<string, string> }[];
  recommendations: Rec[];
  checklists: { id: number; title: string; status: string; done: number; total: number; items: { id: number; title: string; done: boolean; auto: boolean }[] }[];
};

const KIND_ICON: Record<string, React.ElementType> = {
  "جلسه": CalendarCheck, "رزرو": Clock, "یادداشت": FileText, "مورد حاد": Siren,
  "فرم": FileText, "آزمون": FileText, "تایید": ShieldCheck, "رد": XCircle,
  "سند": FileImage, "پیام": Mail, "پیامک": Smartphone,
};

export function CartableView() {
  const [q, setQ] = React.useState("");
  const [rows, setRows] = React.useState<SearchRow[]>([]);
  const [privileged, setPrivileged] = React.useState(true);
  const [scoped, setScoped] = React.useState(false);
  const [selected, setSelected] = React.useState<number | null>(null);
  const [dossier, setDossier] = React.useState<Dossier | null>(null);
  const [docError, setDocError] = React.useState<string | null>(null);
  const [loadingList, setLoadingList] = React.useState(true);
  const [loadingDoc, setLoadingDoc] = React.useState(false);
  // حالت نیابتی — برای دکمهٔ «بازگشت به حساب مدیر» در پرونده (نسخهٔ ۶.۱۱)
  const [acting, setActing] = React.useState<string | null>(null);

  React.useEffect(() => {
    api<{ acting: { actorName: string } | null }>("/api/auth/me")
      .then((d) => setActing(d.acting?.actorName ?? null))
      .catch(() => {});
  }, []);

  const loadList = React.useCallback(async (query: string) => {
    setLoadingList(true);
    try {
      const d = await api<{ rows: SearchRow[]; privileged: boolean; scoped?: boolean }>(`/api/cartable?q=${encodeURIComponent(query)}`);
      setRows(d.rows);
      setPrivileged(d.privileged);
      setScoped(Boolean(d.scoped));
    } catch { /* ignore */ }
    setLoadingList(false);
  }, []);

  React.useEffect(() => { loadList(""); }, [loadList]);

  // پشتیبانی از لینک‌های ورودی: #/cartable?u=5 یا ?event=12
  // گوش دادن زنده به hashchange + رفرنس انتخاب فعلی تا دوباره‌کاری نشود
  const selectedRef = React.useRef<number | null>(null);
  React.useEffect(() => { selectedRef.current = selected; }, [selected]);

  React.useEffect(() => {
    const apply = () => {
      const hash = window.location.hash;
      const mu = hash.match(/cartable\?(?:[^#]*&)?u=(\d+)/);
      const me = hash.match(/cartable\?(?:[^#]*&)?event=(\d+)/);
      if (mu?.[1]) {
        const uid = Number(mu[1]);
        if (uid !== selectedRef.current) select(uid);
      } else if (me?.[1]) {
        api<{ event?: { userId?: number } }>(`/api/events/${me[1]}`)
          .then((d) => { if (d.event?.userId && d.event.userId !== selectedRef.current) select(d.event.userId); })
          .catch(() => {});
      }
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const select = async (id: number) => {
    setSelected(id);
    setLoadingDoc(true);
    setDocError(null);
    try {
      const d = await api<Dossier>(`/api/cartable/${id}`);
      setDossier(d);
    } catch (e) {
      setDossier(null);
      const msg = (e as Error).message;
      setDocError(msg === "UNAUTHORIZED" ? "نشست شما منقضی شده — دوباره وارد شوید." : msg || "خطا در بارگذاری پرونده");
    }
    setLoadingDoc(false);
  };

  const search = () => loadList(q);

  // بازگشت از پرونده به فهرست کارتابل (نسخهٔ ۶.۱۰) — دکمهٔ «بازگشت به کارتابل»
  const backToList = () => {
    setSelected(null);
    setDossier(null);
    setDocError(null);
    if (window.location.hash.includes("cartable?")) window.location.hash = "#/cartable";
    loadList("");
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="کارتابل متقاضی"
        subtitle="پروندهٔ کامل هر متقاضی — اطلاعات، سوابق اجرایی، توصیه‌ها و تیک‌های هوشمند در یک نگاه"
        icon={<FolderOpen className="h-5 w-5" />}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[340px_1fr]">
        {/* ستون جستجو و فهرست */}
        <div className="space-y-3">
          <SectionCard bodyClass="p-3.5">
            <div className="flex gap-2">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search()}
                placeholder="نام، نام خانوادگی یا کد ملی..."
                className="h-9 text-[13px]"
                dir="rtl"
              />
              <Button size="icon" className="brand-gradient h-9 w-9 shrink-0 text-white" onClick={search} aria-label="جستجو">
                <Search className="h-4 w-4" />
              </Button>
            </div>
            {!privileged && (
              <p className="mt-2 text-[11px] text-muted-foreground">سطح دسترسی شما فقط پروندهٔ شخصی خودتان را نشان می‌دهد.</p>
            )}
            {privileged && scoped && (
              <p className="mt-2 flex items-center gap-1 rounded-lg bg-cyan-50 px-2 py-1.5 text-[10.5px] font-bold text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300">
                <ShieldCheck className="h-3.5 w-3.5" /> فقط مراجعان شما نمایش داده می‌شود
              </p>
            )}
          </SectionCard>

          <div className="space-y-2">
            {loadingList && <LoadingView label="در حال یافتن متقاضیان..." />}
            {!loadingList && rows.length === 0 && (
              <SectionCard bodyClass="p-8">
                <p className="text-center text-xs text-muted-foreground">متقاضی‌ای یافت نشد — عبارت دیگری جستجو کنید.</p>
              </SectionCard>
            )}
            {rows.map((r) => (
              <button
                key={r.id}
                onClick={() => select(r.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl border bg-card p-3 text-right shadow-sm transition-all hover:border-ring hover:shadow-md",
                  selected === r.id && "border-ring ring-1 ring-ring"
                )}
              >
                <NameAvatar name={r.name} family={r.family} color={r.avatarColor} size={38} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold">{r.name} {r.family}</p>
                  <p className="mt-0.5 text-[10.5px] text-muted-foreground">
                    {r.nid ? `کد ملی ${faDigits(r.nid)} — ` : "کد ملی ثبت نشده — "}
                    {faNum(r.sessions)} جلسه {r.pending > 0 && `— ${faNum(r.pending)} در انتظار`}
                    {r.lastSession && ` — آخرین: ${jDate(r.lastSession)}`}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ستون پرونده */}
        <div>
          {loadingDoc && <LoadingView label="در حال بارگذاری پرونده..." />}
          {!loadingDoc && !dossier && docError && (
            <SectionCard bodyClass="p-10">
              <div className="flex flex-col items-center gap-3 text-center">
                <AlertTriangle className="h-10 w-10 text-amber-500" />
                <p className="text-sm font-bold">پرونده بارگذاری نشد</p>
                <p className="max-w-sm text-xs leading-6 text-muted-foreground">{docError}</p>
                <Button variant="outline" size="sm" onClick={() => selected && select(selected)}>تلاش دوباره</Button>
              </div>
            </SectionCard>
          )}
          {!loadingDoc && !dossier && !docError && (
            <SectionCard bodyClass="p-12">
              <div className="flex flex-col items-center gap-3 text-center">
                <FolderOpen className="h-10 w-10 text-muted-foreground/50" />
                <p className="text-sm font-bold">کارتابلی انتخاب نشده</p>
                <p className="max-w-sm text-xs leading-6 text-muted-foreground">
                  از فهرست سمت راست متقاضی را انتخاب کنید تا پروندهٔ کامل — شامل اطلاعات هویتی، جلسات، سوابق اجرایی،
                  فرم‌ها، مدارک، تیک‌های هوشمند و توصیه‌های سیستمی — نمایش داده شود.
                </p>
              </div>
            </SectionCard>
          )}
          {!loadingDoc && dossier && <DossierPanel d={dossier} onBack={backToList} onChanged={() => selected && select(selected)} acting={acting} />}
        </div>
      </div>
    </div>
  );
}

// ================================================================ پرونده
function DossierPanel({ d, onBack, onChanged, acting }: { d: Dossier; onBack: () => void; onChanged: () => void; acting: string | null }) {
  const p = d.person;
  // دیالوگ‌های ثبت سریع در پرونده — نسخهٔ ۶.۱۱
  const [sessionOpen, setSessionOpen] = React.useState(false);
  const [reserveOpen, setReserveOpen] = React.useState(false);
  const [acuteOpen, setAcuteOpen] = React.useState(false);
  const [qOpen, setQOpen] = React.useState(false);
  const [exiting, setExiting] = React.useState(false);

  // بازگشت به حساب مدیر — خروج از حالت نیابتی و رفرش کامل
  const exitActing = async () => {
    setExiting(true);
    try {
      await api("/api/users/impersonate", { method: "DELETE" });
      window.location.hash = "#/cartable";
      window.location.reload();
    } catch { setExiting(false); }
  };

  const latestEventId = d.events[0]?.id ?? null;

  return (
    <div className="space-y-4">
      {/* نوار بازگشت + ثبت سریع — نسخهٔ ۶.۱۱ */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-full border bg-card px-3.5 py-1.5 text-[11.5px] font-bold text-muted-foreground shadow-sm transition-all hover:border-ring hover:text-foreground"
        >
          <ArrowRight className="h-3.5 w-3.5" /> بازگشت به کارتابل
        </button>
        <span className="mx-1 h-5 w-px bg-border" />
        <button onClick={() => setSessionOpen(true)} className="brand-gradient flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11.5px] font-bold text-white shadow-sm transition-all hover:opacity-90">
          <CalendarPlus className="h-3.5 w-3.5" /> ثبت جلسه
        </button>
        <button onClick={() => setReserveOpen(true)} className="flex items-center gap-1.5 rounded-full border bg-card px-3.5 py-1.5 text-[11.5px] font-bold shadow-sm transition-all hover:border-ring">
          <CalendarClock className="h-3.5 w-3.5 text-cyan-600" /> ثبت رزرو
        </button>
        <button onClick={() => setAcuteOpen(true)} className="flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3.5 py-1.5 text-[11.5px] font-bold text-rose-700 shadow-sm transition-all hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          <Siren className="h-3.5 w-3.5" /> ثبت مورد حاد
        </button>
        <button onClick={() => setQOpen(true)} className="flex items-center gap-1.5 rounded-full border bg-card px-3.5 py-1.5 text-[11.5px] font-bold shadow-sm transition-all hover:border-ring">
          <ClipboardList className="h-3.5 w-3.5 text-teal-600" /> ثبت پرسشنامه
        </button>
        {/* دکمهٔ بازگشت به حساب مدیر در حالت نیابتی — در خود پرونده (نسخهٔ ۶.۱۱) */}
        {acting && (
          <button
            onClick={exitActing}
            disabled={exiting}
            className="mr-auto flex items-center gap-1.5 rounded-full bg-violet-600 px-3.5 py-1.5 text-[11.5px] font-bold text-white shadow-sm transition-all hover:bg-violet-700 disabled:opacity-60"
          >
            {exiting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            بازگشت به حساب مدیر
          </button>
        )}
      </div>
      {/* سربرگ پرونده */}
      <SectionCard bodyClass="p-4">
        <div className="flex flex-wrap items-center gap-4">
          <NameAvatar name={p.name} family={p.family} size={52} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-extrabold">{p.name} {p.family}</h2>
              {p.blocked && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">مسدود</span>}
              {d.stats.acuteHigh > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                  <Siren className="h-3 w-3" /> {faNum(d.stats.acuteHigh)} مورد حاد شدید
                </span>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {p.nid ? (
                <CopyChip label="کد ملی" value={String(p.nid)} icon={<IdCard className="h-3.5 w-3.5" />} />
              ) : (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900">
                  کد ملی ثبت نشده
                </span>
              )}
              {p.mobile ? <CopyChip label="موبایل" value={String(p.mobile)} icon={<MobileIcon className="h-3.5 w-3.5" />} /> : null}
              <span className="text-[11.5px] text-muted-foreground">
                {p.gender ?? "—"}
                {p.education?.name && ` — تحصیلات: ${p.education.name}`}
                {p.province?.title && ` — ${p.province.title}`}
              </span>
            </div>
            <p className="mt-0.5 text-[10.5px] text-muted-foreground">
              نقش‌ها: {p.roleTitles.length ? p.roleTitles.join("، ") : "متقاضی"} — عضویت از {p.signupDate}
            </p>
          </div>
        </div>
      </SectionCard>

      {/* آمار خلاصه */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard title="کل جلسات" value={faNum(d.stats.sessions)} icon={<CalendarCheck className="h-5 w-5" />} tone="teal" />
        <StatCard title="تایید نهایی" value={faNum(d.stats.confirmed)} icon={<ShieldCheck className="h-5 w-5" />} tone="emerald" />
        <StatCard title="در انتظار تایید" value={faNum(d.stats.pending)} icon={<Clock className="h-5 w-5" />} tone="amber" />
        <StatCard title="رد شده" value={faNum(d.stats.rejected)} icon={<XCircle className="h-5 w-5" />} tone="rose" />
        <StatCard title="موارد حاد" value={faNum(d.stats.acute)} icon={<Siren className="h-5 w-5" />} tone="rose" hint={d.stats.acuteHigh ? `${faNum(d.stats.acuteHigh)} شدت بالا` : undefined} />
        <StatCard title="مجموع تعرفه" value={faNum(Number(d.stats.totalTariff).toLocaleString("fa-IR"))} hint="تومان" icon={<Wallet className="h-5 w-5" />} tone="cyan" />
      </div>

      <Tabs defaultValue="recs">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="recs" className="gap-1.5">
            <Lightbulb className="h-4 w-4" /> توصیه‌ها
            {d.recommendations.length > 0 && (
              <span className="rounded-full bg-rose-500 px-1.5 text-[9px] font-bold text-white">{faNum(d.recommendations.length)}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="sessions" className="gap-1.5"><CalendarCheck className="h-4 w-4" /> جلسات</TabsTrigger>
          <TabsTrigger value="timeline" className="gap-1.5"><History className="h-4 w-4" /> سوابق اجرایی</TabsTrigger>
          <TabsTrigger value="docs" className="gap-1.5"><FileText className="h-4 w-4" /> مدارک و فرم‌ها</TabsTrigger>
          <TabsTrigger value="checks" className="gap-1.5"><CheckCircle2 className="h-4 w-4" /> تیک‌ها</TabsTrigger>
        </TabsList>

        {/* توصیه‌های هوشمند */}
        <TabsContent value="recs" className="mt-4 space-y-3">
          {d.recommendations.length === 0 && (
            <SectionCard bodyClass="p-8">
              <div className="flex flex-col items-center gap-2 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                <p className="text-sm font-bold">توصیهٔ فعالی وجود ندارد</p>
                <p className="text-xs text-muted-foreground">پروندهٔ این متقاضی در وضعیت سالم است.</p>
              </div>
            </SectionCard>
          )}
          {d.recommendations.map((r, i) => (
            <div key={i} className={cn(
              "rounded-2xl border p-4 shadow-sm",
              r.severity === "بالا" ? "border-rose-200 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/30" :
              r.severity === "متوسط" ? "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30" :
              "border-border bg-card"
            )}>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-extrabold",
                  r.severity === "بالا" ? "bg-rose-500 text-white" : r.severity === "متوسط" ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground"
                )}>
                  {r.severity === "بالا" ? "!" : r.severity === "متوسط" ? "؟" : "•"}
                </span>
                <h3 className="text-[13.5px] font-extrabold">{r.title}</h3>
                <span className="mr-auto rounded-full border px-2 py-0.5 text-[10px] font-bold text-muted-foreground">شدت: {r.severity}</span>
              </div>
              <p className="mt-2 text-[12.5px] leading-6 text-foreground/85"><b>چرا:</b> {r.reason}</p>
              <p className="mt-1 text-[12.5px] leading-6 text-foreground/85"><b>اقدام پیشنهادی:</b> {r.action}</p>
            </div>
          ))}
        </TabsContent>

        {/* جلسات + چرخهٔ تایید */}
        <TabsContent value="sessions" className="mt-4 space-y-3">
          {d.events.length === 0 && <SectionCard bodyClass="p-8"><p className="text-center text-xs text-muted-foreground">جلسه‌ای ثبت نشده است.</p></SectionCard>}
          {d.events.map((e) => {
            const chain = d.chainStatus.find((c) => c.eventId === e.id);
            return (
              <SectionCard key={e.id} bodyClass="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-extrabold">
                    {e.service?.name ?? "جلسه"} {e.service?.short && `(${e.service.short})`}
                  </span>
                  <StatusBadge status={e.status} />
                  {e.isEms && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950 dark:text-rose-300">مورد حاد</span>}
                  <span className="mr-auto flex items-center gap-2 text-[10.5px] text-muted-foreground">
                    #{faNum(e.id)} {e.trackingCode ? `— کد پیگیری ${faDigits(e.trackingCode)}` : ""}
                    <button onClick={() => navigate("events")} className="flex items-center gap-1 text-primary hover:underline">
                      جزئیات <ExternalLink className="h-3 w-3" />
                    </button>
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground sm:grid-cols-4">
                  <span>شروع: {e.startDate ?? "—"}</span>
                  <span>پایان: {e.endDate ?? "—"}</span>
                  <span>مرکز: {e.center?.cityTitle ?? "—"}</span>
                  <span>مشاور: {e.acceptor ? `${e.acceptor.name} ${e.acceptor.family}` : "—"}</span>
                  <span>تعرفه: {faNum(Number(e.userTariff).toLocaleString("fa-IR"))} تومان</span>
                  <span>موضوع: {e.topic ?? "—"}</span>
                </div>
                {/* نوار مراحل تایید */}
                {chain && (
                  <div className="mt-3 flex items-center gap-1 overflow-x-auto" dir="rtl">
                    {chain.spans.map((s, i) => (
                      <div key={i} className="flex min-w-[76px] flex-1 flex-col items-center gap-1">
                        <span className={cn(
                          "h-1.5 w-full rounded-full",
                          s.state === "done" ? "bg-emerald-500" : s.state === "active" ? "bg-amber-500 animate-pulse" : s.state === "rejected" ? "bg-rose-500" : "bg-muted"
                        )} />
                        <span className={cn("text-[9px] leading-3", s.state === "done" ? "text-emerald-600" : s.state === "active" ? "text-amber-600 font-bold" : "text-muted-foreground")}>
                          {s.name}
                        </span>
                        {s.state === "active" && s.hours !== null && (
                          <span className="text-[9px] text-amber-600">{faNum(Math.round(s.hours))} ساعت</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {e.medicines.length > 0 && (
                  <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Pill className="h-3.5 w-3.5" /> داروها: {e.medicines.map((m) => `${m.name}${m.dosage ? ` (${m.dosage})` : ""}`).join("، ")}
                  </p>
                )}
                {e.disorders.length > 0 && (
                  <p className="mt-1 text-[11px] text-muted-foreground">اختلال‌ها: {e.disorders.map((x) => x.title).join("، ")}</p>
                )}
              </SectionCard>
            );
          })}
        </TabsContent>

        {/* خط زمانی سوابق */}
        <TabsContent value="timeline" className="mt-4">
          <SectionCard bodyClass="p-5">
            <ol className="relative space-y-4 border-r pr-5">
              {d.timeline.map((t, i) => {
                const Icon = KIND_ICON[t.kind] ?? FileText;
                return (
                  <li key={i} className="relative">
                    <span className={cn(
                      "absolute -right-[31px] flex h-7 w-7 items-center justify-center rounded-full border-2 bg-card",
                      t.kind === "مورد حاد" ? "border-rose-300 text-rose-600" :
                      t.kind === "تایید" ? "border-emerald-300 text-emerald-600" :
                      t.kind === "رد" ? "border-rose-300 text-rose-600" : "border-border text-muted-foreground"
                    )}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="rounded-xl border bg-muted/30 px-3.5 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[12.5px] font-bold">{t.title}</span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[9.5px] font-bold text-muted-foreground">{t.kind}</span>
                        <span className="mr-auto text-[10.5px] tabular-nums text-muted-foreground">{jDate(t.at)}</span>
                      </div>
                      {t.detail && <p className="mt-1 text-[11.5px] text-muted-foreground">{t.detail}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </SectionCard>
        </TabsContent>

        {/* مدارک و فرم‌ها */}
        <TabsContent value="docs" className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SectionCard title="اسناد بارگذاری‌شده" subtitle={`${faNum(d.files.length)} سند`}>
            {d.files.length === 0 ? <p className="text-xs text-muted-foreground">سندی بارگذاری نشده است.</p> : (
              <ul className="space-y-2">
                {d.files.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2">
                    <FileImage className="h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{f.name}</span>
                    <span className="text-[10.5px] text-muted-foreground">{f.uploadDateTime}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
          <SectionCard title="پرسشنامه‌های ثبت‌شده" subtitle={`${faNum(d.questionnaires.length)} پاسخ`}>
            {d.questionnaires.length === 0 ? <p className="text-xs text-muted-foreground">پرسشنامه‌ای برای این متقاضی ثبت نشده است.</p> : (
              <ul className="space-y-2">
                {d.questionnaires.map((q) => (
                  <li key={q.id} className="rounded-xl border bg-muted/30 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <ClipboardList className="h-4 w-4 shrink-0 text-teal-600" />
                      <span className="min-w-0 flex-1 truncate text-[12px] font-bold">{q.title}</span>
                      <span className="text-[10.5px] text-muted-foreground">{q.createdAt}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                      {Object.entries(q.data).slice(0, 4).map(([k, v]) => `${v}`).filter(Boolean).join(" — ")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
          <SectionCard title="جلسات با فرم بالینی" subtitle="ارزیابی روان‌شناختی و مداخلات" className="lg:col-span-2">
            {d.events.filter((e) => e.isEms || e.medicines.length || e.disorders.length).length === 0 && (
              <p className="text-xs text-muted-foreground">فرم بالینی خاصی ثبت نشده است.</p>
            )}
            <ul className="space-y-2">
              {d.events.filter((e) => e.isEms || e.medicines.length || e.disorders.length).map((e) => (
                <li key={e.id} className="rounded-xl border bg-muted/30 px-3 py-2 text-[12px]">
                  <p className="font-bold">جلسهٔ #{faNum(e.id)} — {e.service?.short ?? ""}</p>
                  {e.isEms && <p className="mt-1 text-rose-600">شامل فرم مورد حاد (EMS)</p>}
                  {e.medicines.length > 0 && <p className="mt-0.5 text-muted-foreground">دارو: {e.medicines.map((m) => m.name).join("، ")}</p>}
                  {e.disorders.length > 0 && <p className="mt-0.5 text-muted-foreground">اختلال: {e.disorders.map((x) => x.title).join("، ")}</p>}
                </li>
              ))}
            </ul>
          </SectionCard>
        </TabsContent>

        {/* تیک‌های هوشمند */}
        <TabsContent value="checks" className="mt-4 space-y-3">
          {d.checklists.length === 0 && (
            <SectionCard bodyClass="p-8">
              <p className="text-center text-xs text-muted-foreground">چک‌لیستی برای این متقاضی ایجاد نشده — از بخش «تیک‌های هوشمند» پیشنهاد بگیرید.</p>
              <div className="mt-3 flex justify-center">
                <Button variant="outline" size="sm" onClick={() => navigate("checklists")} className="gap-1.5">
                  <CheckCircle2 className="h-4 w-4" /> رفتن به تیک‌های هوشمند
                </Button>
              </div>
            </SectionCard>
          )}
          {d.checklists.map((r) => (
            <div key={r.id} className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <h3 className="text-[13px] font-extrabold">{r.title}</h3>
                <span className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold",
                  r.status === "تکمیل" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                )}>{r.status}</span>
                <span className="mr-auto text-[11px] tabular-nums text-muted-foreground">{faNum(r.done)}/{faNum(r.total)}</span>
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${r.total ? (r.done / r.total) * 100 : 0}%` }} />
              </div>
              <ul className="mt-3 space-y-1.5">
                {r.items.map((it) => (
                  <li key={it.id} className="flex items-center gap-2 text-[12px]">
                    {it.done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /> : <XCircle className="h-4 w-4 shrink-0 text-muted-foreground/40" />}
                    <span className={cn(it.done && "text-muted-foreground line-through")}>{it.title}</span>
                    {it.auto && <span className="rounded-full bg-cyan-100 px-1.5 py-0.5 text-[9px] font-bold text-cyan-700">تیک خودکار</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </TabsContent>
      </Tabs>

      {/* دیالوگ‌های ثبت سریع پرونده — نسخهٔ ۶.۱۱ */}
      <NewSessionDialog
        open={sessionOpen}
        onClose={() => setSessionOpen(false)}
        onSaved={onChanged}
        presetUser={{ id: p.id, name: p.name, family: p.family }}
      />
      <NewReserveDialog
        open={reserveOpen}
        onClose={() => setReserveOpen(false)}
        onSaved={onChanged}
        presetEventId={latestEventId}
      />
      <NewAcuteDialog
        open={acuteOpen}
        onClose={() => setAcuteOpen(false)}
        onSaved={onChanged}
        presetEventId={latestEventId}
      />
      <QuestionnaireDialog
        open={qOpen}
        onClose={() => setQOpen(false)}
        onSaved={onChanged}
        presetUserId={p.id}
      />
    </div>
  );
}
