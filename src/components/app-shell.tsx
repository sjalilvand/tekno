"use client";
// پوسته اصلی اپلیکیشن — سایدبار RTL کشویی (جمع/باز شدن + آکاردئون گروه‌ها)
// - دسکتاپ: دکمهٔ جمع/باز در هدر + ذخیرهٔ وضعیت
// - موبایل: منوی کشویی با انیمیشن، بستن با Esc و کلیک روی پس‌زمینه
import * as React from "react";
import { cn } from "@/lib/utils";
import { useHashRoute, navigate } from "@/lib/client";
import { faNum } from "@/lib/jalali";
import {
  LayoutDashboard, BarChart3, CalendarCheck, Users2, CalendarClock, ArrowLeftRight,
  Inbox, Siren, Users, Building2, ShieldCheck, FileSignature, Target, Wallet, Receipt,
  MessageSquareText, Mail, CalendarHeart, ScrollText, LifeBuoy, Settings, BookOpen,
  ChevronsLeft, ChevronDown, Moon, Sun, Bell, LogOut, UserRound, Menu, Flower2, Search, PlugZap,
  FileBarChart2, PanelRightClose, PanelRightOpen, X, Network,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { NameAvatar } from "@/components/shared";
import { BRAND } from "@/lib/brand";

export type MetaUser = {
  id: number; name: string; family: string; username: string; nid: number;
  avatarColor: string | null; mobile: number; email?: string | null;
  consultantLevel: number | null; bio?: string | null; roles: string[];
};

type NavItem = { key: string; label: string; icon: React.ElementType; badgeKey?: "unread" };
type NavGroup = { label: string; items: NavItem[] };

const NAV: NavGroup[] = [
  { label: "نگاه کلی", items: [
    { key: "dashboard", label: "داشبورد", icon: LayoutDashboard },
    { key: "bi", label: "داشبوردهای مدیریتی", icon: BarChart3 },
    { key: "processes", label: "فرایندهای سازمانی (BPMN)", icon: Network },
  ]},
  { label: "ابزارها", items: [
    { key: "reports", label: "گزارش‌ساز حرفه‌ای", icon: FileBarChart2 },
  ]},
  { label: "عملیات", items: [
    { key: "events", label: "جلسات مشاوره", icon: CalendarCheck },
    { key: "group-events", label: "جلسات گروهی", icon: Users2 },
    { key: "reserves", label: "رزرو مشاوره", icon: CalendarClock },
    { key: "referrals", label: "ارجاعات سها", icon: ArrowLeftRight },
    { key: "referral-requests", label: "درخواست‌های رزرو", icon: Inbox },
    { key: "ems", label: "موارد حاد", icon: Siren },
  ]},
  { label: "اطلاعات پایه", items: [
    { key: "users", label: "کاربران", icon: Users },
    { key: "centers", label: "مراکز و کلینیک‌ها", icon: Building2 },
    { key: "roles", label: "نقش‌ها و دسترسی‌ها", icon: ShieldCheck },
    { key: "contracts", label: "قراردادهای سازمانی", icon: FileSignature },
  ]},
  { label: "مالی", items: [
    { key: "budgets", label: "سهمیه‌های خدماتی", icon: Target },
    { key: "finance", label: "عملکرد مالی", icon: Wallet },
    { key: "tax", label: "مالیات مشاوران", icon: Receipt },
  ]},
  { label: "ارتباطات", items: [
    { key: "sms", label: "پیامک‌ها", icon: MessageSquareText },
    { key: "messages", label: "پیام‌های داخلی", icon: Mail, badgeKey: "unread" },
    { key: "occasions", label: "مناسبت‌ها", icon: CalendarHeart },
  ]},
  { label: "سیستم", items: [
    { key: "integrations", label: "یکپارچه‌سازی‌ها", icon: PlugZap },
    { key: "logs", label: "لاگ فعالیت", icon: ScrollText },
    { key: "tickets", label: "تیکت پشتیبانی", icon: LifeBuoy },
    { key: "settings", label: "تنظیمات سامانه", icon: Settings },
    { key: "helps", label: "راهنما", icon: BookOpen },
  ]},
];

const ALL_ITEMS = NAV.flatMap((g) => g.items);
const LS_COLLAPSED = "raz-sidebar-collapsed";
const LS_GROUPS = "raz-sidebar-groups";

function readLsBool(key: string, fallback: boolean): boolean {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v === "1"; } catch { return fallback; }
}
function readLsGroups(): string[] {
  try { return JSON.parse(localStorage.getItem(LS_GROUPS) ?? "[]"); } catch { return []; }
}

