"use client";
// =====================================================================
// مرکز مدیریت کاربران و سطوح دسترسی — نسخهٔ ۶.۴
// سه محیط کاری:
//   ۱) کاربران و نقش‌ها — انتساب نقش، تعلیق، حذف با جستجوی زنده
//   ۲) نقش‌های سامانه — ساخت/ویرایش/حذف نقش با کارت‌های گرافیکی
//   ۳) ماتریس دسترسی — کلیدهای رنگی برای هر ماژول + پیش‌تنظیم‌های آماده
// =====================================================================
import * as React from "react";
import { PageHeader, SectionCard, StatCard, LoadingView, NameAvatar } from "@/components/shared";
import { faNum, faDigits, jDate } from "@/lib/jalali";
import { api, navigate, useQuery } from "@/lib/client";
import { PERM_MODULES, PERM_GROUPS, PERM_PRESETS, PERM_ACTIONS, SCOPE_ALL, isActionStyle, toActionStyle, type PermAction } from "@/lib/permissions";
import {
  ShieldCheck, Search, Plus, Trash2, Ban, CheckCircle2, Users, Layers, KeyRound,
  FolderOpen, Pencil, Sparkles, Grid3X3, RotateCcw, Save, Loader2, UserCheck, Clock,
  LogIn, Eye, Globe2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type RoleRow = { id: number; title: string; codeName: string; permissions: string | null; _count: { users: number } };

/** رنگ چیپ‌های عملیات در ماتریس */
const ACTION_TONE: Record<string, string> = {
  cyan: "border-cyan-300 bg-cyan-50 text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300",
  amber: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  rose: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
};

type EmptyProps = { icon: React.ReactNode; title: string; subtitle?: string };
function EmptyState({ icon, title, subtitle }: EmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed py-16 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-muted text-muted-foreground">{icon}</span>
      <p className="text-sm font-extrabold">{title}</p>
      {subtitle && <p className="max-w-sm text-xs leading-5 text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
type UserRoleRow = {
  id: number; level: number; startDate: string; endDate: string | null; isSuspended: boolean;
  user: { id: number; name: string; family: string; nid: number; avatarColor: string | null; mobile: number; username: string; blocked: boolean; consultantLevel: number | null; lastLogin: string | null };
  role: { id: number; title: string; codeName: string };
};

export function RolesView() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="کاربران و سطوح دسترسی"
        subtitle="مدیریت گرافیکی کامل نقش‌ها، انتساب کاربران و ماتریس دسترسی ماژول‌ها — همه‌چیز در یک نگاه"
        icon={<ShieldCheck className="h-5 w-5" />}
      />
      <Tabs defaultValue="users" className="space-y-4">
        <TabsList className="h-auto flex-wrap gap-1">
          <TabsTrigger value="users" className="gap-1.5"><Users className="h-4 w-4" /> کاربران و نقش‌ها</TabsTrigger>
          <TabsTrigger value="roles" className="gap-1.5"><Layers className="h-4 w-4" /> نقش‌های سامانه</TabsTrigger>
          <TabsTrigger value="matrix" className="gap-1.5"><Grid3X3 className="h-4 w-4" /> ماتریس دسترسی</TabsTrigger>
        </TabsList>
        <TabsContent value="users"><UsersRolesTab /></TabsContent>
        <TabsContent value="roles"><RolesTab /></TabsContent>
        <TabsContent value="matrix"><MatrixTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================ تب ۱ — کاربران و نقش‌ها
function UsersRolesTab() {
  const { toast } = useToast();
  const [q, setQ] = React.useState("");
  const [addOpen, setAddOpen] = React.useState(false);
  const [form, setForm] = React.useState({ userId: "", roleId: "", level: "0" });

  const { data, loading, refetch } = useQuery<{ roleList: RoleRow[]; userRoles: UserRoleRow[]; total: number; userCount: number }>(
    () => api(`/api/roles?q=${encodeURIComponent(q)}`), [q]
  );
  const usersQ = useQuery<{ users: { id: number; name: string; family: string; nid: number }[] }>(
    () => api("/api/users?page=1&pageSize=200"), []
  );

  const rows = data?.userRoles ?? [];
  const activeCount = rows.filter((r) => !r.isSuspended && !r.user.blocked).length;
  const suspendedCount = rows.filter((r) => r.isSuspended).length;

  const assign = async () => {
    if (!form.userId || !form.roleId) return;
    try {
      await api("/api/roles", { method: "POST", body: JSON.stringify(form) });
      toast({ title: "نقش با موفقیت به کاربر اختصاص یافت" });
      setAddOpen(false);
      setForm({ userId: "", roleId: "", level: "0" });
      refetch();
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    }
  };

  const toggleSuspend = async (ur: UserRoleRow) => {
    await api("/api/roles", { method: "PATCH", body: JSON.stringify({ id: ur.id, isSuspended: !ur.isSuspended }) });
    toast({ title: ur.isSuspended ? "نقش فعال شد" : "نقش معلق شد" });
    refetch();
  };

  const remove = async (ur: UserRoleRow) => {
    if (!confirm(`نقش «${ur.role.title}» از «${ur.user.name} ${ur.user.family}» حذف شود؟`)) return;
    await api(`/api/roles?id=${ur.id}`, { method: "DELETE" });
    toast({ title: "انتساب نقش حذف شد" });
    refetch();
  };

  // ورود نیابتی — مدیر بدون رمز وارد حساب این کاربر می‌شود و کارتابلش را می‌بیند
  const enterAs = async (ur: UserRoleRow) => {
    if (!confirm(`وارد حساب «${ur.user.name} ${ur.user.family}» می‌شوید؟ کارتابل و داده‌ها از نگاه او نمایش داده می‌شود.`)) return;
    try {
      await api("/api/users/impersonate", { method: "POST", body: JSON.stringify({ userId: ur.user.id }) });
      toast({ title: `وارد حساب ${ur.user.name} ${ur.user.family} شدید` });
      window.location.hash = "#/cartable";
      window.location.reload();
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard title="کل کاربران" value={faNum(data?.userCount ?? 0)} icon={<Users className="h-4 w-4" />} tone="teal" />
        <StatCard title="انتساب‌های فعال" value={faNum(activeCount)} icon={<UserCheck className="h-4 w-4" />} tone="emerald" />
        <StatCard title="نقش‌های سامانه" value={faNum(data?.roleList?.length ?? 0)} icon={<Layers className="h-4 w-4" />} tone="cyan" />
        <StatCard title="نقش‌های معلق" value={faNum(suspendedCount)} icon={<Ban className="h-4 w-4" />} tone="rose" />
      </div>

      <SectionCard bodyClass="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی نام، نام خانوادگی یا نام کاربری..." className="h-10 pr-9" />
          </div>
          <Button className="brand-gradient h-10 gap-1.5 text-white" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> انتساب نقش جدید
          </Button>
        </div>
      </SectionCard>

      {loading ? <LoadingView /> : rows.length === 0 ? (
        <EmptyState icon={<Users className="h-10 w-10" />} title="انتسابی یافت نشد" subtitle="با دکمهٔ «انتساب نقش جدید» اولین نقش را به یک کاربر بدهید" />
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {rows.map((ur) => (
            <div key={ur.id} className={cn(
              "group relative overflow-hidden rounded-2xl border bg-card p-4 transition-all hover:shadow-md",
              ur.isSuspended && "opacity-60",
              ur.user.blocked && "border-rose-200 dark:border-rose-900"
            )}>
              <div className="flex items-start gap-3">
                <NameAvatar name={ur.user.name} family={ur.user.family} color={ur.user.avatarColor} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-[13.5px] font-bold">{ur.user.name} {ur.user.family}</p>
                    <Badge className="brand-gradient text-[9.5px] text-white">{ur.role.title}</Badge>
                    {ur.isSuspended && <Badge variant="outline" className="text-[9.5px] text-amber-600 border-amber-300">معلق</Badge>}
                    {ur.user.blocked && <Badge variant="outline" className="text-[9.5px] text-rose-600 border-rose-300">مسدود</Badge>}
                    {ur.user.consultantLevel ? <Badge variant="secondary" className="text-[9.5px]">سطح {faNum(ur.user.consultantLevel)}</Badge> : null}
                  </div>
                  <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                    کد ملی {faDigits(ur.user.nid)} — همراه {faDigits(ur.user.mobile)} — <span dir="ltr">{ur.user.username}</span>
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground/80">
                    <Clock className="h-3 w-3" /> آخرین ورود: {ur.user.lastLogin ? jDate(ur.user.lastLogin) : "—"} — شروع نقش: {jDate(ur.startDate)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-1.5">
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" title="مشاهدهٔ پروندهٔ کاربر" onClick={() => navigate(`cartable?u=${ur.user.id}`)}>
                      <FolderOpen className="h-4 w-4 text-emerald-600" />
                    </Button>
                    <Button
                      size="icon"
                      className="h-8 w-8 brand-gradient text-white"
                      title="ورود به حساب این کاربر بدون رمز — کارتابل و داده‌ها از نگاه او"
                      onClick={() => enterAs(ur)}
                    >
                      <LogIn className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" title={ur.isSuspended ? "رفع تعلیق" : "تعلیق نقش"} onClick={() => toggleSuspend(ur)}>
                      <Ban className={cn("h-4 w-4", ur.isSuspended ? "text-amber-500" : "text-muted-foreground")} />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" title="حذف انتساب" onClick={() => remove(ur)}>
                      <Trash2 className="h-4 w-4 text-rose-500" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* دیالوگ انتساب نقش */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md p-6" dir="rtl">
          <DialogHeader><DialogTitle className="text-right">انتساب نقش به کاربر</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">کاربر</Label>
              <Select value={form.userId} onValueChange={(v) => setForm((p) => ({ ...p, userId: v }))}>
                <SelectTrigger className="h-10"><SelectValue placeholder="انتخاب کاربر..." /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {(usersQ.data?.users ?? []).map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name} {u.family} — {faDigits(u.nid)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">نقش</Label>
              <Select value={form.roleId} onValueChange={(v) => setForm((p) => ({ ...p, roleId: v }))}>
                <SelectTrigger className="h-10"><SelectValue placeholder="انتخاب نقش..." /></SelectTrigger>
                <SelectContent>
                  {(data?.roleList ?? []).map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>{r.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">سطح (۰ تا ۵)</Label>
              <Input type="number" min={0} max={5} value={form.level} onChange={(e) => setForm((p) => ({ ...p, level: e.target.value }))} className="h-10" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>انصراف</Button>
              <Button size="sm" className="brand-gradient text-white" onClick={assign} disabled={!form.userId || !form.roleId}>اختصاص نقش</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================ تب ۲ — نقش‌های سامانه
function RolesTab() {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [preset, setPreset] = React.useState("consultant");
  const [editRole, setEditRole] = React.useState<RoleRow | null>(null);
  const [editTitle, setEditTitle] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const { data, loading, refetch } = useQuery<{ roleList: RoleRow[] }>(() => api("/api/roles"), []);

  const create = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const p = PERM_PRESETS.find((x) => x.key === preset);
      await api("/api/roles", { method: "POST", body: JSON.stringify({ title, permissions: p?.modules ?? null }) });
      toast({ title: `نقش «${title}» ساخته شد` });
      setOpen(false);
      setTitle("");
      refetch();
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    }
    setBusy(false);
  };

  const rename = async () => {
    if (!editRole || !editTitle.trim()) return;
    await api("/api/roles", { method: "PUT", body: JSON.stringify({ id: editRole.id, title: editTitle }) });
    toast({ title: "عنوان نقش بروزرسانی شد" });
    setEditRole(null);
    refetch();
  };

  const remove = async (r: RoleRow) => {
    if (!confirm(`نقش «${r.title}» حذف شود؟`)) return;
    try {
      await api(`/api/roles?roleId=${r.id}`, { method: "DELETE" });
      toast({ title: "نقش حذف شد" });
      refetch();
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">نقش‌ها را بسازید و در تب «ماتریس دسترسی» دسترسی هر نقش را تعیین کنید.</p>
        <Button className="brand-gradient h-9 gap-1.5 text-white" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> نقش جدید</Button>
      </div>
      {loading ? <LoadingView /> : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(data?.roleList ?? []).map((r) => {
            const perms = (() => { try { return r.permissions ? (JSON.parse(r.permissions) as string[]) : null; } catch { return null; }})();
            const full = perms === null || perms.includes("*");
            return (
              <div key={r.id} className="group relative overflow-hidden rounded-2xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg">
                <div className="brand-gradient absolute inset-x-0 top-0 h-1" />
                <div className="flex items-start justify-between">
                  <span className="brand-gradient flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-md">
                    <ShieldCheck className="h-5 w-5" />
                  </span>
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button size="icon" variant="ghost" className="h-8 w-8" title="ویرایش عنوان" onClick={() => { setEditRole(r); setEditTitle(r.title); }}>
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" title="حذف نقش" onClick={() => remove(r)}>
                      <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                    </Button>
                  </div>
                </div>
                <p className="mt-3 text-[14px] font-extrabold">{r.title}</p>
                <p className="text-[10px] text-muted-foreground" dir="ltr">{r.codeName}</p>
                <div className="mt-3 flex items-center gap-1.5">
                  <Badge variant="secondary" className="text-[10px]">{faNum(r._count.users)} کاربر</Badge>
                  {full ? (
                    <Badge className="bg-emerald-100 text-[10px] text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><Sparkles className="ml-1 h-3 w-3" /> دسترسی کامل</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">{faNum(perms?.length ?? 0)} ماژول مجاز</Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* دیالوگ ساخت نقش */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md p-6" dir="rtl">
          <DialogHeader><DialogTitle className="text-right">ساخت نقش جدید</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">عنوان نقش</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً: ناظر استان" className="h-10" />
            </div>
            <div><Label className="text-xs">شروع دسترسی از پیش‌تنظیم</Label>
              <Select value={preset} onValueChange={setPreset}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PERM_PRESETS.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                بعداً می‌توانید در تب «ماتریس دسترسی» هر ماژول را جداگانه فعال/غیرفعال کنید.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>انصراف</Button>
              <Button size="sm" className="brand-gradient text-white" onClick={create} disabled={!title.trim() || busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} ساخت نقش
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* دیالوگ ویرایش عنوان */}
      <Dialog open={Boolean(editRole)} onOpenChange={(o) => !o && setEditRole(null)}>
        <DialogContent className="max-w-sm p-6" dir="rtl">
          <DialogHeader><DialogTitle className="text-right">ویرایش عنوان نقش</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="h-10" />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditRole(null)}>انصراف</Button>
              <Button size="sm" onClick={rename} disabled={!editTitle.trim()}>ذخیره</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================ تب ۳ — ماتریس دسترسی
function MatrixTab() {
  const { toast } = useToast();
  const { data, loading, refetch } = useQuery<{ roleList: RoleRow[] }>(() => api("/api/roles"), []);
  const roles = data?.roleList ?? [];
  const [roleId, setRoleId] = React.useState<number | null>(null);
  const [perms, setPerms] = React.useState<string[] | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!roleId && roles.length) {
      const first = roles.find((r) => r.permissions) ?? roles[0];
      select(first.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roles]);

  const select = (id: number) => {
    const r = roles.find((x) => x.id === id);
    setRoleId(id);
    if (!r) return;
    try {
      setPerms(r.permissions ? (JSON.parse(r.permissions) as string[]) : null);
    } catch { setPerms(null); }
    setDirty(false);
  };

  const toggle = (key: string) => {
    if (perms === null) return; // حالت legacy — ابتدا باید شروع به محدودسازی کنید
    setPerms((p) => {
      const cur = p!;
      if (!cur.includes(key)) return [...cur, key];
      // خاموش کردن «دیدن» — کل ماژول و همهٔ عملیات‌هایش حذف می‌شود
      return cur.filter((x) => x !== key && !x.startsWith(`${key}:`));
    });
    setDirty(true);
  };

  const toggleAction = (key: string, action: PermAction) => {
    if (perms === null) return;
    const akey = `${key}:${action}`;
    setPerms((p) => {
      // قالب قدیمی → اول به قالب عملیاتی گسترش می‌یابد (ماژول‌های فعلی = همهٔ عملیات)
      let cur = toActionStyle(p!);
      if (action !== "view" && !cur.includes(key)) cur = [...cur, key]; // عملیات بدون دیدن بی‌معناست
      if (cur.includes(akey)) return cur.filter((x) => x !== akey);
      return [...cur, akey];
    });
    setDirty(true);
  };

  const applyPreset = (pkey: string) => {
    const p = PERM_PRESETS.find((x) => x.key === pkey);
    if (!p) return;
    setPerms(p.modules.includes("*") ? ["*"] : toActionStyle(p.modules));
    setDirty(true);
  };

  const setAll = (value: boolean) => {
    if (value) {
      const full: string[] = [];
      for (const m of PERM_MODULES) full.push(m.key, `${m.key}:create`, `${m.key}:edit`, `${m.key}:delete`);
      setPerms(full);
    } else setPerms([]);
    setDirty(true);
  };

  const save = async () => {
    if (!roleId) return;
    setSaving(true);
    try {
      await api("/api/roles", { method: "PUT", body: JSON.stringify({ id: roleId, permissions: perms }) });
      toast({ title: "ماتریس دسترسی ذخیره شد" });
      setDirty(false);
      refetch();
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    }
    setSaving(false);
  };

  if (loading) return <LoadingView />;
  if (!roles.length) return <EmptyState icon={<Layers className="h-10 w-10" />} title="هنوز نقشی ساخته نشده" subtitle="ابتدا در تب «نقش‌های سامانه» یک نقش بسازید" />;

  const current = roles.find((r) => r.id === roleId);
  const isLegacy = perms === null;

  return (
    <div className="space-y-4">
      {/* انتخاب نقش */}
      <SectionCard bodyClass="p-4">
        <div className="flex flex-wrap items-center gap-2">
          {roles.map((r) => (
            <button
              key={r.id}
              onClick={() => select(r.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-all",
                roleId === r.id ? "brand-gradient border-transparent text-white shadow-md" : "bg-card text-muted-foreground hover:border-ring hover:text-foreground"
              )}
            >
              <ShieldCheck className="h-3.5 w-3.5" /> {r.title}
            </button>
          ))}
        </div>
      </SectionCard>

      {/* ابزارها */}
      <SectionCard bodyClass="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground"><Sparkles className="h-3.5 w-3.5" /> پیش‌تنظیم‌های آماده:</span>
          {PERM_PRESETS.map((p) => (
            <Button key={p.key} size="sm" variant="outline" className="h-7 rounded-full text-[11px]" onClick={() => applyPreset(p.key)}>{p.label}</Button>
          ))}
          <span className="mr-auto flex items-center gap-1.5">
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-[11px]" onClick={() => setAll(true)}><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> انتخاب همه</Button>
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-[11px]" onClick={() => setAll(false)}><RotateCcw className="h-3.5 w-3.5 text-rose-500" /> حذف همه</Button>
            <Button size="sm" className={cn("h-7 gap-1 text-[11px]", dirty ? "brand-gradient text-white" : "")} onClick={save} disabled={!dirty || saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} ذخیره{dirty ? " *" : ""}
            </Button>
          </span>
        </div>
        {isLegacy && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
            این نقش در حالت «دسترسی کامل قدیمی» است و به همهٔ ماژول‌ها و عملیات‌ها دسترسی دارد. برای محدودسازی، یکی از پیش‌تنظیم‌ها را اعمال کنید یا اولین ماژول را فعال کنید.
          </p>
        )}
        {!isLegacy && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-xl border border-dashed border-cyan-300 bg-cyan-50/60 px-3 py-1.5 dark:border-cyan-800 dark:bg-cyan-950/30">
              <Globe2 className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
              <span className="text-[11px] font-bold text-cyan-800 dark:text-cyan-200">مشاهدهٔ همهٔ داده‌ها (حتی خارج از مراجعان خود)</span>
              <Switch checked={perms!.includes(SCOPE_ALL)} onCheckedChange={() => toggle(SCOPE_ALL)} />
            </span>
            <span className="text-[10.5px] leading-4 text-muted-foreground">
              نقش‌های مشاور فقط مراجعان خودشان را می‌بینند؛ با این کلید، همهٔ داده‌ها باز می‌شود.
            </span>
          </div>
        )}
        {!isLegacy && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
            <span className="font-bold">راهنمای عملیات در هر ماژول:</span>
            {PERM_ACTIONS.map((a) => (
              <span key={a.key} className="flex items-center gap-1">
                <span className={cn("inline-block h-2 w-2 rounded-full", a.key === "view" ? "bg-emerald-500" : a.key === "create" ? "bg-cyan-500" : a.key === "edit" ? "bg-amber-500" : "bg-rose-500")} />
                {a.label}
              </span>
            ))}
            <span>— سوییچ هر ماژول = «دیدن»؛ چیپ‌های رنگی = عملیات جداگانه</span>
          </div>
        )}
      </SectionCard>

      {/* ماتریس — گروه‌بندی‌شده */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {PERM_GROUPS.map((g) => {
          const mods = PERM_MODULES.filter((m) => m.group === g);
          const on = mods.filter((m) => !isLegacy && perms!.includes(m.key)).length;
          return (
            <div key={g} className="rounded-2xl border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="flex items-center gap-2 text-[12.5px] font-extrabold">
                  <KeyRound className="h-4 w-4 text-primary" /> {g}
                </p>
                <Badge variant="secondary" className="text-[10px] tabular-nums">{isLegacy ? "همه" : `${faNum(on)} / ${faNum(mods.length)}`}</Badge>
              </div>
              <div className="space-y-1">
                {mods.map((m) => {
                  const checked = isLegacy ? true : perms!.includes(m.key);
                  return (
                    <div key={m.key} className="rounded-xl px-3 py-2 transition-colors hover:bg-muted/60">
                      <label className="flex cursor-pointer items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-[12px] font-medium">
                          <span className={cn("h-2 w-2 rounded-full", checked ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700")} />
                          {m.label}
                        </span>
                        <Switch checked={checked} onCheckedChange={() => toggle(m.key)} />
                      </label>
                      {checked && !isLegacy && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {PERM_ACTIONS.filter((a) => a.key !== "view").map((a) => {
                            const akey = `${m.key}:${a.key}`;
                            const on = perms!.includes(akey);
                            return (
                              <button
                                key={a.key}
                                onClick={() => toggleAction(m.key, a.key as PermAction)}
                                className={cn(
                                  "flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold transition-all",
                                  on ? ACTION_TONE[a.tone] : "border-dashed border-border text-muted-foreground hover:border-ring hover:text-foreground"
                                )}
                              >
                                {on ? <CheckCircle2 className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                                {a.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
