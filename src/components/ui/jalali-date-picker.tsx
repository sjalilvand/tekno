"use client";
// تقویم شمسی (Jalali) — کامپوننت انتخاب تاریخ فارسی بدون وابستگی خارجی
// مقدار ورودی/خروجی: ISO (yyyy-mm-dd) — نمایش: کاملاً شمسی و فارسی
import * as React from "react";
import { cn } from "@/lib/utils";
import { gToJ, jToG, jToIso, jMonthLength, jMonths, jWeekdays, faWeekCol, isoToJ, jLabel, todayIso, type JParts } from "@/lib/jdate";
import { ChevronRight, ChevronLeft, CalendarDays, X } from "lucide-react";

const WEEKDAY_FULL = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];

export function JalaliDatePicker({
  value, onChange, placeholder = "انتخاب تاریخ", className, disabled, clearable = true, allowFuture = true,
}: {
  value: string;                                  // ISO یا ""
  onChange: (iso: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  clearable?: boolean;
  allowFuture?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const sel = isoToJ(value);
  const today = gToJ(new Date());

  // نگاه تقویم — پیش‌فرض: تاریخ انتخاب‌شده یا امروز
  const [view, setView] = React.useState<JParts>(sel ?? today);

  React.useEffect(() => {
    if (open) setView(sel ?? gToJ(new Date()));
  }, [open]);

  // بستن با کلیک بیرون یا Esc
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const moveMonth = (delta: number) => {
    setView((v) => {
      let m = v.jm + delta, y = v.jy;
      if (m < 1) { m = 12; y -= 1; }
      if (m > 12) { m = 1; y += 1; }
      return { jy: y, jm: m, jd: 1 };
    });
  };

  const pick = (jd: number) => {
    onChange(jToIso(view.jy, view.jm, jd));
    setOpen(false);
  };

  const len = jMonthLength(view.jy, view.jm);
  const firstCol = faWeekCol(jToG(view.jy, view.jm, 1).getUTCDay());
  const cells: (number | null)[] = [
    ...Array(firstCol).fill(null),
    ...Array.from({ length: len }, (_, i) => i + 1),
  ];

  const isDisabledDay = (jd: number) => {
    if (allowFuture) return false;
    const iso = jToIso(view.jy, view.jm, jd);
    return iso > todayIso();
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-md border bg-transparent px-3 py-1 text-xs shadow-sm transition-colors",
          "hover:bg-accent/50 disabled:cursor-not-allowed disabled:opacity-50",
          open && "border-ring ring-1 ring-ring/30",
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className={cn("flex-1 text-right tabular-nums", !value && "text-muted-foreground")}>
          {value ? jLabel(value) : placeholder}
        </span>
        {value && clearable && (
          <span
            role="button"
            tabIndex={-1}
            aria-label="پاک کردن تاریخ"
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={(e) => { e.stopPropagation(); onChange(""); }}
          >
            <X className="h-3 w-3" />
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="تقویم شمسی"
          className="absolute z-50 mt-1.5 w-[288px] rounded-2xl border bg-popover p-3 shadow-xl"
        >
          {/* سربرگ: ناوبری ماه و سال */}
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => moveMonth(-1)} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-accent" aria-label="ماه قبل">
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-1.5">
              <select
                value={view.jm}
                onChange={(e) => setView((v) => ({ ...v, jm: Number(e.target.value) }))}
                className="h-7 rounded-lg border bg-background px-2 text-xs font-bold outline-none"
                aria-label="ماه"
              >
                {jMonths.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <select
                value={view.jy}
                onChange={(e) => setView((v) => ({ ...v, jy: Number(e.target.value) }))}
                className="h-7 w-[72px] rounded-lg border bg-background px-2 text-xs font-bold tabular-nums outline-none"
                aria-label="سال"
              >
                {Array.from({ length: 81 }, (_, i) => today.jy - 70 + i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <button type="button" onClick={() => moveMonth(1)} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-accent" aria-label="ماه بعد">
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>

          {/* روزهای هفته */}
          <div className="grid grid-cols-7 gap-0.5 pb-1">
            {jWeekdays.map((d) => (
              <span key={d} className="py-1 text-center text-[10px] font-bold text-muted-foreground">{d}</span>
            ))}
          </div>

          {/* شبکهٔ روزها */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((jd, i) => {
              if (jd === null) return <span key={`e${i}`} />;
              const iso = jToIso(view.jy, view.jm, jd);
              const isSelected = value === iso;
              const isToday = today.jy === view.jy && today.jm === view.jm && today.jd === jd;
              const disabled = isDisabledDay(jd);
              return (
                <button
                  key={jd}
                  type="button"
                  disabled={disabled}
                  onClick={() => pick(jd)}
                  title={WEEKDAY_FULL[faWeekCol(jToG(view.jy, view.jm, jd).getUTCDay())]}
                  className={cn(
                    "flex h-8 items-center justify-center rounded-lg text-xs font-semibold tabular-nums transition-colors",
                    isSelected && "bg-primary text-primary-foreground shadow-sm",
                    !isSelected && isToday && "border border-primary/50 text-primary",
                    !isSelected && !isToday && "hover:bg-accent",
                    disabled && "cursor-not-allowed opacity-30 hover:bg-transparent",
                  )}
                >
                  {jd.toLocaleString("fa-IR", { useGrouping: false })}
                </button>
              );
            })}
          </div>

          {/* پانویس */}
          <div className="mt-2 flex items-center justify-between border-t pt-2">
            <button
              type="button"
              onClick={() => { onChange(todayIso()); setOpen(false); }}
              className="rounded-lg px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-accent"
            >
              امروز
            </button>
            <span className="text-[10px] text-muted-foreground">{WEEKDAY_FULL[faWeekCol(jToG(view.jy, view.jm, view.jd).getUTCDay())]}</span>
            {value && clearable && (
              <button
                type="button"
                onClick={() => { onChange(""); setOpen(false); }}
                className="rounded-lg px-2.5 py-1 text-[11px] font-bold text-muted-foreground hover:bg-accent"
              >
                پاک کردن
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
