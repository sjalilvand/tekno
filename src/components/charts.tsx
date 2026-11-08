"use client";
// نمودارهای مدیریتی — recharts با پالت فیروزه‌ای
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  PieChart, Pie, Legend, AreaChart, Area, RadialBarChart, RadialBar, PolarAngleAxis,
} from "recharts";
import { faNum } from "@/lib/jalali";

// پالت نمودارها — رز/زرشکی/طلایی (الگوی رزپسی)
export const CHART_COLORS = ["#a83a54", "#c99a5b", "#5c4a6e", "#d97b90", "#8a76a0", "#7c2740", "#b98a4b", "#c2647e", "#6d5a80", "#a8838d"];

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  fontSize: 12,
  fontFamily: "Vazirmatn",
  boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
  direction: "rtl" as const,
};

function fmtTick(v: number | string) {
  const n = Number(v);
  if (n >= 1000) return `${faNum(Math.round(n / 100) / 10)}هـ`;
  return faNum(n);
}

export function BarChartX({
  data, xKey, bars, height = 280, stacked = false, color = "#0d9488", layout = "horizontal",
}: {
   
  data: any[];
  xKey: string;
  bars: { key: string; name: string; color?: string }[];
  height?: number;
  stacked?: boolean;
  color?: string;
  layout?: "horizontal" | "vertical";
}) {
  const vertical = layout === "vertical";
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={layout} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={!vertical} />
        {vertical ? (
          <>
            <XAxis type="number" tick={{ fontSize: 11, fill: "var(--muted-foreground)", fontFamily: "Vazirmatn" }} axisLine={false} tickLine={false} tickFormatter={fmtTick} />
            <YAxis type="category" dataKey={xKey} width={90} tick={{ fontSize: 11, fill: "var(--muted-foreground)", fontFamily: "Vazirmatn" }} axisLine={false} tickLine={false} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: "var(--muted-foreground)", fontFamily: "Vazirmatn" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)", fontFamily: "Vazirmatn" }} axisLine={false} tickLine={false} tickFormatter={fmtTick} width={44} />
          </>
        )}
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "color-mix(in srgb, var(--accent) 40%, transparent)" }} formatter={(v) => faNum(Number(v))} />
        {bars.map((b, i) => (
          <Bar key={b.key} dataKey={b.key} name={b.name} fill={b.color ?? color} radius={vertical ? [0, 6, 6, 0] : [6, 6, 0, 0]} stackId={stacked ? "a" : undefined} maxBarSize={38}>
            {bars.length === 1 && !vertical && data.map((_, j) => <Cell key={j} fill={CHART_COLORS[j % CHART_COLORS.length]} fillOpacity={0.92} />)}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({
  data, nameKey = "name", valueKey = "value", height = 260, innerRadius = 58, outerRadius = 88,
}: {
   
  data: any[];
  nameKey?: string;
  valueKey?: string;
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey={valueKey} nameKey={nameKey} innerRadius={innerRadius} outerRadius={outerRadius} paddingAngle={3} cornerRadius={5} stroke="none">
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => faNum(Number(v))} />
        <Legend
          layout="vertical" align="left" verticalAlign="middle"
          iconType="circle" iconSize={8}
          formatter={(v) => <span style={{ fontSize: 11.5, color: "var(--muted-foreground)", fontFamily: "Vazirmatn" }}>{v}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function AreaChartX({
  data, xKey, areas, height = 260,
}: {
   
  data: any[];
  xKey: string;
  areas: { key: string; name: string; color?: string }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
        <defs>
          {areas.map((a, i) => (
            <linearGradient key={i} id={`grad-${a.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={a.color ?? CHART_COLORS[i]} stopOpacity={0.28} />
              <stop offset="100%" stopColor={a.color ?? CHART_COLORS[i]} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: "var(--muted-foreground)", fontFamily: "Vazirmatn" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)", fontFamily: "Vazirmatn" }} axisLine={false} tickLine={false} tickFormatter={fmtTick} width={44} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => faNum(Number(v))} />
        {areas.map((a, i) => (
          <Area key={a.key} type="monotone" dataKey={a.key} name={a.name} stroke={a.color ?? CHART_COLORS[i]} strokeWidth={2.4} fill={`url(#grad-${a.key})`} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function GaugeChart({ value, max = 100, label, color = "#0d9488" }: { value: number; max?: number; label: string; color?: string }) {
  const pct = Math.min(100, Math.round((value / (max || 1)) * 100));
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={150}>
        <RadialBarChart data={[{ value: pct }]} innerRadius="72%" outerRadius="100%" startAngle={90} endAngle={-270}>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar dataKey="value" cornerRadius={10} fill={color} background={{ fill: "var(--muted)" }} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pt-2">
        <span className="text-xl font-extrabold tabular-nums">{faNum(pct)}٪</span>
        <span className="text-[11px] text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}
