"use client";
// ارجاعات سها — نسخهٔ ۶.۱۹: نمایش همهٔ آیتم‌های رکورد بدون خلاصه‌سازی
// همهٔ ستون‌ها: کد ارجاع، نام، کد ملی، موبایل، استان، شهر، مرکز، خدمت،
// نوع ارجاع، توضیحات کامل، جلسات، پذیرنده، پیگیری‌ها، وضعیت، تاریخ، عملیات
import * as React from "react";
import { PageHeader, FilterBar, DataTable, StatusBadge, StatCard, Column } from "@/components/shared";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { faNum, faDigits, jDate, jTime } from "@/lib/jalali";
import { api, useQuery } from "@/lib/client";
import { ArrowLeftRight, Search, MessageCircleMore, Pencil, RotateCcw, Hourglass, UserCheck, CornerDownLeft, CalendarX } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

type FollowUp = { id: number; userId: number; userName: string; comment: string; createdAt: string };
type ReferrRow = {
  id: number; refId: string; userId: number; userName: string | null; userNid: string | null; userMobile: string | null;
  provinceId: number; cityId: number | null; centerId: number | null;
  provinceTitle: string | null; cityTitle: string | null; centerTitle: string | null;
  serviceId: number; service: { short: string; name: string };
  description: string | null; isReferr: boolean; acceptorId: number | null; acceptorName: string | null;
  sessionsCount: number; status: string; creationDate: string; followUps: FollowUp[];
};

const STATUSES = ["در انتظار", "پذیرش‌شده", "ارجاع‌شده", "منقضی"];

