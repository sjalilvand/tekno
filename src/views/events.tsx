"use client";
// جلسات مشاوره — لیست + جزئیات + زنجیره تایید
import * as React from "react";
import { PageHeader, FilterBar, DataTable, StatusBadge, NameAvatar, LoadingView, DateCell, SectionCard, Column, ApplicantCell } from "@/components/shared";
import { faNum, faDigits, faMoney, jDate, jDateTime, jTime } from "@/lib/jalali";
import { api, useQuery } from "@/lib/client";
import { CalendarCheck, Search, CheckCircle2, XCircle, MessageSquarePlus, Clock, FileText, Stethoscope, Activity, Pill, CircleCheck, CircleX, Circle, Siren } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type EventRow = {
  id: number; trackingCode: number | null; startDate: string | null; status: string;
  weight: number; userTariff: number; topic: string | null;
  user: { id: number; name: string; family: string; avatarColor: string | null; nid: number; mobile: number };
  acceptor: { id: number; name: string; family: string; consultantLevel: number | null } | null;
  service: { id: number; short: string; name: string };
  center: { id: number; title: string; cityTitle: string; provinceTitle: string };
};

type EventDetail = {
  event: EventRow & {
    nid: number; description: string | null; endDate: string | null;
    rejectedComment: string | null; rejectedAt: string | null;
    centerAdminConfirmDateTime: string | null; centerTechConfirmDateTime: string | null;
    operatorConfirmDateTime: string | null; provinceSupervisorConfirmDateTime: string | null;
    supervisorConfirmDateTime: string | null;
    acceptorFee: number; secretaryFee: number; supervisorFee: number; centerFee: number; adminFee: number;
    user: { id: number; name: string; family: string; nid: number; mobile: number; avatarColor: string | null; gender: string | null; education: { name: string } | null };
    center: { id: number; title: string; cityTitle: string; provinceTitle: string; tel: string | null };
    comments: { id: number; comment: string | null; dateTime: string }[];
    psychology: { id: number; mood: string | null; job: string | null; children: number | null; clinicalObservation: string | null; insight: string | null; memory: string | null } | null;
    neuroFeedback: { id: number; protocol: string | null; target: string | null; ezterabOld: number | null; ezterabNew: number | null; focusOld: number | null; focusNew: number | null } | null;
    medicines: { id: number; name: string; dosage: string | null; duration: string | null }[];
  };
  ems: { id: number; severity: string; hadPaymentStatus: string | null } | null;
};

const VIEWS = [
  { key: "all", label: "همه" },
  { key: "pending", label: "در انتظار تایید" },
  { key: "done", label: "تایید نهایی" },
  { key: "undone", label: "ناتمام" },
  { key: "rejected", label: "رد شده" },
];

