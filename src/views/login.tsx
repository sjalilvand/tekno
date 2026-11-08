"use client";
// صفحه ورود — طراحی دوپانلی مدرن
import * as React from "react";
import { Flower2, UserRound, KeyRound, Loader2, ArrowLeft, Sparkles } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DEMO = [
  { label: "مدیر سیستم", username: "admin" },
  { label: "مدیر کلینیک", username: "manager" },
  { label: "مشاور", username: "consultant" },
];

export function LoginView() {
  const [username, setUsername] = React.useState("admin");
  const [password, setPassword] = React.useState("123456");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "خطا در ورود");
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطای نامشخص");
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2" dir="rtl">
      {/* پنل برند */}
      <div className="brand-gradient relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute inset-0 opacity-20">
          <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-white/30 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-80 w-80 rounded-full bg-amber-300/30 blur-3xl" />
        </div>
        <div className="relative flex items-center gap-3 text-white">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
            <Flower2 className="h-6 w-6" />
          </span>
          <div>
            <p className="text-lg font-extrabold">{BRAND.name}</p>
            <p className="text-xs text-white/75">کلینیک مشاوره و روان‌درمانی</p>
          </div>
        </div>
        <div className="relative text-white">
          <span className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" /> نسخه {BRAND.version}
          </span>
          <h1 className="text-3xl font-black leading-relaxed">
            سامانه یکپارچه مدیریت
            <br />
            جلسات، روان‌درمانی و مشاوره
            <br />
            در محیطی امن و محرمانه
          </h1>
          <ul className="mt-6 space-y-2.5 text-sm text-white/85">
            <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-white/70" /> پیگیری زنجیره تایید جلسات در یک نگاه</li>
            <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-white/70" /> اتصال به سامانه سها و مدیریت ارجاع‌ها</li>
            <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-white/70" /> داشبوردهای توصیفی، تحلیلی، تفسیری و کشف خطا</li>
            <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-white/70" /> گزارش‌ساز حرفه‌ای با خروجی CSV و چاپ</li>
          </ul>
        </div>
        <p className="relative text-xs text-white/60">© {BRAND.name} — {BRAND.hours}</p>
      </div>

      {/* فرم ورود */}
      <div className="flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <span className="brand-gradient mb-3 flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg">
              <Flower2 className="h-7 w-7" />
            </span>
            <p className="text-lg font-extrabold">{BRAND.name}</p>
          </div>

          <div className="rounded-3xl border bg-card p-8 shadow-xl shadow-rose-900/5">
            <h2 className="text-xl font-extrabold">ورود به سامانه</h2>
            <p className="mt-1 text-sm text-muted-foreground">با نام کاربری یا کد ملی و رمز عبور وارد شوید</p>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="username" className="text-xs font-semibold">نام کاربری / کد ملی</Label>
                <div className="relative">
                  <UserRound className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)}
                    className="h-11 pr-9" placeholder="admin" autoComplete="username" required />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-semibold">رمز عبور</Label>
                <div className="relative">
                  <KeyRound className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                    className="h-11 pr-9" placeholder="••••••" autoComplete="current-password" required />
                </div>
              </div>

              {error && (
                <p className="rounded-xl bg-rose-50 px-3 py-2.5 text-xs font-medium text-rose-600 dark:bg-rose-950/50 dark:text-rose-400" role="alert">
                  {error}
                </p>
              )}

              <Button type="submit" className="h-11 w-full text-sm font-bold" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeft className="h-4 w-4" />}
                {loading ? "در حال ورود..." : "ورود"}
              </Button>
            </form>

            <div className="mt-6 rounded-2xl bg-muted/70 p-3.5">
              <p className="mb-2 text-[11px] font-bold text-muted-foreground">حساب‌های نمونه (رمز همه: ۱۲۳۴۵۶)</p>
              <div className="flex flex-wrap gap-1.5">
                {DEMO.map((d) => (
                  <button key={d.username} onClick={() => { setUsername(d.username); setPassword("123456"); }}
                    className="rounded-full border bg-card px-3 py-1 text-[11px] font-semibold transition-colors hover:border-ring hover:bg-accent hover:text-accent-foreground">
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
