"use client";
// پروفایل کاربر
import * as React from "react";
import { PageHeader, SectionCard, NameAvatar, StatusBadge } from "@/components/shared";
import { faNum, faDigits, jDate, jDateTime } from "@/lib/jalali";
import { api, useQuery } from "@/lib/client";
import { UserRound, Save, ShieldCheck, KeyRound, Clock3, MonitorSmartphone } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

type Me = {
  user: {
    id: number; name: string; family: string; username: string; nid: number;
    mobile: number; email: string | null; avatarColor: string | null;
    consultantLevel: number | null; bio: string | null; roles: string[];
  };
};

type ProfileProps = {
  user: { id: number; name: string; family: string; username: string; roles: string[]; avatarColor: string | null };
  refreshMe: () => Promise<{ user: Me["user"]; unread: number } | null>;
};

export function ProfileView({ user, refreshMe }: ProfileProps) {
  const { toast } = useToast();
  const detail = useQuery<ProfileData>(() => api(`/api/users/${user.id}`), [user.id]);
  const [form, setForm] = React.useState({ email: "", bio: "" });
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    if (detail.data && !loaded) {
      setForm({ email: detail.data.user.email ?? "", bio: detail.data.user.bio ?? "" });
      setLoaded(true);
    }
  }, [detail.data, loaded]);

  const save = async () => {
    await api(`/api/users/${user.id}`, { method: "PATCH", body: JSON.stringify(form) });
    toast({ title: "پروفایل بروزرسانی شد" });
    refreshMe();
  };

  return (
    <div>
      <PageHeader title="پروفایل من" subtitle="اطلاعات حساب و نشست‌های ورود" icon={<UserRound className="h-5 w-5" />} />

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard className="lg:col-span-1">
          <div className="flex flex-col items-center pb-4 text-center">
            <NameAvatar name={user.name} family={user.family} color={user.avatarColor} size={84} />
            <p className="mt-3.5 text-lg font-extrabold">{user.name} {user.family}</p>
            <p className="text-xs tabular-nums text-muted-foreground" dir="ltr">{user.username}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {user.roles.map((r) => (
                <Badge key={r} variant="secondary" className="text-[10.5px] font-bold">{r}</Badge>
              ))}
            </div>
            {detail.data?.user.consultantLevel && (
              <Badge className="mt-2 bg-accent text-accent-foreground text-[10.5px]">سطح مشاور {faNum(detail.data.user.consultantLevel)}</Badge>
            )}
          </div>
          {detail.data && (
            <div className="space-y-2 border-t pt-4 text-xs">
              <Row label="کد ملی" value={faDigits(detail.data.user.nid)} />
              <Row label="موبایل" value={faDigits(detail.data.user.mobile)} />
              <Row label="نام پدر" value={detail.data.user.father ?? "—"} />
              <Row label="تاریخ تولد" value={jDate(detail.data.user.birthday)} />
              <Row label="ثبت‌نام" value={jDate(detail.data.user.signupDate)} />
              <Row label="آخرین ورود" value={detail.data.user.lastLogin ? jDateTime(detail.data.user.lastLogin) : "—"} />
            </div>
          )}
        </SectionCard>

        <div className="space-y-4 lg:col-span-2">
          <SectionCard title="ویرایش اطلاعات تماس">
            <div className="grid gap-3.5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">ایمیل</Label>
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-9 text-xs" dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">درباره من</Label>
                <Input value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} className="h-9 text-xs" />
              </div>
            </div>
            <Button size="sm" className="mt-4 gap-1.5" onClick={save}>
              <Save className="h-3.5 w-3.5" /> ذخیره تغییرات
            </Button>
          </SectionCard>

          <SectionCard title="نشست‌های ورود اخیر" subtitle="فعالیت‌های اخیر حساب شما" bodyClass="p-0">
            <ul className="divide-y">
              {detail.data?.sessions.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
                    <MonitorSmartphone className="h-4 w-4 text-muted-foreground" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold" dir="ltr">{s.browser?.slice(0, 50) ?? "—"}</p>
                    <p className="text-[10px] tabular-nums text-muted-foreground" dir="ltr">{s.ip}</p>
                  </div>
                  <span className="text-[10.5px] tabular-nums text-muted-foreground">{jDateTime(s.dateTime)}</span>
                </li>
              ))}
              {detail.data?.sessions.length === 0 && <li className="p-6 text-center text-xs text-muted-foreground">نشستی یافت نشد</li>}
            </ul>
          </SectionCard>

          {detail.data && detail.data.taxes.length > 0 && (
            <SectionCard title="سابقه مالیات من" subtitle="آخرین دوره‌های مالیاتی" bodyClass="p-0">
              <ul className="divide-y">
                {detail.data.taxes.slice(0, 6).map((t) => (
                  <li key={t.id} className="flex items-center justify-between px-5 py-3 text-xs">
                    <span className="font-bold">{faNum(t.year)}/{faNum(t.month)}</span>
                    <span className="tabular-nums">حق‌الزحمه: <b>{faNum(t.totalPayment)}</b></span>
                    <span className="tabular-nums text-rose-600 dark:text-rose-400">مالیات: <b>{faNum(t.taxAmount)}</b></span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}

type ProfileData = {
  user: {
    id: number; nid: number; mobile: number; father: string | null; birthday: string | null;
    signupDate: string; lastLogin: string | null; email: string | null; bio: string | null;
    consultantLevel: number | null;
  };
  sessions: { id: string; ip: string | null; browser: string | null; dateTime: string }[];
  taxes: { id: number; year: number; month: number; taxAmount: number; totalPayment: number }[];
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
      <span className="text-[10.5px] text-muted-foreground">{label}</span>
      <span className="text-[11px] font-bold">{value}</span>
    </div>
  );
}