function NavList({
  route, collapsed, unread, onNavigate, onCloseMobile,
}: {
  route: string;
  collapsed: boolean;
  unread: number;
  onNavigate?: () => void;
  onCloseMobile?: () => void;
}) {
  const activeGroup = NAV.find((g) => g.items.some((i) => i.key === route))?.label;
  // خواندن localStorage فقط بعد از mount (سازگار با SSR)
  const [openGroups, setOpenGroups] = React.useState<string[]>(() => NAV.map((g) => g.label));
  React.useEffect(() => {
    const saved = readLsGroups();
    if (saved.length) setOpenGroups(saved);
  }, []);
  React.useEffect(() => {
    // گروه فعال همیشه باز بماند
    if (activeGroup && !openGroups.includes(activeGroup)) {
      setOpenGroups((prev) => {
        const next = [...prev, activeGroup];
        try { localStorage.setItem(LS_GROUPS, JSON.stringify(next)); } catch {}
        return next;
      });
    }
  }, [activeGroup]);

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => {
      const next = prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label];
      try { localStorage.setItem(LS_GROUPS, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const renderItem = (item: NavItem) => {
    const active = route === item.key;
    const badge = item.badgeKey === "unread" ? unread : 0;
    const link = (
      <button
        onClick={() => { navigate(item.key); onNavigate?.(); onCloseMobile?.(); }}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-all duration-150",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_0_0_0_1px_rgba(168,58,84,0.15)]"
            : "text-sidebar-foreground hover:bg-muted/70 hover:text-foreground"
        )}
      >
        {active && <span className="absolute right-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-primary" />}
        <item.icon className={cn("h-[18px] w-[18px] shrink-0 transition-transform group-hover:scale-110", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
        {!collapsed && <span className="flex-1 text-right">{item.label}</span>}
        {!collapsed && badge > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">{faNum(badge)}</span>
        )}
        {collapsed && badge > 0 && (
          <span className="absolute -top-0.5 left-1 h-2 w-2 rounded-full bg-rose-500" />
        )}
      </button>
    );
    return (
      <li key={item.key}>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="left" sideOffset={8}>
              <span className="text-xs font-medium">{item.label}</span>
            </TooltipContent>
          </Tooltip>
        ) : link}
      </li>
    );
  };

  return (
    <TooltipProvider delayDuration={200}>
      <nav className="flex-1 space-y-3 overflow-y-auto px-3 py-4" aria-label="منوی اصلی">
        {NAV.map((group) => {
          const isOpen = openGroups.includes(group.label) || Boolean(activeGroup === group.label && !collapsed);
          if (collapsed) {
            // حالت نوار باریک: همهٔ آیتم‌ها به‌صورت آیکون
            return (
              <div key={group.label} className="space-y-0.5 border-b border-border/40 pb-3 last:border-0">
                {group.items.map(renderItem)}
              </div>
            );
          }
          return (
            <div key={group.label}>
              <button
                onClick={() => toggleGroup(group.label)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-[11px] font-bold tracking-wide text-muted-foreground/80 transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                <span>{group.label}</span>
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", isOpen ? "rotate-0" : "-rotate-90")} />
              </button>
              <div
                className={cn(
                  "grid transition-all duration-200 ease-in-out",
                  isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                )}
              >
                <ul className="space-y-0.5 overflow-hidden">
                  {group.items.map(renderItem)}
                </ul>
              </div>
            </div>
          );
        })}
      </nav>
    </TooltipProvider>
  );
}

