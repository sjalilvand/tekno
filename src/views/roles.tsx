"use client";
// نقش‌ها و دسترسی‌ها
import * as React from "react";
import { PageHeader, DataTable, NameAvatar, SectionCard, Column, LoadingView } from "@/components/shared";
import { faNum, faDigits, jDate } from "@/lib/jalali";
import { api, useQuery } from "@/lib/client";
import { ShieldCheck, Search, PlusCircle, Ban } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

type RoleRow = { id: number; title: string; codeName: string; _count: { users: number } };
type UserRoleRow = {
  id: number; level: number; startDate: string; endDate: string | null; isSuspended: boolean;
  user: { id: number; name: string; family: string; nid: number; avatarColor: string | null; mobile: number; consultantLevel: number | null };
  role: { id: number; title: string };
};

export function RolesView() {
  const { toast } = useToast();
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ userId: "", roleId: "", level: "0" });

  const { data, loading, refetch } = useQuery<{ roleList: RoleRow[]; userRoles: UserRoleRow[]; total: number }>(
    () => api(`/api/roles?q=${encodeURIComponent(q)}`), [q]
  );
  const usersQ = useQuery<{ users: { id: number; name: string; family: string }[] }>(() => api("/api/users?page=1&pageSize=100"), [open]);

  const create = async () => {
    if (!form.userId || !form.roleId) return;
    await api("/api/roles", { method: "POST", body: JSON.stringify(form) });
    toast({ title: "نقش به کاربر اختصاص یافت" });
    setOpen(false);
    refetch();
  };

  const toggleSuspend = async (ur: UserRoleRow) => {
    await api("/api/roles", { method: "PATCH", body: JSON.stringify({ id: ur.id, isSuspended: !ur.isSuspended }) });
    toast({ title: ur.isSuspended ? "نقش فعال شد" : "نقش معلق شد" });
    refetch();
  };

  const columns: Column<UserRoleRow>[] = [
    {
      header: "کاربر",
      cell: (ur) => (
        <div className="flex items-center gap-2.5">
          <NameAvatar name={ur.user.name} family={ur.user.family} color={ur.user.avatarColor} size={32} />
          <div>
            <p className="text-[13px] font-semibold leading-5">{ur.user.name} {ur.user.family}</p>
            <p className="text-[10.5px] tabular-nums text-muted-foreground leading-4">{faDigits(ur.user.nid)}</p>
          </div>
        </div>
      ),
    },
    { header: "نقش", cell: (ur) => <Badge variant="secondary" className="text-[10.5px] font-bold">{ur.role.title}</Badge> },
    { header: "سطح", cell: (ur) => <span className="text-xs tabular-nums">{ur.level ? faNum(ur.level) : "—"}</span> },
    { header: "شروع", cell: (ur) => <span className="text-xs tabular-nums text-muted-foreground">{jDate(ur.startDate)}</span> },
    { header: "پایان", cell: (ur) => <span className="text-xs tabular-nums text-muted-foreground">{ur.endDate ? jDate(ur.endDate) : "نامحدود"}</span> },
    { header: "وضعیت", cell: (ur) => <span className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-bold ${ur.isSuspended ? "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"}`}>{ur.isSuspended ? "معلق" : "فعال"}</span> },
    { header: "معلق/فعال", cell: (ur) => <Switch checked={!ur.isSuspended} onCheckedChange={() => toggleSuspend(ur)} aria-label="تغییر وضعیت" /> },
  ];

  return (
    <div>
      <PageHeader
        title="نقش‌ها و دسترسی‌ها"
        subtitle={`${faNum(data?.roleList.length ?? 0)} نقش — ${faNum(data?.total ?? 0)} تخصیص`}
        icon={<ShieldCheck className="h-5 w-5" />}
        actions={
          <Button className="gap-1.5" size="sm" onClick={() => setOpen(true)}>
            <PlusCircle className="h-4 w-4" /> تخصیص نقش
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        {data?.roleList.map((r) => (
          <div key={r.id} className="rounded-xl border bg-card p-3 text-center shadow-sm">
            <p className="truncate text-[11px] font-bold">{r.title}</p>
            <p className="mt-1 text-lg font-extrabold tabular-nums text-primary">{faNum(r._count.users)}</p>
          </div>
        ))}
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی کاربر..." className="h-9 pr-9 text-sm" />
      </div>

      <div className="rounded-2xl border bg-card shadow-sm">
        <DataTable columns={columns} rows={data?.userRoles ?? []} loading={loading} emptyText="تخصیصی یافت نشد" />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle className="text-right">تخصیص نقش جدید</DialogTitle></DialogHeader>
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label className="text-xs">کاربر</Label>
              <Select value={form.userId} onValueChange={(v) => setForm({ ...form, userId: v })}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="انتخاب کاربر..." /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {usersQ.data?.users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name} {u.family}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">نقش</Label>
                <Select value={form.roleId} onValueChange={(v) => setForm({ ...form, roleId: v })}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="انتخاب..." /></SelectTrigger>
                  <SelectContent>
                    {data?.roleList.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">سطح</Label>
                <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v })}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[0, 1, 2, 3, 4, 5].map((l) => <SelectItem key={l} value={String(l)}>{l === 0 ? "بدون سطح" : `سطح ${faNum(l)}`}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>انصراف</Button>
            <Button onClick={create} disabled={!form.userId || !form.roleId}>تخصیص</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
