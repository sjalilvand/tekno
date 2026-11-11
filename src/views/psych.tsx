"use client";
// =====================================================================
// آزمون‌های روان‌شناختی — بانک ۴۰ آزمون استاندارد + اجرا + نتیجه و تاریخچه
// منبع بانک: مخزن special-spoon (نسخهٔ ۶.۱۲) — نمره‌دهی سمت سرور
// =====================================================================
import * as React from "react";
import { PageHeader, SectionCard, StatCard, LoadingView, DataTable, Column, DateCell } from "@/components/shared";
import { api, useQuery } from "@/lib/client";
import { faNum, faDigits } from "@/lib/jalali";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ClipboardList, Clock, Users, FileCheck2, Search, Loader2, ChevronRight, ChevronLeft,
  Award, RefreshCw, Download, X, CheckCircle2, BrainCircuit, UserRound, ChevronDown,
} from "lucide-react";

type TestItem = {
  id: number; slug: string; title: string; code: string | null; topic: string;
  description: string | null; ageRange: string | null; minutes: number | null;
  color: string; isActive: boolean; questionsCount: number; attemptsCount: number;
};

type Question = { prompt: string; options: [string, number][]; subscale?: string; image?: string };

type TestDetail = {
  id: number; slug: string; title: string; code: string | null; topic: string;
  description: string | null; ageRange: string | null; minutes: number | null; color: string;
  questions: Question[]; maxScore: number;
};

type Subscore = { key: string; title: string; score: number; level?: string; text?: string };

type SubmitResult = {
  attemptId: number; score: number; percent: number; maxScore: number;
  label: string | null; guidance: string | null; subscores: Subscore[];
};

type AttemptRow = {
  id: number; testTitle: string; testSlug: string; topic: string; color: string;
  subjectName: string | null; subjectNid: string | null; userName: string;
  score: number; percent: number; resultLabel: string | null; resultGuidance: string | null;
  subscores: string | null; createdAt: string;
};