function Brand({ collapsed, onCloseMobile }: { collapsed: boolean; onCloseMobile?: () => void }) {
  return (
    <div className={cn("flex items-center gap-3 border-b px-4 py-4", collapsed && "justify-center px-2")}>
      <span className="brand-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white shadow-md">
        <Flower2 className="h-5 w-5" />
      </span>
      {!collapsed && (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold">{BRAND.name}</p>
          <p className="truncate text-[10.5px] text-muted-foreground">{BRAND.tagline}</p>
        </div>
      )}
      {onCloseMobile && (
        <Button variant="ghost" size="icon" onClick={onCloseMobile} aria-label="بستن منو">
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

export function AppShell({
  user, unread, children,
}: {
  user: MetaUser;
  unread: number;
  children: React.ReactNode;
}) {
  const route = useHashRoute();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { theme, setTheme } = useTheme();

  // وضعیت جمع/باز منو فقط بعد از mount از localStorage خوانده می‌شود (سازگار با SSR)
  React.useEffect(() => {
    setCollapsed(readLsBool(LS_COLLAPSED, false));
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try { localStorage.setItem(LS_COLLAPSED, c ? "0" : "1"); } catch {}
      return !c;
    });
  };

  const current = ALL_ITEMS.find((i) => i.key === route);
  const isDark = theme === "dark";

  // بستن منوی موبایل با Esc
  React.useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  return (
    <div className="min-h-screen" dir="rtl">
      {/* سایدبار دسکتاپ — با دکمهٔ جمع/باز کشویی */}
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-30 hidden flex-col border-l bg-sidebar transition-all duration-300 lg:flex",
          collapsed ? "w-[76px]" : "w-[264px]"
        )}
      >
        <Brand collapsed={collapsed} />
        <NavList route={route} collapsed={collapsed} unread={unread} />
        <div className="border-t p-3">
          <button
            onClick={toggleCollapsed}
            className="flex w-full items-center justify-center gap-2 rounded-xl border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={collapsed ? "باز کردن منو" : "جمع کردن منو"}
          >
            <ChevronsLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
            {!collapsed && "جمع کردن منو"}
          </button>
        </div>
      </aside>

      {/* پس‌زمینهٔ منوی موبایل */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-300 lg:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />
      {/* سایدبار موبایل — کشویی با انیمیشن */}
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-[280px] flex-col bg-sidebar shadow-2xl transition-transform duration-300 ease-out lg:hidden",
          mobileOpen ? "translate-x-0" : "translate-x-full"
        )}
        aria-hidden={!mobileOpen}
      >
        <Brand collapsed={false} onCloseMobile={() => setMobileOpen(false)} />
        <NavList route={route} collapsed={false} unread={unread} onNavigate={() => setMobileOpen(false)} />
      </aside>

      {/* بدنه */}
      <div className={cn("flex min-h-screen flex-col transition-all duration-300", collapsed ? "lg:pr-[76px]" : "lg:pr-[264px]")}>
        {/* هدر */}
        <header className="glass-header sticky top-0 z-20 border-b">
          <div className="flex h-16 items-center gap-3 px-4 lg:px-6">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="باز کردن منو">
              <Menu className="h-5 w-5" />
            </Button>
            {/* جمع/باز کردن منو — دسکتاپ */}
            <Button
              variant="ghost"
              size="icon"
              className="hidden lg:inline-flex"
              onClick={toggleCollapsed}
              aria-label={collapsed ? "باز کردن منو" : "جمع کردن منو"}
              title={collapsed ? "باز کردن منو" : "جمع کردن منو"}
            >
              {collapsed ? <PanelRightOpen className="h-5 w-5 text-muted-foreground" /> : <PanelRightClose className="h-5 w-5 text-muted-foreground" />}
            </Button>
            <h2 className="hidden text-[15px] font-bold sm:block">{current?.label ?? BRAND.name}</h2>
            <div className="flex-1" />

            <button
              onClick={() => navigate("users")}
              className="hidden items-center gap-2 rounded-full border bg-card px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-ring hover:text-foreground md:flex"
            >
              <Search className="h-3.5 w-3.5" />
              جستجوی کاربر...
            </button>

            <Button variant="ghost" size="icon" className="relative" onClick={() => navigate("messages")} aria-label="پیام‌ها">
              <Bell className="h-5 w-5 text-muted-foreground" />
              {unread > 0 && (
                <span className="absolute -top-0.5 right-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                  {faNum(unread)}
                </span>
              )}
            </Button>

            <Button variant="ghost" size="icon" onClick={() => setTheme(isDark ? "light" : "dark")} aria-label="تغییر تم">
              {isDark ? <Sun className="h-5 w-5 text-amber-400" /> : <Moon className="h-5 w-5 text-slate-500" />}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2.5 rounded-full border bg-card py-1 pl-3 pr-1.5 transition-shadow hover:shadow-md" aria-label="منوی کاربر">
                  <NameAvatar name={user.name} family={user.family} color={user.avatarColor} size={32} />
                  <span className="hidden text-right sm:block">
                    <span className="block text-xs font-bold leading-4">{user.name} {user.family}</span>
                    <span className="block text-[10px] text-muted-foreground leading-4">{user.roles[0] ?? "کاربر"}</span>
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>
                  <p className="text-sm font-bold">{user.name} {user.family}</p>
                  <p className="text-xs font-normal text-muted-foreground mt-0.5" dir="ltr">{user.username}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("profile")} className="gap-2">
                  <UserRound className="h-4 w-4" /> پروفایل من
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("tickets")} className="gap-2">
                  <LifeBuoy className="h-4 w-4" /> پشتیبانی
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    await fetch("/api/auth/logout", { method: "POST" });
                    window.location.reload();
                  }}
                  className="gap-2 text-rose-600 focus:text-rose-600 dark:text-rose-400"
                >
                  <LogOut className="h-4 w-4" /> خروج از حساب
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* محتوا */}
        <main className="flex-1 px-4 py-6 lg:px-8">
          <div className="mx-auto max-w-[1400px]">{children}</div>
        </main>

        <footer className="border-t py-4 text-center text-xs text-muted-foreground mt-auto">
          <p>نسخه {BRAND.version} — {BRAND.name}</p>
          <p className="mt-0.5 text-[10.5px] opacity-80">{BRAND.hours} | تلفن: {BRAND.phone}</p>
        </footer>
      </div>
    </div>
  );
}
