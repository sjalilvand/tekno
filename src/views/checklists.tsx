"use client";
// =====================================================================
// تیک‌های هوشمند — نسخهٔ ۶.۱
// • الگوهای چک‌لیست استاندارد (پذیرش / مورد حاد / جلسهٔ معلق)
// • پیشنهاد هوشمند: روبهٔ سیستم پرونده‌های نیازمند را می‌یابد و چک‌لیست می‌سازد
// • تیک خودکار: آیتم‌های دارای قاعده وقتی شرط داده برقرار شود، خودکار تیک می‌خورند
// =====================================================================
import * as React from "react";
import { api } from "@/lib/client";
import { faNum, jDate } from "@/lib/jalali";
import { cn } from "@/lib/utils";
import { PageHeader, SectionCard, LoadingView } from "@/components/shared";
import { Button } from "@/components/ui/button";
import {
  ListChecks, Sparkles, CheckCircle2, Circle, Trash2, Plus, Loader2, Zap, Users, Siren, Clock,
} from "lucide-react";

type Tpl = { id: number; key: string; title: string; desc?: string | null; trigger: string; items: { title: string; autoRule?: string }[] };
type Item = { id: number; title: string; autoRule?: string | null; done: boolean; auto: boolean; doneAt?: string | null };
type Run = {
  id: number; templateTitle: string; templateKey: string; userId: number | null; eventId: number | null;
  title?: string | null; status: string; createdAt: string; completedAt?: string | null;
  items: Item[]; done: number; total: number; autoDone: number;
};

