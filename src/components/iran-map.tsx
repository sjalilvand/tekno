"use client";
// =====================================================================
// نقشهٔ تعاملی ایران — ۳۱ استان (نسخهٔ ۶.۱۴)
// حالت کروپلت: رنگ هر استان بر اساس «روند مشاوره» (جلسات/متقاضیان/درآمد/موارد حاد)
// با طیف ۵ پله‌ای شرابی برند + پین شماره‌دار تعداد مراکز (مثل نقشهٔ کلینیک‌های مرجع)
// + پاپ‌آپ مشخصات داخل خود نقشه (overlay)
// دادهٔ مسیر استان‌ها: مخزن special-spoon (svg عمومی nastoohir/iran-map-svg)
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

/** آمار یک استان برای رنگ‌آمیزی کروپلت (نسخهٔ ۶.۱۴) */
export type RegionStat = {
  provinceId: number;
  /** مقدار عددی شاخص — مثلاً تعداد جلسات */
  value: number;
  /** تعداد مراکز (روی پین شماره‌دار نمایش داده می‌شود) */
  count?: number;
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

/** طیف ۵ پله‌ای شرابی برند — از کم (روشن) به زیاد (تیره) */
const RAMP = ["#fceef1", "#f6cdd6", "#e990a4", "#d4576f", "#962b44"];

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

/** راهنمای کروپلت — طیف کم به زیاد + برچسب شاخص */
export function ChoroplethLegend({ metricLabel, unit }: { metricLabel: string; unit?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 text-[10px] text-muted-foreground">
      <span className="font-bold text-foreground/70">{metricLabel}:</span>
      <span className="flex items-center gap-1">
        کمتر
        {RAMP.map((c) => (
          <span key={c} className="h-3 w-6 rounded-sm border border-black/5" style={{ background: c }} />
        ))}
        بیشتر{unit ? ` (${unit})` : ""}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#5b1e2e] text-[8px] font-black text-white">۹۹</span>
        تعداد مراکز
      </span>
    </div>
  );
}

export function IranMap({
  markers, regions, metricLabel, metricUnit,
  selectedId, onSelect,
  selectedProvince, onSelectProvince,
  overlay, className,
}: {
  /** حالت قدیمی — نشانگر مرکزها */
  markers?: MapMarker[];
  /** حالت کروپلت — مقدار شاخص هر استان (نسخهٔ ۶.۱۴) */
  regions?: RegionStat[];
  metricLabel?: string;
  metricUnit?: string;
  selectedId?: number | string | null;
  onSelect?: (id: number | string) => void;
  /** استان انتخاب‌شده برای پاپ‌آپ داخل نقشه */
  selectedProvince?: number | null;
  onSelectProvince?: (id: number | null) => void;
  /** محتوای شناور داخل کادر نقشه — پاپ‌آپ مشخصات */
  overlay?: React.ReactNode;
  className?: string;
}) {
  const [hovered, setHovered] = React.useState<string | number | null>(null);
  const choropleth = Boolean(regions?.length);

  const regionMap = React.useMemo(() => {
    const m = new Map<number, RegionStat>();
    for (const r of regions ?? []) m.set(r.provinceId, r);
    return m;
  }, [regions]);

  const maxValue = React.useMemo(
    () => Math.max(1, ...(regions ?? []).map((r) => r.value)),
    [regions]
  );

  const rampIndex = (value: number): number => {
    if (value <= 0) return 0;
    return Math.min(RAMP.length - 1, Math.max(1, Math.ceil((value / maxValue) * (RAMP.length - 1))));
  };

  // گروه‌بندی نشانگرها بر پایهٔ استان — چند مرکز در یک استان کنار هم
  const byProvince = React.useMemo(() => {
    const map = new Map<number, MapMarker[]>();
    for (const m of markers ?? []) {
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

  // پین شماره‌دار استان‌ها (حالت کروپلت) — مثل نقشهٔ مرجع
  const provincePins = React.useMemo(() => {
    const pins: { provinceId: number; x: number; y: number; count: number; value: number; name: string }[] = [];
    for (const [pid, stat] of regionMap) {
      const key = KEY_BY_CODE[String(pid).padStart(2, "0")];
      const center = key ? IRAN_PROVINCE_CENTER[key] : undefined;
      if (!center) continue;
      pins.push({
        provinceId: pid, x: (center[0] / IRAN_VIEWBOX.w) * 100, y: (center[1] / IRAN_VIEWBOX.h) * 100,
        count: stat.count ?? 0, value: stat.value,
        name: IRAN_PROVINCE_META[key]?.fa ?? String(pid),
      });
    }
    return pins;
  }, [regionMap]);

  // تولتیپ — استان (کروپلت) یا نشانگر (حالت قدیمی)
  const hoveredProvince = typeof hovered === "number" ? hovered : null;
  const hoveredMarker = choropleth ? null : ((markers ?? []).find((x) => x.id === hovered) ?? null);

  return (
    <div className={cn("relative w-full select-none", className)} dir="rtl">
      <svg
        viewBox={`0 0 ${IRAN_VIEWBOX.w} ${IRAN_VIEWBOX.h}`}
        className="mx-auto block h-auto w-full max-w-[560px]"
        role="img"
        aria-label="نقشهٔ ایران — روند مشاوره به تفکیک استان"
      >
        {/* دریاها */}
        {IRAN_SEA_PATHS.map((d, i) => (
          <path key={`sea-${i}`} d={d} fill="#7dd3fc" opacity={0.35} />
        ))}
        {/* استان‌ها */}
        {Object.entries(IRAN_PROVINCE_PATHS).map(([key, d]) => {
          const meta = IRAN_PROVINCE_META[key];
          const pid = meta ? Number(meta.code) : null;
          const stat = pid ? regionMap.get(pid) : undefined;
          const pTone = pid ? toneOfProvince(pid) : null;
          const fill = choropleth
            ? stat
              ? RAMP[rampIndex(stat.value)]
              : "var(--muted)"
            : pTone
              ? TONE_SOFT[pTone]
              : "var(--muted)";
          const stroke = choropleth
            ? stat ? "#7c2438" : "var(--border)"
            : pTone ? TONE_HEX[pTone] : "var(--border)";
          const clickable = choropleth ? Boolean(stat && onSelectProvince) : Boolean(pTone);
          const selected = choropleth && pid != null && selectedProvince === pid;
          return (
            <path
              key={key}
              d={d}
              fill={fill}
              stroke={selected ? "#3f1020" : stroke}
              strokeWidth={selected ? 2.4 : choropleth && stat ? 1.2 : pTone ? 1.6 : 0.8}
              className={cn("transition-all duration-200", clickable && "cursor-pointer hover:opacity-75")}
              onMouseEnter={() => { if (pid != null && (stat || pTone)) setHovered(pid); }}
              onMouseLeave={() => setHovered(null)}
              onClick={() => {
                if (pid == null) return;
                if (choropleth) onSelectProvince?.(selectedProvince === pid ? null : pid);
                else if (pTone) onSelect?.(byProvince.get(pid)?.[0]?.id ?? pid);
              }}
            />
          );
        })}
      </svg>

      {/* نشانگر مراکز — حالت قدیمی (خوشه‌چینی چند مرکز یک استان) */}
      {!choropleth &&
        (markers ?? []).map((m) => {
          const key = KEY_BY_CODE[String(m.provinceId).padStart(2, "0")];
          const center = key ? IRAN_PROVINCE_CENTER[key] : undefined;
          if (!center) return null;
          const group = byProvince.get(m.provinceId) ?? [];
          const groupIndex = group.findIndex((x) => x.id === m.id);
          const n = group.length;
          let dx = 0, dy = 0;
          if (n > 1) {
            const radius = Math.min(10 + n * 1.6, 22);
            const angle = (groupIndex / n) * Math.PI * 2 - Math.PI / 2;
            dx = Math.cos(angle) * radius;
            dy = Math.sin(angle) * radius * 0.9;
          }
          const x = ((center[0] + dx) / IRAN_VIEWBOX.w) * 100;
          const y = ((center[1] + dy) / IRAN_VIEWBOX.h) * 100;
          const selected = m.id === selectedId;
          const isHovered = hoveredMarker?.id === m.id;
          return (
            <button
              key={m.id}
              className={cn(
                "group absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full outline-none transition-transform",
                selected ? "scale-125" : "hover:scale-110"
              )}
              style={{ left: `${x}%`, top: `${y}%` }}
              onMouseEnter={() => setHovered(m.id)}
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
                {n > 1 && (
                  <span className="absolute -top-1.5 -left-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-foreground px-0.5 text-[8px] font-black leading-none text-background">
                    {faNum(n)}
                  </span>
                )}
                {m.tone === "emerald" && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40" style={{ background: TONE_HEX[m.tone] }} />
                )}
              </span>
              {(isHovered || selected) && (
                <span className="pointer-events-none absolute -bottom-5 right-1/2 translate-x-1/2 whitespace-nowrap rounded-md bg-background/90 px-1.5 text-[9.5px] font-bold text-foreground/90 shadow-sm">
                  {m.value}
                </span>
              )}
            </button>
          );
        })}

      {/* پین شماره‌دار تعداد مراکز هر استان — حالت کروپلت (نسخهٔ ۶.۱۴) */}
      {choropleth &&
        provincePins.map((p) => {
          const selected = selectedProvince === p.provinceId;
          const isHovered = hoveredProvince === p.provinceId;
          return (
            <button
              key={p.provinceId}
              className={cn(
                "absolute z-10 -translate-x-1/2 -translate-y-1/2 outline-none transition-transform",
                selected ? "scale-125" : "hover:scale-110"
              )}
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
              onMouseEnter={() => setHovered(p.provinceId)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onSelectProvince?.(selected ? null : p.provinceId)}
              aria-label={`${p.name} — ${faNum(p.count)} مرکز`}
            >
              <span
                className={cn(
                  "flex items-center justify-center rounded-full border-2 border-white text-[9.5px] font-black leading-none text-white shadow-lg dark:border-black/50",
                  selected ? "h-7 min-w-7 px-1 text-[11px]" : "h-5 min-w-5 px-0.5"
                )}
                style={{ background: "#5b1e2e" }}
              >
                {faNum(p.count)}
              </span>
              {(isHovered || selected) && (
                <span className="pointer-events-none absolute -bottom-5 right-1/2 translate-x-1/2 whitespace-nowrap rounded-md bg-background/95 px-1.5 py-0.5 text-[9.5px] font-bold text-foreground shadow-sm">
                  {p.name}
                </span>
              )}
            </button>
          );
        })}

      {/* تولتیپ شناور — استان (کروپلت) */}
      {choropleth && hoveredProvince != null && (() => {
        const pin = provincePins.find((p) => p.provinceId === hoveredProvince);
        if (!pin) return null;
        const stat = regionMap.get(hoveredProvince);
        return (
          <div
            className="pointer-events-none absolute z-20 max-w-[220px] -translate-x-1/2 -translate-y-[130%] rounded-xl border bg-popover px-3 py-2 text-right shadow-xl"
            style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
          >
            <p className="text-[11.5px] font-extrabold leading-4">{pin.name}</p>
            {metricLabel && (
              <p className="mt-1 text-[10.5px] font-bold" style={{ color: "#962b44" }}>
                {faNum(stat?.value ?? 0)} {metricLabel}
              </p>
            )}
            <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{faNum(pin.count)} مرکز رز</p>
          </div>
        );
      })()}

      {/* تولتیپ شناور — نشانگر (حالت قدیمی) */}
      {hoveredMarker && !choropleth && (() => {
        const hm = hoveredMarker;
        const key = KEY_BY_CODE[String(hm.provinceId).padStart(2, "0")];
        const center = key ? IRAN_PROVINCE_CENTER[key] : undefined;
        if (!center) return null;
        const x = (center[0] / IRAN_VIEWBOX.w) * 100;
        const y = (center[1] / IRAN_VIEWBOX.h) * 100;
        return (
          <div
            className="pointer-events-none absolute z-20 max-w-[220px] -translate-x-1/2 -translate-y-[120%] rounded-xl border bg-popover px-3 py-2 text-right shadow-xl"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <p className="text-[11px] font-extrabold leading-4">{hm.title}</p>
            {hm.sub && <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{hm.sub}</p>}
            <p className="mt-1 text-[10.5px] font-bold" style={{ color: TONE_HEX[hm.tone] }}>{hm.value}</p>
          </div>
        );
      })()}

      {/* راهنما */}
      <div className="mt-2 flex justify-center">
        {choropleth ? <ChoroplethLegend metricLabel={metricLabel ?? "روند مشاوره"} unit={metricUnit} /> : <MapLegend />}
      </div>

      {/* پاپ‌آپ مشخصات — داخل خود کادر نقشه (نسخهٔ ۶.۱۴) */}
      {overlay}
    </div>
  );
}

/** برچسب فارسی مقدار — جلسات و درآمد */
export function markerValue(sessions: number, income: number): string {
  if (sessions === 0) return "بدون جلسه";
  return `${faNum(sessions)} جلسه`;
}