export function ReferralsView() {
  const { toast } = useToast();
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [provinceId, setProvinceId] = React.useState("");
  const [cityId, setCityId] = React.useState("");
  const [centerId, setCenterId] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<ReferrRow | null>(null);
  const [followup, setFollowup] = React.useState("");
  const [editing, setEditing] = React.useState<ReferrRow | null>(null);
  const [editForm, setEditForm] = React.useState<{ status: string; provinceId: string; cityId: string; centerId: string; sessionsCount: string; description: string }>({ status: "", provinceId: "", cityId: "", centerId: "", sessionsCount: "0", description: "" });
  const [busy, setBusy] = React.useState(false);

  const { data, loading, refetch } = useQuery<{
    total: number; totalPages: number; referrs: ReferrRow[];
    statusAgg: { status: string; count: number }[];
  }>(() => api(`/api/referrals?status=${encodeURIComponent(status)}&provinceId=${provinceId}&cityId=${cityId}&centerId=${centerId}&from=${from}&to=${to}&q=${encodeURIComponent(q)}&page=${page}&pageSize=20`), [status, provinceId, cityId, centerId, from, to, q, page]);

  const meta = useQuery<{ provinces: { id: number; title: string }[]; cities: { id: number; title: string; provinceId: number }[]; centers: { id: number; title: string; provinceId: number; cityId: number }[] }>(() => api("/api/meta"), []);

  const cityOptions = React.useMemo(
    () => (meta.data?.cities ?? []).filter((c) => !provinceId || c.provinceId === Number(provinceId)),
    [meta.data, provinceId]
  );
  const centerOptions = React.useMemo(
    () => (meta.data?.centers ?? []).filter((c) =>
      (!provinceId || c.provinceId === Number(provinceId)) && (!cityId || c.cityId === Number(cityId))
    ),
    [meta.data, provinceId, cityId]
  );

  const cnt = (s: string) => data?.statusAgg.find((x) => x.status === s)?.count ?? 0;

  const act = async (id: number, action: string, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      await api("/api/referrals", { method: "PATCH", body: JSON.stringify({ id, action, ...extra }) });
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  };

  const accept = async (r: ReferrRow) => {
    if (await act(r.id, "accept")) { toast({ title: "ارجاع پذیرش شد" }); refetch(); }
  };

  const sendFollowup = async () => {
    if (!selected || !followup.trim()) return;
    if (await act(selected.id, "followup", { comment: followup })) {
      toast({ title: "پیگیری ثبت شد" });
      setFollowup("");
      setSelected(null);
      refetch();
    }
  };

  const openEdit = (r: ReferrRow) => {
    setEditForm({ status: r.status, provinceId: String(r.provinceId), cityId: r.cityId ? String(r.cityId) : "", centerId: r.centerId ? String(r.centerId) : "", sessionsCount: String(r.sessionsCount), description: r.description ?? "" });
    setEditing(r);
  };

  const editCityOptions = React.useMemo(
    () => (meta.data?.cities ?? []).filter((c) => !editForm.provinceId || c.provinceId === Number(editForm.provinceId)),
    [meta.data, editForm.provinceId]
  );
  const editCenterOptions = React.useMemo(
    () => (meta.data?.centers ?? []).filter((c) =>
      (!editForm.provinceId || c.provinceId === Number(editForm.provinceId)) && (!editForm.cityId || c.cityId === Number(editForm.cityId))
    ),
    [meta.data, editForm.provinceId, editForm.cityId]
  );

  const saveEdit = async () => {
    if (!editing) return;
    if (await act(editing.id, "edit", {
      status: editForm.status,
      provinceId: Number(editForm.provinceId),
      cityId: editForm.cityId === "" ? null : Number(editForm.cityId),
      centerId: editForm.centerId === "" ? null : Number(editForm.centerId),
      sessionsCount: Number(editForm.sessionsCount),
      description: editForm.description,
    })) {
      toast({ title: "ارجاع با موفقیت ویرایش شد" });
      setEditing(null);
      refetch();
    }
  };

  const resetFilters = () => {
    setQ(""); setStatus(""); setProvinceId(""); setCityId(""); setCenterId(""); setFrom(""); setTo(""); setPage(1);
  };

  const columns: Column<ReferrRow>[] = [
    { header: "کد ارجاع", cell: (r) => <span className="text-xs font-bold tabular-nums text-primary">{faDigits(r.refId)}</span> },
    { header: "نام و نام خانوادگی", cell: (r) => <span className="text-[13px] font-semibold">{r.userName ?? "—"}</span> },
    { header: "کد ملی", cell: (r) => <span className="text-xs tabular-nums">{r.userNid ? faDigits(r.userNid) : "—"}</span> },
    { header: "موبایل", cell: (r) => <span dir="ltr" className="block text-left text-xs tabular-nums">{r.userMobile ? faDigits(r.userMobile) : "—"}</span> },
    { header: "استان", cell: (r) => <span className="text-xs">{r.provinceTitle ?? "—"}</span> },
    { header: "شهر", cell: (r) => <span className="text-xs">{r.cityTitle ?? "—"}</span> },
    { header: "مرکز", cell: (r) => <span className="text-xs">{r.centerTitle ?? "—"}</span> },
    { header: "خدمت", cell: (r) => <Badge variant="secondary" className="max-w-56 whitespace-normal text-center text-[10.5px] font-semibold leading-4">{r.service?.name ?? "—"}</Badge> },
    {
      header: "نوع ارجاع",
      cell: (r) => (
        <Badge variant="outline" className={`text-[10.5px] font-bold ${r.isReferr ? "border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-700 dark:bg-teal-950/50 dark:text-teal-300" : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300"}`}>
          {r.isReferr ? "ارجاع‌شده به مرکز" : "دریافتی از سها"}
        </Badge>
      ),
    },
    {
      header: "توضیحات",
      className: "whitespace-normal",
      cell: (r) => <span className="block whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">{r.description ?? "—"}</span>,
    },
    { header: "جلسات", cell: (r) => <span className="text-xs font-bold tabular-nums">{faNum(r.sessionsCount)}</span> },
    { header: "پذیرنده", cell: (r) => <span className="text-xs">{r.acceptorName ?? "—"}</span> },
    {
      header: "پیگیری‌ها",
      cell: (r) => (
        <button className="inline-flex items-center gap-1 text-xs font-bold tabular-nums text-primary hover:underline" onClick={(e) => { e.stopPropagation(); setSelected(r); }}>
          <MessageCircleMore className="h-3.5 w-3.5" /> {faNum(r.followUps.length)}
        </button>
      ),
    },
    { header: "وضعیت", cell: (r) => <StatusBadge status={r.status} /> },
    {
      header: "تاریخ",
      cell: (r) => (
        <div className="text-xs leading-4">
          <span className="tabular-nums text-muted-foreground">{jDate(r.creationDate)}</span>
          <br />
          <span className="tabular-nums text-[10px] text-muted-foreground/70">ساعت {jTime(r.creationDate)}</span>
        </div>
      ),
    },
    {
      header: "عملیات",
      cell: (r) => (
        <div className="flex gap-1">
          {r.status === "در انتظار" && (
            <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px] text-emerald-600 hover:text-emerald-700" disabled={busy} onClick={(e) => { e.stopPropagation(); accept(r); }}>
              پذیرش
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-[11px]" onClick={(e) => { e.stopPropagation(); setSelected(r); }}>
            <MessageCircleMore className="h-3.5 w-3.5" /> پیگیری
          </Button>
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-[11px]" onClick={(e) => { e.stopPropagation(); openEdit(r); }}>
            <Pencil className="h-3.5 w-3.5" /> ویرایش
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="ارجاعات سها" subtitle={`پیگیری ${faNum(data?.total ?? 0)} ارجاع دریافتی از وزارت بهداشت`} icon={<ArrowLeftRight className="h-5 w-5" />} />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard title="در انتظار" value={faNum(cnt("در انتظار"))} icon={<Hourglass className="h-5 w-5" />} tone="amber" />
        <StatCard title="پذیرش‌شده" value={faNum(cnt("پذیرش‌شده"))} icon={<UserCheck className="h-5 w-5" />} tone="cyan" />
        <StatCard title="ارجاع‌شده" value={faNum(cnt("ارجاع‌شده"))} icon={<CornerDownLeft className="h-5 w-5" />} tone="teal" />
        <StatCard title="منقضی" value={faNum(cnt("منقضی"))} icon={<CalendarX className="h-5 w-5" />} tone="slate" />
      </div>

      <FilterBar className="mb-4">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="جستجوی کد ارجاع، نام، کد ملی یا موبایل..." className="h-9 pr-9 text-sm" />
        </div>
        <Select value={provinceId} onValueChange={(v) => { setProvinceId(v === "all" ? "" : v); setCityId(""); setCenterId(""); setPage(1); }}>
          <SelectTrigger className="h-9 w-32 text-xs"><SelectValue placeholder="استان" /></SelectTrigger>
          <SelectContent dir="rtl" className="max-h-64">
            <SelectItem value="all">همهٔ استان‌ها</SelectItem>
            {(meta.data?.provinces ?? []).map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={cityId} onValueChange={(v) => { setCityId(v === "all" ? "" : v); setCenterId(""); setPage(1); }}>
          <SelectTrigger className="h-9 w-32 text-xs"><SelectValue placeholder="شهر" /></SelectTrigger>
          <SelectContent dir="rtl" className="max-h-64">
            <SelectItem value="all">همهٔ شهرها</SelectItem>
            {cityOptions.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={centerId} onValueChange={(v) => { setCenterId(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="h-9 w-44 text-xs"><SelectValue placeholder="مرکز مشاوره" /></SelectTrigger>
          <SelectContent dir="rtl" className="max-h-64">
            <SelectItem value="all">همهٔ مراکز</SelectItem>
            {centerOptions.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <JalaliDatePicker value={from} onChange={(v) => { setFrom(v); setPage(1); }} placeholder="از تاریخ" className="w-36" />
        <JalaliDatePicker value={to} onChange={(v) => { setTo(v); setPage(1); }} placeholder="تا تاریخ" className="w-36" />
        <Button variant="ghost" size="sm" className="h-9 gap-1 text-xs text-muted-foreground" onClick={resetFilters}>
          <RotateCcw className="h-3.5 w-3.5" /> حذف فیلتر
        </Button>
      </FilterBar>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <button onClick={() => { setStatus(""); setPage(1); }}
          className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition-all ${!status ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}>
          همه <span className="tabular-nums opacity-70">({faNum(data?.total ?? 0)})</span>
        </button>
        {STATUSES.map((s) => (
          <button key={s} onClick={() => { setStatus(s); setPage(1); }}
            className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition-all ${status === s ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}>
            {s} <span className="tabular-nums opacity-70">({faNum(cnt(s))})</span>
          </button>
        ))}
      </div>

      <div className="rounded-2xl border bg-card shadow-sm">
        <DataTable columns={columns} rows={data?.referrs ?? []} loading={loading} emptyText="ارجاعی یافت نشد" page={data?.page} totalPages={data?.totalPages} onPageChange={setPage} />
      </div>

      {/* پیگیری — تاریخچهٔ کامل + ثبت پیگیری جدید */}
      <Dialog open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">پیگیری ارجاع {selected ? faNum(selected.refId) : ""}</DialogTitle>
          </DialogHeader>
          <p className="rounded-xl bg-muted/60 p-3 text-xs leading-5 text-muted-foreground">{selected?.description ?? "بدون توضیحات"}</p>
          <div className="max-h-56 space-y-2.5 overflow-y-auto pl-1">
            {(selected?.followUps ?? []).length === 0 && <p className="text-center text-xs text-muted-foreground">هنوز پیگیری‌ای ثبت نشده است</p>}
            {(selected?.followUps ?? []).map((f) => (
              <div key={f.id} className="rounded-xl border bg-card p-2.5">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[11px] font-bold">{f.userName}</span>
                  <span className="text-[10px] tabular-nums text-muted-foreground">{jDateTime(f.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-xs leading-5">{f.comment}</p>
              </div>
            ))}
          </div>
          <Textarea value={followup} onChange={(e) => setFollowup(e.target.value)} placeholder="متن پیگیری جدید..." rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>انصراف</Button>
            <Button disabled={!followup.trim() || busy} onClick={sendFollowup}>ثبت پیگیری</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ویرایش کامل رکورد ارجاع */}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">ویرایش ارجاع {editing ? faNum(editing.refId) : ""}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="mb-1.5 block text-xs">وضعیت</Label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                <SelectTrigger className="h-9 w-full text-xs"><SelectValue /></SelectTrigger>
                <SelectContent dir="rtl">
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="mb-1.5 block text-xs">استان</Label>
              <Select value={editForm.provinceId || "none"} onValueChange={(v) => setEditForm({ ...editForm, provinceId: v === "none" ? "" : v, cityId: "", centerId: "" })}>
                <SelectTrigger className="h-9 w-full text-xs"><SelectValue /></SelectTrigger>
                <SelectContent dir="rtl" className="max-h-64">
                  {(meta.data?.provinces ?? []).map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="mb-1.5 block text-xs">شهر</Label>
              <Select value={editForm.cityId || "none"} onValueChange={(v) => setEditForm({ ...editForm, cityId: v === "none" ? "" : v, centerId: "" })}>
                <SelectTrigger className="h-9 w-full text-xs"><SelectValue /></SelectTrigger>
                <SelectContent dir="rtl" className="max-h-64">
                  <SelectItem value="none">بدون شهر</SelectItem>
                  {editCityOptions.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="mb-1.5 block text-xs">مرکز مشاوره</Label>
              <Select value={editForm.centerId || "none"} onValueChange={(v) => setEditForm({ ...editForm, centerId: v === "none" ? "" : v })}>
                <SelectTrigger className="h-9 w-full text-xs"><SelectValue /></SelectTrigger>
                <SelectContent dir="rtl" className="max-h-64">
                  <SelectItem value="none">بدون مرکز</SelectItem>
                  {editCenterOptions.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">تعداد جلسات</Label>
              <Input type="number" min={0} value={editForm.sessionsCount} onChange={(e) => setEditForm({ ...editForm, sessionsCount: e.target.value })} className="h-9 text-xs" />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">کد ارجاع / کد ملی</Label>
              <div className="flex h-9 items-center gap-2 text-[11px] tabular-nums text-muted-foreground">
                <span>ارجاع: {editing ? faDigits(editing.refId) : ""}</span>
                <span>ملی: {editing?.userNid ? faDigits(editing.userNid) : "—"}</span>
              </div>
            </div>
            <div className="col-span-2">
              <Label className="mb-1.5 block text-xs">توضیحات</Label>
              <Textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={3} className="text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>انصراف</Button>
            <Button disabled={busy} onClick={saveEdit}>ذخیرهٔ تغییرات</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
