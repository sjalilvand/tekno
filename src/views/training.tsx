"use client";
// =====================================================================
// آموزش‌ها — محتوای آموزشی، دوره‌ها و آزمون‌های آموزشی (نسخهٔ ۶.۱۲)
// منبع محتوا: مخزن special-spoon (آکادمی رز)
// =====================================================================
import * as React from "react";
import { PageHeader, SectionCard, StatCard, LoadingView, DateCell } from "@/components/shared";
import { api, useQuery } from "@/lib/client";
import { faNum, faMoney, jDateTime } from "@/lib/jalali";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  GraduationCap, BookOpen, Presentation, FileQuestion, Loader2, Download, Clock,
  Users, CheckCircle2, XCircle, Award, ChevronLeft, Search, Sparkles,
} from "lucide-react";

type TrainingItem = {
  id: number; kind: "content" | "course" | "exam"; slug: string; title: string;
  summary: string | null; topic: string | null; tag: string | null; price: number;
  capacity: number | null; startAt: string | null; sessionCount: number;
  questionsCount: number; passPercent: number; durationMinutes: number;
  status: string; attemptsCount: number; createdAt: string;
};

type ItemDetail = {
  id: number; kind: "content" | "course" | "exam"; slug: string; title: string;
  summary: string | null; body: string | null; topic: string | null; tag: string | null;
  price: number; capacity: number | null; startAt: string | null;
  sessions: { title: string; durationMinutes: number }[];
  questionsCount: number; durationMinutes: number; passPercent: number;
  options: string[][]; prompts: string[];
};

