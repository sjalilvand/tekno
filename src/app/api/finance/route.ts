import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail } from "@/lib/server";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const now = new Date();

  const [feeSums, emsSums, emsPaidCount, monthly, centerIncome, contractIncome] = await Promise.all([
    db.event.aggregate({
      where: { status: "تایید نهایی" },
      _sum: { userTariff: true, acceptorFee: true, supervisorFee: true, centerFee: true, adminFee: true, secretaryFee: true },
      _count: true,
    }),
    db.eventsEms.aggregate({ _sum: { hadPaymentAmount: true } }),
    db.eventsEms.count({ where: { hadPaymentStatus: "پرداخت شده" } }),
    db.event.findMany({
      where: { status: "تایید نهایی", startDate: { gte: new Date(now.getTime() - 330 * 86400000) } },
      select: { startDate: true, userTariff: true, acceptorFee: true, centerFee: true },
    }),
    db.event.groupBy({ by: ["centerId"], where: { status: "تایید نهایی" }, _sum: { userTariff: true }, _count: true, orderBy: { _sum: { userTariff: "desc" } }, take: 8 }),
    db.corporateContractService.aggregate({ _sum: { userTariff: true }, _count: true }),
  ]);

  const centers = await db.center.findMany({ where: { id: { in: centerIncome.map((c) => c.centerId) } }, select: { id: true, title: true } });

  const MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
  const monthMap = new Map<string, { income: number; fee: number; center: number }>();
  for (let i = 10; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthMap.set(`${d.getFullYear()}-${d.getMonth()}`, { income: 0, fee: 0, center: 0 });
  }
  for (const ev of monthly) {
    const d = new Date(ev.startDate);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const m = monthMap.get(key);
    if (m) {
      m.income += ev.userTariff; m.fee += ev.acceptorFee; m.center += ev.centerFee;
    }
  }
  const series = Array.from(monthMap.entries()).map(([key, v]) => {
    const [, mo] = key.split("-").map(Number);
    return { month: MONTHS[mo], ...v };
  });

  return ok({
    totals: {
      gross: feeSums._sum.userTariff ?? 0,
      consultantFees: feeSums._sum.acceptorFee ?? 0,
      supervisorFees: feeSums._sum.supervisorFee ?? 0,
      centerFees: feeSums._sum.centerFee ?? 0,
      adminFees: feeSums._sum.adminFee ?? 0,
      secretaryFees: feeSums._sum.secretaryFee ?? 0,
      events: feeSums._count,
      emsPaid: emsSums._sum.hadPaymentAmount ?? 0,
      emsCount: emsPaidCount,
    },
    series,
    centerIncome: centerIncome.map((c) => ({
      name: centers.find((x) => x.id === c.centerId)?.title ?? "—",
      income: c._sum.userTariff ?? 0, sessions: c._count,
    })),
    contractTotal: contractIncome._count,
  });
}
