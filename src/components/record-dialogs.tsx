"use client";
// =====================================================================
// دیالوگ‌های مشترک ثبت (نسخهٔ ۶.۱۱) — در همهٔ بخش‌ها استفاده می‌شوند:
//   NewSessionDialog      — ثبت جلسه مشاوره (با امکان ثبت متقاضی جدید)
//   CompleteSessionDialog — ثبت انجام شدن جلسه + یادداشت
//   NewReserveDialog      — ثبت رزرو وقت
//   NewAcuteDialog        — ثبت مورد حاد (EMS)
//   QuestionnaireDialog   — پر کردن پرسشنامه برای متقاضی/جلسه
// همهٔ دیالوگ‌ها خودشان متا (خدمت/کلینیک) را در محدودهٔ دسترسی کاربر می‌گیرند
// و کلاینت‌ساید فقط پیش‌فرض می‌سازد — اعتبارسنجی نهایی سمت سرور است.
// =====================================================================
import * as React from "react";
import { api } from "@/lib/client";
import { faDigits, faNum, jDate } from "@/lib/jalali";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { Loader2, Search, Plus, UserPlus, CalendarCheck, CalendarClock, Siren, ClipboardList, CheckCircle2, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------
// انواع مشترک
// ---------------------------------------------------------------------

export type MetaLite = {
  services: { id: number; name: string; short?: string | null }[];
  centers: { id: number; title: string; cityTitle?: string; provinceTitle?: string }[];
};

type SearchRow = { id: number; name: string; family: string; nid: number };

function useMeta(open: boolean): { meta: MetaLite | null; error: string | null } {
  const [meta, setMeta] = React.useState<MetaLite | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!open) return;
    setMeta(null);
    setError(null);
    api<MetaLite>("/api/meta")
      .then((d) => setMeta({ services: d.services ?? [], centers: d.centers ?? [] }))
      .catch((e) => setError(e.message));
  }, [open]);
  return { meta, error };
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <Label className="mb-1.5 block text-[12px] font-bold">{label}</Label>
      {children}
      {hint && <p className="mt-1 text-[10.5px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------
// انتخاب متقاضی — از فهرست یا ثبت جدید (فقط برای ثبت جلسه)
// ---------------------------------------------------------------------

export type PersonPickerValue = {
  userId: string;
  newClient: { nid: string; name: string; family: string; mobile: string; gender: string };
};

function PersonPicker({ value, onChange }: {
  value: PersonPickerValue;
  onChange: (v: PersonPickerValue) => void;
}) {
  const [mode, setMode] = React.useState<"existing" | "new">(value.userId ? "existing" : "new");
  const [q, setQ] = React.useState("");
  const [rows, setRows] = React.useState<SearchRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [touched, setTouched] = React.useState(false);

  const search = React.useCallback(async (query: string) => {
    setLoading(true);
    try {
      const d = await api<{ rows: SearchRow[] }>(`/api/cartable?q=${encodeURIComponent(query)}`);
      setRows(d.rows ?? []);
      setTouched(true);
    } catch { setRows([]); }
    setLoading(false);
  }, []);

  React.useEffect(() => { if (mode === "existing" && !touched) search(""); }, [mode, touched, search]);

  return (
    <div className="rounded-xl border bg-muted/20 p-3">
      <div className="mb-3 flex gap-1.5">
        <Button type="button" size="sm" variant={mode === "existing" ? "default" : "outline"} className="h-8 gap-1.5 text-[11.5px]" onClick={() => setMode("existing")}>
          <Search className="h-3.5 w-3.5" /> انتخاب از فهرست
        </Button>
        <Button type="button" size="sm" variant={mode === "new" ? "default" : "outline"} className="h-8 gap-1.5 text-[11.5px]" onClick={() => setMode("new")}>
          <UserPlus className="h-3.5 w-3.5" /> متقاضی جدید
        </Button>
      </div>
      {mode === "existing" ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search(q)} placeholder="نام یا کد ملی..." className="h-9 text-[12.5px]" dir="rtl" />
            <Button type="button" size="icon" className="h-9 w-9 shrink-0" onClick={() => search(q)} aria-label="جستجو"><Search className="h-4 w-4" /></Button>
          </div>
          {loading && <p className="text-center text-[11px] text-muted-foreground">در حال جستجو...</p>}
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {rows.map((r) => (
              <button key={r.id} type="button"
                onClick={() => onChange({ ...value, userId: String(r.id), newClient: { nid: "", name: "", family: "", mobile: "", gender: "" } })}
                className={cn("flex w-full items-center justify-between rounded-lg border bg-card px-3 py-1.5 text-right text-[12px] transition-colors hover:border-ring",
                  value.userId === String(r.id) && "border-ring ring-1 ring-ring")}>
                <span className="font-bold">{r.name} {r.family}</span>
                <span className="text-[10.5px] tabular-nums text-muted-foreground">{r.nid ? faDigits(r.nid) : "—"}</span>
              </button>
            ))}
            {!loading && rows.length === 0 && <p className="py-2 text-center text-[11px] text-muted-foreground">متقاضی‌ای یافت نشد — گزینهٔ «متقاضی جدید» را بزنید.</p>}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Field label="کد ملی *"><Input value={value.newClient.nid} onChange={(e) => onChange({ ...value, userId: "", newClient: { ...value.newClient, nid: e.target.value } })} className="h-9 text-[12.5px]" dir="ltr" inputMode="numeric" placeholder="کد ملی ۱۰ رقمی" /></Field>
          <Field label="موبایل *"><Input value={value.newClient.mobile} onChange={(e) => onChange({ ...value, userId: "", newClient: { ...value.newClient, mobile: e.target.value } })} className="h-9 text-[12.5px]" dir="ltr" inputMode="numeric" placeholder="09xxxxxxxxx" /></Field>
          <Field label="نام *"><Input value={value.newClient.name} onChange={(e) => onChange({ ...value, userId: "", newClient: { ...value.newClient, name: e.target.value } })} className="h-9 text-[12.5px]" /></Field>
          <Field label="نام خانوادگی *"><Input value={value.newClient.family} onChange={(e) => onChange({ ...value, userId: "", newClient: { ...value.newClient, family: e.target.value } })} className="h-9 text-[12.5px]" /></Field>
          <Field label="جنسیت">
            <Select value={value.newClient.gender || "none"} onValueChange={(v) => onChange({ ...value, userId: "", newClient: { ...value.newClient, gender: v === "none" ? "" : v } })}>
              <SelectTrigger className="h-9 text-[12.5px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                <SelectItem value="زن">زن</SelectItem>
                <SelectItem value="مرد">مرد</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <p className="col-span-2 self-end text-[10.5px] leading-4 text-muted-foreground">
            متقاضی جدید همزمان با ثبت جلسه ساخته می‌شود؛ ورود او با کد ملی و رمز پیش‌فرض ۱۲۳۴۵۶ است.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// ۱) ثبت جلسه مشاوره
// ---------------------------------------------------------------------

export function NewSessionDialog({ open, onClose, onSaved, presetUser }: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  presetUser?: { id: number; name: string; family: string } | null;
}) {
  const { toast } = useToast();
  const { meta, error: metaError } = useMeta(open);
  const [person, setPerson] = React.useState({ userId: presetUser ? String(presetUser.id) : "", newClient: { nid: "", name: "", family: "", mobile: "", gender: "" } });
  const [serviceId, setServiceId] = React.useState("");
  const [centerId, setCenterId] = React.useState("");
  const [date, setDate] = React.useState("");
  const [time, setTime] = React.useState("");
  const [topic, setTopic] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [tariff, setTariff] = React.useState("");
  const [done, setDone] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setPerson({ userId: presetUser ? String(presetUser.id) : "", newClient: { nid: "", name: "", family: "", mobile: "", gender: "" } });
      setServiceId(""); setCenterId(""); setDate(""); setTime(""); setTopic(""); setDescription(""); setTariff(""); setDone(false);
    }
  }, [open, presetUser]);

  const save = async () => {
    setSaving(true);
    try {
      const iso = date ? (time ? combineIso(date, time) : date) : "";
      const payload: Record<string, unknown> = {
        serviceId: Number(serviceId), centerId: Number(centerId),
        startDate: iso || undefined, topic, description, userTariff: tariff ? Number(tariff) : 0, done,
      };
      if (person.userId) payload.userId = Number(person.userId);
      else payload.newClient = person.newClient;
      const d = await api<{ event: { id: number }; client: { name: string; family: string } }>("/api/events", { method: "POST", body: JSON.stringify(payload) });
      toast({ title: `جلسه #${faNum(d.event.id)} برای «${d.client.name} ${d.client.family}» ثبت شد` });
      onSaved();
      onClose();
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    }
    setSaving(false);
  };

  const valid = Boolean((person.userId || (person.newClient.nid && person.newClient.name && person.newClient.family && person.newClient.mobile)) && serviceId && centerId);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl p-0" dir="rtl">
        <DialogHeader className="border-b bg-gradient-to-l from-accent/60 to-transparent px-6 py-4 text-right">
          <DialogTitle className="flex items-center gap-2 text-base"><CalendarCheck className="h-4.5 w-4.5 text-primary" /> ثبت جلسه مشاوره</DialogTitle>
          <DialogDescription className="text-[11.5px]">
            {presetUser ? `برای «${presetUser.name} ${presetUser.family}» — می‌توانید متقاضی دیگری هم انتخاب کنید.` : "جلسهٔ جدید در محدودهٔ کلینیک‌های شما ثبت می‌شود."}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-6 py-4">
          {metaError && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[11.5px] text-rose-700">{metaError}</p>}
          <PersonPicker value={person} onChange={setPerson} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="خدمت مشاوره *">
              <Select value={serviceId || undefined} onValueChange={setServiceId}>
                <SelectTrigger className="h-9 text-[12.5px]"><SelectValue placeholder="انتخاب خدمت" /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {(meta?.services ?? []).map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="کلینیک / مرکز *">
              <Select value={centerId || undefined} onValueChange={setCenterId}>
                <SelectTrigger className="h-9 text-[12.5px]"><SelectValue placeholder="انتخاب کلینیک" /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {(meta?.centers ?? []).map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.title}{c.cityTitle ? ` — ${c.cityTitle}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="تاریخ جلسه"><JalaliDatePicker value={date} onChange={setDate} placeholder="انتخاب تاریخ" /></Field>
            <Field label="ساعت"><Input value={time} onChange={(e) => setTime(e.target.value)} placeholder="14:30" dir="ltr" className="h-9 text-[12.5px]" inputMode="numeric" /></Field>
            <Field label="موضوع جلسه"><Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="مثلاً اضطراب اجتماعی" className="h-9 text-[12.5px]" /></Field>
            <Field label="تعرفه (تومان)"><Input value={tariff} onChange={(e) => setTariff(e.target.value.replace(/\D/g, ""))} dir="ltr" inputMode="numeric" className="h-9 text-[12.5px]" /></Field>
          </div>
          <Field label="شرح جلسه / خلاصهٔ مشاوره">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="text-[12.5px]" placeholder="یادداشت بالینی، شرح وضعیت و اقدامات..." />
          </Field>
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2.5">
            <Switch checked={done} onCheckedChange={setDone} />
            <span className="text-[12.5px] font-bold">این جلسه انجام شده است</span>
            <span className="text-[10.5px] text-muted-foreground">— با ثبت انجام، جلسه وارد چرخهٔ تایید می‌شود</span>
          </label>
        </div>
        <DialogFooter className="border-t bg-muted/40 px-6 py-3.5">
          <Button variant="outline" size="sm" onClick={onClose}>انصراف</Button>
          <Button className="brand-gradient gap-1.5 text-white" size="sm" disabled={!valid || saving} onClick={save}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} ثبت جلسه
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** ترکیب تاریخ ISO (نیمه‌شب) با ساعت HH:mm */
function combineIso(iso: string, time: string): string {
  const d = new Date(iso);
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (m) d.setHours(Math.min(23, Number(m[1])), Number(m[2]), 0, 0);
  return d.toISOString();
}

// ---------------------------------------------------------------------
// انتخاب جلسه — برای رزرو و مورد حاد
// ---------------------------------------------------------------------

type EventOption = { id: number; label: string; sub: string };

function EventPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [q, setQ] = React.useState("");
  const [options, setOptions] = React.useState<EventOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [openList, setOpenList] = React.useState(false);

  const load = React.useCallback(async (query: string) => {
    setLoading(true);
    try {
      const d = await api<{ events: { id: number; topic: string | null; startDate: string | null; status: string; user?: { name: string; family: string }; service?: { short: string | null } }[] }>(`/api/events?pageSize=30&q=${encodeURIComponent(query)}`);
      setOptions((d.events ?? []).map((e) => ({
        id: e.id,
        label: `#${faNum(e.id)} — ${e.user ? `${e.user.name} ${e.user.family}` : "مراجع"}${e.service?.short ? ` — ${e.service.short}` : ""}`,
        sub: `${e.startDate ? jDate(e.startDate) : "بدون تاریخ"} — ${e.status}${e.topic ? ` — ${e.topic}` : ""}`,
      })));
    } catch { setOptions([]); }
    setLoading(false);
  }, []);

  React.useEffect(() => { if (openList) load(q); }, [openList, q, load]);

  const selected = options.find((o) => String(o.id) === value);

  return (
    <div className="rounded-xl border bg-muted/20 p-3">
      <div className="mb-2 flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی جلسه (نام، کد پیگیری)..." className="h-9 text-[12.5px]" dir="rtl" />
        <Button type="button" size="icon" className="h-9 w-9 shrink-0" onClick={() => { setOpenList(true); load(q); }} aria-label="بارگذاری جلسات">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </div>
      {selected && (
        <div className="mb-2 rounded-lg border bg-card px-3 py-1.5 text-[12px]">
          <p className="font-bold">{selected.label}</p>
          <p className="text-[10.5px] text-muted-foreground">{selected.sub}</p>
        </div>
      )}
      <button type="button" onClick={() => setOpenList((o) => !o)} className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed px-3 py-1.5 text-[11.5px] text-muted-foreground transition-colors hover:border-ring hover:text-foreground">
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", openList && "rotate-180")} />
        {openList ? "بستن فهرست جلسات" : "نمایش جلسات در محدودهٔ شما"}
      </button>
      {openList && (
        <div className="mt-2 max-h-44 space-y-1 overflow-y-auto">
          {options.map((o) => (
            <button key={o.id} type="button" onClick={() => { onChange(String(o.id)); setOpenList(false); }}
              className={cn("flex w-full flex-col rounded-lg border bg-card px-3 py-1.5 text-right transition-colors hover:border-ring", value === String(o.id) && "border-ring ring-1 ring-ring")}>
              <span className="text-[12px] font-bold">{o.label}</span>
              <span className="text-[10px] text-muted-foreground">{o.sub}</span>
            </button>
          ))}
          {!loading && options.length === 0 && <p className="py-2 text-center text-[11px] text-muted-foreground">جلسه‌ای در محدودهٔ شما یافت نشد — ابتدا جلسه ثبت کنید.</p>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// ۲) ثبت انجام شدن جلسه
// ---------------------------------------------------------------------

export function CompleteSessionDialog({ open, onClose, onSaved, event }: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  event: { id: number; title: string } | null;
}) {
  const { toast } = useToast();
  const [date, setDate] = React.useState("");
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => { if (open) { setDate(""); setNote(""); } }, [open, event?.id]);

  const save = async () => {
    if (!event) return;
    setSaving(true);
    try {
      await api(`/api/events/${event.id}`, { method: "POST", body: JSON.stringify({ action: "complete", date: date || undefined, comment: note }) });
      toast({ title: `انجام جلسه #${faNum(event.id)} ثبت شد — در انتظار تایید مدیر` });
      onSaved();
      onClose();
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md p-0" dir="rtl">
        <DialogHeader className="border-b bg-gradient-to-l from-accent/60 to-transparent px-6 py-4 text-right">
          <DialogTitle className="flex items-center gap-2 text-base"><CheckCircle2 className="h-4.5 w-4.5 text-emerald-600" /> ثبت انجام جلسه</DialogTitle>
          <DialogDescription className="text-[11.5px]">{event ? `${event.title} — جلسه #${faNum(event.id)}` : ""}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-6 py-4">
          <Field label="تاریخ انجام"><JalaliDatePicker value={date} onChange={setDate} placeholder="امروز (پیش‌فرض)" /></Field>
          <Field label="یادداشت و شرح اقدامات (اختیاری)">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="text-[12.5px]" placeholder="خلاصهٔ جلسه، تمرین‌ها و اقدامات انجام‌شده..." />
          </Field>
          <p className="rounded-lg bg-cyan-50 px-3 py-2 text-[11px] leading-5 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300">
            پس از ثبت، جلسه «انجام شده» علامت می‌خورد و برای تایید نهایی به چرخهٔ تایید مدیر ارسال می‌شود.
          </p>
        </div>
        <DialogFooter className="border-t bg-muted/40 px-6 py-3.5">
          <Button variant="outline" size="sm" onClick={onClose}>انصراف</Button>
          <Button className="brand-gradient gap-1.5 text-white" size="sm" disabled={saving} onClick={save}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} ثبت انجام
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// ۳) ثبت رزرو وقت
// ---------------------------------------------------------------------

export function NewReserveDialog({ open, onClose, onSaved, presetEventId }: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  presetEventId?: number | null;
}) {
  const { toast } = useToast();
  const [eventId, setEventId] = React.useState(presetEventId ? String(presetEventId) : "");
  const [date, setDate] = React.useState("");
  const [time, setTime] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => { if (open) { setEventId(presetEventId ? String(presetEventId) : ""); setDate(""); setTime(""); } }, [open, presetEventId]);

  const save = async () => {
    setSaving(true);
    try {
      await api("/api/reserves", { method: "POST", body: JSON.stringify({ eventId: Number(eventId), date: date || undefined, time }) });
      toast({ title: "رزرو وقت با موفقیت ثبت شد" });
      onSaved();
      onClose();
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg p-0" dir="rtl">
        <DialogHeader className="border-b bg-gradient-to-l from-accent/60 to-transparent px-6 py-4 text-right">
          <DialogTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-4.5 w-4.5 text-primary" /> ثبت رزرو وقت مشاوره</DialogTitle>
          <DialogDescription className="text-[11.5px]">زمان جلسهٔ بعدی را برای یکی از جلسات پروندهٔ خود رزرو کنید.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-6 py-4">
          <Field label="جلسه *"><EventPicker value={eventId} onChange={setEventId} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="تاریخ رزرو *"><JalaliDatePicker value={date} onChange={setDate} /></Field>
            <Field label="ساعت"><Input value={time} onChange={(e) => setTime(e.target.value)} placeholder="16:00" dir="ltr" className="h-9 text-[12.5px]" inputMode="numeric" /></Field>
          </div>
        </div>
        <DialogFooter className="border-t bg-muted/40 px-6 py-3.5">
          <Button variant="outline" size="sm" onClick={onClose}>انصراف</Button>
          <Button className="brand-gradient gap-1.5 text-white" size="sm" disabled={!eventId || saving} onClick={save}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} ثبت رزرو
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// ۴) ثبت مورد حاد (EMS)
// ---------------------------------------------------------------------

const EMS_OPTIONS: { key: string; label: string; options: string[] }[] = [
  { key: "emsType", label: "نوع مورد حاد", options: ["خودکشی", "خودزنی", "خشونت خانگی", "سوءمصرف مواد", "بحران روانی حاد", "آزار جنسی", "خشونت بیرونی", "سوگ حاد", "حمله وحشت", "سایر"] },
  { key: "suicidalFrom", label: "عوامل خطر خودکشی", options: ["افسردگی شدید", "شکست عاطفی", "بیکاری", "بدهی مالی", "سابقه خودکشی", "اعتیاد", "طرد خانوادگی", "بیماری جسمی", "انزوای اجتماعی"] },
  { key: "psychiatricDisorders", label: "اختلالات روانپزشکی", options: ["افسردگی", "اضطراب", "دوقطبی", "اسکیزوفرنی", "وسواس", "استرس پس از سانحه", "اختلال خواب", "اختلال خوردن", "سوءمصرف مواد"] },
  { key: "socialFactors", label: "عوامل اجتماعی مؤثر", options: ["طلاق/جدایی", "مرگ عزیز", "بیکاری", "فقر", "بی‌سرپناهی", "خشونت خانواده", "مهاجرت", "طرد اجتماعی"] },
  { key: "protectiveFactors", label: "عوامل حفاظتی", options: ["حمایت خانواده", "باور مذهبی", "فرزندان", "مسیر درمان", "امید به آینده", "مهارت حل مسئله", "دلبستگی سالم"] },
  { key: "suggestedActions", label: "اقدامات پیشنهادی", options: ["ارجاع فوری به روانپزشک", "بستری", "جلسه اضطراری", "افزایش دفعات جلسات", "درگیر کردن خانواده", "پیگیری درمان دارویی", "ارجاع به مددکاری", "مراقبت امنیتی"] },
];

export function NewAcuteDialog({ open, onClose, onSaved, presetEventId }: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  presetEventId?: number | null;
}) {
  const { toast } = useToast();
  const [eventId, setEventId] = React.useState(presetEventId ? String(presetEventId) : "");
  const [severity, setSeverity] = React.useState("متوسط");
  const [checks, setChecks] = React.useState<Record<string, string[]>>({});
  const [actionsTaken, setActionsTaken] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [fin, setFin] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => { if (open) { setEventId(presetEventId ? String(presetEventId) : ""); setSeverity("متوسط"); setChecks({}); setActionsTaken(""); setDescription(""); setFin(false); } }, [open, presetEventId]);

  const toggle = (key: string, opt: string) =>
    setChecks((c) => ({ ...c, [key]: (c[key] ?? []).includes(opt) ? (c[key] ?? []).filter((x) => x !== opt) : [...(c[key] ?? []), opt] }));

  const save = async () => {
    setSaving(true);
    try {
      await api("/api/ems", { method: "POST", body: JSON.stringify({ eventId: Number(eventId), severity, ...checks, actionsTaken, description, financialAssistanceRequest: fin }) });
      toast({ title: "مورد حاد با موفقیت ثبت شد — جلسه در فهرست موارد حاد نمایش داده می‌شود" });
      onSaved();
      onClose();
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl p-0" dir="rtl">
        <DialogHeader className="border-b bg-gradient-to-l from-rose-500/10 to-transparent px-6 py-4 text-right">
          <DialogTitle className="flex items-center gap-2 text-base"><Siren className="h-4.5 w-4.5 text-rose-500" /> ثبت مورد حاد (EMS)</DialogTitle>
          <DialogDescription className="text-[11.5px]">فرم ارزیابی مورد حاد — بر اساس فرم استاندارد کمیسیون موارد حاد</DialogDescription>
        </DialogHeader>
        <div className="max-h-[62vh] space-y-4 overflow-y-auto px-6 py-4">
          <Field label="جلسهٔ مرتبط *"><EventPicker value={eventId} onChange={setEventId} /></Field>
          <Field label="شدت مورد حاد *">
            <div className="flex gap-2">
              {["کم", "متوسط", "بالا"].map((s) => (
                <button key={s} type="button" onClick={() => setSeverity(s)}
                  className={cn("flex-1 rounded-xl border px-3 py-2 text-[12.5px] font-bold transition-colors",
                    severity === s ? (s === "بالا" ? "border-rose-400 bg-rose-500 text-white" : s === "متوسط" ? "border-amber-400 bg-amber-500 text-white" : "border-emerald-400 bg-emerald-500 text-white") : "bg-card hover:border-ring")}>
                  {s}
                </button>
              ))}
            </div>
          </Field>
          {EMS_OPTIONS.map((g) => (
            <Field key={g.key} label={g.label}>
              <div className="flex flex-wrap gap-1.5">
                {g.options.map((opt) => {
                  const on = (checks[g.key] ?? []).includes(opt);
                  return (
                    <button key={opt} type="button" onClick={() => toggle(g.key, opt)}
                      className={cn("rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors", on ? "border-primary bg-primary text-white" : "bg-card text-muted-foreground hover:border-ring hover:text-foreground")}>
                      {opt}
                    </button>
                  );
                })}
              </div>
            </Field>
          ))}
          <Field label="اقدامات انجام‌شده">
            <Textarea value={actionsTaken} onChange={(e) => setActionsTaken(e.target.value)} rows={2} className="text-[12.5px]" placeholder="اقدامات فوری انجام‌شده برای این مورد..." />
          </Field>
          <Field label="توضیحات تکمیلی">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="text-[12.5px]" placeholder="شرح مورد برای کمیسیون..." />
          </Field>
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2.5">
            <Switch checked={fin} onCheckedChange={setFin} />
            <span className="text-[12.5px] font-bold">درخواست کمک‌هزینه دارد</span>
            <span className="text-[10.5px] text-muted-foreground">— برای بررسی در کمیسیون موارد حاد</span>
          </label>
        </div>
        <DialogFooter className="border-t bg-muted/40 px-6 py-3.5">
          <Button variant="outline" size="sm" onClick={onClose}>انصراف</Button>
          <Button className="brand-gradient gap-1.5 text-white" size="sm" disabled={!eventId || saving} onClick={save}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Siren className="h-4 w-4" />} ثبت مورد حاد
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// ۵) پر کردن پرسشنامه برای متقاضی
// ---------------------------------------------------------------------

type FormLite = { id: number; title: string; desc: string | null; isActive?: boolean; fields: { key: string; label: string; type: string; required?: boolean; options?: string[] }[] };

export function QuestionnaireDialog({ open, onClose, onSaved, presetUserId }: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  presetUserId?: number | null;
}) {
  const { toast } = useToast();
  const [forms, setForms] = React.useState<FormLite[]>([]);
  const [formId, setFormId] = React.useState("");
  const [data, setData] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setFormId(""); setData({});
    setLoading(true);
    api<{ forms: FormLite[] }>("/api/forms")
      .then((d) => setForms((d.forms ?? []).filter((f) => f.isActive)))
      .catch(() => setForms([]))
      .finally(() => setLoading(false));
  }, [open]);

  const form = forms.find((f) => String(f.id) === formId) ?? null;

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      await api(`/api/forms/${form.id}/submit`, {
        method: "POST",
        body: JSON.stringify({ data, userId: presetUserId ?? null }),
      });
      toast({ title: `پاسخ «${form.title}» ثبت شد` });
      onSaved();
      onClose();
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl p-0" dir="rtl">
        <DialogHeader className="border-b bg-gradient-to-l from-accent/60 to-transparent px-6 py-4 text-right">
          <DialogTitle className="flex items-center gap-2 text-base"><ClipboardList className="h-4.5 w-4.5 text-primary" /> ثبت پرسشنامه</DialogTitle>
          <DialogDescription className="text-[11.5px]">یکی از پرسشنامه‌های فعال سازمان را برای متقاضی پر کنید.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-6 py-4">
          {loading ? (
            <p className="flex items-center justify-center gap-2 py-6 text-[12px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> در حال بارگذاری پرسشنامه‌ها...</p>
          ) : forms.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-muted-foreground">پرسشنامهٔ فعالی وجود ندارد — از بخش «فرم‌ساز» پرسشنامه بسازید.</p>
          ) : (
            <>
              <Field label="پرسشنامه *">
                <Select value={formId || undefined} onValueChange={(v) => { setFormId(v); setData({}); }}>
                  <SelectTrigger className="h-9 text-[12.5px]"><SelectValue placeholder="انتخاب پرسشنامه" /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {forms.map((f) => <SelectItem key={f.id} value={String(f.id)}>{f.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              {form && (
                <div className="space-y-3">
                  {form.desc && <p className="rounded-lg bg-muted/40 px-3 py-2 text-[11.5px] text-muted-foreground">{form.desc}</p>}
                  {form.fields.map((f) => (
                    <Field key={f.key} label={`${f.label}${f.required ? " *" : ""}`}>
                      {f.type === "textarea" ? (
                        <Textarea value={data[f.key] ?? ""} onChange={(e) => setData((d) => ({ ...d, [f.key]: e.target.value }))} rows={2} className="text-[12.5px]" />
                      ) : f.type === "select" ? (
                        <Select value={data[f.key] || undefined} onValueChange={(v) => setData((d) => ({ ...d, [f.key]: v }))}>
                          <SelectTrigger className="h-9 text-[12.5px]"><SelectValue placeholder="انتخاب کنید" /></SelectTrigger>
                          <SelectContent>{(f.options ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : f.type === "checkbox" ? (
                        <label className="flex cursor-pointer items-center gap-2 text-[12.5px]">
                          <Switch checked={(data[f.key] ?? "false") === "true"} onCheckedChange={(v) => setData((d) => ({ ...d, [f.key]: String(v) }))} />
                          {f.label}
                        </label>
                      ) : (
                        <Input type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} value={data[f.key] ?? ""} onChange={(e) => setData((d) => ({ ...d, [f.key]: e.target.value }))} className="h-9 text-[12.5px]" dir={f.type === "number" || f.type === "date" ? "ltr" : "rtl"} />
                      )}
                    </Field>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <DialogFooter className="border-t bg-muted/40 px-6 py-3.5">
          <Button variant="outline" size="sm" onClick={onClose}>انصراف</Button>
          <Button className="brand-gradient gap-1.5 text-white" size="sm" disabled={!form || saving} onClick={save}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />} ثبت پاسخ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