export function EventsView() {
  const { toast } = useToast();
  const [view, setView] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [serviceId, setServiceId] = React.useState("");
  const [centerId, setCenterId] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<number | null>(null);

  const meta = useQuery<{ services: { id: number; name: string }[]; centers: { id: number; title: string }[] }>(() => api("/api/meta"), []);
  const { data, loading, refetch } = useQuery<{
    total: number; totalPages: number; events: EventRow[];
    statusAgg: { status: string; count: number }[];
  }>(() => api(`/api/events?view=${view}&q=${encodeURIComponent(q)}&serviceId=${serviceId}&centerId=${centerId}&page=${page}`), [view, q, serviceId, centerId, page]);

  const detail = useQuery<EventDetail>(
    () => (selected ? api(`/api/events/${selected}`) : Promise.resolve(null)),
    [selected]
  );

  const act = async (action: string, comment?: string) => {
    if (!selected) return;
    try {
      await api(`/api/events/${selected}`, { method: "POST", body: JSON.stringify({ action, comment }) });
      toast({ title: action === "confirm" ? "جلسه با موفقیت تایید شد" : action === "reject" ? "جلسه رد شد" : "یادداشت ثبت شد" });
      detail.refetch();
      refetch();
    } catch (e) {
      toast({ title: "خطا", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  const columns: Column<EventRow>[] = [
    {
      header: "کد رهگیری",
      cell: (e) => <span className="text-xs font-bold tabular-nums text-primary">{faNum(e.trackingCode ?? 0)}</span>,
    },
    {
      header: "مراجع",
      cell: (e) => (
        <ApplicantCell userId={e.user.id} name={e.user.name} family={e.user.family} nid={e.user.nid} mobile={e.user.mobile} avatarColor={e.user.avatarColor} />
      ),
    },
    { header: "خدمت", cell: (e) => <Badge variant="secondary" className="text-[10.5px] font-semibold">{e.service.short}</Badge> },
    { header: "موضوع", cell: (e) => <span className="text-xs">{e.topic ?? "—"}</span> },
    { header: "مرکز", cell: (e) => <span className="text-xs text-muted-foreground">{e.center.cityTitle}</span> },
    { header: "مشاور", cell: (e) => <span className="text-xs">{e.acceptor ? `${e.acceptor.name} ${e.acceptor.family}` : "—"}</span> },
    { header: "تاریخ", cell: (e) => <DateCell value={e.startDate} /> },
    { header: "تعرفه (ریال)", cell: (e) => <span className="text-xs tabular-nums">{faNum(e.userTariff)}</span> },
    { header: "وضعیت", cell: (e) => <StatusBadge status={e.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="جلسات مشاوره"
        subtitle={`مدیریت و پیگیری ${faNum(data?.total ?? 0)} جلسه`}
        icon={<CalendarCheck className="h-5 w-5" />}
      />

      {/* تب‌های وضعیت */}
      <div className="mb-4 flex flex-wrap gap-2">
        {VIEWS.map((v) => {
          const count = v.key === "all" ? data?.total : data?.statusAgg
            .filter((s) => v.key === "pending" ? s.status.includes("در انتظار") : s.status === (v.key === "done" ? "تایید نهایی" : v.key === "rejected" ? "رد شده" : "ناتمام"))
            .reduce((sum, s) => sum + s.count, 0);
          return (
            <button
              key={v.key}
              onClick={() => { setView(v.key); setPage(1); }}
              className={`rounded-full border px-4 py-1.5 text-xs font-bold transition-all ${view === v.key ? "border-primary bg-primary text-primary-foreground shadow-sm" : "bg-card text-muted-foreground hover:border-ring hover:text-foreground"}`}
            >
              {v.label}
              <span className={`mr-1.5 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${view === v.key ? "bg-white/20" : "bg-muted"}`}>{faNum(count ?? 0)}</span>
            </button>
          );
        })}
      </div>

      <FilterBar className="mb-4">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="جستجوی کد رهگیری، نام مراجع..." className="h-9 pr-9 text-sm" />
        </div>
        <Select value={serviceId || "all"} onValueChange={(v) => { setServiceId(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="h-9 w-48 text-sm"><SelectValue placeholder="همه خدمات" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه خدمات</SelectItem>
            {meta.data?.services.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={centerId || "all"} onValueChange={(v) => { setCenterId(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="h-9 w-48 text-sm"><SelectValue placeholder="همه مراکز" /></SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="all">همه مراکز</SelectItem>
            {meta.data?.centers.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>)}
          </SelectContent>
        </Select>
      </FilterBar>

      <div className="rounded-2xl border bg-card shadow-sm">
        <DataTable
          columns={columns}
          rows={data?.events ?? []}
          loading={loading}
          page={data?.page}
          totalPages={data?.totalPages}
          onPageChange={setPage}
          onRowClick={(e) => setSelected(e.id)}
        />
      </div>

      {/* جزئیات جلسه */}
      <Dialog open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl p-0" dir="rtl">
          {detail.loading || !detail.data ? (
            <>
              <DialogHeader className="sr-only"><DialogTitle>جزئیات جلسه</DialogTitle></DialogHeader>
              <LoadingView label="در حال دریافت جزئیات جلسه..." />
            </>
          ) : (
            <>
              <DialogHeader className="border-b bg-gradient-to-l from-accent/60 to-transparent px-6 py-5 text-right">
                <DialogTitle className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="block text-base font-extrabold">جلسه {faNum(detail.data.event.trackingCode ?? 0)}</span>
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      {detail.data.event.service.name} — {jDate(detail.data.event.startDate)} ساعت {jTime(detail.data.event.startDate)}
                    </span>
                  </div>
                  <StatusBadge status={detail.data.event.status} />
                </DialogTitle>
              </DialogHeader>

              <div className="max-h-[62vh] overflow-y-auto px-6 py-4">
                <Tabs defaultValue="info" dir="rtl">
                  <TabsList className="w-full justify-start overflow-x-auto">
                    <TabsTrigger value="info"><FileText className="ml-1 h-3.5 w-3.5" /> مشخصات</TabsTrigger>
                    <TabsTrigger value="chain"><Activity className="ml-1 h-3.5 w-3.5" /> زنجیره تایید</TabsTrigger>
                    <TabsTrigger value="clinical"><Stethoscope className="ml-1 h-3.5 w-3.5" /> بالینی</TabsTrigger>
                    <TabsTrigger value="notes"><MessageSquarePlus className="ml-1 h-3.5 w-3.5" /> یادداشت‌ها ({faNum(detail.data.event.comments.length)})</TabsTrigger>
                  </TabsList>

                  <TabsContent value="info" className="pt-4 space-y-4">
                    <div className="flex items-center gap-3 rounded-2xl border bg-muted/40 p-4">
                      <NameAvatar name={detail.data.event.user.name} family={detail.data.event.user.family} color={detail.data.event.user.avatarColor} size={44} />
                      <div className="flex-1">
                        <p className="text-sm font-bold">{detail.data.event.user.name} {detail.data.event.user.family}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          کد ملی {faDigits(detail.data.event.user.nid)} — موبایل {faDigits(detail.data.event.user.mobile)} — {detail.data.event.user.gender ?? "—"}
                        </p>
                      </div>
                      <div className="text-left text-xs text-muted-foreground">
                        <p className="font-bold text-foreground">{detail.data.event.center.title}</p>
                        <p>{detail.data.event.center.provinceTitle} / {detail.data.event.center.cityTitle}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <MiniStat label="وزن خدمت" value={faNum(detail.data.event.weight)} />
                      <MiniStat label="تعرفه کاربر" value={`${faNum(detail.data.event.userTariff)} ریال`} />
                      <MiniStat label="حق مشاور" value={`${faMoney(detail.data.event.acceptorFee)} ریال`} />
                      <MiniStat label="سهم مرکز" value={`${faMoney(detail.data.event.centerFee)} ریال`} />
                    </div>

                    {detail.data.event.topic && (
                      <div className="rounded-xl border bg-muted/30 p-3.5">
                        <p className="text-[11px] font-bold text-muted-foreground mb-1">موضوع و شرح جلسه</p>
                        <p className="text-xs leading-6">{detail.data.event.topic} — {detail.data.event.description ?? ""}</p>
                      </div>
                    )}

                    {detail.data.event.medicines.length > 0 && (
                      <div className="rounded-xl border bg-rose-50/50 dark:bg-rose-950/20 p-3.5">
                        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold"><Pill className="h-3.5 w-3.5 text-rose-500" /> داروهای تجویزی</p>
                        {detail.data.event.medicines.map((m) => (
                          <p key={m.id} className="text-xs"><b>{m.name}</b> — {m.dosage} — {m.duration}</p>
                        ))}
                      </div>
                    )}

                    {detail.data.event.neuroFeedback && (
                      <div className="rounded-xl border bg-muted/30 p-3.5">
                        <p className="mb-2 text-[11px] font-bold">نوروفیدبک — پروتکل {detail.data.event.neuroFeedback.protocol}</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <span>تمرکز: {faNum(detail.data.event.neuroFeedback.focusOld ?? 0)} ← <b className="text-emerald-600">{faNum(detail.data.event.neuroFeedback.focusNew ?? 0)}</b></span>
                          <span>اضطراب: {faNum(detail.data.event.neuroFeedback.ezterabOld ?? 0)} ← <b className="text-emerald-600">{faNum(detail.data.event.neuroFeedback.ezterabNew ?? 0)}</b></span>
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="chain" className="pt-4">
                    <ConfirmChain detail={detail.data.event} />
                  </TabsContent>

                  <TabsContent value="clinical" className="pt-4 space-y-3">
                    {detail.data.event.psychology ? (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        <MiniStat label="خلق" value={detail.data.event.psychology.mood ?? "—"} />
                        <MiniStat label="شغل" value={detail.data.event.psychology.job ?? "—"} />
                        <MiniStat label="فرزندان" value={faNum(detail.data.event.psychology.children ?? 0)} />
                        <MiniStat label="بینش" value={detail.data.event.psychology.insight ?? "—"} />
                        <MiniStat label="حافظه" value={detail.data.event.psychology.memory ?? "—"} />
                      </div>
                    ) : (
                      <p className="py-6 text-center text-xs text-muted-foreground">فرم شرح حال بالینی برای این جلسه ثبت نشده است</p>
                    )}
                    {detail.data.ems && (
                      <div className="rounded-xl border border-rose-200 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/20 p-3.5">
                        <p className="flex items-center gap-1.5 text-xs font-bold text-rose-700 dark:text-rose-400"><SirenIcon /> مورد حاد مرتبط — شدت {detail.data.ems.severity}</p>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="notes" className="pt-4">
                    <NotesPanel comments={detail.data.event.comments} onAdd={(text) => act("comment", text)} />
                  </TabsContent>
                </Tabs>
              </div>

              <DialogFooter className="border-t bg-muted/40 px-6 py-4">
                {detail.data.event.status.includes("در انتظار") && (
                  <>
                    <Button className="gap-1.5" onClick={() => act("confirm")}>
                      <CheckCircle2 className="h-4 w-4" /> تایید مرحله بعد
                    </Button>
                    <RejectButton onConfirm={(comment) => act("reject", comment)} />
                  </>
                )}
                {(detail.data.event.status === "تایید نهایی" || detail.data.event.status === "رد شده") && (
                  <p className="text-xs text-muted-foreground">
                    {detail.data.event.status === "رد شده" && detail.data.event.rejectedComment ? `دلیل رد: ${detail.data.event.rejectedComment}` : "این جلسه به فرآیند تایید خاتمه داده است"}
                  </p>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RejectButton({ onConfirm }: { onConfirm: (comment: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const [comment, setComment] = React.useState("");
  return (
    <>
      <Button variant="destructive" className="gap-1.5" onClick={() => setOpen(true)}>
        <XCircle className="h-4 w-4" /> رد جلسه
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle className="text-right">دلیل رد جلسه</DialogTitle></DialogHeader>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="دلیل رد را وارد کنید..." rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>انصراف</Button>
            <Button variant="destructive" disabled={!comment.trim()} onClick={() => { onConfirm(comment); setOpen(false); }}>تایید رد</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ConfirmChain({ detail }: { detail: EventDetail["event"] }) {
  const steps = [
    { label: "ثبت جلسه", date: detail.startDate },
    { label: "تایید مدیر مرکز", date: detail.centerAdminConfirmDateTime },
    { label: "تایید مسئول فنی", date: detail.centerTechConfirmDateTime },
    { label: "تایید نظارت حرفه‌ای", date: detail.operatorConfirmDateTime },
    { label: "تایید ناظر استان", date: detail.provinceSupervisorConfirmDateTime },
    { label: "تایید نهایی ناظر", date: detail.supervisorConfirmDateTime },
  ];
  if (detail.status === "رد شده") {
    steps[1] = { label: `رد شده — ${detail.rejectedComment ?? ""}`, date: detail.rejectedAt };
  }
  return (
    <div className="relative space-y-0 pt-2">
      {steps.map((s, i) => {
        const done = !!s.date && detail.status !== "رد شده";
        const isLast = i === steps.length - 1;
        return (
          <div key={i} className="relative flex gap-3 pb-6 last:pb-0">
            {!isLast && <span className="absolute right-[13px] top-7 h-full w-0.5 bg-border" />}
            {done ? (
              <CircleCheck className="h-7 w-7 shrink-0 fill-primary/15 text-primary" />
            ) : (
              <Circle className="h-7 w-7 shrink-0 text-muted-foreground/40" />
            )}
            <div className="pt-0.5">
              <p className={`text-xs font-bold ${done ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</p>
              {s.date && <p className="text-[10.5px] tabular-nums text-muted-foreground mt-0.5">{jDateTime(s.date)}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NotesPanel({ comments, onAdd }: { comments: { id: number; comment: string | null; dateTime: string }[]; onAdd: (text: string) => void }) {
  const [text, setText] = React.useState("");
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="یادداشت جدید..." rows={2} className="text-xs" />
        <Button size="sm" className="shrink-0 gap-1 self-end" disabled={!text.trim()} onClick={() => { onAdd(text); setText(""); }}>
          <MessageSquarePlus className="h-4 w-4" /> ثبت
        </Button>
      </div>
      <Separator />
      <div className="max-h-56 space-y-2 overflow-y-auto">
        {comments.map((c) => (
          <div key={c.id} className="rounded-xl border bg-muted/40 p-3">
            <p className="text-xs leading-6">{c.comment}</p>
            <p className="mt-1.5 text-[10px] tabular-nums text-muted-foreground">{jDateTime(c.dateTime)}</p>
          </div>
        ))}
        {comments.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">یادداشتی ثبت نشده است</p>}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-muted/40 px-3.5 py-2.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-xs font-extrabold tabular-nums">{value}</p>
    </div>
  );
}

function SirenIcon() {
  return <Siren className="h-3.5 w-3.5" />;
}
