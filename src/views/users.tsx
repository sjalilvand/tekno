"use client";
// مدیریت کاربران
import * as React from "react";
import { PageHeader, FilterBar, DataTable, StatusBadge, NameAvatar, LoadingView, SectionCard, DotBadge, Column } from "@/components/shared";
import { faNum, faDigits, jDate, jDateTime } from "@/lib/jalali";
import { api, useQuery } from "@/lib/client";
import { Users, Search, ShieldCheck, Ban, UserRoundCheck, Phone, CalendarDays, GraduationCap, ScrollText, BadgeCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type UserRow = {
  id: number; nid: number; username: string; name: string; family: string;
  gender: string | null; mobile: number; province: string | null; education: string | null;
  roles: { title: string; level: number; isSuspended: boolean }[];
  signupDate: string; lastLogin: string | null; blocked: boolean; avatarColor: string | null;
};

type Meta = {
  provinces: { id: number; title: string }[];
  roles: { id: number; title: string }[];
};

type UserDetail = {
  user: Omit<UserRow, "education"> & { father?: string; email?: string; bio?: string; marriage?: { name: string } | null; address?: string; birthday?: string | null; consultantLevel?: number | null; education?: { name: string } | null };
  events: { id: number; trackingCode: number | null; startDate: string | null; status: string; topic: string | null; service: { short: string } }[];
  taxes: { id: number; year: number; month: number; taxAmount: number; totalPayment: number }[];
  consultantEdu: { id: number; field: string | null; grade: string | null; university: string | null; graduationDate: string | null }[];
  logs: { id: number; category: string; description: string | null; timestamp: string }[];
  sessions: { id: string; ip: string | null; browser: string | null; dateTime: string }[];
};

export function UsersView() {
  const { toast } = useToast();
  const [q, setQ] = React.useState("");
  const [roleId, setRoleId] = React.useState("");
  const [provinceId, setProvinceId] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<number | null>(null);

  const meta = useQuery<Meta>(() => api("/api/meta"), []);
  const { data, loading, refetch } = useQuery<{ total: number; totalPages: number; users: UserRow[] }>(
    () => api(`/api/users?q=${encodeURIComponent(q)}&roleId=${roleId}&provinceId=${provinceId}&page=${page}`),
    [q, roleId, provinceId, page]
  );
  const detail = useQuery<UserDetail>(
    () => (selected ? api(`/api/users/${selected}`) : Promise.resolve(null)),
    [selected]
  );

  const toggleBlock = async (u: UserRow) => {
    await api(`/api/users/${u.id}`, { method: "PATCH", body: JSON.stringify({ blocked: !u.blocked }) });
    toast({ title: u.blocked ? "کاربر رفع مسدودی شد" : "کاربر مسدود شد" });
    refetch();
  };

  const columns: Column<UserRow>[] = [
    {
      header: "کاربر",
      cell: (u) => (
        <div className="flex items-center gap-2.5">
          <NameAvatar name={u.name} family={u.family} color={u.avatarColor} />
          <div>
            <p className="text-[13px] font-semibold leading-5">{u.name} {u.family}</p>
            <p className="text-[10.5px] tabular-nums text-muted-foreground leading-4">{faDigits(u.nid)}</p>
          </div>
        </div>
      ),
    },
    { header: "نقش‌ها", cell: (u) => <RoleChips roles={u.roles} /> },
    { header: "موبایل", cell: (u) => <span className="text-xs tabular-nums text-muted-foreground" dir="ltr">{faDigits(u.mobile)}</span> },
    { header: "استان", cell: (u) => <span className="text-xs">{u.province ?? "—"}</span> },
    { header: "تحصیلات", cell: (u) => <span className="text-xs text-muted-foreground">{u.education ?? "—"}</span> },
    { header: "آخرین ورود", cell: (u) => <span className="text-xs tabular-nums text-muted-foreground">{u.lastLogin ? jDateTime(u.lastLogin) : "ثبت نشده"}</span> },
    { header: "وضعیت", cell: (u) => <DotBadge label={u.blocked ? "مسدود" : "فعال"} ok={!u.blocked} /> },
    {
      header: "عملیات",
      cell: (u) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setSelected(u.id); }} title="پرونده کاربر">
            <UserRoundCheck className="h-4 w-4 text-primary" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); toggleBlock(u); }} title={u.blocked ? "رفع مسدودی" : "مسدودسازی"}>
            <Ban className={`h-4 w-4 ${u.blocked ? "text-emerald-600" : "text-rose-500"}`} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="کاربران"
        subtitle={`مدیریت ${faNum(data?.total ?? 0)} کاربر سامانه`}
        icon={<Users className="h-5 w-5" />}
      />

      <FilterBar className="mb-4">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="جستجوی نام، کد ملی یا موبایل..." className="h-9 pr-9 text-sm" />
        </div>
        <Select value={roleId || "all"} onValueChange={(v) => { setRoleId(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="h-9 w-44 text-sm"><SelectValue placeholder="همه نقش‌ها" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه نقش‌ها</SelectItem>
            {meta.data?.roles.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={provinceId || "all"} onValueChange={(v) => { setProvinceId(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="h-9 w-44 text-sm"><SelectValue placeholder="همه استان‌ها" /></SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="all">همه استان‌ها</SelectItem>
            {meta.data?.provinces.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.title}</SelectItem>)}
          </SelectContent>
        </Select>
      </FilterBar>

      <div className="rounded-2xl border bg-card shadow-sm">
        <DataTable
          columns={columns}
          rows={data?.users ?? []}
          loading={loading}
          page={data?.page}
          totalPages={data?.totalPages}
          onPageChange={setPage}
          onRowClick={(u) => setSelected(u.id)}
        />
      </div>

      {/* پرونده کاربر */}
      <Dialog open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden" dir="rtl">
          {detail.loading || !detail.data ? (
            <>
              <DialogHeader className="sr-only"><DialogTitle>پرونده کاربر</DialogTitle></DialogHeader>
              <LoadingView label="در حال دریافت پرونده..." />
            </>
          ) : (
            <>
              <DialogHeader className="border-b bg-gradient-to-l from-accent/60 to-transparent px-6 py-5 text-right">
                <DialogTitle className="flex items-center gap-3">
                  <NameAvatar name={detail.data.user.name} family={detail.data.user.family} color={detail.data.user.avatarColor} size={46} />
                  <div>
                    <span className="block text-base font-extrabold">{detail.data.user.name} {detail.data.user.family}</span>
                    <span className="block text-xs font-normal text-muted-foreground mt-0.5">
                      کد ملی: {faDigits(detail.data.user.nid)} — {detail.data.user.roles.map((r) => r.title).join("، ")}
                    </span>
                  </div>
                </DialogTitle>
              </DialogHeader>

              <Tabs defaultValue="info" dir="rtl" className="px-6">
                <TabsList className="w-full justify-start overflow-x-auto">
                  <TabsTrigger value="info" className="gap-1.5"><BadgeCheck className="h-3.5 w-3.5" /> اطلاعات پایه</TabsTrigger>
                  <TabsTrigger value="events">جلسات ({faNum(detail.data.events.length)})</TabsTrigger>
                  <TabsTrigger value="tax">مالیات</TabsTrigger>
                  <TabsTrigger value="activity" className="gap-1.5"><ScrollText className="h-3.5 w-3.5" /> فعالیت اخیر</TabsTrigger>
                </TabsList>

                <TabsContent value="info" className="pb-6 pt-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <InfoItem icon={<Phone className="h-3.5 w-3.5" />} label="موبایل" value={faDigits(detail.data.user.mobile)} />
                    <InfoItem icon={<CalendarDays className="h-3.5 w-3.5" />} label="تاریخ تولد" value={jDate(detail.data.user.birthday)} />
                    <InfoItem icon={<GraduationCap className="h-3.5 w-3.5" />} label="تحصیلات" value={detail.data.user.education?.name ?? "—"} />
                    <InfoItem icon={<Users className="h-3.5 w-3.5" />} label="نام پدر" value={detail.data.user.father ?? "—"} />
                    <InfoItem icon={<CalendarDays className="h-3.5 w-3.5" />} label="ثبت‌نام" value={jDate(detail.data.user.signupDate)} />
                    <InfoItem icon={<BadgeCheck className="h-3.5 w-3.5" />} label="وضعیت تاهل" value={detail.data.user.marriage?.name ?? "—"} />
                  </div>
                  {detail.data.consultantEdu.length > 0 && (
                    <>
                      <Separator className="my-4" />
                      <p className="mb-2.5 flex items-center gap-1.5 text-xs font-bold"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> مدارک تحصیلی مشاور</p>
                      <div className="space-y-2">
                        {detail.data.consultantEdu.map((e) => (
                          <div key={e.id} className="flex items-center justify-between rounded-xl border bg-muted/40 px-4 py-2.5 text-xs">
                            <span className="font-semibold">{e.field} — {e.grade}</span>
                            <span className="text-muted-foreground">{e.university} ({faDigits(e.graduationDate ?? "")})</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </TabsContent>

                <TabsContent value="events" className="pb-6 pt-4">
                  <ScrollArea className="h-72">
                    <div className="space-y-2">
                      {detail.data.events.map((ev) => (
                        <div key={ev.id} className="flex items-center justify-between rounded-xl border px-4 py-2.5">
                          <div>
                            <p className="text-xs font-semibold">{ev.topic ?? ev.service.short}</p>
                            <p className="text-[10.5px] text-muted-foreground">کد {faNum(ev.trackingCode ?? 0)} — {jDate(ev.startDate)}</p>
                          </div>
                          <StatusBadge status={ev.status} />
                        </div>
                      ))}
                      {detail.data.events.length === 0 && <p className="py-8 text-center text-xs text-muted-foreground">جلسه‌ای یافت نشد</p>}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="tax" className="pb-6 pt-4">
                  <ScrollArea className="h-72">
                    <div className="space-y-2">
                      {detail.data.taxes.map((t) => (
                        <div key={t.id} className="flex items-center justify-between rounded-xl border px-4 py-2.5 text-xs">
                          <span className="font-semibold">{faNum(t.year)}/{faNum(t.month)}</span>
                          <span>حق‌الزحمه: <b className="tabular-nums">{faNum(t.totalPayment)}</b> ریال</span>
                          <span>مالیات: <b className="tabular-nums text-rose-600">{faNum(t.taxAmount)}</b></span>
                        </div>
                      ))}
                      {detail.data.taxes.length === 0 && <p className="py-8 text-center text-xs text-muted-foreground">سابقه مالیاتی یافت نشد</p>}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="activity" className="pb-6 pt-4">
                  <ScrollArea className="h-72">
                    <div className="space-y-2">
                      {detail.data.logs.map((l) => (
                        <div key={l.id} className="flex items-center justify-between rounded-xl border px-4 py-2.5 text-xs">
                          <span><Badge variant="outline" className="ml-2 text-[10px]">{l.category}</Badge>{l.description}</span>
                          <span className="tabular-nums text-muted-foreground">{jDateTime(l.timestamp)}</span>
                        </div>
                      ))}
                      {detail.data.logs.length === 0 && <p className="py-8 text-center text-xs text-muted-foreground">فعالیتی یافت نشد</p>}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RoleChips({ roles }: { roles: { title: string; level: number; isSuspended: boolean }[] }) {
  return (
    <div className="flex max-w-52 flex-wrap gap-1">
      {roles.slice(0, 2).map((r) => (
        <Badge key={r.title} variant={r.isSuspended ? "outline" : "secondary"} className="text-[10px] font-semibold">
          {r.title}{r.level > 0 ? ` (سطح ${faNum(r.level)})` : ""}
        </Badge>
      ))}
      {roles.length > 2 && <Badge variant="outline" className="text-[10px]">+{faNum(roles.length - 2)}</Badge>}
    </div>
  );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-muted/40 px-3.5 py-2.5">
      <p className="flex items-center gap-1 text-[10px] text-muted-foreground">{icon} {label}</p>
      <p className="mt-1 truncate text-xs font-bold">{value}</p>
    </div>
  );
}
