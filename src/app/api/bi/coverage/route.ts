import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail } from "@/lib/server";

// =====================================================================
// پوشش داده‌ها — تعداد رکورد و بازهٔ تاریخ هر منبع
// تا «چرا داشبورد خالی است؟» بلافاصله مشخص شود (مثلاً انتقال داده اجرا نشده)
// =====================================================================

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);

  async function settled<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    try { return await fn(); } catch { return fallback; }
  }

  const [events, reserves, users, referrs, sms, centers, services] = await Promise.all([
    settled(async () => {
      const [c, f] = await Promise.all([
        db.event.count(),
        db.event.aggregate({ _min: { startDate: true }, _max: { startDate: true } }),
      ]);
      return { count: c, first: f._min.startDate, last: f._max.startDate };
    }, { count: 0, first: null, last: null }),
    settled(async () => {
      const [c, f] = await Promise.all([
        db.eventReserve.count(),
        db.eventReserve.aggregate({ _min: { date: true }, _max: { date: true } }),
      ]);
      return { count: c, first: f._min.date, last: f._max.date };
    }, { count: 0, first: null, last: null }),
    settled(() => db.user.count(), 0),
    settled(() => db.referr.count(), 0),
    settled(() => db.sms.count(), 0),
    settled(() => db.center.count(), 0),
    settled(() => db.service.count(), 0),
  ]);

  return ok({
    sources: [
      { key: "events", label: "جلسات مشاوره", count: events.count, first: events.first, last: events.last },
      { key: "reserves", label: "رزروها", count: reserves.count, first: reserves.first, last: reserves.last },
      { key: "users", label: "کاربران", count: users, first: null, last: null },
      { key: "referrals", label: "ارجاعات سها", count: referrs, first: null, last: null },
      { key: "sms", label: "پیامک‌ها", count: sms, first: null, last: null },
      { key: "centers", label: "مراکز", count: centers, first: null, last: null },
      { key: "services", label: "خدمات", count: services, first: null, last: null },
    ],
    checkedAt: new Date().toISOString(),
  });
}
