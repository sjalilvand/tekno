"use client";
// تنظیمات سامانه — شامل مدیریت اتصال پایگاه داده
import * as React from "react";
import { PageHeader, SectionCard, LoadingView } from "@/components/shared";
import { api, useQuery } from "@/lib/client";
import { Settings, Save, KeyRound, MonitorSmartphone, Database, PlugZap, RefreshCw, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { jDateTime, faNum } from "@/lib/jalali";

type SettingRow = { name: string; value: string | null; group: string };
type SessionRow = { id: string; ip: string | null; browser: string | null; dateTime: string; user: { name: string; family: string } };

type DbInfo = {
  engine: string;
  current: { engine: string; host: string; port: string; database: string; user: string; password: string } | null;
  urlMasked: string;
  live: { ok: boolean; message: string; version?: string; latencyMs?: number; tablesCount?: number };
  envFile: boolean;
};

function DatabaseConnectionCard() {
  const { toast } = useToast();
  const { data, loading, refetch } = useQuery<DbInfo>(() => api("/api/database"), []);
  const [form, setForm] = React.useState({ host: "127.0.0.1", port: "3306", database: "", user: "root", password: "" });
  const [testing, setTesting] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{ ok: boolean; message: string; version?: string; latencyMs?: number } | null>(null);
  const [savedInfo, setSavedInfo] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (data?.current && data.engine === "mysql") {
      setForm((f) => ({ ...f, host: data.current!.host, port: data.current!.port, database: data.current!.database, user: data.current!.user }));
    }
  }, [data]);

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await api<{ ok: boolean; message: string; version?: string; latencyMs?: number }>("/api/database", {
        method: "POST",
        body: JSON.stringify({ action: "test", ...form }),
      });
      setTestResult(r);
    } catch (e: any) {
      setTestResult({ ok: false, message: e?.message ?? "خطا در تست اتصال" });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await api<{ saved: boolean; urlMasked: string; nextStep: string }>("/api/database", {
        method: "POST",
        body: JSON.stringify({ action: "save", ...form }),
      });
      setSavedInfo(r.nextStep);
      toast({ title: "اتصال جدید در فایل .env ذخیره شد" });
      refetch();
    } catch (e: any) {
      toast({ title: e?.message ?? "خطا در ذخیرهٔ اتصال", variant: "destructive" as never });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <SectionCard title="اتصال پایگاه داده"><LoadingView label="در حال بررسی اتصال..." /></SectionCard>;

  return (
    <SectionCard
      title="اتصال پایگاه داده"
      subtitle="وضعیت اتصال فعلی، تست اتصال جدید و تغییر آدرس پایگاه داده"
    >
      {/* وضعیت فعلی */}
      <div className="rounded-xl border bg-muted/30 p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <span className="flex items-center gap-1.5 font-extrabold text-foreground"><Database className="h-4 w-4 text-primary" /> اتصال فعلی</span>
          {data?.live.ok ? (
            <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10.5px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" /> متصل{data.live.version ? ` — MySQL ${data.live.version}` : ""}
              {data.live.latencyMs ? ` (${faNum(data.live.latencyMs)} میلی‌ثانیه)` : ""}
              {data.live.tablesCount ? ` — ${faNum(data.live.tablesCount)} جدول` : ""}
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[10.5px] font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
              <XCircle className="h-3.5 w-3.5" /> {data?.live.message ?? "قطع"}
            </span>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={refetch} aria-label="بازبینی"><RefreshCw className="h-3.5 w-3.5" /></Button>
        </div>
        <p className="mt-2 truncate text-[11px] text-muted-foreground" dir="ltr">{data?.urlMasked}</p>
      </div>

      {/* فرم اتصال جدید */}
      <div className="mt-4 border-t pt-4">
        <p className="mb-3 text-xs font-extrabold">تغییر اتصال به MySQL</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-muted-foreground">آدرس سرور (Host)</p>
            <Input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} className="h-9 text-xs" dir="ltr" placeholder="127.0.0.1" />
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-muted-foreground">پورت</p>
            <Input value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} className="h-9 text-xs" dir="ltr" placeholder="3306" />
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-muted-foreground">نام پایگاه داده</p>
            <Input value={form.database} onChange={(e) => setForm({ ...form, database: e.target.value })} className="h-9 text-xs" dir="ltr" placeholder="rahe_zendegi" />
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-muted-foreground">نام کاربری</p>
            <Input value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} className="h-9 text-xs" dir="ltr" placeholder="root" />
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-muted-foreground">رمز عبور</p>
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="h-9 text-xs" dir="ltr" placeholder="••••••••" />
          </div>
          <div className="flex items-end gap-2">
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={test} disabled={testing}>
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />} تست اتصال
            </Button>
            <Button size="sm" className="h-9 gap-1.5" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} ذخیرهٔ اتصال
            </Button>
          </div>
        </div>

        {testResult && (
          <div className={`mt-3 rounded-xl border px-4 py-3 text-xs leading-6 ${testResult.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300" : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"}`}>
            {testResult.ok ? (
              <>
                <b>اتصال موفق</b> — نسخهٔ سرور: {testResult.version} — تأخیر: {faNum(testResult.latencyMs ?? 0)} میلی‌ثانیه. حالا «ذخیرهٔ اتصال» را بزنید.
              </>
            ) : (
              <>
                <b>اتصال ناموفق:</b> {testResult.message}
              </>
            )}
          </div>
        )}
        {savedInfo && (
          <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs leading-6 text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300">
            <b>ذخیره شد.</b> {savedInfo}
          </div>
        )}
        <p className="mt-3 text-[10.5px] leading-5 text-muted-foreground">
          نکته: ذخیرهٔ اتصال فقط فایل <code dir="ltr">.env</code> را تغییر می‌دهد؛ تا پیش از اجرای مجدد سامانه، اتصال فعلی تغییر نمی‌کند. رمز عبور هرگز ذخیره یا نمایش داده نمی‌شود.
        </p>
      </div>
    </SectionCard>
  );
}

