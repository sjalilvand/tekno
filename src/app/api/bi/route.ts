import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail } from "@/lib/server";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);

  const [provinceEvents, serviceTotals, centerPerf, statusDist, genderDist, emsSev, budgetRows] = await Promise.all([
    db.event.groupBy({
      by: ["centerId"], where: { status: "تایید نهایی" }, _count: true,
    }),
    db.event.groupBy({ by: ["serviceId"], _count: true, where: { status: "تایید نهایی" } }),
    db.event.groupBy({
      by: ["centerId"], where: { status: "تایید نهایی" },
      _count: true, _sum: { acceptorFee: true, userTariff: true },
    }),
    db.event.groupBy({ by: ["status"], _count: true }),
    db.user.groupBy({ by: ["gender"], _count: true }),
    db.eventsEms.groupBy({ by: ["severity"], _count: true }),
    db.budget.findMany({ where: { isActive: true }, include: { provinces: { include: { province: { select: { title: true } } } } } }),
  ]);

  const centers = await db.center.findMany({ select: { id: true, title: true, provinceTitle: true } });
  const services = await db.service.findMany();
  const provinces = await db.province.findMany({ select: { id: true, title: true } });

  // آمار به تفکیک استان
  const byProvince = new Map<string, number>();
  for (const pe of provinceEvents) {
    const c = centers.find((x) => x.id === pe.centerId);
    if (!c) continue;
    byProvince.set(c.provinceTitle, (byProvince.get(c.provinceTitle) ?? 0) + pe._count);
  }
  const provinceStats = Array.from(byProvince.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);

  const serviceStats = serviceTotals
    .map((s) => ({ name: services.find((x) => x.id === s.serviceId)?.short ?? "—", value: s._count }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const centerStats = centerPerf
    .map((c) => {
      const center = centers.find((x) => x.id === c.centerId);
      return {
        name: center?.title ?? "—", province: center?.provinceTitle ?? "",
        sessions: c._count, income: c._sum.userTariff ?? 0, consultantFee: c._sum.acceptorFee ?? 0,
      };
    })
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 10);

  // مصرف سهمیه‌ها
  const budgetStats = budgetRows.map((b) => ({
    title: b.title, amount: b.amount, used: b.used, reserved: b.reserved,
    pct: b.amount ? Math.round((b.used / b.amount) * 100) : 0,
    provinces: b.provinces.map((p) => ({ title: p.province.title, amount: p.amount, used: p.used, pct: p.amount ? Math.round((p.used / p.amount) * 100) : 0 })).sort((x, y) => y.pct - x.pct).slice(0, 5),
  }));

  return ok({
    provinceStats,
    serviceStats,
    centerStats,
    statusDist: statusDist.map((s) => ({ name: s.status, value: s._count })),
    genderDist: genderDist.map((g) => ({ name: g.gender ?? "نامشخص", value: g._count })),
    emsSev: emsSev.map((e) => ({ name: e.severity, value: e._count })),
    budgetStats,
  });
}
