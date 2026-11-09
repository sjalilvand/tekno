"use client";
// =====================================================================
// چت آنلاین هوشمند — ویجت شناور گوشهٔ پایین سامانه (نسخهٔ ۶.۱)
// • پرسش و پاسخ دربارهٔ داده‌های سامانه در محدودهٔ سطح دسترسی کاربر
// • تولید گزارش و نمودار درون‌گفتگو (SVG سبک — بدون وابستگی)
// • شناسایی کیس‌های حاد و هشدار پیش‌دستانه برای مدیر
// • تاریخچهٔ ماندگار در پایگاه داده (ChatMessages)
// =====================================================================
import * as React from "react";
import { cn } from "@/lib/utils";
import { api, navigate } from "@/lib/client";
import { faNum } from "@/lib/jalali";
import { MessageCircleHeart, X, Send, Loader2, Trash2, Sparkles, BarChart3, AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChatPayload } from "@/lib/assistant";

type Msg = {
  id: number | string;
  role: "user" | "assistant";
  text: string;
  payload?: ChatPayload;
  createdAt?: string;
};

const PALETTE = ["#a83a54", "#c99a5b", "#0e7490", "#7c2740", "#047857", "#b45309", "#6d28d9", "#475569"];

// ------------------------------------------------------ نمودارهای سبک SVG
function ChatChart({ chart }: { chart: NonNullable<ChatPayload["chart"]> }) {
  const data = chart.data.filter((d) => d.value > 0);
  if (!data.length) return null;
  const max = Math.max(...data.map((d) => d.value));

  if (chart.type === "pie") {
    const total = data.reduce((a, b) => a + b.value, 0);
    let acc = 0;
    const R = 34, C = 2 * Math.PI * R;
    return (
      <div className="flex items-center gap-4 py-2" dir="rtl">
        <svg width="90" height="90" viewBox="0 0 90 90" className="shrink-0 -rotate-90">
          <circle cx="45" cy="45" r={R} fill="none" stroke="currentColor" className="text-muted/60" strokeWidth="13" />
          {data.map((d, i) => {
            const frac = d.value / total;
            const dash = `${frac * C} ${C}`;
            const el = (
              <circle key={i} cx="45" cy="45" r={R} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth="13"
                strokeDasharray={dash} strokeDashoffset={-acc * C} strokeLinecap="butt" />
            );
            acc += frac;
            return el;
          })}
        </svg>
        <div className="flex flex-col gap-1.5 min-w-0">
          {data.map((d, i) => (
            <div key={i} className="flex items-center gap-2 text-[11.5px]">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
              <span className="truncate max-w-[170px]">{d.name}</span>
              <span className="font-bold tabular-nums">{faNum(d.value)}</span>
              <span className="text-muted-foreground tabular-nums">({faNum(Math.round((d.value / total) * 100))}٪)</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (chart.type === "line") {
    const W = 280, H = 90, pad = 8;
    const step = (W - pad * 2) / Math.max(1, data.length - 1);
    const pts = data.map((d, i) => [pad + i * step, H - pad - (d.value / Math.max(1, max)) * (H - pad * 2.2)] as const);
    const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    return (
      <div className="py-2" dir="ltr">
        <svg width="100%" viewBox={`0 0 ${W} ${H + 14}`}>
          <path d={path} fill="none" stroke="#a83a54" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
          {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="2.8" fill="#a83a54" />)}
          {data.map((d, i) => (
            <text key={i} x={pad + i * step} y={H + 10} fontSize="7.5" textAnchor="middle" fill="#94797f"
              transform={`rotate(-40 ${pad + i * step} ${H + 10})`}>{d.name.slice(0, 7)}</text>
          ))}
        </svg>
        <div className="flex justify-between text-[10px] text-muted-foreground px-1" dir="rtl">
          <span>حداکثر: {faNum(max)}</span>
          <span>مجموع: {faNum(data.reduce((a, b) => a + b.value, 0))}</span>
        </div>
      </div>
    );
  }

  // bar افقی — RTL: برچسب راست، میله به چپ رشد می‌کند
  return (
    <div className="flex flex-col gap-1.5 py-2" dir="rtl">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-[120px] shrink-0 truncate text-[11px] text-foreground/85">{d.name}</span>
          <div className="h-3.5 flex-1 rounded-md bg-muted/60 overflow-hidden">
            <div className="h-full rounded-md transition-all" style={{ width: `${Math.max(4, (d.value / max) * 100)}%`, background: PALETTE[i % PALETTE.length] }} />
          </div>
          <span className="w-12 shrink-0 text-left text-[11px] font-bold tabular-nums">{faNum(d.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------ بدنهٔ ویجت
export function ChatWidget() {
  const [open, setOpen] = React.useState(false);
  const [booted, setBooted] = React.useState(false);
  const [scope, setScope] = React.useState<string>("");
  const [acuteUnread, setAcuteUnread] = React.useState(0);
  const [msgs, setMsgs] = React.useState<Msg[]>([]);
  const [quick, setQuick] = React.useState<string[]>([]);
  const [input, setInput] = React.useState("");
  const [typing, setTyping] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const scrollDown = () => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  // باز شدن از سایر صفحات (دکمهٔ «دستیار هوشمند» داشبورد)
  React.useEffect(() => {
    const openChat = () => setOpen(true);
    window.addEventListener("rz-open-chat", openChat);
    return () => window.removeEventListener("rz-open-chat", openChat);
  }, []);

  // خوش‌آمد فقط یک بار — هشدار موارد حاد برای نشان روی دکمهٔ شناور
  React.useEffect(() => {
    if (!open || booted) return;
    setBooted(true);
    (async () => {
      try {
        const [hist, meta] = await Promise.all([
          api<{ messages: Msg[] }>("/api/chat?history=1"),
          api<{ scope: string; acuteUnread: number; reply: { text: string; quickReplies?: string[] } }>("/api/chat"),
        ]);
        setScope(meta.scope);
        setAcuteUnread(meta.acuteUnread);
        setQuick(meta.reply.quickReplies ?? []);
        if (hist.messages.length) {
          setMsgs(hist.messages);
        } else {
          setMsgs([{ id: "welcome", role: "assistant", text: meta.reply.text }]);
        }
        scrollDown();
      } catch {
        setMsgs([{ id: "err", role: "assistant", text: "ارتباط دستیار برقرار نشد — دوباره تلاش کنید." }]);
      }
    })();
  }, [open, booted]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || typing) return;
    setInput("");
    setMsgs((m) => [...m, { id: `u-${Date.now()}`, role: "user", text: q }]);
    setTyping(true);
    scrollDown();
    try {
      const reply = await api<{ text: string; payload?: ChatPayload; quickReplies?: string[] }>("/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: q }),
      });
      setMsgs((m) => [...m, { id: `a-${Date.now()}`, role: "assistant", text: reply.text, payload: reply.payload }]);
      if (reply.quickReplies) setQuick(reply.quickReplies);
    } catch (e: any) {
      setMsgs((m) => [...m, { id: "e", role: "assistant", text: e?.message === "UNAUTHORIZED" ? "ابتدا وارد سامانه شوید." : "پاسخ دستیار با خطا مواجه شد." }]);
    } finally {
      setTyping(false);
      scrollDown();
    }
  };

  const clearChat = async () => {
    try {
      const r = await api<{ reply: { text: string; quickReplies?: string[] } }>("/api/chat", { method: "DELETE" });
      setMsgs([{ id: "w", role: "assistant", text: r.reply.text }]);
      if (r.reply.quickReplies) setQuick(r.reply.quickReplies);
    } catch { /* ignore */ }
  };

  const go = (href: string) => {
    const route = href.replace(/^#\//, "");
    navigate(route.split("?")[0]);
    setOpen(false);
  };

  return (
    <>
      {/* دکمهٔ شناور — گوشهٔ پایین چپ (سایدبار در راست است) */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="دستیار هوشمند"
        className={cn(
          "fixed bottom-5 left-5 z-[60] flex h-14 w-14 items-center justify-center rounded-full shadow-xl transition-all duration-300 hover:scale-105 active:scale-95 no-print",
          open ? "bg-card text-foreground border rotate-0" : "brand-gradient text-white"
        )}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircleHeart className="h-6 w-6" />}
        {!open && acuteUnread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white ring-2 ring-white animate-pulse">
            {faNum(acuteUnread)}
          </span>
        )}
      </button>

      {/* پنل گفتگو */}
      <div
        className={cn(
          "fixed bottom-[84px] left-5 z-[60] flex w-[min(400px,calc(100vw-40px))] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl transition-all duration-200 origin-bottom-left no-print",
          open ? "pointer-events-auto h-[min(560px,calc(100vh-130px))] scale-100 opacity-100" : "pointer-events-none h-0 scale-90 opacity-0"
        )}
        role="dialog"
        aria-label="دستیار هوشمند سامانه"
      >
        {/* سربرگ */}
        <div className="brand-gradient flex items-center gap-2.5 px-4 py-3 text-white">
          <Sparkles className="h-5 w-5" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-extrabold leading-5">دستیار هوشمند رز</p>
            <p className="text-[10px] opacity-85 leading-4">
              {scope === "all" ? "دسترسی کامل مدیریتی" : scope === "center" ? "دسترسی مدیر مرکز" : scope === "consultant" ? "دسترسی مشاور" : "دسترسی شخصی"}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/15" onClick={clearChat} aria-label="پاک‌سازی گفتگو" title="پاک‌سازی گفتگو">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {/* پیام‌ها */}
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-muted/25 px-3.5 py-3.5">
          {msgs.map((m) => (
            <div key={m.id} className={cn("flex", m.role === "user" ? "justify-start flex-row-reverse" : "justify-start")}>
              <div className={cn(
                "max-w-[92%] rounded-2xl px-3.5 py-2.5 text-[12.5px] leading-6 shadow-sm",
                m.role === "user"
                  ? "bg-primary text-primary-foreground rounded-tr-sm"
                  : "bg-card border rounded-tl-sm"
              )}>
                <p className="whitespace-pre-wrap">{m.text}</p>

                {/* نمودار */}
                {m.payload?.chart && (
                  <div className="mt-2 rounded-xl border bg-background/60 px-3 pb-1.5 pt-2">
                    <div className="flex items-center gap-1.5 pb-1 text-[10.5px] font-bold text-muted-foreground">
                      <BarChart3 className="h-3.5 w-3.5" /> {m.payload.chart.title}
                    </div>
                    <ChatChart chart={m.payload.chart} />
                  </div>
                )}

                {/* کارت‌ها */}
                {m.payload?.cards?.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => c.href && go(c.href)}
                    className={cn(
                      "mt-2 block w-full rounded-xl border p-2.5 text-right transition-all",
                      c.href && "hover:shadow-md hover:border-ring",
                      c.tone === "rose" ? "border-rose-200 bg-rose-50/70 dark:border-rose-900 dark:bg-rose-950/40" :
                      c.tone === "amber" ? "border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/40" :
                      c.tone === "teal" ? "border-teal-200 bg-teal-50/70 dark:border-teal-900 dark:bg-teal-950/40" :
                      "border-border bg-background/60"
                    )}
                  >
                    <span className="flex items-center gap-1.5 text-[12px] font-extrabold">
                      {c.tone === "rose" && <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />}
                      {c.title}
                      {c.href && <ExternalLink className="mr-auto h-3 w-3 text-muted-foreground" />}
                    </span>
                    {c.lines.map((l, j) => (
                      <span key={j} className="mt-0.5 block text-[11px] leading-5 text-muted-foreground">{l}</span>
                    ))}
                  </button>
                ))}

                {/* جدول */}
                {m.payload?.table && (
                  <div className="mt-2 overflow-x-auto rounded-xl border bg-background/60">
                    <table className="w-full text-[10.5px]">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          {m.payload.table.columns.map((col, i) => (
                            <th key={i} className="px-2 py-1.5 text-right font-bold whitespace-nowrap">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {m.payload.table.rows.map((row, i) => (
                          <tr key={i} className="border-b last:border-0">
                            {row.map((cell, j) => (
                              <td key={j} className="px-2 py-1.5 whitespace-nowrap">{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* لینک‌ها */}
                {m.payload?.links?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.payload.links.map((l, i) => (
                      <button key={i} onClick={() => go(l.href)}
                        className="rounded-full border bg-accent/60 px-2.5 py-1 text-[10.5px] font-bold text-accent-foreground transition-colors hover:bg-accent">
                        {l.label} ↗
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))}

          {typing && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> دستیار در حال بررسی داده‌ها...
            </div>
          )}
        </div>

        {/* پاسخ‌های سریع */}
        {quick.length > 0 && !typing && (
          <div className="flex flex-wrap gap-1.5 border-t bg-card px-3 py-2">
            {quick.slice(0, 5).map((q, i) => (
              <button key={i} onClick={() => send(q)}
                className="rounded-full border bg-muted/60 px-3 py-1 text-[10.5px] font-medium transition-colors hover:border-ring hover:bg-accent hover:text-accent-foreground">
                {q}
              </button>
            ))}
          </div>
        )}

        {/* ورودی */}
        <form
          className="flex items-center gap-2 border-t bg-card p-2.5"
          onSubmit={(e) => { e.preventDefault(); send(input); }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="پرسش خود را بنویسید..."
            className="h-9 flex-1 rounded-xl bg-muted/40 text-[12.5px]"
            dir="rtl"
          />
          <Button type="submit" size="icon" className="brand-gradient h-9 w-9 shrink-0 rounded-xl text-white" disabled={typing || !input.trim()} aria-label="ارسال">
            <Send className="h-4 w-4 -scale-x-100" />
          </Button>
        </form>
      </div>
    </>
  );
}
