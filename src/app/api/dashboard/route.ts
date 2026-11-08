import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail } from "@/lib/server";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);

  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 86400000);
  const prevMonthStart = new Date(now.getTime() - 60 * 86400000);

  const [
    totalEvents, confirmedEvents, pendingEvents, rejectedEvents, undoneEvents,
    totalUsers, totalCenters, totalConsultants,
    pendingReferrals, openEms, activeBudgets,
    eventsThisMonth, eventsPrevMonth,
    serviceCounts, recentEvents, upcomingReserves, monthlySeries, statusCounts,
  ] = await Promise.all([
    db.event.count(),
    db.event.count({ where: { status: "تایید نهایی" } }),
    db.event.count({ where: { status: { contains: "در انتظار" } } }),
    db.event.count({ where: { status: "رد شده" } }),
    db.event.count({ where: { status: "ناتمام" } }),
    db.user.count(),
    db.center.count({ where: { isEnabled: true } }),
    db.user.count({ where: { roles: { some: { role: { title: { in: ["مشاور", "روانپزشک"] } } } } } }),
    db.referr.count({ where: { status: "در انتظار" } }),
    db.eventsEms.count({ where: { hadPaymentStatus: { in: ["در انتظار بررسی", "تایید شده"] } } }),
    db.budget.findMany({ where: { isActive: true }, take: 6 }),
    db.event.count({ where: { startDate: { gte: monthAgo } } }),
    db.event.count({ where: { startDate: { gte: prevMonthStart, lt: monthAgo } } }),
    db.event.groupBy({ by: ["serviceId"], where: { status: "تایید نهایی" }, _count: true }),
    db.event.findMany({
      orderBy: { startDate: "desc" }, take: 8,
      include: { user: { select: { name: true, family: true, avatarColor: true } }, service: { select: { short: true } }, center: { select: { cityTitle: true } } },
    }),
    db.eventReserve.findMany({
      where: { date: { gte: now } }, orderBy: { date: "asc" }, take: 6,
      include: {
        event: { include: { user: { select: { name: true, family: true } } } },
      },
    }),
    db.event.findMany({
      where: { startDate: { gte: new Date(now.getTime() - 330 * 86400000) }, status: "تایید نهایی" },
      select: { startDate: true },
    }),
    db.event.groupBy({ by: ["status"], _count: true }),
  ]);

  const services = await db.service.findMany();
  const serviceDist = serviceCounts
    .map((s) => ({ name: services.find((x) => x.id === s.serviceId)?.short ?? "—", value: s._count }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // سری ماهانه ۱۱ ماه اخیر
  const monthMap = new Map<string, number>();
  for (let i = 10; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthMap.set(`${d.getFullYear()}-${d.getMonth()}`, 0);
  }
  for (const ev of monthlySeries) {
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
    statusDist: statusCounts.map((s) => ({ name: s.status, value: s._count })),
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