function percentToneLabel(p: number): { label: string; cls: string } {
  if (p >= 67) return { label: "شدت بالا", cls: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300" };
  if (p >= 34) return { label: "شدت متوسط", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300" };
  return { label: "شدت پایین", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" };
}

// ---------------- اجرای آزمون — یک سؤال در هر گام ----------------
function TestRunner({ detail, onClose, onDone }: { detail: TestDetail; onClose: () => void; onDone: (r: SubmitResult) => void }) {
  const { toast } = useToast();
  const [step, setStep] = React.useState(0);
  const [answers, setAnswers] = React.useState<number[]>(() => Array(detail.questions.length).fill(-1));
  const [subject, setSubject] = React.useState({ name: "", nid: "" });
  const [showSubject, setShowSubject] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const qs = detail.questions;
  const q = qs[step];
  const answered = answers.filter((a) => a >= 0).length;
  const progress = Math.round((answered / qs.length) * 100);

  const pick = (optIdx: number) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[step] = optIdx;
      return next;
    });
    // پرش خودکار به سؤال بعد (جز آخرین)
    if (step < qs.length - 1) setTimeout(() => setStep((s) => Math.min(s + 1, qs.length - 1)), 220);
  };

  const submit = async () => {
    if (answered < qs.length) {
      toast({ title: `هنوز ${faNum(qs.length - answered)} سؤال بی‌پاسخ مانده است`, variant: "destructive" as never });
      const first = answers.findIndex((a) => a < 0);
      if (first >= 0) setStep(first);
      return;
    }
    setSubmitting(true);
    try {
      const r = await api<SubmitResult>(`/api/psych-tests/${detail.slug}`, {
        method: "POST",
        body: JSON.stringify({ answers, subjectName: subject.name || undefined, subjectNid: subject.nid || undefined }),
      });
      onDone(r);
    } catch (e: any) {
      toast({ title: e?.message ?? "خطا در ثبت پاسخ‌ها", variant: "destructive" as never });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold">
          <span>سؤال {faNum(step + 1)} از {faNum(qs.length)}</span>
          <span className="text-muted-foreground">{faNum(progress)}٪ تکمیل</span>
        </div>
        <Progress value={progress} className="h-1.5" />
      </div>

      <div className="rounded-2xl border bg-muted/40 p-4">
        {q?.subscale && <Badge variant="outline" className="mb-2 text-[9.5px]">{q.subscale}</Badge>}
        <p className="text-sm font-bold leading-7">{q?.prompt}</p>
        {q?.image && (
          <div className="mt-3 flex justify-center rounded-xl border bg-white p-2 dark:bg-background">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/psych/images/${q.image}`} alt={`تصویر سؤال ${step + 1}`} className="max-h-64 object-contain" />
          </div>
        )}
        <div className="mt-3 grid gap-2">
          {q?.options.map(([label], i) => (
            <button
              key={i}
              onClick={() => pick(i)}
              className={cn(
                "flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-right text-[12.5px] leading-6 transition-all",
                answers[step] === i
                  ? "border-primary bg-accent font-bold text-accent-foreground shadow-sm"
                  : "bg-card hover:border-primary/40 hover:bg-accent/50"
              )}
            >
              <span className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10.5px] font-black",
                answers[step] === i ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}>
                {faDigits(i + 1)}
              </span>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="gap-1" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <ChevronRight className="h-3.5 w-3.5" /> قبلی
        </Button>
        {step < qs.length - 1 ? (
          <Button size="sm" className="gap-1" onClick={() => setStep((s) => Math.min(qs.length - 1, s + 1))}>
            بعدی <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button size="sm" className="gap-1" onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            پایان آزمون و محاسبهٔ نتیجه
          </Button>
        )}
        <span className="flex-1" />
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onClose}>بستن</Button>
      </div>

      {/* ناوبری سریع سؤال‌ها */}
      <div className="flex flex-wrap gap-1 border-t pt-3">
        {answers.map((a, i) => (
          <button
            key={i}
            onClick={() => setStep(i)}
            className={cn(
              "h-6 w-6 rounded-md text-[9.5px] font-bold transition-colors",
              i === step && "ring-2 ring-primary ring-offset-1",
              a >= 0 ? "bg-primary/85 text-primary-foreground" : "bg-muted text-muted-foreground"
            )}
            aria-label={`سؤال ${i + 1}`}
          >
            {faNum(i + 1)}
          </button>
        ))}
      </div>

      {/* ثبت برای متقاضی — اختیاری */}
      <div className="border-t pt-3">
        <button className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground hover:text-foreground" onClick={() => setShowSubject((v) => !v)}>
          <UserRound className="h-3.5 w-3.5" />
          ثبت نتیجه برای متقاضی (اختیاری)
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showSubject && "rotate-180")} />
        </button>
        {showSubject && (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <Input value={subject.name} onChange={(e) => setSubject({ ...subject, name: e.target.value })} placeholder="نام و نام‌خانوادگی آزمون‌دهنده" className="h-9 text-xs" />
            <Input value={subject.nid} onChange={(e) => setSubject({ ...subject, nid: e.target.value })} placeholder="کد ملی متقاضی" className="h-9 text-xs" dir="ltr" inputMode="numeric" />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- کارت نتیجه ----------------
function ResultCard({ result, detail, onClose, onNew }: { result: SubmitResult; detail: TestDetail; onClose: () => void; onNew: () => void }) {
  const tone = percentToneLabel(result.percent);
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-3 rounded-2xl border bg-gradient-to-b from-accent/60 to-transparent px-4 py-6 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary text-primary-foreground shadow-lg">
          <Award className="h-8 w-8" />
        </span>
        <div>
          <p className="text-sm font-extrabold">{detail.title}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">نتیجهٔ آزمون شما آماده شد</p>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-center">
            <p className="text-2xl font-black tabular-nums">{faNum(result.score)}</p>
            <p className="text-[10px] text-muted-foreground">نمرهٔ کل از {faNum(result.maxScore)}</p>
          </div>
          <div className="h-10 w-px bg-border" />
          <div className="text-center">
            <p className="text-2xl font-black tabular-nums">{faNum(result.percent)}٪</p>
            <p className="text-[10px] text-muted-foreground">درصد شدت</p>
          </div>
        </div>
        {result.label && <Badge className={cn("text-[11px]", tone.cls)}>{result.label}</Badge>}
      </div>

      {result.guidance && (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-[12px] leading-7 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
          <p className="mb-1 font-extrabold">تفسیر و توصیه</p>
          {result.guidance}
        </div>
      )}

      {result.subscores.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-extrabold">نمرهٔ زیرمقیاس‌ها</p>
          {result.subscores.map((s) => (
            <div key={s.key} className="rounded-xl border bg-muted/40 px-3.5 py-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold">{s.title}</span>
                <span className="flex items-center gap-2">
                  {s.level && <Badge variant="outline" className="text-[9.5px]">{s.level}</Badge>}
                  <span className="font-black tabular-nums">{faNum(s.score)}</span>
                </span>
              </div>
              {s.text && <p className="mt-1.5 text-[11px] leading-6 text-muted-foreground">{s.text}</p>}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={onNew}><RefreshCw className="h-3.5 w-3.5" /> اجرای مجدد</Button>
        <Button size="sm" className="flex-1" onClick={onClose}>بستن</Button>
      </div>
    </div>
  );
}

// ---------------- نمای اصلی ----------------
export function PsychView() {
  const { toast } = useToast();
  const [topic, setTopic] = React.useState("");
  const [q, setQ] = React.useState("");
  const [importing, setImporting] = React.useState(false);
  const [openSlug, setOpenSlug] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<TestDetail | null>(null);
  const [result, setResult] = React.useState<SubmitResult | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [expandedAttempt, setExpandedAttempt] = React.useState<number | null>(null);

  const list = useQuery<{ items: TestItem[]; topics: string[]; total: number }>(
    () => api(`/api/psych-tests?q=${encodeURIComponent(q)}`), [q]
  );
  const attempts = useQuery<{ items: AttemptRow[]; total: number }>(() => api("/api/psych-attempts?pageSize=50"), []);

  const openTest = async (slug: string) => {
    setOpenSlug(slug);
    setResult(null);
    setDetailLoading(true);
    try {
      const d = await api<TestDetail>(`/api/psych-tests/${slug}`);
      setDetail(d);
    } catch (e: any) {
      toast({ title: e?.message ?? "خطا در بارگذاری آزمون", variant: "destructive" as never });
      setOpenSlug(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const importBank = async () => {
    setImporting(true);
    try {
      const r = await api<{ imported: number; updated: number; total: number }>("/api/psych-tests", {
        method: "POST", body: JSON.stringify({ action: "import" }),
      });
      toast({ title: `بانک آزمون‌ها بارگذاری شد — ${faNum(r.imported)} جدید، ${faNum(r.updated)} به‌روزرسانی` });
      list.refetch();
    } catch (e: any) {
      toast({ title: e?.message ?? "خطا در بارگذاری بانک آزمون‌ها", variant: "destructive" as never });
    } finally {
      setImporting(false);
    }
  };

  const items = (list.data?.items ?? []).filter((i) => !topic || i.topic === topic);
  const totalAttempts = attempts.data?.total ?? 0;
  const totalQuestions = (list.data?.items ?? []).reduce((s, i) => s + i.questionsCount, 0);

  const attemptColumns: Column<AttemptRow>[] = [
    {
      header: "آزمون",
      cell: (r) => (
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
          <div>
            <p className="text-[12.5px] font-semibold leading-5">{r.testTitle}</p>
            <p className="text-[10px] text-muted-foreground">{r.topic}</p>
          </div>
        </div>
      ),
    },
    { header: "آزمون‌دهنده", cell: (r) => <span className="text-xs">{r.subjectName ?? "—"}{r.subjectNid ? <span className="block text-[10px] text-muted-foreground" dir="ltr">{faDigits(r.subjectNid)}</span> : null}</span> },
    { header: "ثبت‌کننده", cell: (r) => <span className="text-xs text-muted-foreground">{r.userName || "—"}</span> },
    { header: "نمره", cell: (r) => <span className="text-xs font-black tabular-nums">{faNum(r.score)}</span> },
    {
      header: "شدت",
      cell: (r) => {
        const t = percentToneLabel(r.percent);
        return <Badge className={cn("text-[10px]", t.cls)}>{faNum(r.percent)}٪ — {r.resultLabel ?? t.label}</Badge>;
      },
    },
    { header: "تاریخ", cell: (r) => <DateCell value={r.createdAt} /> },
    {
      header: "تفسیر",
      cell: (r) => (
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-[10.5px]" onClick={() => setExpandedAttempt(expandedAttempt === r.id ? null : r.id)}>
          {expandedAttempt === r.id ? <><X className="h-3 w-3" /> بستن</> : <><ChevronDown className="h-3 w-3" /> نمایش</>}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="آزمون‌های روان‌شناختی"
        subtitle="بانک آزمون‌های استاندارد — اجرا، نمره‌دهی خودکار و تفسیر"
        icon={<ClipboardList className="h-5 w-5" />}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard title="آزمون‌های بانک" value={faNum(list.data?.total ?? 0)} icon={<ClipboardList className="h-5 w-5" />} tone="rose" />
        <StatCard title="کل سؤال‌ها" value={faNum(totalQuestions)} icon={<FileCheck2 className="h-5 w-5" />} tone="cyan" />
        <StatCard title="اجرای ثبت‌شده" value={faNum(totalAttempts)} icon={<Users className="h-5 w-5" />} tone="teal" />
        <StatCard title="موضوعات" value={faNum(list.data?.topics.length ?? 0)} icon={<BrainCircuit className="h-5 w-5" />} tone="amber" />
      </div>

      <Tabs defaultValue="tests" dir="rtl">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="tests" className="gap-1.5"><ClipboardList className="h-3.5 w-3.5" /> بانک آزمون‌ها</TabsTrigger>
          <TabsTrigger value="results" className="gap-1.5"><FileCheck2 className="h-3.5 w-3.5" /> نتایج و تاریخچه</TabsTrigger>
        </TabsList>

        <TabsContent value="tests" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-56 flex-1">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی آزمون..." className="h-9 pr-9 text-sm" />
            </div>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={importBank} disabled={importing}>
              {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              بارگذاری/به‌روزرسانی بانک
            </Button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setTopic("")}
              className={cn("rounded-full border px-3 py-1 text-[11px] font-bold transition-colors", !topic ? "border-primary bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted")}
            >
              همه ({faNum(list.data?.total ?? 0)})
            </button>
            {(list.data?.topics ?? []).map((t) => (
              <button
                key={t}
                onClick={() => setTopic(topic === t ? "" : t)}
                className={cn("rounded-full border px-3 py-1 text-[11px] font-bold transition-colors", topic === t ? "border-primary bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted")}
              >
                {t}
              </button>
            ))}
          </div>

          {list.loading ? (
            <LoadingView />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((t) => (
                <button
                  key={t.id}
                  onClick={() => openTest(t.slug)}
                  className="group flex flex-col rounded-2xl border bg-card p-4 text-right shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: t.color }}>
                      <ClipboardList className="h-5 w-5" />
                    </span>
                    {!t.isActive && <Badge variant="outline" className="text-[9px] text-muted-foreground">غیرفعال</Badge>}
                  </div>
                  <p className="mt-3 text-[13px] font-extrabold leading-6 group-hover:text-primary">{t.title}</p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted-foreground">{t.description}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[9.5px] text-muted-foreground">
                    <Badge variant="outline" className="text-[9.5px]">{t.topic}</Badge>
                    {t.code && <Badge variant="outline" className="text-[9.5px]">{t.code}</Badge>}
                    {t.ageRange && <Badge variant="outline" className="text-[9.5px]">{t.ageRange}</Badge>}
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t pt-2.5 text-[10.5px] text-muted-foreground">
                    <span className="flex items-center gap-1"><FileCheck2 className="h-3 w-3" /> {faNum(t.questionsCount)} سؤال</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> ~{faNum(t.minutes ?? 10)} دقیقه</span>
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {faNum(t.attemptsCount)} اجرا</span>
                  </div>
                </button>
              ))}
              {!items.length && !list.loading && (
                <div className="col-span-full rounded-2xl border border-dashed py-12 text-center text-xs text-muted-foreground">
                  آزمونی یافت نشد — اگر بانک خالی است، دکمهٔ «بارگذاری/به‌روزرسانی بانک» را بزنید.
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="results" className="mt-4">
          <div className="rounded-2xl border bg-card shadow-sm">
            <DataTable columns={attemptColumns} rows={attempts.data?.items ?? []} loading={attempts.loading} />
          </div>
          {attempts.data?.items?.map((r) =>
            expandedAttempt === r.id ? (
              <div key={`x-${r.id}`} className="mt-3 space-y-2 rounded-2xl border bg-card p-4 shadow-sm">
                <p className="text-xs font-extrabold">تفسیر نتیجه — {r.testTitle}</p>
                {r.resultGuidance && (
                  <p className="rounded-xl bg-sky-50 px-3.5 py-2.5 text-[11.5px] leading-6 text-sky-900 dark:bg-sky-950/40 dark:text-sky-200">{r.resultGuidance}</p>
                )}
                {(() => {
                  let subs: Subscore[] = [];
                  try { subs = JSON.parse(r.subscores ?? "[]"); } catch { /* داده خراب */ }
                  if (!subs.length) return null;
                  return (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {subs.map((s) => (
                        <div key={s.key} className="rounded-xl border bg-muted/40 px-3 py-2 text-[11px]">
                          <div className="flex items-center justify-between">
                            <span className="font-bold">{s.title}</span>
                            <span className="tabular-nums font-black">{faNum(s.score)}{s.level ? ` — ${s.level}` : ""}</span>
                          </div>
                          {s.text && <p className="mt-1 leading-5 text-muted-foreground">{s.text}</p>}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            ) : null
          )}
        </TabsContent>
      </Tabs>

      {/* دیالوگ اجرای آزمون / نتیجه */}
      <Dialog open={openSlug !== null} onOpenChange={(o) => { if (!o) { setOpenSlug(null); setDetail(null); setResult(null); } }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-right">{detail?.title ?? "در حال بارگذاری آزمون..."}</DialogTitle>
            <DialogDescription className="text-right">
              {detail ? `${faNum(detail.questions.length)} سؤال — حدود ${faNum(detail.minutes ?? 10)} دقیقه` : " "}
            </DialogDescription>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> در حال بارگذاری سؤال‌ها...
            </div>
          ) : result ? (
            <ResultCard result={result} detail={detail!} onClose={() => { setOpenSlug(null); setDetail(null); setResult(null); attempts.refetch(); }} onNew={() => setResult(null)} />
          ) : detail ? (
            <TestRunner
              detail={detail}
              onClose={() => { setOpenSlug(null); setDetail(null); }}
              onDone={(r) => { setResult(r); attempts.refetch(); }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
