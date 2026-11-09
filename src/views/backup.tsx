"use client";
// =====================================================================
// داده و پشتیبان — به‌روزرسانی داده با پشتیبان جدید + وضعیت اتصال دیتابیس
// =====================================================================
import * as React from "react";
import { PageHeader, LoadingView, SectionCard, DotBadge, DateCell } from "@/components/shared";
import { faNum, jDateTime } from "@/lib/jalali";
import { api, useQuery } from "@/lib/client";
import { DatabaseBackup, HardDriveDownload, RefreshCw, Play, Database, FolderSearch, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

type Job = { id: number; source: string; mode: string; status: string; progress: number; tablesDone: number; tablesAll: number; startedAt: string; finishedAt: string | null };
type BackupData = {
  jobs: Job[];
  db: { engine: string; target: string; provider: string };
  candidates: { path: string; sizeMb: number }[];
};
type JobStatus = {
  job: Job;
  tables: { name: string; rows: number; done: boolean }[];
  phase: string;
  logTail: string;
};

export function BackupView() {
  const { toast } = useToast();
  const { data, loading, refetch } = useQuery<BackupData>(() => api("/api/backup"), []);
  const [source, setSource] = React.useState("");
  const [mode, setMode] = React.useState("append");
  const [busy, setBusy] = React.useState(false);
  const [watchId, setWatchId] = React.useState<number | null>(null);
  const status = useQuery<JobStatus>(() => (watchId ? api(`/api/backup/${watchId}`) : Promise.resolve(null)), [watchId]);

  React.useEffect(() => {
    if (data?.candidates.length && !source) setSource(data.candidates[0].path);
  }, [data, source]);

  // پایش پیشرفت کار در حال اجرا
  React.useEffect(() => {
    if (!watchId) return;
    const t = setInterval(() => status.refetch(), 4000);
    return () => clearInterval(t);
  }, [watchId, status]);

  // اتمام کار
  React.useEffect(() => {
    const st = status.data?.job?.status;
    if (watchId && (st === "done" || st === "failed")) {
      toast({ title: st === "done" ? "به‌روزرسانی داده کامل شد ✅" : "انتقال داده با خطا مواجه شد — لاگ را ببینید", variant: st === "done" ? "default" : "destructive" });
      setWatchId(null);
      refetch();
    }
  }, [status.data?.job?.status, watchId, toast, refetch]);

  const start = async () => {
    if (!source) return;
    setBusy(true);
    try {
      const r = await api<{ job: Job }>("/api/backup", { method: "POST", body: JSON.stringify({ source, mode }) });
      toast({ title: "کار انتقال شروع شد — پیشرفت در همین صفحه دیده می‌شود" });
      setWatchId(r.job.id);
      refetch();
    } catch (e) { toast({ title: (e as Error).message, variant: "destructive" }); }
    setBusy(false);
  };

  if (loading) return <LoadingView label="در حال خواندن وضعیت داده و پشتیبان‌ها..." />;
  const runningJob = status.data?.job && ["running", "queued"].includes(status.data.job.status) ? status.data : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="داده و پشتیبان"
        subtitle="به‌روزرسانی داده‌ها با پشتیبان جدید سامانهٔ قبلی + وضعیت اتصال دیتابیس"
        icon={<DatabaseBackup className="h-5 w-5" />}
        actions={<Button size="sm" variant="outline" className="gap-1.5" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /> بروزرسانی وضعیت</Button>}
      />

      {/* وضعیت اتصال */}
      <SectionCard title="اتصال دیتابیس فعلی" subtitle="برای تغییر آدرس دیتابیس، فایل .env در پوشهٔ نصب سامانه ویرایش و سرویس restart شود">
        <div className="grid gap-3 sm:grid-cols-3">
          <InfoBox icon={<Database className="h-4 w-4" />} label="موتور" value={data?.db.engine ?? "—"} />
          <InfoBox icon={<HardDriveDownload className="h-4 w-4" />} label="مقصد" value={data?.db.target ?? "—"} mono />
          <InfoBox icon={<Info className="h-4 w-4" />} label="حالت اجرای کوئری‌های خام" value={data?.db.provider === "mysql" ? "MySQL (تولید)" : "SQLite (توسعه)"} />
        </div>
      </SectionCard>

      {/* فرم به‌روزرسانی */}
      <SectionCard
        title="به‌روزرسانی داده با پشتیبان جدید"
        subtitle="فایل پشتیبان SQLite سامانهٔ قبلی (مثل app.sqlite) روی سرور قرار می‌گیرد؛ انتقال با ادغام و بدون از دست رفتن داده انجام می‌شود"
      >
        <div className="space-y-3">
          <div>
            <Label className="text-xs">مسیر فایل پشتیبان روی سرور</Label>
            <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="D:\Projects\rahe_zendegi\data\app.sqlite" className="h-9 font-mono text-xs" dir="ltr" />
            {Boolean(data?.candidates.length) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {data!.candidates.map((c) => (
                  <button key={c.path} onClick={() => setSource(c.path)} className="flex items-center gap-1 rounded-full border bg-card px-2.5 py-1 font-mono text-[10px] text-muted-foreground transition-colors hover:border-ring hover:text-foreground" dir="ltr">
                    <FolderSearch className="h-3 w-3" /> {c.path} ({faNum(String(c.sizeMb))}MB)
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">حالت انتقال</Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="append">ادغام و به‌روزرسانی (توصیه‌شده — رکوردهای تکراری جایگزین می‌شوند)</SelectItem>
                  <SelectItem value="truncate">پاکسازی کامل و جایگزینی (دادهٔ فعلی حذف می‌شود!)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button className="gap-1.5" disabled={busy || !source || Boolean(runningJob)} onClick={start}>
                <Play className="h-4 w-4" /> {busy ? "در حال شروع..." : "شروع به‌روزرسانی"}
              </Button>
            </div>
          </div>
          <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-[11px] leading-5 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            ⚠️ برای پشتیبان حجیم (۱.۵ گیگابایت) انتقال چند دقیقه طول می‌کشد و صفحه را نبندید؛ پیشرفت لحظه‌ای زیر نمایش داده می‌شود.
            برای پشتیبان‌های SQL خروجی مستقیم (فایل .sql)، ابتدا باید به SQLite تبدیل شود — از ابزار sql_viewer استفاده کنید.
          </p>
        </div>
      </SectionCard>

      {/* پیشرفت کار فعال */}
      {runningJob && (
        <SectionCard title="پیشرفت انتقال در حال اجرا" subtitle={runningJob.job.source}>
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs">
              <Badge className="bg-sky-500">در حال اجرا</Badge>
              {runningJob.phase && <span className="text-muted-foreground">{runningJob.phase}</span>}
              <span className="text-muted-foreground">— {faNum(runningJob.tables.filter((t) => t.done).length)} از {faNum(runningJob.tables.length)} جدول</span>
            </div>
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-2 bg-primary transition-all" style={{ width: `${runningJob.tables.length ? (runningJob.tables.filter((t) => t.done).length * 100) / runningJob.tables.length : 5}%` }} />
            </div>
            {runningJob.tables.length > 0 && (
              <div className="max-h-40 space-y-1 overflow-auto rounded-xl border bg-muted/30 p-3">
                {runningJob.tables.map((t) => (
                  <div key={t.name} className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1.5">
                      <DotBadge label={t.done ? "انجام شد" : "در انتظار"} ok={t.done} />
                      <span className="font-mono" dir="ltr">{t.name}</span>
                    </span>
                    <span className="tabular-nums text-muted-foreground">{faNum(t.rows)} ردیف</span>
                  </div>
                ))}
              </div>
            )}
            {runningJob.logTail && (
              <pre className="max-h-32 overflow-auto rounded-xl border bg-slate-950 p-3 text-left font-mono text-[10px] leading-4 text-slate-100" dir="ltr">{runningJob.logTail}</pre>
            )}
          </div>
        </SectionCard>
      )}

      {/* تاریخچه */}
      <SectionCard title="کارهای قبلی" bodyClass="p-0">
        <div className="divide-y">
          {data?.jobs.map((j) => (
            <div key={j.id} className="flex items-center justify-between px-5 py-3 text-xs">
              <div className="min-w-0">
                <p className="truncate font-mono text-[11px]" dir="ltr">{j.source}</p>
                <p className="text-[10px] text-muted-foreground">شروع: {jDateTime(j.startedAt)} — حالت: {j.mode === "truncate" ? "جایگزینی کامل" : "ادغام"}</p>
              </div>
              <div className="flex items-center gap-2">
                {j.finishedAt && <span className="text-[10px] text-muted-foreground"><DateCell value={j.finishedAt} /></span>}
                <JobBadge status={j.status} />
                {["running", "queued"].includes(j.status) && (
                  <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setWatchId(j.id)}>پایش</Button>
                )}
              </div>
            </div>
          ))}
          {!data?.jobs.length && <p className="p-8 text-center text-xs text-muted-foreground">هنوز کاری اجرا نشده است</p>}
        </div>
      </SectionCard>
    </div>
  );
}

function InfoBox({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border bg-muted/40 px-4 py-3">
      <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">{icon} {label}</p>
      <p className={`mt-1 truncate text-xs font-bold ${mono ? "font-mono" : ""}`} dir={mono ? "ltr" : undefined}>{value}</p>
    </div>
  );
}

function JobBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    running: { label: "در حال اجرا", cls: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300" },
    queued: { label: "در صف", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" },
    done: { label: "موفق", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" },
    failed: { label: "ناموفق", cls: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300" },
  };
  const s = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${s.cls}`}>{s.label}</span>;
}