export function SettingsView() {
  const { toast } = useToast();
  const { data, loading, refetch } = useQuery<{ settings: SettingRow[]; apiTokens: { id: number; title: string; token: string; isActive: boolean }[]; sessions: SessionRow[] }>(
    () => api("/api/settings"), []
  );
  const [edits, setEdits] = React.useState<Record<string, string>>({});

  const save = async (name: string) => {
    await api("/api/settings", { method: "PUT", body: JSON.stringify({ name, value: edits[name] ?? undefined }) });
    toast({ title: "تنظیم ذخیره شد" });
    refetch();
  };

  if (loading) return <LoadingView />;

  const groups = Array.from(new Set(data?.settings.map((s) => s.group) ?? []));

  return (
    <div className="space-y-6">
      <PageHeader title="تنظیمات سامانه" subtitle="پیکربندی عمومی، پیامک، جلسات و موارد حاد" icon={<Settings className="h-5 w-5" />} />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <DatabaseConnectionCard />
        </div>
        {groups.map((g) => (
          <SectionCard key={g} title={`تنظیمات ${g}`}>
            <div className="space-y-3">
              {data?.settings.filter((s) => s.group === g).map((s) => {
                const isBool = s.value === "true" || s.value === "false";
                return (
                  <div key={s.name} className="flex items-center justify-between gap-3 rounded-xl border bg-muted/40 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold">{s.name}</p>
                      {isBool ? (
                        <p className="text-[10.5px] text-muted-foreground">{s.value === "true" ? "فعال" : "غیرفعال"}</p>
                      ) : (
                        <Input
                          value={edits[s.name] ?? s.value ?? ""}
                          onChange={(e) => setEdits({ ...edits, [s.name]: e.target.value })}
                          className="mt-1 h-7 border-dashed text-xs"
                        />
                      )}
                    </div>
                    {isBool ? (
                      <Switch
                        checked={s.value === "true"}
                        onCheckedChange={async (v) => {
                          await api("/api/settings", { method: "PUT", body: JSON.stringify({ name: s.name, value: String(v) }) });
                          toast({ title: "تنظیم ذخیره شد" });
                          refetch();
                        }}
                        aria-label={s.name}
                      />
                    ) : (
                      <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => save(s.name)} aria-label="ذخیره">
                        <Save className="h-4 w-4 text-primary" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </SectionCard>
        ))}

        <SectionCard title="توکن‌های API" subtitle="احراز هویت سرویس‌های خارجی">
          <div className="space-y-2.5">
            {data?.apiTokens.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-xl border bg-muted/40 px-4 py-3">
                <KeyRound className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold">{t.title}</p>
                  <p className="truncate text-[10px] tabular-nums text-muted-foreground" dir="ltr">{t.token.slice(0, 12)}••••••••</p>
                </div>
                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 text-[10px]">{t.isActive ? "فعال" : "غیرفعال"}</Badge>
              </div>
            ))}
            {data?.apiTokens.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">توکنی ثبت نشده است</p>}
          </div>
        </SectionCard>

        <SectionCard title="نشست‌های اخیر" subtitle="ورودهای اخیر کاربران">
          <ul className="max-h-72 space-y-2.5 overflow-y-auto">
            {data?.sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-3 rounded-xl border bg-muted/40 px-4 py-2.5">
                <MonitorSmartphone className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold">{s.user.name} {s.user.family}</p>
                  <p className="truncate text-[10px] text-muted-foreground" dir="ltr">{s.browser?.slice(0, 44)}</p>
                </div>
                <div className="text-left">
                  <p className="text-[10px] tabular-nums text-muted-foreground" dir="ltr">{s.ip}</p>
                  <p className="text-[10px] tabular-nums text-muted-foreground">{jDateTime(s.dateTime)}</p>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