const TRIGGER_LABEL: Record<string, { text: string; icon: React.ElementType; tone: string }> = {
  new_client: { text: "پذیرش متقاضی جدید", icon: Users, tone: "bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300" },
  acute: { text: "مورد حاد (EMS)", icon: Siren, tone: "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300" },
  approval_stuck: { text: "جلسهٔ معلق در تایید", icon: Clock, tone: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300" },
  manual: { text: "دستی", icon: Plus, tone: "bg-muted text-muted-foreground" },
};

export function ChecklistsView() {
  const [data, setData] = React.useState<{ templates: Tpl[]; runs: Run[]; openCount: number; openItems: number } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [suggesting, setSuggesting] = React.useState(false);
  const [creating, setCreating] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try { setData(await api("/api/checklists")); } catch { /* ignore */ }
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const suggest = async () => {
    setSuggesting(true);
    try {
      const r = await api<{ created: number }>("/api/checklists", { method: "POST", body: JSON.stringify({ action: "suggest" }) });
      if (r.created > 0) { /* بازخوانی خودکار */ }
      await load();
    } catch { /* ignore */ }
    setSuggesting(false);
  };

  const createRun = async (tpl: Tpl) => {
    const userIdStr = prompt("شناسهٔ متقاضی (اختیاری — خالی بگذارید):");
    setCreating(tpl.key);
    try {
      await api("/api/checklists", {
        method: "POST",
        body: JSON.stringify({
          action: "create", templateKey: tpl.key,
          userId: userIdStr && userIdStr.trim() ? Number(userIdStr.trim()) : null,
        }),
      });
      await load();
    } catch { /* ignore */ }
    setCreating(null);
  };

  const toggle = async (run: Run, item: Item) => {
    // بهینه‌سازی: تغییر محلی فوری + همگام‌سازی
    const next = !item.done;
    setData((d) => d ? ({
      ...d,
      runs: d.runs.map((r) => r.id === run.id ? {
        ...r,
        items: r.items.map((i) => i.id === item.id ? { ...i, done: next, auto: false } : i),
        done: r.done + (next ? 1 : -1),
        status: (r.done + (next ? 1 : -1)) === r.total ? "تکمیل" : "در جریان",
      } : r),
      openItems: d.openItems + (next ? -1 : 1),
    }) : d);
    try {
      await api("/api/checklists", { method: "POST", body: JSON.stringify({ action: "toggle", itemId: item.id, done: next }) });
    } catch { await load(); }
  };

  const deleteRun = async (runId: number) => {
    if (!confirm("این چک‌لیست حذف شود؟")) return;
    await api("/api/checklists", { method: "POST", body: JSON.stringify({ action: "deleteRun", runId }) });
    await load();
  };

  if (loading) return <LoadingView label="در حال بارگذاری تیک‌های هوشمند..." />;

  const runs = data?.runs ?? [];
  const templates = data?.templates ?? [];
  const openRuns = runs.filter((r) => r.status === "در جریان");
  const doneRuns = runs.filter((r) => r.status !== "در جریان");

  return (
    <div className="space-y-5">
      <PageHeader
        title="تیک‌های هوشمند"
        subtitle="چک‌لیست‌های استاندارد با تیک خودکار بر اساس دادهٔ واقعی پرونده"
        icon={<ListChecks className="h-5 w-5" />}
        actions={
          <Button className="brand-gradient gap-2 text-white" onClick={suggest} disabled={suggesting}>
            {suggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            پیشنهاد هوشمند
          </Button>
        }
      />

      {/* نوار آمار */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatMini title="چک‌لیست در جریان" value={data?.openCount ?? 0} tone="amber" />
        <StatMini title="آیتم باز" value={data?.openItems ?? 0} tone="rose" />
        <StatMini title="الگوی فعال" value={templates.length} tone="teal" />
        <StatMini title="تیک‌های خودکار امروزی" value={runs.reduce((a, r) => a + r.autoDone, 0)} tone="cyan" />
      </div>

      {/* الگوها */}
      <SectionCard title="الگوهای چک‌لیست" subtitle="ساخت دستی چک‌لیست از الگو — یا اجازه دهید «پیشنهاد هوشمند» خودش پرونده‌ها را بیابد">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {templates.map((t) => {
            const trig = TRIGGER_LABEL[t.trigger] ?? TRIGGER_LABEL.manual;
            return (
              <div key={t.id} className="flex flex-col rounded-2xl border bg-muted/30 p-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-[13px] font-extrabold">{t.title}</h3>
                  <span className={cn("mr-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold", trig.tone)}>
                    <trig.icon className="h-3 w-3" /> {trig.text}
                  </span>
                </div>
                {t.desc && <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">{t.desc}</p>}
                <ul className="mt-2 space-y-1">
                  {t.items.slice(0, 4).map((i, j) => (
                    <li key={j} className="flex items-start gap-1.5 text-[11.5px] text-foreground/80">
                      <Circle className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/50" /> {i.title}
                      {i.autoRule && <Zap className="mt-0.5 h-3 w-3 shrink-0 text-cyan-500" aria-label="تیک خودکار" />}
                    </li>
                  ))}
                  {t.items.length > 4 && <li className="text-[10.5px] text-muted-foreground">و {faNum(t.items.length - 4)} مورد دیگر...</li>}
                </ul>
                <div className="mt-3 flex-1" />
                <Button variant="outline" size="sm" className="w-full gap-1.5 text-[11.5px]" onClick={() => createRun(t)} disabled={creating === t.key}>
                  {creating === t.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} ایجاد چک‌لیست
                </Button>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* در جریان */}
      <RunList title="چک‌لیست‌های در جریان" runs={openRuns} onToggle={toggle} onDelete={deleteRun} emptyText="چک‌لیست بازی در جریان نیست — از «پیشنهاد هوشمند» استفاده کنید." />
      {/* تکمیل‌شده */}
      <RunList title="تکمیل‌شده" runs={doneRuns.slice(0, 12)} onToggle={toggle} onDelete={deleteRun} emptyText="چک‌لیست تکمیل‌شده‌ای وجود ندارد." />
    </div>
  );
}

function RunList({
  title, runs, onToggle, onDelete, emptyText,
}: {
  title: string;
  runs: Run[];
  onToggle: (r: Run, i: Item) => void;
  onDelete: (id: number) => void;
  emptyText: string;
}) {
  return (
    <SectionCard title={title} subtitle={`${faNum(runs.length)} مورد`}>
      {runs.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {runs.map((r) => (
            <div key={r.id} className="rounded-2xl border bg-card p-4">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-[13px] font-extrabold">{r.templateTitle}</h3>
                {r.title && <span className="truncate rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{r.title}</span>}
                <span className={cn("mr-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                  r.status === "تکمیل" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300")}>
                  {r.status}
                </span>
                <button onClick={() => onDelete(r.id)} className="text-muted-foreground transition-colors hover:text-rose-500" aria-label="حذف چک‌لیست">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {r.userId && <p className="mt-1 text-[10.5px] text-muted-foreground">متقاضی #{faNum(r.userId)}{r.eventId ? ` — جلسهٔ #${faNum(r.eventId)}` : ""} — {jDate(r.createdAt)}</p>}
              <div className="mt-2 flex items-center gap-2">
                <div className="h-2 flex-1 rounded-full bg-muted">
                  <div className={cn("h-full rounded-full transition-all", r.status === "تکمیل" ? "bg-emerald-500" : "bg-primary")} style={{ width: `${r.total ? (r.done / r.total) * 100 : 0}%` }} />
                </div>
                <span className="text-[11px] font-bold tabular-nums">{faNum(r.done)}/{faNum(r.total)}</span>
              </div>
              <ul className="mt-3 space-y-1.5">
                {r.items.map((i) => (
                  <li key={i.id}>
                    <button
                      onClick={() => onToggle(r, i)}
                      className="flex w-full items-start gap-2 rounded-lg px-1.5 py-1 text-right transition-colors hover:bg-muted/60"
                    >
                      {i.done
                        ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                        : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" />}
                      <span className={cn("text-[12px] leading-5", i.done && "text-muted-foreground line-through")}>{i.title}</span>
                      {i.auto && <span className="ml-auto shrink-0 rounded-full bg-cyan-100 px-1.5 py-0.5 text-[9px] font-bold text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">خودکار</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function StatMini({ title, value, tone }: { title: string; value: number; tone: "amber" | "rose" | "teal" | "cyan" }) {
  const tones: Record<string, string> = {
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
    rose: "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
    teal: "bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300",
    cyan: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300",
  };
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", tones[tone])}>
        <ListChecks className="h-4 w-4" />
      </span>
      <p className="mt-2.5 text-xl font-extrabold tabular-nums">{faNum(value)}</p>
      <p className="text-[11.5px] text-muted-foreground">{title}</p>
    </div>
  );
}
