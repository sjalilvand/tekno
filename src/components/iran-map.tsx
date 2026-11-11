"use client";
// =====================================================================
// نقشهٔ تعاملی ایران — ۳۱ استان (نسخهٔ ۶.۱۲)
// دادهٔ مسیر استان‌ها: مخزن special-spoon (svg عمومی nastoohir/iran-map-svg)
// نشانگرها بر پایهٔ کد استان روی مرکز استان قرار می‌گیرند.
// =====================================================================
import * as React from "react";
import {
  IRAN_VIEWBOX, IRAN_PROVINCE_META, IRAN_PROVINCE_CENTER,
  IRAN_PROVINCE_PATHS, IRAN_SEA_PATHS,
} from "@/components/iran-map-data";
import { cn } from "@/lib/utils";
import { faNum } from "@/lib/jalali";

export type MapTone = "emerald" | "amber" | "rose" | "slate";

export type MapMarker = {
  id: number | string;
  title: string;
  provinceId: number;
  tone: MapTone;
  /** مقدار نمایشی روی نشانگر — مثلاً «۱۲ جلسه» */
  value: string;
  sub?: string;
};

const TONE_HEX: Record<MapTone, string> = {
  emerald: "#10b981",
  amber: "#f59e0b",
  rose: "#f43f5e",
  slate: "#94a3b8",
};

const TONE_SOFT: Record<MapTone, string> = {
  emerald: "rgba(16,185,129,0.22)",
  amber: "rgba(245,158,11,0.24)",
  rose: "rgba(244,63,94,0.20)",
  slate: "rgba(148,163,184,0.22)",
};

/** کد رسمی استان → کلید لاتین نقشه */
const KEY_BY_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(IRAN_PROVINCE_META).map(([key, m]) => [m.code, key])
);

export function toneForPerformance(income: number, sessions: number, isEnabled: boolean): MapTone {
  if (!isEnabled) return "slate";
  if (sessions === 0) return "slate";
  if (sessions >= 12 || income >= 50_000_000) return "emerald";
  if (sessions >= 3) return "amber";
  return "rose";
}

