import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { guardAction, ok, scopeCenterIds } from "@/lib/server";
import { ensureRoseClinics, bankErrorSummary } from "@/lib/banks";

/**
 * اطلس مراکز رز — وضعیت و عملکرد هر مرکز/کلینیک روی نقشهٔ ایران (نسخهٔ ۶.۱۲)
 * خروجی با دامنهٔ دسترسی کاربر فیلتر می‌شود (مدیر استان/کلینیک فقط مراکز خودش).
 */
export async function GET(req: NextRequest) {
  const g = await guardAction(req, "atlas", "view", "اطلس مراکز رز");
  if (g.error) return g.error;

  // اگر مراکز رز هنوز از نقشهٔ ایران وارد نشده باشند، خودکار بارگذاری می‌شوند (نسخهٔ ۶.۱۳)
  // نسخهٔ ۶.۱۴ — خطای درون‌ریزی دیگر بی‌صدا نیست
  const bank = await ensureRoseClinics().catch((e: unknown) => ({
    imported: 0, updated: 0, total: 0, skipped: false,
    errors: [e instanceof Error ? e.message.slice(0, 200) : "خطای نامشخص درون‌ریزی"],
  }));
  const bankError = bankErrorSummary(bank);
  if (bankError) console.error("[atlas] خطای درون‌ریزی خودکار:", bankError);

  const centerIds = await scopeCenterIds(g.acc);
  const centerWhere = centerIds ? { id: { in: centerIds } } : {};

  const centers = await db.center.findMany({
    where: centerWhere,
    orderBy: { title: "asc" },
    select: {
      id: true, title: true, isEnabled: true, address: true, tel: true,
      provinceId: true, provinceTitle: true, cityId: true, cityTitle: true,
      postalCode: true, managerName: true, managerPhone: true, workingHours: true,
      latitude: true, longitude: true, mapUrl: true,
      _count: { select: { events: true, staff: true } },
    },
  });

  const ids = centers.map((c) => c.id);

  // عملکرد: جلسات تاییدشده، درآمد، آخرین فعالیت، متقاضیان یکتا
  const [perf, emsRows, applicantRows] = await Promise.all([
    db.event.groupBy({
      by: ["centerId"],
      where: { centerId: { in: ids }, status: "تایید نهایی" },
      _count: { _all: true },
      _sum: { userTariff: true },
      _max: { startDate: true },
    }),
    db.eventsEms.findMany({
      where: { event: { centerId: { in: ids } } },
      select: { event: { select: { centerId: true } } },
    }),
    db.event.findMany({
      where: { centerId: { in: ids } },
      select: { centerId: true, userId: true },
      distinct: ["centerId", "userId"],
    }),
  ]);

  const perfMap = new Map(perf.map((p) => [Number(p.centerId), p]));
  const emsMap = new Map<number, number>();
  for (const e of emsRows) {
    const cid = Number(e.event.centerId);
    emsMap.set(cid, (emsMap.get(cid) ?? 0) + 1);
  }
  const applicantMap = new Map<number, number>();
  for (const a of applicantRows) {
    const cid = Number(a.centerId);
    applicantMap.set(cid, (applicantMap.get(cid) ?? 0) + 1);
  }

  const items = centers.map((c) => {
    const p = perfMap.get(c.id);
    const income = p?._sum.userTariff ?? 0;
    const sessions = p?._count._all ?? 0;
    return {
      id: c.id, title: c.title, isEnabled: c.isEnabled,
      provinceId: c.provinceId, provinceTitle: c.provinceTitle,
      cityTitle: c.cityTitle, address: c.address, tel: c.tel,
      postalCode: c.postalCode, managerName: c.managerName, managerPhone: c.managerPhone,
      workingHours: c.workingHours, latitude: c.latitude, longitude: c.longitude,
      mapUrl: c.mapUrl,
      staffCount: c._count.staff,
      totalEvents: c._count.events,
      confirmedSessions: sessions,
      income, emsCount: emsMap.get(c.id) ?? 0,
      applicants: applicantMap.get(c.id) ?? 0,
      lastActivity: p?._max.startDate ?? null,
    };
  });

  const totals = {
    centers: items.length,
    active: items.filter((i) => i.isEnabled).length,
    sessions: items.reduce((s, i) => s + i.confirmedSessions, 0),
    income: items.reduce((s, i) => s + i.income, 0),
    applicants: items.reduce((s, i) => s + i.applicants, 0),
    ems: items.reduce((s, i) => s + i.emsCount, 0),
    staff: items.reduce((s, i) => s + i.staffCount, 0),
    provinces: new Set(items.map((i) => i.provinceId)).size,
  };

  return ok({ items, totals, bankError });
}