const KIND_META = {
  content: { label: "محتوای آموزشی", icon: BookOpen, tone: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300" },
  course: { label: "دورهٔ آموزشی", icon: Presentation, tone: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300" },
  exam: { label: "آزمون آموزشی", icon: FileQuestion, tone: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300" },
} as const;

// ---------------- اجرای آزمون آموزشی ----------------
function ExamRunner({ detail, onClose, onDone }: { detail: ItemDetail; onClose: () => void; onDone: (r: { percent: number; correct: number; total: number; passed: boolean; passPercent: number }) => void }) {
  const { toast } = useToast();
  const [answers, setAnswers] = React.useState<number[]>(() => Array(detail.questionsCount).fill(-1));
  const [submitting, setSubmitting] = React.useState(false);
  const answered = answers.filter((a) => a >= 0).length;

  const submit = async () => {
    if (answered < detail.questionsCount) {
      toast({ title: "به همهٔ سؤال‌ها پاسخ دهید", variant: "destructive" as never });
      return;
    }
    setSubmitting(true);
    try {
      const r = await api<{ percent: number; correct: number; total: number; passed: boolean; passPercent: number }>(`/api/training/${detail.slug}`, {
        method: "POST", body: JSON.stringify({ answers }),
      });
      onDone(r);
    } catch (e: any) {
      toast({ title: e?.message ?? "خطا در ثبت آزمون", variant: "destructive" as never });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold">
          <span>پاسخ داده‌شده: {faNum(answered)} از {faNum(detail.questionsCount)}</span>
          <span className="text-muted-foreground">حد نصاب قبولی: {faNum(detail.passPercent)}٪</span>
        </div>
        <Progress value={Math.round((answered / detail.questionsCount) * 100)} className="h-1.5" />
      </div>
      {detail.prompts.map((prompt, qi) => (
        <div key={qi} className="rounded-xl border bg-muted/40 p-3.5">
          <p className="text-[12.5px] font-bold leading-6">{faNum(qi + 1)}. {prompt}</p>
          <div className="mt-2 grid gap-1.5">
            {(detail.options[qi] ?? []).map((opt, oi) => (
              <button
                key={oi}
                onClick={() => setAnswers((p) => { const n = [...p]; n[qi] = oi; return n; })}
                className={cn(
                  "rounded-lg border px-3 py-2 text-right text-[12px] transition-all",
                  answers[qi] === oi ? "border-primary bg-accent font-bold" : "bg-card hover:bg-accent/50"
                )}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <Button size="sm" className="flex-1 gap-1" onClick={submit} disabled={submitting}>
          {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          ثبت و اعلام نتیجه
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose}>بستن</Button>
      </div>
    </div>
  );
}

// ---------------- نمای اصلی ----------------
export function TrainingView() {
  const { toast } = useToast();
  const [q, setQ] = React.useState("");
  const [importing, setImporting] = React.useState(false);
  const [openSlug, setOpenSlug] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<ItemDetail | null>(null);
  const [examResult, setExamResult] = React.useState<{ percent: number; correct: number; total: number; passed: boolean; passPercent: number } | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);

  const list = useQuery<{ items: TrainingItem[]; bankError?: string | null }>(() => api(`/api/training${q ? `?q=${encodeURIComponent(q)}` : ""}`), []);

  const contents = (list.data?.items ?? []).filter((i) => i.kind === "content");
  const courses = (list.data?.items ?? []).filter((i) => i.kind === "course");
  const exams = (list.data?.items ?? []).filter((i) => i.kind === "exam");
  // نسخهٔ ۶.۱۴ — خطای درون‌ریزی خودکار بی‌صدا نمی‌ماند
  const bankError = list.data?.bankError ?? null;

  const openItem = async (slug: string) => {
    setOpenSlug(slug);
    setExamResult(null);
    setDetailLoading(true);
    try {
      setDetail(await api<ItemDetail>(`/api/training/${slug}`));
    } catch (e: any) {
      toast({ title: e?.message ?? "خطا در بارگذاری", variant: "destructive" as never });
      setOpenSlug(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const importTraining = async () => {
    setImporting(true);
    try {
      const r = await api<{ imported: number; updated: number; total: number }>("/api/training", {
        method: "POST", body: JSON.stringify({ action: "import" }),
      });
      toast({ title: `محتوای آموزشی بارگذاری شد — ${faNum(r.imported)} جدید، ${faNum(r.updated)} به‌روزرسانی` });
      list.refetch();
    } catch (e: any) {
      toast({ title: e?.message ?? "خطا در بارگذاری محتوای آموزشی", variant: "destructive" as never });
    } finally {
      setImporting(false);
    }
  };

  const card = (it: TrainingItem) => {
    const meta = KIND_META[it.kind];
    const Icon = meta.icon;
    return (
      <button
        key={it.id}
        onClick={() => openItem(it.slug)}
        className="group flex flex-col rounded-2xl border bg-card p-4 text-right shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
      >
        <div className="flex items-center justify-between">
          <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl", meta.tone)}>
            <Icon className="h-4.5 w-4.5" />
          </span>
          {it.tag && <Badge variant="outline" className="text-[9.5px]">{it.tag}</Badge>}
        </div>
        <p className="mt-2.5 text-[13px] font-extrabold leading-6 group-hover:text-primary">{it.title}</p>
        {it.summary && <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted-foreground">{it.summary}</p>}
        <div className="mt-3 flex items-center justify-between border-t pt-2.5 text-[10px] text-muted-foreground">
          <span>{meta.label}</span>
          {it.kind === "course" && <span className="flex items-center gap-1"><Presentation className="h-3 w-3" /> {faNum(it.sessionCount)} جلسه</span>}
          {it.kind === "exam" && <span className="flex items-center gap-1"><FileQuestion className="h-3 w-3" /> {faNum(it.questionsCount)} سؤال</span>}
          {it.kind === "course" && <span>{it.price > 0 ? `${faMoney(it.price)} ریال` : "رایگان"}</span>}
          {it.kind === "exam" && <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {faNum(it.attemptsCount)}</span>}
          {it.kind === "content" && <span>{it.topic ?? ""}</span>}
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="آموزش‌ها"
        subtitle="آکادمی رز — محتوای آموزشی، دوره‌ها و آزمون‌های مهارتی"
        icon={<GraduationCap className="h-5 w-5" />}
      />

      <div className="grid grid-cols-3 gap-3">
        <StatCard title="محتوای آموزشی" value={faNum(contents.length)} icon={<BookOpen className="h-5 w-5" />} tone="cyan" />
        <StatCard title="دوره‌ها" value={faNum(courses.length)} icon={<Presentation className="h-5 w-5" />} tone="emerald" />
        <StatCard title="آزمون‌های آموزشی" value={faNum(exams.length)} icon={<FileQuestion className="h-5 w-5" />} tone="amber" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو در آموزش‌ها..." className="h-9 pr-9 text-sm" />
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={importTraining} disabled={importing}>
          {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          بارگذاری/به‌روزرسانی محتوای آموزشی
        </Button>
      </div>

      {bankError && (
        <div className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-[11.5px] font-bold leading-6 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          خطا در بارگذاری خودکار محتوای آموزشی: {bankError}
        </div>
      )}

      {list.loading ? (
        <LoadingView />
      ) : (
        <Tabs defaultValue="content" dir="rtl">
          <TabsList>
            <TabsTrigger value="content" className="gap-1.5"><BookOpen className="h-3.5 w-3.5" /> محتوا ({faNum(contents.length)})</TabsTrigger>
            <TabsTrigger value="courses" className="gap-1.5"><Presentation className="h-3.5 w-3.5" /> دوره‌ها ({faNum(courses.length)})</TabsTrigger>
            <TabsTrigger value="exams" className="gap-1.5"><FileQuestion className="h-3.5 w-3.5" /> آزمون‌ها ({faNum(exams.length)})</TabsTrigger>
          </TabsList>
          <TabsContent value="content" className="mt-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{contents.map(card)}</div>
          </TabsContent>
          <TabsContent value="courses" className="mt-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{courses.map(card)}</div>
          </TabsContent>
          <TabsContent value="exams" className="mt-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{exams.map(card)}</div>
          </TabsContent>
        </Tabs>
      )}

      {/* دیالوگ نمایش/اجرا */}
      <Dialog open={openSlug !== null} onOpenChange={(o) => { if (!o) { setOpenSlug(null); setDetail(null); setExamResult(null); } }}>
        <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-right">
              {detail && React.createElement(KIND_META[detail.kind].icon, { className: "h-4.5 w-4.5 text-primary" })}
              {detail?.title ?? "در حال بارگذاری..."}
            </DialogTitle>
            <DialogDescription className="text-right">{detail?.tag ?? ""}</DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> در حال بارگذاری...
            </div>
          ) : examResult ? (
            <div className="space-y-4 py-2 text-center">
              <span className={cn(
                "mx-auto flex h-16 w-16 items-center justify-center rounded-3xl text-white shadow-lg",
                examResult.passed ? "bg-emerald-500" : "bg-rose-500"
              )}>
                {examResult.passed ? <Award className="h-8 w-8" /> : <XCircle className="h-8 w-8" />}
              </span>
              <p className="text-lg font-black">{examResult.passed ? "قبول شدید!" : "مردود — تلاش دوباره"}</p>
              <p className="text-sm text-muted-foreground">
                {faNum(examResult.correct)} پاسخ صحیح از {faNum(examResult.total)} — نمرهٔ {faNum(examResult.percent)}٪
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setExamResult(null)}>تلاش مجدد</Button>
                <Button size="sm" className="flex-1" onClick={() => { setOpenSlug(null); setDetail(null); setExamResult(null); }}>بستن</Button>
              </div>
            </div>
          ) : detail ? (
            <div className="space-y-4">
              {detail.kind !== "exam" && (
                <>
                  {detail.summary && <p className="rounded-xl bg-accent/60 px-4 py-3 text-[12px] font-bold leading-6 text-accent-foreground">{detail.summary}</p>}
                  <p className="whitespace-pre-wrap text-[12.5px] leading-7">{detail.body}</p>
                  {detail.sessions.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-extrabold">جلسات دوره</p>
                      {detail.sessions.map((s, i) => (
                        <div key={i} className="flex items-center justify-between rounded-xl border bg-muted/40 px-3.5 py-2 text-xs">
                          <span className="font-bold">{s.title}</span>
                          <span className="flex items-center gap-1 text-muted-foreground"><Clock className="h-3 w-3" /> {faNum(s.durationMinutes)} دقیقه</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {detail.kind === "course" && (
                    <div className="flex items-center justify-between rounded-xl border bg-muted/40 px-4 py-2.5 text-xs">
                      <span>شهریه دوره</span>
                      <span className="font-black">{detail.price > 0 ? `${faMoney(detail.price)} ریال` : "رایگان"}</span>
                    </div>
                  )}
                </>
              )}
              {detail.kind === "exam" && (
                <ExamRunner
                  detail={detail}
                  onClose={() => { setOpenSlug(null); setDetail(null); }}
                  onDone={(r) => setExamResult(r)}
                />
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