export function MapLegend() {
  const items: { tone: MapTone; label: string }[] = [
    { tone: "emerald", label: "عملکرد بالا" },
    { tone: "amber", label: "عملکرد متوسط" },
    { tone: "rose", label: "نیازمند توجه" },
    { tone: "slate", label: "بدون فعالیت / غیرفعال" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10.5px] text-muted-foreground">
      {items.map((i) => (
        <span key={i.tone} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: TONE_HEX[i.tone] }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

export function IranMap({
  markers, selectedId, onSelect, className,
}: {
  markers: MapMarker[];
  selectedId?: number | string | null;
  onSelect?: (id: number | string) => void;
  className?: string;
}) {
  const [hovered, setHovered] = React.useState<{ m: MapMarker; x: number; y: number } | null>(null);

  // گروه‌بندی نشانگرها بر پایهٔ استان — چند مرکز در یک استان کنار هم
  const byProvince = React.useMemo(() => {
    const map = new Map<number, MapMarker[]>();
    for (const m of markers) {
      const arr = map.get(m.provinceId) ?? [];
      arr.push(m);
      map.set(m.provinceId, arr);
    }
    return map;
  }, [markers]);

  const toneOfProvince = (provinceId: number): MapTone | null => {
    const arr = byProvince.get(provinceId);
    if (!arr?.length) return null;
    const order: MapTone[] = ["emerald", "amber", "rose", "slate"];
    for (const t of order) if (arr.some((m) => m.tone === t)) return t;
    return "slate";
  };

  return (
    <div className={cn("relative w-full select-none", className)} dir="rtl">
      <svg
        viewBox={`0 0 ${IRAN_VIEWBOX.w} ${IRAN_VIEWBOX.h}`}
        className="mx-auto block h-auto w-full max-w-[560px]"
        role="img"
        aria-label="نقشهٔ ایران — وضعیت مراکز"
      >
        {/* دریاها */}
        {IRAN_SEA_PATHS.map((d, i) => (
          <path key={`sea-${i}`} d={d} fill="#7dd3fc" opacity={0.35} />
        ))}
        {/* استان‌ها */}
        {Object.entries(IRAN_PROVINCE_PATHS).map(([key, d]) => {
          const meta = IRAN_PROVINCE_META[key];
          const tone = meta ? toneOfProvince(Number(meta.code)) : null;
          const isHoverTarget = Boolean(tone);
          return (
            <path
              key={key}
              d={d}
              fill={tone ? TONE_SOFT[tone] : "var(--muted)"}
              stroke={tone ? TONE_HEX[tone] : "var(--border)"}
              strokeWidth={tone ? 1.6 : 0.8}
              className={cn("transition-all duration-200", isHoverTarget && "cursor-pointer hover:opacity-80")}
            />
          );
        })}
      </svg>

      {/* نشانگر مراکز — مطلق روی نقشه */}
      {markers.map((m, idx) => {
        const key = KEY_BY_CODE[String(m.provinceId).padStart(2, "0")];
        const center = key ? IRAN_PROVINCE_CENTER[key] : undefined;
        if (!center) return null;
        const groupIndex = (byProvince.get(m.provinceId) ?? []).findIndex((x) => x.id === m.id);
        const dx = (groupIndex % 3 - 1) * 10;
        const dy = Math.floor(groupIndex / 3) * 10;
        const x = ((center[0] + dx) / IRAN_VIEWBOX.w) * 100;
        const y = ((center[1] + dy) / IRAN_VIEWBOX.h) * 100;
        const selected = m.id === selectedId;
        return (
          <button
            key={m.id}
            className={cn(
              "group absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full outline-none transition-transform",
              selected ? "scale-125" : "hover:scale-110"
            )}
            style={{ left: `${x}%`, top: `${y}%` }}
            onMouseEnter={() => setHovered({ m, x, y })}
            onMouseLeave={() => setHovered(null)}
            onClick={() => onSelect?.(m.id)}
            aria-label={`${m.title} — ${m.value}`}
          >
            <span
              className={cn(
                "relative flex h-4 w-4 items-center justify-center rounded-full shadow-md ring-2 ring-white transition-all dark:ring-black/40",
                selected && "h-5 w-5"
              )}
              style={{ background: TONE_HEX[m.tone] }}
            >
              {m.tone === "emerald" && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40" style={{ background: TONE_HEX[m.tone] }} />
              )}
            </span>
            <span className="pointer-events-none absolute -bottom-5 right-1/2 translate-x-1/2 whitespace-nowrap text-[9.5px] font-bold text-foreground/90">
              {m.value}
            </span>
          </button>
        );
      })}

      {/* تولتیپ شناور */}
      {hovered && (
        <div
          className="pointer-events-none absolute z-20 max-w-[220px] -translate-x-1/2 -translate-y-[120%] rounded-xl border bg-popover px-3 py-2 text-right shadow-xl"
          style={{ left: `${hovered.x}%`, top: `${hovered.y}%` }}
        >
          <p className="text-[11px] font-extrabold leading-4">{hovered.m.title}</p>
          {hovered.m.sub && <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{hovered.m.sub}</p>}
          <p className="mt-1 text-[10.5px] font-bold" style={{ color: TONE_HEX[hovered.m.tone] }}>{hovered.m.value}</p>
        </div>
      )}

      {/* راهنمای سریع */}
      <div className="mt-2 flex justify-center">
        <MapLegend />
      </div>
    </div>
  );
}

/** برچسب فارسی مقدار — جلسات و درآمد */
export function markerValue(sessions: number, income: number): string {
  if (sessions === 0) return "بدون جلسه";
  return `${faNum(sessions)} جلسه`;
}
