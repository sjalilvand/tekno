"use client";
// پیام‌های داخلی
import * as React from "react";
import { PageHeader, NameAvatar, LoadingView, StatusBadge } from "@/components/shared";
import { faNum, jDateTime } from "@/lib/jalali";
import { api, useQuery } from "@/lib/client";
import { Mail, Star, SendHorizonal, Inbox, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

type MessageRow = {
  id: number; subject: string | null; text: string | null; timestamp: string;
  star: boolean; isRead: boolean; targetRole: string | null;
  fromUser: { id: number; name: string; family: string; avatarColor: string | null };
  toUser: { id: number; name: string; family: string } | null;
};

export function MessagesView() {
  const { toast } = useToast();
  const [box, setBox] = React.useState("inbox");
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ toUserId: "", subject: "", text: "" });

  const meta = useQuery<{ roles: { id: number; title: string }[] }>(() => api("/api/meta"), []);
  const { data, loading, refetch } = useQuery<{ messages: MessageRow[]; unread: number }>(
    () => api(`/api/messages?box=${box}`), [box]
  );
  const usersQ = useQuery<{ users: { id: number; name: string; family: string }[] }>(
    () => api("/api/users?page=1&pageSize=100"), [open]
  );

  const toggleStar = async (m: MessageRow) => {
    await api("/api/messages", { method: "PATCH", body: JSON.stringify({ id: m.id, star: !m.star }) });
    refetch();
  };

  const markRead = async (m: MessageRow) => {
    if (!m.isRead) {
      await api("/api/messages", { method: "PATCH", body: JSON.stringify({ id: m.id, isRead: true }) });
      refetch();
    }
  };

  const send = async () => {
    if (!form.text.trim() || !form.toUserId) return;
    await api("/api/messages", { method: "POST", body: JSON.stringify(form) });
    toast({ title: "پیام ارسال شد" });
    setOpen(false);
    setForm({ toUserId: "", subject: "", text: "" });
    refetch();
  };

  return (
    <div>
      <PageHeader
        title="پیام‌های داخلی"
        subtitle={`${faNum(data?.unread ?? 0)} پیام خوانده‌نشده`}
        icon={<Mail className="h-5 w-5" />}
        actions={
          <Button className="gap-1.5" size="sm" onClick={() => setOpen(true)}>
            <SendHorizonal className="h-4 w-4" /> پیام جدید
          </Button>
        }
      />

      <div className="mb-4 flex gap-2">
        <button onClick={() => setBox("inbox")} className={`flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-xs font-bold transition-all ${box === "inbox" ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}>
          <Inbox className="h-3.5 w-3.5" /> صندوق ورودی
        </button>
        <button onClick={() => setBox("sent")} className={`flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-xs font-bold transition-all ${box === "sent" ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}>
          <Send className="h-3.5 w-3.5" /> ارسالی
        </button>
      </div>

      {loading ? (
        <LoadingView />
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <ul className="divide-y">
            {data?.messages.length === 0 && (
              <li className="p-12 text-center text-sm text-muted-foreground">پیامی یافت نشد</li>
            )}
            {data?.messages.map((m) => (
              <li key={m.id} onClick={() => markRead(m)} className={`flex cursor-pointer items-start gap-3 px-5 py-3.5 transition-colors hover:bg-muted/50 ${!m.isRead && box === "inbox" ? "bg-accent/30" : ""}`}>
                <NameAvatar name={m.fromUser.name} family={m.fromUser.family} color={m.fromUser.avatarColor} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={`text-[13px] ${!m.isRead && box === "inbox" ? "font-extrabold" : "font-semibold"}`}>
                      {box === "sent" ? (m.toUser ? `به: ${m.toUser.name} ${m.toUser.family}` : `به: ${m.targetRole ?? "همه"}`) : `${m.fromUser.name} ${m.fromUser.family}`}
                    </p>
                    {m.targetRole && <StatusBadge status="در حال بررسی" className="!hidden" />}
                    {m.targetRole && <span className="rounded-full bg-muted px-2 py-0.5 text-[9.5px] font-bold text-muted-foreground">به نقش: {m.targetRole}</span>}
                    {!m.isRead && box === "inbox" && <span className="h-2 w-2 rounded-full bg-primary" />}
                  </div>
                  <p className="mt-0.5 truncate text-xs font-bold">{m.subject}</p>
                  <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{m.text}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <button onClick={(e) => { e.stopPropagation(); toggleStar(m); }} aria-label="ستاره" className="transition-transform hover:scale-125">
                    <Star className={`h-4 w-4 ${m.star ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
                  </button>
                  <span className="text-[10px] tabular-nums text-muted-foreground">{jDateTime(m.timestamp)}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader><DialogTitle className="text-right">پیام جدید</DialogTitle></DialogHeader>
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label className="text-xs">گیرنده</Label>
              <Select value={form.toUserId} onValueChange={(v) => setForm({ ...form, toUserId: v })}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="انتخاب کاربر..." /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {usersQ.data?.users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name} {u.family}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">موضوع</Label>
              <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="h-9 text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">متن پیام</Label>
              <Textarea value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} rows={4} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>انصراف</Button>
            <Button onClick={send} disabled={!form.text.trim() || !form.toUserId}>
              <SendHorizonal className="h-4 w-4" /> ارسال
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
