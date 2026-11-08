"use client";
// =====================================================================
// فرم‌ساز — نسخهٔ ۶.۱
// ساخت فرم دلخواه (متن/عدد/تاریخ/انتخابی/چندخطی/تیک) + ثبت پاسخ +
// اتصال پاسخ به متقاضی/جلسه + مرور پاسخ‌ها
// =====================================================================
import * as React from "react";
import { api } from "@/lib/client";
import { faNum, jDate } from "@/lib/jalali";
import { cn } from "@/lib/utils";
import { PageHeader, SectionCard, LoadingView } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  ClipboardPlus, Plus, Trash2, ArrowUp, ArrowDown, Save, FileText,
  Inbox, Pencil, CheckCircle2,
} from "lucide-react";

type FieldDef = { key: string; label: string; type: string; required?: boolean; options?: string[] };
type FormRow = { id: number; title: string; desc?: string | null; fields: FieldDef[]; isActive: boolean; createdAt: string; submissionsCount: number };
type SubRow = { id: number; formId: number; formTitle: string; fields: FieldDef[]; data: Record<string, string>; userId: number | null; eventId: number | null; createdAt: string };

const TYPES: { value: string; label: string }[] = [
  { value: "text", label: "متن کوتاه" },
  { value: "textarea", label: "متن چندخطی" },
  { value: "number", label: "عدد" },
  { value: "date", label: "تاریخ" },
  { value: "select", label: "انتخاب از فهرست" },
  { value: "checkbox", label: "تیک بله/خیر" },
];

