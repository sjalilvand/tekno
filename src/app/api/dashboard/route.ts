import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail } from "@/lib/server";

/**
 * داشبورد اصلی — مقاوم در برابر داده‌های ناقص:
 * هر متریک با allSettled جدا محاسبه می‌شود تا خطای یک بخش
 * (مثلاً ناسازگاری دادهٔ قدیمی) کل داشبورد را نبندد.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);

  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 86400000);
  const prevMonthStart = new Date(now.getTime() - 60 * 86400000);

  /** اجرای امن یک کوئری — در صورت خطا مقدار پیش‌فرض برمی‌گردد */
  async function settled<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      console.error("[dashboard] metric failed:", e?.message ?? e);
      return fallback;
    }
  }

  const [
    totalEvents, confirmedEvents, pendingEvents, rejectedEvents, undoneEvents,
    totalUsers, totalCenters, totalConsultants,
    pendingReferrals, openEms, activeBudgets,
    eventsThisMonth, eventsPrevMonth,
    serviceCounts, recentEvents, upcomingReserves, monthlySeries, statusCounts,
    services,
  ] = await Promise.all([
    settled(() => db.event.count(), 0),
    settled(() => db.event.count({ where: { status: "تایید نهایی" } }), 0),
    settled(() => db.event.count({ where: { status: { contains: "در انتظار" } } }), 0),
    settled(() => db.event.count({ where: { status: "رد شده" } }), 0),
    settled(() => db.event.count({ where: { status: "ناتمام" } }), 0),
    settled(() => db.user.count(), 0),
    settled(() => db.center.count({ where: { isEnabled: true } }), 0),
    settled(() => db.user.count({ where: { roles: { some: { role: { title: { in: ["مشاور", "روانپزشک"] } } } } } }), 0),
    settled(() => db.referr.count({ where: { status: "در انتظار" } }), 0),
    settled(() => db.eventsEms.count({ where: { hadPaymentStatus: { in: ["در انتظار بررسی", "تایید شده"] } } }), 0),
    settled(() => db.budget.findMany({ where: { isActive: true }, take: 6 }), []),
    settled(() => db.event.count({ where: { startDate: { gte: monthAgo } } }), 0),
    settled(() => db.event.count({ where: { startDate: { gte: prevMonthStart, lt: monthAgo } } }), 0),
    settled(() => db.event.groupBy({ by: ["serviceId"], where: { status: "تایید نهایی" }, _count: true }), [] as { serviceId: number; _count: number }[]),
    settled(() => db.event.findMany({
      orderBy: { startDate: "desc" }, take: 8,
      include: { user: { select: { name: true, family: true, avatarColor: true } }, service: { select: { short: true } }, center: { select: { cityTitle: true } } },
    }), []),
    settled(() => db.eventReserve.findMany({
      where: { date: { gte: now } }, orderBy: { date: "asc" }, take: 6,
      include: { event: { include: { user: { select: { name: true, family: true } } } } },
    }), []),
    settled(() => db.event.findMany({
      where: { startDate: { gte: new Date(now.getTime() - 330 * 86400000) }, status: "تایید نهایی" },
      select: { startDate: true },
    }), [] as { startDate: Date | null }[]),
    settled(() => db.event.groupBy({ by: ["status"], _count: true }), [] as { status: string | null; _count: number }[]),
    settled(() => db.service.findMany(), []),
  ]);

  const serviceDist = serviceCounts
    .map((s) => ({ name: services.find((x) => x.id === s.serviceId)?.short ?? "سایر", value: s._count }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // سری ماهانه ۱۱ ماه اخیر
  const monthMap = new Map<string, number>();
  for (let i = 10; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthMap.set(`${d.getFullYear()}-${d.getMonth()}`, 0);
  }
  for (const ev of monthlySeries) {
    if (!ev?.startDate) continue;
    const d = new Date(ev.startDate);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (monthMap.has(key)) monthMap.set(key, (monthMap.get(key) ?? 0) + 1);
  }
  const MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
  const series = Array.from(monthMap.entries()).map(([key, value]) => {
    const [, m] = key.split("-").map(Number);
    return { month: MONTHS[m], value };
  });

  const trend = eventsPrevMonth > 0 ? Math.round(((eventsThisMonth - eventsPrevMonth) / eventsPrevMonth) * 100) : 0;

  return ok({
    kpis: {
      totalEvents: { value: totalEvents, trend },
      confirmedEvents,
      pendingEvents,
      rejectedEvents,
      undoneEvents,
      totalUsers,
      totalCenters,
      totalConsultants,
      pendingReferrals,
      openEms,
    },
    budgets: budgetsList(activeBudgets),
    serviceDist,
    statusDist: statusCounts.map((s) => ({ name: s.status ?? "نامشخص", value: s._count })),
    monthlySeries: series,
    recentEvents,
    upcomingReserves,
  });
}

function budgetsList(budgets: { id: number; title: string; amount: number; used: number; reserved: number; remained: number }[]) {
  return budgets.map((b) => ({
    id: b.id, title: b.title, amount: b.amount, used: b.used,
    reserved: b.reserved, remained: b.remained,
    pct: b.amount ? Math.round((b.used / b.amount) * 100) : 0,
  }));
}
