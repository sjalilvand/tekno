"use client";
// یکپارچه‌سازی‌ها — پیامک واقعی و وب‌سرویس سها
// پنل مدیریت: پیکربندی سرویس‌ها، ارسال صف پیامک، اجرای همگام‌سازی و مشاهدهٔ تاریخچه
import * as React from "react";
import { PageHeader, SectionCard, LoadingView, StatusBadge } from "@/components/shared";
import { api, useQuery } from "@/lib/client";
import { PlugZap, Send, RefreshCw, Save, History, ShieldCheck, CircleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { jDateTime, faNum } from "@/lib/jalali";

type SyncLogRow = {
  id: number; service: string; entity: string; direction: string; status: string;
  records: number; cursor: string | null; message: string | null; duration: number | null; createTime: string;
};

type IntegrationsData = {
  sms: {
    provider: string; apiKey: string; sender: string; username: string; password: string;
    baseUrl: string; enabled: boolean; configured: boolean;
  };
  soha: {
    enabled: boolean; baseUrl: string; username: string; password: string; apiKey: string;
    centerCode: string; protocol: string; configured: boolean;
    cursors: { entity: string; cursor: string | null }[];
  };
  queueStats: Record<string, number>;
  syncLogs: SyncLogRow[];
};

const SMS_PROVIDERS = [
  { value: "kavenegar", label: "کاوه‌نگار" },
  { value: "smsir", label: "SMS.ir" },
  { value: "mellipayamak", label: "ملی پیامک" },
  { value: "soha", label: "پنل سها" },
  { value: "mock", label: "شبیه‌ساز (تست)" },
];

export function IntegrationsView() {
  const { toast } = useToast();
  const { data, loading, refetch } = useQuery<IntegrationsData>(() => api("/api/integrations"), []);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [smsEdits, setSmsEdits] = React.useState<Partial<IntegrationsData["sms"]>>({});
  const [sohaEdits, setSohaEdits] = React.useState<Partial<IntegrationsData["soha"]>>({});

  if (loading || !data) return <LoadingView />;

  const sms = { ...data.sms, ...smsEdits };
  const soha = { ...data.soha, ...sohaEdits };
  const queued = data.queueStats["در صف"] ?? 0;
  const failed = data.queueStats["ناموفق"] ?? 0;
  const sent = data.queueStats["ارسال شده"] ?? 0;

  const save = async () => {
    setBusy("save");
    try {
      await api("/api/integrations", { method: "PUT", body: JSON.stringify({ sms: smsEdits, soha: sohaEdits }) });
      toast({ title: "تنظیمات یکپارچه‌سازی ذخیره شد" });
      setSmsEdits({}); setSohaEdits({});
      refetch();
    } catch (e: any) {
      toast({ title: "خطا در ذخیره", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const run = async (payload: Record<string, unknown>, okTitle: string) => {
    setBusy(payload.action as string);
    try {
      const res = await api<any>("/api/integrations/run", { method: "POST", body: JSON.stringify(payload) });
      toast({
        title: okTitle,
        description: "processed" in res
          ? `پردازش: ${faNum(res.processed)} | ارسال‌شده: ${faNum(res.sent)} | ناموفق: ${faNum(res.failed)}${res.enabled ? "" : " — سرویس پیامک غیرفعال است"}`
          : `رکوردهای همگام‌شده: ${faNum(res.records ?? 0)}`,
      });
      refetch();
    } catch (e: any) {
      toast({ title: "اجرای عملیات ناموفق بود", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const field = (label: string, value: string | undefined, onChange: (v: string) => void, placeholder = "", ltr = true) => (
    <div>
      <label className="mb-1 block text-[11px] font-bold text-muted-foreground">{label}</label>
      <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-8 text-xs" dir={ltr ? "ltr" : "rtl"} />
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="یکپارچه‌سازی‌ها"
        subtitle="پیامک واقعی، وب‌سرویس سها و تاریخچهٔ همگام‌سازی"
        icon={<PlugZap className="h-5 w-5" />}
        actions={
          <Button size="sm" onClick={save} disabled={busy !== null || (!Object.keys(smsEdits).length && !Object.keys(sohaEdits).length)}>
            {busy === "save" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            ذخیرهٔ تنظیمات
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---------------- پیامک واقعی ---------------- */}
        <SectionCard
          title="پیامک واقعی"
          subtitle="ارسال از صف پیامک‌های سامانه به سرویس‌دهندهٔ انتخابی"
          actions={<Switch checked={sms.enabled ?? false} onCheckedChange={(v) => setSmsEdits({ ...smsEdits, enabled: v })} aria-label="فعال‌سازی پیامک" />}
        >
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border bg-muted/40 px-3 py-2 text-center">
                <p className="text-[10px] text-muted-foreground">در صف</p>
                <p className="text-lg font-extrabold tabular-nums">{faNum(queued)}</p>
              </div>
              <div className="rounded-xl border bg-muted/40 px-3 py-2 text-center">
                <p className="text-[10px] text-muted-foreground">ارسال‌شده</p>
                <p className="text-lg font-extrabold tabular-nums text-emerald-600">{faNum(sent)}</p>
              </div>
              <div className="rounded-xl border bg-muted/40 px-3 py-2 text-center">
                <p className="text-[10px] text-muted-foreground">ناموفق</p>
                <p className="text-lg font-extrabold tabular-nums text-red-500">{faNum(failed)}</p>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-bold text-muted-foreground">سرویس‌دهنده</label>
              <Select value={sms.provider ?? "mock"} onValueChange={(v) => setSmsEdits({ ...smsEdits, provider: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SMS_PROVIDERS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {sms.provider === "mellipayamak" || sms.provider === "soha" ? (
              <div className="grid grid-cols-2 gap-3">
                {field("نام کاربری", sms.username, (v) => setSmsEdits({ ...smsEdits, username: v }))}
                {field("رمز عبور", sms.password, (v) => setSmsEdits({ ...smsEdits, password: v }))}
              </div>
            ) : null}
            {sms.provider === "soha" && field("آدرس پنل سها", sms.baseUrl, (v) => setSmsEdits({ ...smsEdits, baseUrl: v }), "https://sms.soha…/api")}
            {field(sms.provider === "mellipayamak" ? "— " : "کلید API", sms.apiKey, (v) => setSmsEdits({ ...smsEdits, apiKey: v }))}
            {field("خط ارسال (Sender)", sms.sender, (v) => setSmsEdits({ ...smsEdits, sender: v }), "+98… یا 5000…")}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" disabled={busy !== null || queued === 0} onClick={() => run({ action: "sms-dispatch", limit: 100 }, "صف پیامک اجرا شد")}>
                <Send className="h-4 w-4" /> ارسال صف ({faNum(queued)})
              </Button>
              <Button size="sm" variant="ghost" disabled={busy !== null || failed === 0} onClick={() => run({ action: "sms-dispatch", limit: 100, retry: true }, "تلاش مجدد انجام شد")}>
                <RefreshCw className="h-4 w-4" /> تلاش مجدد ناموفق‌ها
              </Button>
            </div>
            {!data.sms.configured && data.sms.provider !== "mock" && (
              <p className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                <CircleAlert className="h-3.5 w-3.5 shrink-0" /> کلید API یا نام کاربری سرویس‌دهنده هنوز تنظیم نشده است
              </p>
            )}
          </div>
        </SectionCard>

        {/* ---------------- وب‌سرویس سها ---------------- */}
        <SectionCard
          title="وب‌سرویس سها"
          subtitle="همگام‌سازی بیماران و ارجاعات با سامانهٔ سها"
          actions={<Switch checked={soha.enabled ?? false} onCheckedChange={(v) => setSohaEdits({ ...sohaEdits, enabled: v })} aria-label="فعال‌سازی سها" />}
        >
          <div className="space-y-3">
            {field("آدرس پایهٔ وب‌سرویس", soha.baseUrl, (v) => setSohaEdits({ ...sohaEdits, baseUrl: v }), "https://…/api")}
            <div className="grid grid-cols-2 gap-3">
              {field("نام کاربری", soha.username, (v) => setSohaEdits({ ...sohaEdits, username: v }))}
              {field("رمز عبور", soha.password, (v) => setSohaEdits({ ...sohaEdits, password: v }))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {field("کد مرکز", soha.centerCode, (v) => setSohaEdits({ ...sohaEdits, centerCode: v }))}
              <div>
                <label className="mb-1 block text-[11px] font-bold text-muted-foreground">کلید API (اختیاری)</label>
                <Input value={soha.apiKey ?? ""} onChange={(e) => setSohaEdits({ ...sohaEdits, apiKey: e.target.value })} className="h-8 text-xs" dir="ltr" />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run({ action: "soha-sync", entity: "Patients", direction: "IN" }, "همگام‌سازی بیماران اجرا شد")}>
                <RefreshCw className="h-4 w-4" /> بیماران
              </Button>
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run({ action: "soha-sync", entity: "Referrals", direction: "IN" }, "همگام‌سازی ارجاعات اجرا شد")}>
                <RefreshCw className="h-4 w-4" /> ارجاعات
              </Button>
              <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => run({ action: "soha-sync", entity: "Referrals", direction: "OUT" }, "اعلام وضعیت به سها انجام شد")}>
                <Send className="h-4 w-4" /> اعلام وضعیت به سها
              </Button>
            </div>

            {soha.cursors?.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold text-muted-foreground">آخرین نشانگر همگام‌سازی:</p>
                {soha.cursors.map((c) => (
                  <div key={c.entity} className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-1.5 text-[11px]">
                    <span className="font-bold">{c.entity}</span>
                    <span className="tabular-nums text-muted-foreground" dir="ltr">{c.cursor ?? "—"}</span>
                  </div>
                ))}
              </div>
            )}
            {!data.soha.configured && (
              <p className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                <CircleAlert className="h-3.5 w-3.5 shrink-0" /> آدرس وب‌سرویس و اطلاعات احراز هویت را تکمیل کنید
              </p>
            )}
          </div>
        </SectionCard>
      </div>

      {/* ---------------- تاریخچهٔ همگام‌سازی ---------------- */}
      <SectionCard
        title="تاریخچهٔ عملیات"
        subtitle="۲۵ اجرای اخیر وب‌سرویس سها و صف پیامک"
        actions={<History className="h-4 w-4 text-muted-foreground" />}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="border-b text-[10.5px] text-muted-foreground">
                <th className="pb-2 pl-2 font-bold">سرویس</th>
                <th className="pb-2 pl-2 font-bold">موجودیت</th>
                <th className="pb-2 pl-2 font-bold">جهت</th>
                <th className="pb-2 pl-2 font-bold">وضعیت</th>
                <th className="pb-2 pl-2 font-bold">رکورد</th>
                <th className="pb-2 pl-2 font-bold">مدت</th>
                <th className="pb-2 pl-2 font-bold">زمان</th>
                <th className="pb-2 font-bold">پیام</th>
              </tr>
            </thead>
            <tbody>
              {data.syncLogs.map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className="py-2 pl-2"><Badge variant="outline" className="text-[10px]">{l.service}</Badge></td>
                  <td className="py-2 pl-2 font-medium">{l.entity}</td>
                  <td className="py-2 pl-2 text-muted-foreground">{l.direction === "IN" ? "دریافت" : "ارسال"}</td>
                  <td className="py-2 pl-2"><StatusBadge status={l.status} /></td>
                  <td className="py-2 pl-2 tabular-nums">{faNum(l.records)}</td>
                  <td className="py-2 pl-2 tabular-nums text-muted-foreground">{l.duration != null ? `${faNum(Math.round(l.duration / 100) / 10)} ثانیه` : "—"}</td>
                  <td className="py-2 pl-2 tabular-nums text-muted-foreground">{jDateTime(l.createTime)}</td>
                  <td className="max-w-56 truncate py-2 text-muted-foreground" title={l.message ?? ""}>{l.message ?? "—"}</td>
                </tr>
              ))}
              {data.syncLogs.length === 0 && (
                <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">هنوز عملیاتی اجرا نشده است</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
        منطق اختصاصی سها و پیامک به‌صورت تدریجی از کد PHP منتقل می‌شود؛ نقاط قابل تنظیم در مستندات <span className="font-bold">docs/PHP-MIGRATION.md</span> آمده است.
      </p>
    </div>
  );
}
