"use client";
// راهنمای سامانه
import * as React from "react";
import { PageHeader, SectionCard, LoadingView } from "@/components/shared";
import { faNum } from "@/lib/jalali";
import { api, useQuery } from "@/lib/client";
import { BookOpen, HelpCircle, Keyboard, MousePointerClick, Users, CalendarCheck, ArrowLeftRight, Target, ShieldCheck, LifeBuoy } from "lucide-react";

const GUIDE = [
  {
    title: "شروع سریع",
    icon: MousePointerClick,
    items: [
      "از منوی سمت راست به بخش مورد نظر بروید؛ هر بخش یک ماژول مستقل است.",
      "با کلیک روی هر ردیف جدول، جزئیات کامل همان رکورد باز می‌شود.",
      "از دکمه تغییر تم (ماه/خورشید) در بالای صفحه برای حالت تیره استفاده کنید.",
      "منوی کناری با دکمه «جمع کردن منو» به حالت آیکنی در می‌آید.",
    ],
  },
  {
    title: "جلسات و زنجیره تایید",
    icon: CalendarCheck,
    items: [
      "هر جلسه پس از ثبت، از مراحل مدیر مرکز → مسئول فنی → نظارت حرفه‌ای → ناظر استان عبور می‌کند.",
      "در تب «زنجیره تایید» داخل جزئیات جلسه، وضعیت دقیق هر مرحله را می‌بینید.",
      "رد جلسه بدون ثبت دلیل امکان‌پذیر نیست.",
      "یادداشت‌های مشاور در تب «یادداشت‌ها» قابل مشاهده و افزودن است.",
    ],
  },
  {
    title: "ارجاعات سها",
    icon: ArrowLeftRight,
    items: [
      "ارجاعات جدید از سامانه وزارت بهداشت (سها) به‌صورت خودکار در همین ماژول ظاهر می‌شوند.",
      "ارجاع در انتظار را با دکمه «پذیرش» به چرخه خدمات اضافه کنید.",
      "برای ثبت اقدامات بعدی از دکمه «پیگیری» استفاده کنید.",
    ],
  },
  {
    title: "سهمیه‌ها و بودجه",
    icon: Target,
    items: [
      "مصرف و رزرو هر سهمیه با نوار پیشرفت نمایش داده می‌شود.",
      "تخصیص استانی هر سهمیه در کارت همان سهمیه قابل مشاهده است.",
      "در BI، تب «سهمیه‌ها» پرمصرف‌ترین استان‌ها را نشان می‌دهد.",
    ],
  },
  {
    title: "نقش‌ها و دسترسی",
    icon: ShieldCheck,
    items: [
      "تایید جلسات بر اساس نقش شما انجام می‌شود (مدیر کلینیک، مسئول فنی و...).",
      "مدیر سیستم و مدیر کل می‌توانند همه مراحل را یکجا تایید کنند.",
      "مشاوران تنها جلسات پذیرش‌شده خود را می‌بینند.",
    ],
  },
  {
    title: "پشتیبانی",
    icon: LifeBuoy,
    items: [
      "برای گزارش خطا یا درخواست امکان جدید از ماژول «تیکت پشتیبانی» استفاده کنید.",
      "راهنمای اختصاصی هر نقش در ماژول «مناسبت‌ها و راهنما» موجود است.",
    ],
  },
];

export function HelpsView() {
  const { data, loading } = useQuery<{ helps: { id: number; title: string; fileUrl: string | null }[] }>(() => api("/api/occasions"), []);
  if (loading) return <LoadingView />;

  return (
    <div>
      <PageHeader title="راهنمای سامانه" subtitle="راهنمای کاربردی ماژول‌ها برای همه کاربران" icon={<BookOpen className="h-5 w-5" />} />

      <div className="mb-4 rounded-2xl border border-teal-200 bg-gradient-to-l from-teal-50 to-emerald-50/50 p-5 dark:border-teal-900 dark:from-teal-950/40 dark:to-emerald-950/20">
        <p className="flex items-center gap-2 text-sm font-extrabold text-teal-800 dark:text-teal-300">
          <HelpCircle className="h-4.5 w-4.5" />
          نسخه ۵.۰.۰ — بازنویسی کامل رابط کاربری
        </p>
        <p className="mt-1.5 text-xs leading-6 text-teal-700/80 dark:text-teal-400/80">
          این نسخه با تمرکز بر سادگی، سرعت و زیبایی بازطراحی شده است. تمام ماژول‌های نسخه قبلی — کاربران، جلسات، ارجاعات سها،
          سهمیه‌ها، قراردادها، موارد حاد، مالیات، پیامک و گزارش‌های BI — با چیدمان جدید و تاریخ‌شمسی یکپارچه در دسترس هستند.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {GUIDE.map((g) => (
          <SectionCard key={g.title} title={g.title}>
            <ul className="space-y-2.5">
              {g.items.map((item, i) => (
                <li key={i} className="flex gap-2.5 text-xs leading-6 text-foreground/85">
                  <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </SectionCard>
        ))}

        <SectionCard title="فایل‌های راهنمای نقش‌ها" subtitle="قابل دانلود برای هر نقش">
          <ul className="grid gap-2 sm:grid-cols-2">
            {data?.helps.map((h) => (
              <li key={h.id} className="flex items-center gap-2.5 rounded-xl border bg-muted/40 px-3.5 py-2.5">
                <BookOpen className="h-4 w-4 shrink-0 text-primary" />
                <span className="truncate text-xs font-semibold">{h.title}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
