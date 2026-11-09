"use client";
// نوار وضعیت اتصال پایگاه داده — در صورت قطعی، هشدار قرمز با دلیل و دکمهٔ تلاش مجدد
import * as React from "react";
import { Database, AlertTriangle, RefreshCw, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Health = { ok: boolean; latencyMs: number; engine: string; error: string | null };

export function DbStatusBanner() {
  const [health, setHealth] = React.useState<Health | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);

  const check = React.useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      setHealth(await res.json());
    } catch {
      setHealth({ ok: false, latencyMs: 0, engine: "—", error: "پاسخی از سرور دریافت نشد" });
    }
    setChecking(false);
  }, []);

  React.useEffect(() => {
    check();
    const t = setInterval(check, 60_000); // بررسی هر یک دقیقه
    return () => clearInterval(t);
  }, [check]);

  if (!health || health.ok || dismissed) return null;

  return (
    <div className="mx-4 mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-rose-900 shadow-sm dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-100">
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-100 dark:bg-rose-900">
        {checking ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-300" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-extrabold">اتصال پایگاه داده برقرار نیست ({health.engine})</p>
        <p className="mt-0.5 text-[11.5px] leading-5 text-rose-800 dark:text-rose-200">{health.error ?? "خطای نامشخص در اتصال"}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" className="h-8 gap-1.5 border-rose-300 text-rose-800 hover:bg-rose-100 dark:text-rose-100" onClick={check} disabled={checking}>
          <RefreshCw className={cnSpin(checking)} /> تلاش مجدد
        </Button>
        <Button size="sm" variant="ghost" className="h-8 text-rose-700 hover:bg-rose-100 dark:text-rose-200" onClick={() => setDismissed(true)}>
          بستن
        </Button>
      </div>
    </div>
  );
}

/** نشانگر کوچک سبز/قرمز کنار عنوان برند */
export function DbStatusDot() {
  const [health, setHealth] = React.useState<Health | null>(null);
  React.useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        const d = await res.json();
        if (alive) setHealth(d);
      } catch { /* noop */ }
    };
    run();
    const t = setInterval(run, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  if (!health) return null;
  return (
    <span
      title={health.ok ? `پایگاه داده متصل است (${health.engine} — ${health.latencyMs}ms)` : `قطع اتصال: ${health.error ?? ""}`}
      className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-[9.5px] font-bold text-muted-foreground"
    >
      {health.ok ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <AlertTriangle className="h-3 w-3 text-rose-500" />}
      <Database className="h-3 w-3" />
      {health.ok ? `${health.engine} · ${health.latencyMs}ms` : "قطع اتصال"}
    </span>
  );
}

function cnSpin(active: boolean) {
  return active ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5";
}