export function FormsView() {
  const [tab, setTab] = React.useState<"forms" | "submissions">("forms");
  const [forms, setForms] = React.useState<FormRow[]>([]);
  const [subs, setSubs] = React.useState<SubRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState<{ id?: number; title: string; desc: string; fields: FieldDef[] } | null>(null);
  const [filling, setFilling] = React.useState<FormRow | null>(null);
  const [fillData, setFillData] = React.useState<Record<string, string>>({});
  const [fillUserId, setFillUserId] = React.useState("");
  const [fillEventId, setFillEventId] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [f, s] = await Promise.all([
        api<{ forms: FormRow[] }>("/api/forms"),
        api<{ submissions: SubRow[] }>("/api/forms?tab=submissions"),
      ]);
      setForms(f.forms);
      setSubs(s.submissions);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); };

  const saveForm = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      if (editing.id) {
        await api("/api/forms", {
          method: "PUT",
          body: JSON.stringify({ id: editing.id, title: editing.title, desc: editing.desc, fields: editing.fields }),
        });
        flash("فرم ویرایش شد ✓");
      } else {
        await api("/api/forms", {
          method: "POST",
          body: JSON.stringify({ title: editing.title, desc: editing.desc, fields: editing.fields }),
        });
        flash("فرم جدید ساخته شد ✓");
      }
      setEditing(null);
      await load();
    } catch (e: any) { flash(e.message); }
    setSaving(false);
  };

  const deleteForm = async (id: number) => {
    if (!confirm("فرم و همهٔ پاسخ‌های آن حذف شود؟")) return;
    await api(`/api/forms/${id}`, { method: "DELETE" });
    flash("فرم حذف شد");
    await load();
  };

  const toggleActive = async (f: FormRow) => {
    await api("/api/forms", { method: "PUT", body: JSON.stringify({ id: f.id, isActive: !f.isActive }) });
    await load();
  };

  const submitFill = async () => {
    if (!filling) return;
    setSaving(true);
    try {
      await api(`/api/forms/${filling.id}/submit`, {
        method: "POST",
        body: JSON.stringify({
          data: fillData,
          userId: fillUserId ? Number(fillUserId) : null,
          eventId: fillEventId ? Number(fillEventId) : null,
        }),
      });
      flash("پاسخ ثبت شد ✓");
      setFilling(null);
      setFillData({});
      setFillUserId(""); setFillEventId("");
      await load();
    } catch (e: any) { flash(e.message); }
    setSaving(false);
  };

  if (loading) return <LoadingView label="در حال بارگذاری فرم‌ها..." />;

  // ---------------- حالت پر کردن فرم ----------------
  if (filling) {
    return (
      <div className="space-y-5">
        <PageHeader title={`پر کردن فرم: ${filling.title}`} subtitle={filling.desc ?? ""} icon={<ClipboardPlus className="h-5 w-5" />}
          actions={<Button variant="outline" size="sm" onClick={() => setFilling(null)}>بازگشت</Button>} />
        <SectionCard>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {filling.fields.map((f) => (
              <div key={f.key} className={cn(f.type === "textarea" && "md:col-span-2")}>
                <label className="mb-1.5 block text-[12.5px] font-bold">
                  {f.label} {f.required && <span className="text-rose-500">*</span>}
                </label>
                {f.type === "textarea" ? (
                  <Textarea value={fillData[f.key] ?? ""} onChange={(e) => setFillData((d) => ({ ...d, [f.key]: e.target.value }))} rows={4} />
                ) : f.type === "select" ? (
                  <select
                    className="h-10 w-full rounded-xl border bg-background px-3 text-[13px]"
                    value={fillData[f.key] ?? ""}
                    onChange={(e) => setFillData((d) => ({ ...d, [f.key]: e.target.value }))}
                  >
                    <option value="">— انتخاب کنید —</option>
                    {f.options?.map((o, i) => <option key={i} value={o}>{o}</option>)}
                  </select>
                ) : f.type === "checkbox" ? (
                  <label className="flex items-center gap-2 text-[13px]">
                    <input type="checkbox" checked={fillData[f.key] === "true"} onChange={(e) => setFillData((d) => ({ ...d, [f.key]: String(e.target.checked) }))} className="h-4 w-4 accent-[#a83a54]" />
                    بله
                  </label>
                ) : (
                  <Input type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} value={fillData[f.key] ?? ""} onChange={(e) => setFillData((d) => ({ ...d, [f.key]: e.target.value }))} />
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 border-t pt-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[12px] font-bold text-muted-foreground">اتصال به متقاضی (شناسه — اختیاری)</label>
              <Input value={fillUserId} onChange={(e) => setFillUserId(e.target.value)} placeholder="مثلاً ۵" dir="ltr" />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-bold text-muted-foreground">اتصال به جلسه (شناسه — اختیاری)</label>
              <Input value={fillEventId} onChange={(e) => setFillEventId(e.target.value)} placeholder="مثلاً ۱۲۳" dir="ltr" />
            </div>
          </div>
          <div className="mt-5 flex gap-2">
            <Button className="brand-gradient gap-2 text-white" onClick={submitFill} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} ثبت پاسخ
            </Button>
            <Button variant="outline" onClick={() => setFilling(null)}>انصراف</Button>
          </div>
        </SectionCard>
        {toast && <Toast msg={toast} />}
      </div>
    );
  }

  // ---------------- حالت ساخت/ویرایش فرم ----------------
  if (editing) {
    return (
      <div className="space-y-5">
        <PageHeader
          title={editing.id ? "ویرایش فرم" : "ساخت فرم جدید"}
          subtitle="فیلدها را تعریف کنید — نوع، برچسب، اجباری بودن و گزینه‌های انتخابی"
          icon={<ClipboardPlus className="h-5 w-5" />}
          actions={<Button variant="outline" size="sm" onClick={() => setEditing(null)}>بازگشت</Button>}
        />
        <SectionCard>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[12.5px] font-bold">عنوان فرم <span className="text-rose-500">*</span></label>
              <Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="مثلاً فرم رضایت مراجع" />
            </div>
            <div>
              <label className="mb-1.5 block text-[12.5px] font-bold">توضیح (اختیاری)</label>
              <Input value={editing.desc} onChange={(e) => setEditing({ ...editing, desc: e.target.value })} />
            </div>
          </div>

          <div className="mt-5 space-y-2.5">
            {editing.fields.map((f, i) => (
              <div key={i} className="rounded-xl border bg-muted/30 p-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-40">
                    <label className="mb-1 block text-[10.5px] text-muted-foreground">برچسب</label>
                    <Input className="h-9 text-[12.5px]" value={f.label}
                      onChange={(e) => setEditing({ ...editing, fields: editing.fields.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} />
                  </div>
                  <div className="w-36">
                    <label className="mb-1 block text-[10.5px] text-muted-foreground">نوع</label>
                    <select className="h-9 w-full rounded-xl border bg-background px-2 text-[12.5px]" value={f.type}
                      onChange={(e) => setEditing({ ...editing, fields: editing.fields.map((x, j) => j === i ? { ...x, type: e.target.value } : x) })}>
                      {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-1.5 pb-1.5">
                    <Switch checked={Boolean(f.required)} onCheckedChange={(v) => setEditing({ ...editing, fields: editing.fields.map((x, j) => j === i ? { ...x, required: v } : x) })} />
                    <span className="text-[11.5px]">اجباری</span>
                  </div>
                  <div className="mr-auto flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" disabled={i === 0}
                      onClick={() => { const arr = [...editing.fields]; [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; setEditing({ ...editing, fields: arr }); }}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" disabled={i === editing.fields.length - 1}
                      onClick={() => { const arr = [...editing.fields]; [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; setEditing({ ...editing, fields: arr }); }}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500" onClick={() => setEditing({ ...editing, fields: editing.fields.filter((_, j) => j !== i) })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {f.type === "select" && (
                  <div className="mt-2">
                    <label className="mb-1 block text-[10.5px] text-muted-foreground">گزینه‌ها (با ویرگول انگلیسی جدا کنید)</label>
                    <Input className="h-9 text-[12.5px]" value={(f.options ?? []).join(",")}
                      onChange={(e) => setEditing({ ...editing, fields: editing.fields.map((x, j) => j === i ? { ...x, options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } : x) })} />
                  </div>
                )}
                <p className="mt-1.5 text-[10px] text-muted-foreground" dir="ltr">key: {f.key}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-1.5"
              onClick={() => {
                const key = `f${Date.now().toString(36)}`;
                setEditing({ ...editing, fields: [...editing.fields, { key, label: "فیلد جدید", type: "text" }] });
              }}>
              <Plus className="h-4 w-4" /> افزودن فیلد
            </Button>
            <div className="mr-auto flex gap-2">
              <Button className="brand-gradient gap-2 text-white" onClick={saveForm} disabled={saving || !editing.title.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} ذخیرهٔ فرم
              </Button>
            </div>
          </div>
        </SectionCard>
        {toast && <Toast msg={toast} />}
      </div>
    );
  }

  // ---------------- فهرست فرم‌ها ----------------
  return (
    <div className="space-y-5">
      <PageHeader
        title="فرم‌ساز"
        subtitle="ساخت فرم‌های دلخواه سازمان، اتصال پاسخ به متقاضی/جلسه و مرور پاسخ‌ها"
        icon={<ClipboardPlus className="h-5 w-5" />}
        actions={
          <Button className="brand-gradient gap-2 text-white" onClick={() => setEditing({ title: "", desc: "", fields: [] })}>
            <Plus className="h-4 w-4" /> فرم جدید
          </Button>
        }
      />

      <div className="flex gap-2">
        <Button variant={tab === "forms" ? "default" : "outline"} size="sm" onClick={() => setTab("forms")} className="gap-1.5">
          <FileText className="h-4 w-4" /> فرم‌ها ({faNum(forms.length)})
        </Button>
        <Button variant={tab === "submissions" ? "default" : "outline"} size="sm" onClick={() => setTab("submissions")} className="gap-1.5">
          <Inbox className="h-4 w-4" /> پاسخ‌ها ({faNum(subs.length)})
        </Button>
      </div>

      {tab === "forms" && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {forms.length === 0 && (
            <SectionCard bodyClass="p-10 lg:col-span-2 xl:col-span-3">
              <div className="flex flex-col items-center gap-2 text-center">
                <ClipboardPlus className="h-9 w-9 text-muted-foreground/50" />
                <p className="text-sm font-bold">هنوز فرمی ساخته نشده است</p>
                <p className="text-xs text-muted-foreground">با دکمهٔ «فرم جدید» اولین فرم سازمان را بسازید.</p>
              </div>
            </SectionCard>
          )}
          {forms.map((f) => (
            <SectionCard key={f.id} bodyClass="p-4" className={cn(!f.isActive && "opacity-70")}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="text-[13.5px] font-extrabold">{f.title}</h3>
                  {f.desc && <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">{f.desc}</p>}
                </div>
                <Switch checked={f.isActive} onCheckedChange={() => toggleActive(f)} aria-label="فعال/غیرفعال" />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {f.fields.map((fd) => (
                  <span key={fd.key} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">
                    {fd.label} <span className="text-muted-foreground/70">({TYPES.find((t) => t.value === fd.type)?.label})</span>
                    {fd.required && <span className="text-rose-500">*</span>}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2 border-t pt-3">
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Inbox className="h-3.5 w-3.5" /> {faNum(f.submissionsCount)} پاسخ
                </span>
                <span className="text-[10.5px] text-muted-foreground">— ساخت: {jDate(f.createdAt)}</span>
                <div className="mr-auto flex gap-1">
                  <Button variant="outline" size="sm" className="h-8 gap-1 text-[11px]" onClick={() => { setFilling(f); setFillData({}); }}>
                    <Pencil className="h-3 w-3" /> پر کردن
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 gap-1 text-[11px]" onClick={() => setEditing({ id: f.id, title: f.title, desc: f.desc ?? "", fields: f.fields })}>
                    ویرایش
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500" onClick={() => deleteForm(f.id)} aria-label="حذف فرم">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </SectionCard>
          ))}
        </div>
      )}

      {tab === "submissions" && (
        <div className="space-y-3">
          {subs.length === 0 && (
            <SectionCard bodyClass="p-10">
              <p className="text-center text-xs text-muted-foreground">پاسخی ثبت نشده است.</p>
            </SectionCard>
          )}
          {subs.map((s) => (
            <SectionCard key={s.id} bodyClass="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <h3 className="text-[13px] font-extrabold">{s.formTitle}</h3>
                {s.userId && <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-700">متقاضی #{faNum(s.userId)}</span>}
                {s.eventId && <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-bold text-cyan-700">جلسه #{faNum(s.eventId)}</span>}
                <span className="mr-auto text-[10.5px] text-muted-foreground">{jDate(s.createdAt)}</span>
              </div>
              <div className="mt-2.5 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                {s.fields.map((fd) => (
                  <div key={fd.key} className="text-[12px]">
                    <span className="text-muted-foreground">{fd.label}: </span>
                    <span className="font-medium">{s.data[fd.key] || "—"}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          ))}
        </div>
      )}

      {toast && <Toast msg={toast} />}
    </div>
  );
}

function Toast({ msg }: { msg: string }) {
  return (
    <div className="fixed bottom-6 right-6 z-[70] rounded-xl border bg-card px-4 py-2.5 text-[12.5px] font-bold shadow-xl">
      {msg}
    </div>
  );
}
