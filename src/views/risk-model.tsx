"use client";
// =====================================================================
// مدل کیس حاد و ریسک — داشبورد کاوش داده و پیش‌بینی
//   ۱) الگوهای کشف‌شده از سوابق کیس‌های حاد (کاوش الگو با نسبت شدت)
//   ۲) درصد ریسک هر متقاضی (۰-۱۰۰) با عوامل مؤثر
//   ۳) هشدار خودکار به مشاوران برای متقاضیان بالای آستانه
// =====================================================================
import * as React from "react";
import { PageHeader, SectionCard, StatCard, LoadingView, NameAvatar } from "@/components/shared";
import { faNum, faDigits, jDateTime } from "@/lib/jalali";
import { api, navigate, useQuery } from "@/lib/client";
import {
  BrainCircuit, Siren, Users, Sparkles, BellRing, FolderOpen, AlertTriangle,
  TrendingUp, RefreshCw, Gauge, Info, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type RiskPattern = { key: string; category: string; label: string; acuteCount: number; acuteRate: number; baseRate: number; lift: number };
type RiskFactor = { label: string; lift: number };
type RiskApplicant = {
  id: number; name: string; family: string; nid: string; avatarColor: string | null;
  gender: string | null; age: number | null; sessions: number; acuteCount: number;
  severityHigh: boolean; lastAcuteAt: string | null;
  risk: number; level: "کم" | "متوسط" | "بالا" | "بحرانی";
  factors: RiskFactor[]; acceptors: { id: number; name: string; family: string }[];
};
type AlertItem = { id: number; title: string; body: string | null; createdAt: string };
type Payload = {
  model: { trainedAt: string; totalUsers: number; acuteUsers: number; baseline: number; patterns: RiskPattern[]; insufficient: boolean; message: string | null };
  applicants: RiskApplicant[];
  alerts: AlertItem[];
};

const LEVEL_STYLE: Record<string, { chip: string; bar: string; dot: string }> = {
  "بحرانی": { chip: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300", bar: "bg-rose-500", dot: "bg-rose-500" },
  "بالا": { chip: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300", bar: "bg-orange-500", dot: "bg-orange-500" },
  "متوسط": { chip: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300", bar: "bg-amber-400", dot: "bg-amber-400" },
  "کم": { chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300", bar: "bg-emerald-400", dot: "bg-emerald-400" },
};

export function RiskModelView() {
  const { toast } = useToast();
  const [threshold, setThreshold] = React.useState(55);
  const [levelFilter, setLevelFilter] = React.useState<string>("همه");
  const [sending, setSending] = React.useState(false);
  const { data, loading, refetch, error } = useQuery<Payload>(() => api("/api/risk-model"), []);

  const model = data?.model;
  const applicants = data?.applicants ?? [];
  const highRisk = React.useMemo(() => applicants.filter((a) => a.risk >= threshold), [applicants, threshold]);
  const shown = React.useMemo(
    () => (levelFilter === "همه" ? applicants : applicants.filter((a) => a.level === levelFilter)).slice(0, 80),
    [applicants, levelFilter]
  );

  const sendAlerts = async () => {
    setSending(true);
    try {
      const r = await api<{ sent: number; targets: number; message: string }>("/api/risk-model", {
        method: "POST",
        body: JSON.stringify({ action: "alert", threshold }),
      });
      toast({ title: r.message ?? "هشدارها ارسال شد" });
      refetch();
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    }
    setSending(false);
  };

  if (loading) return <LoadingView label="در حال کاوش داده‌ها و ساخت مدل..." />;
  if (error || !model) {
    return (
      <div className="space-y-5">
        <PageHeader title="مدل کیس حاد و ریسک" subtitle="کاوش الگو و پیش‌بینی ریسک متقاضیان" icon={<BrainCircuit className="h-5 w-5" />} />
        <div className="rounded-3xl border border-dashed p-16 text-center text-sm text-muted-foreground">{error ?? "مدل در دسترس نیست"}</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="مدل کیس حاد و ریسک"
        subtitle="کشف خودکار الگوهای کیس حاد از داده‌ها و برآورد درصد ریسک هر متقاضی — با هشدار به مشاوران"
        icon={<BrainCircuit className="h-5 w-5" />}
      />

      {/* کارت‌های آماری */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard title="متقاضیان تحلیل‌شده" value={faNum(model.totalUsers)} icon={<Users className="h-4 w-4" />} tone="teal" />
        <StatCard title="کیس‌های حاد تاریخی" value={faNum(model.acuteUsers)} icon={<Siren className="h-4 w-4" />} tone="rose" hint={model.totalUsers ? `نرخ پایه: ${faNum(Math.round(model.baseline * 100))}٪` : undefined} />
        <StatCard title="الگوهای کشف‌شده" value={faNum(model.patterns.length)} icon={<Sparkles className="h-4 w-4" />} tone="cyan" />
        <StatCard title={`پرخطر بالای ${faNum(threshold)}٪`} value={faNum(highRisk.length)} icon={<AlertTriangle className="h-4 w-4" />} tone="amber" />
      </div>

      {model.message && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] leading-6 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
          <Info className="mt-1 h-4 w-4 shrink-0" />
          <span>{model.message}</span>
        </div>
      )}

      {/* الگوهای کشف‌شده */}
      <SectionCard title="الگوهای کشف‌شده از داده‌ها (کاوش الگو)" subtitle="نسبت شدت هر ویژگی در بروز کیس حاد — عدد بالاتر یعنی ریسک بیشتر" bodyClass="p-4">
        {model.patterns.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">هنوز الگوی معناداری کشف نشده — با ثبت بیشتر فرم‌های «موارد حاد»، مدل دقیق‌تر می‌شود.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
            {model.patterns.map((p, i) => (
              <div key={p.key} className="rounded-2xl border bg-card p-3.5 transition-all hover:shadow-md">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-[12.5px] font-extrabold">
                      <span className={cn("flex h-5 w-5 items-center justify-center rounded-md text-[9px] font-black text-white", i < 3 ? "bg-rose-500" : "bg-slate-400")}>{faNum(i + 1)}</span>
                      {p.label}
                    </p>
                    <p className="mt-0.5 pr-6 text-[10px] text-muted-foreground">{p.category} — در {faNum(Math.round(p.acuteRate * 100))}٪ کیس‌های حاد دیده شده (حالت پایه {faNum(Math.round(p.baseRate * 100))}٪)</p>
                  </div>
                  <Badge className={cn("shrink-0 text-[10.5px] font-black", p.lift >= 3 ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300" : p.lift >= 2 ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300")}>
                    <TrendingUp className="ml-1 h-3 w-3" /> {faNum(p.lift.toFixed(1))}×
                  </Badge>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full rounded-full transition-all", p.lift >= 3 ? "bg-rose-500" : p.lift >= 2 ? "bg-orange-500" : "bg-amber-400")} style={{ width: `${Math.min(p.lift / 5, 1) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* آستانه و ارسال هشدار */}
      <SectionCard bodyClass="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-primary" />
            <span className="text-[12px] font-bold">آستانهٔ هشدار:</span>
            <Input type="number" min={10} max={95} value={threshold} onChange={(e) => setThreshold(Math.max(10, Math.min(Number(e.target.value) || 55, 95)))} className="h-9 w-20 text-center" />
            <span className="text-[12px] font-bold">٪</span>
          </div>
          <input
            type="range" min={10} max={95} value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="h-1.5 min-w-40 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-[#a83a54]"
            aria-label="آستانهٔ ریسک"
          />
          <Button className="brand-gradient h-9 gap-1.5 text-white" onClick={sendAlerts} disabled={sending || highRisk.length === 0}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
            هشدار به مشاوران ({faNum(highRisk.length)} نفر)
          </Button>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => { refetch(); toast({ title: "مدل بازسازی شد" }); }}>
            <RefreshCw className="h-3.5 w-3.5" /> بازمحاسبه
          </Button>
        </div>
        <p className="mt-2 text-[10.5px] text-muted-foreground">
          هشدارها در زنگ اعلان بالای صفحه برای مشاورِ هر متقاضی و مدیران سامانه نمایش داده می‌شود؛ برای هر متقاضی حداکثر یک بار در ۲۴ ساعت.
        </p>
      </SectionCard>

      {/* فیلتر سطح ریسک */}
      <div className="flex flex-wrap items-center gap-1.5">
        {["همه", "بحرانی", "بالا", "متوسط", "کم"].map((lv) => {
          const count = lv === "همه" ? applicants.length : applicants.filter((a) => a.level === lv).length;
          return (
            <button
              key={lv}
              onClick={() => setLevelFilter(lv)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-[11.5px] font-bold transition-all",
                levelFilter === lv ? "brand-gradient border-transparent text-white shadow-md" : "bg-card text-muted-foreground hover:border-ring hover:text-foreground"
              )}
            >
              {lv} <span className="opacity-70">({faNum(count)})</span>
            </button>
          );
        })}
      </div>

      {/* جدول متقاضیان پرریسک */}
      {shown.length === 0 ? (
        <div className="rounded-3xl border border-dashed py-16 text-center text-xs text-muted-foreground">
          {applicants.length === 0 ? "داده‌ای برای تحلیل وجود ندارد" : "متقاضی‌ای در این سطح یافت نشد"}
        </div>
      ) : (
        <div className="space-y-2.5">
          {shown.map((a) => {
            const st = LEVEL_STYLE[a.level];
            return (
              <div key={a.id} className={cn("rounded-2xl border bg-card p-4 transition-all hover:shadow-md", a.level === "بحرانی" && "border-rose-300 dark:border-rose-800")}>
                <div className="flex flex-wrap items-center gap-3">
                  <NameAvatar name={a.name} family={a.family} color={a.avatarColor} size={42} />
                  <div className="min-w-40 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-[13px] font-extrabold">{a.name} {a.family}</p>
                      <Badge className={cn("text-[9.5px] font-black", st.chip)}>{a.level}</Badge>
                      {a.acuteCount > 0 && <Badge variant="outline" className="text-[9.5px] text-rose-600">سابقهٔ حاد: {faNum(a.acuteCount)}</Badge>}
                      {a.severityHigh && <Badge variant="outline" className="text-[9.5px] text-rose-600">شدت بالا</Badge>}
                    </div>
                    <p className="mt-0.5 text-[10.5px] tabular-nums text-muted-foreground">
                      کد ملی {faDigits(a.nid)}{a.age ? ` — ${faNum(a.age)} ساله` : ""}{a.gender ? ` — ${a.gender}` : ""} — {faNum(a.sessions)} جلسه
                    </p>
                  </div>
                  {/* نوار ریسک */}
                  <div className="flex min-w-44 items-center gap-2">
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className={cn("h-full rounded-full transition-all duration-500", st.bar)} style={{ width: `${a.risk}%` }} />
                    </div>
                    <span className={cn("w-12 text-left text-[13px] font-black tabular-nums", a.level === "بحرانی" ? "text-rose-600" : a.level === "بالا" ? "text-orange-600" : "text-muted-foreground")}>{faNum(a.risk)}٪</span>
                  </div>
                  <Button size="sm" variant="outline" className="h-8 gap-1 text-[11px]" onClick={() => navigate(`cartable?u=${a.id}`)}>
                    <FolderOpen className="h-3.5 w-3.5" /> کارتابل
                  </Button>
                </div>
                {a.factors.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pr-1">
                    <span className="text-[10px] font-bold text-muted-foreground">عوامل مؤثر:</span>
                    {a.factors.slice(0, 4).map((f) => (
                      <span key={f.label} className="rounded-full bg-muted/70 px-2 py-0.5 text-[9.5px] font-bold text-foreground/80">
                        {f.label} <span className="text-rose-500">{faNum(f.lift.toFixed(1))}×</span>
                      </span>
                    ))}
                    {a.acceptors.length > 0 && (
                      <span className="mr-auto text-[10px] text-muted-foreground">مشاور: {a.acceptors.map((x) => `${x.name} ${x.family}`).join("، ")}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* تاریخچهٔ هشدارها */}
      {(data?.alerts?.length ?? 0) > 0 && (
        <SectionCard title="آخرین هشدارهای ارسال‌شده به مشاوران" bodyClass="p-4">
          <div className="space-y-1.5">
            {data!.alerts.map((n) => (
              <div key={n.id} className="flex items-start gap-2.5 rounded-xl px-3 py-2 transition-colors hover:bg-muted/50">
                <Siren className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11.5px] font-bold leading-5">{n.title}</p>
                  {n.body && <p className="mt-0.5 line-clamp-1 text-[10.5px] text-muted-foreground">{n.body}</p>}
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground">{jDateTime(n.createdAt)}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
