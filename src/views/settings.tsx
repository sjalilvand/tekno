"use client";
// تنظیمات سامانه
import * as React from "react";
import { PageHeader, SectionCard, LoadingView } from "@/components/shared";
import { api, useQuery } from "@/lib/client";
import { Settings, Save, KeyRound, MonitorSmartphone } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { jDateTime } from "@/lib/jalali";
import { faNum } from "@/lib/jalali";

type SettingRow = { name: string; value: string | null; group: string };
type SessionRow = { id: string; ip: string | null; browser: string | null; dateTime: string; user: { name: string; family: string } };

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
