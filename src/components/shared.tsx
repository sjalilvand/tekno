"use client";
// کامپوننت‌های مشترک سامانه — طراحی مدرن RTL
import * as React from "react";
import { cn } from "@/lib/utils";
import { faNum, jDate } from "@/lib/jalali";
import { ChevronRight, ChevronLeft, Inbox, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// ---------------- سربرگ صفحه ----------------
export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div className="flex items-center gap-3">
        {icon && (
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-accent-foreground shadow-sm">
            {icon}
          </div>
        )}
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---------------- کارت آماری ----------------
export function StatCard({
  title,
  value,
  hint,
  icon,
  tone = "teal",
  trend,
}: {
  title: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  tone?: "teal" | "amber" | "rose" | "emerald" | "cyan" | "slate";
  trend?: number;
}) {
  const tones: Record<string, string> = {
    teal: "bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
    rose: "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
    cyan: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300",
    slate: "bg-slate-100 text-slate-700 dark:bg-slate-800/70 dark:text-slate-300",
  };
  return (
    <div className="group rounded-2xl border bg-card p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
      <div className="flex items-center justify-between">
        <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl transition-transform group-hover:scale-110", tones[tone])}>
          {icon}
        </span>
        {trend !== undefined && (
          <span className={cn("text-xs font-bold rounded-full px-2 py-0.5", trend >= 0 ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400" : "bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400")}>
            {trend >= 0 ? "▲" : "▼"} {faNum(Math.abs(trend))}٪
          </span>
        )}
      </div>
      <div className="mt-4 text-2xl font-extrabold tabular-nums">{value}</div>
      <div className="mt-1 text-sm font-medium text-foreground/80">{title}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

// ---------------- نشان وضعیت ----------------
const STATUS_STYLES: Record<string, { bg: string; dot: string }> = {
  "تایید نهایی": { bg: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900", dot: "bg-emerald-500" },
  "در انتظار تایید مدیر مرکز": { bg: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900", dot: "bg-amber-500" },
  "در انتظار تایید مسئول فنی": { bg: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900", dot: "bg-amber-500" },
  "در انتظار تایید نظارت حرفه‌ای": { bg: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-900", dot: "bg-orange-500" },
  "در انتظار تایید ناظر استان": { bg: "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/50 dark:text-cyan-300 dark:border-cyan-900", dot: "bg-cyan-500" },
  "در انتظار پذیرش": { bg: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-900", dot: "bg-sky-500" },
  "رد شده": { bg: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900", dot: "bg-rose-500" },
  "ناتمام": { bg: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700", dot: "bg-slate-400" },
  "در انتظار": { bg: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900", dot: "bg-amber-500" },
  "پذیرش‌شده": { bg: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/50 dark:text-teal-300 dark:border-teal-900", dot: "bg-teal-500" },
  "ارجاع‌شده": { bg: "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/50 dark:text-cyan-300 dark:border-cyan-900", dot: "bg-cyan-500" },
  "منقضی": { bg: "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-700", dot: "bg-slate-400" },
  "پرداخت شده": { bg: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900", dot: "bg-emerald-500" },
  "تایید شده": { bg: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/50 dark:text-teal-300 dark:border-teal-900", dot: "bg-teal-500" },
  "بدون درخواست": { bg: "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-700", dot: "bg-slate-400" },
  "در انتظار بررسی": { bg: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900", dot: "bg-amber-500" },
  "باز": { bg: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900", dot: "bg-amber-500" },
  "در حال بررسی": { bg: "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/50 dark:text-cyan-300 dark:border-cyan-900", dot: "bg-cyan-500" },
  "بسته": { bg: "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-700", dot: "bg-slate-400" },
  "ارسال شده": { bg: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900", dot: "bg-emerald-500" },
  "در صف": { bg: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900", dot: "bg-amber-500" },
  "ناموفق": { bg: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900", dot: "bg-rose-500" },
};

export function StatusBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const s = STATUS_STYLES[status] ?? {
    bg: "bg-muted text-muted-foreground border-border",
    dot: "bg-muted-foreground",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", s.bg, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
      {status}
    </span>
  );
}

/** نشان نقطه‌ای ساده برای وضعیت‌های بولی */
export function DotBadge({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
      ok ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900"
         : "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-700")}>
      <span className={cn("h-1.5 w-1.5 rounded-full", ok ? "bg-emerald-500" : "bg-slate-400")} />
      {label}
    </span>
  );
}

// ---------------- آواتار ----------------
const AVATAR_COLORS: Record<string, string> = {
  teal: "bg-teal-600", rose: "bg-rose-500", amber: "bg-amber-500", violet: "bg-violet-500",
  cyan: "bg-cyan-600", emerald: "bg-emerald-600", orange: "bg-orange-500", slate: "bg-slate-500",
};

export function NameAvatar({ name, family, color, size = 36 }: { name: string; family?: string | null; color?: string | null; size?: number }) {
  const initials = `${name?.[0] ?? "؟"}${family?.[0] ?? ""}`;
  const bg = AVATAR_COLORS[color ?? "teal"] ?? AVATAR_COLORS.teal;
  return (
    <span className={cn("avatar-fallback", bg)} style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden>
      {initials}
    </span>
  );
}

// ---------------- جدول داده ----------------
export type Column<T> = {
  header: string;
   
  cell: (row: T, index: number) => React.ReactNode;
  className?: string;
  headerClass?: string;
};

export function DataTable<T extends { id?: number | string }>({
  columns,
  rows,
  loading,
  error,
  emptyText = "داده‌ای برای نمایش وجود ندارد",
  page,
  totalPages,
  onPageChange,
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  error?: string | null;
  emptyText?: string;
  page?: number;
  totalPages?: number;
  onPageChange?: (p: number) => void;
  onRowClick?: (row: T) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2.5 p-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-500 dark:bg-rose-950/50">
          <Inbox className="h-6 w-6" />
        </span>
        <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{error}</p>
      </div>
    );
  }
  if (!rows.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Inbox className="h-7 w-7" />
        </span>
        <p className="text-sm font-medium text-muted-foreground">{emptyText}</p>
      </div>
    );
  }
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="soft-table w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              {columns.map((c, i) => (
                <th key={i} className={cn("px-4 py-3 text-right font-semibold whitespace-nowrap", c.headerClass)}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr
                key={row.id ?? ri}
                className={cn("border-b border-border/60 last:border-0", onRowClick && "cursor-pointer")}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((c, ci) => (
                  <td key={ci} className={cn("px-4 py-3 align-middle whitespace-nowrap", c.className)}>
                    {c.cell(row, ri)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages !== undefined && page !== undefined && totalPages > 1 && onPageChange && (
        <div className="flex items-center justify-between border-t px-4 py-3">
          <span className="text-xs text-muted-foreground">
            صفحه {faNum(page)} از {faNum(totalPages)}
          </span>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="صفحه قبل">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} aria-label="صفحه بعد">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- فیلترها ----------------
export function FilterBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2.5 rounded-2xl border bg-card p-3.5 shadow-sm", className)}>
      {children}
    </div>
  );
}

// ---------------- کارت بخش ----------------
export function SectionCard({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClass,
}: {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClass?: string;
}) {
  return (
    <section className={cn("rounded-2xl border bg-card shadow-sm", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
          <div>
            {title && <h2 className="text-sm font-bold">{title}</h2>}
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className={cn("p-5", bodyClass)}>{children}</div>
    </section>
  );
}

// ---------------- حالت بارگذاری صفحه ----------------
export function LoadingView({ label = "در حال بارگذاری..." }: { label?: string }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-7 w-7 animate-spin text-primary" />
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}

// ---------------- تاریخ خلاصه ----------------
export function DateCell({ value }: { value: string | number | Date | null | undefined }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return <span className="text-xs tabular-nums text-muted-foreground">{jDate(value)}</span>;
}
