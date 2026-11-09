import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, resolveAccess, eventScopeWhere } from "@/lib/server";

// =====================================================================
// پوشش داده‌ها — تعداد رکورد و بازهٔ تاریخ هر منبع
// تا «چرا داشبورد خالی است؟» بلافاصله مشخص شود (مثلاً انتقال داده اجرا نشده)
// ---------------------------------------------------------------
// نسخهٔ ۶.۹ — اسکوپ مشاور: فقط جلسات/رزروهای/موارد حادِ خودش و مالیات خودش
// =====================================================================

export async function GET(req: NextRequest) {
  const acc = await resolveAccess(req);
  if (!acc) return fail("UNAUTHORIZED", 401);
  const seeAll = acc.seeAllData;
  const evScope = eventScopeWhere(acc);
  const uid = acc.uid;

  async function settled<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    try { return await fn(); } catch { return fallback; }
  }

  const [events, reserves, users, referrs, sms, centers, services, ems, groupEvents, logs, taxes, budgets, rrequests] = await Promise.all([
    settled(async () => {
      const [c, f] = await Promise.all([
        db.event.count({ where: evScope }),
        db.event.aggregate({ where: evScope, _min: { startDate: true }, _max: { startDate: true } }),
      ]);
      return { count: c, first: f._min.startDate, last: f._max.startDate };
    }, { count: 0, first: null, last: null }),
    settled(async () => {
      const [c, f] = await Promise.all([
        db.eventReserve.count({ where: seeAll ? {} : { event: evScope } }),
        db.eventReserve.aggregate({ where: seeAll ? {} : { event: evScope }, _min: { date: true }, _max: { date: true } }),
      ]);
      return { count: c, first: f._min.date, last: f._max.date };
    }, { count: 0, first: null, last: null }),
    settled(() => (seeAll ? db.user.count() : Promise.resolve(0)), 0),
    settled(() => (seeAll ? db.referr.count() : Promise.resolve(0)), 0),
    settled(() => (seeAll ? db.sms.count() : Promise.resolve(0)), 0),
    settled(() => (seeAll ? db.center.count() : Promise.resolve(0)), 0),
    settled(() => (seeAll ? db.service.count() : Promise.resolve(0)), 0),
    settled(() => db.eventsEms.count({ where: seeAll ? {} : { event: evScope } }), 0),
    settled(() => db.groupEvent.count({ where: seeAll ? {} : { acceptorId: uid } }), 0),
    settled(() => (seeAll ? db.log.count() : Promise.resolve(0)), 0),
    settled(() => (seeAll ? db.consultantTax.count() : db.consultantTax.count({ where: { userId: uid } })), 0),
    settled(() => (seeAll ? db.budget.count() : Promise.resolve(0)), 0),
    settled(() => (seeAll ? db.referrRequest.count() : Promise.resolve(0)), 0),
  ]);

  return ok({
    sources: [
      { key: "events", label: "جلسات مشاوره", count: events.count, first: events.first, last: events.last },
      { key: "group-events", label: "جلسات گروهی", count: groupEvents, first: null, last: null },
      { key: "ems", label: "موارد حاد", count: ems, first: null, last: null },
      { key: "reserves", label: "رزروها", count: reserves.count, first: reserves.first, last: reserves.last },
      { key: "reserve-requests", label: "درخواست‌های رزرو", count: rrequests, first: null, last: null },
      { key: "users", label: "کاربران", count: users, first: null, last: null },
      { key: "referrals", label: "ارجاعات سها", count: referrs, first: null, last: null },
      { key: "sms", label: "پیامک‌ها", count: sms, first: null, last: null },
      { key: "logs", label: "لاگ فعالیت", count: logs, first: null, last: null },
      { key: "taxes", label: "مالیات مشاوران", count: taxes, first: null, last: null },
      { key: "budgets", label: "سهمیه‌ها", count: budgets, first: null, last: null },
      { key: "centers", label: "مراکز", count: centers, first: null, last: null },
      { key: "services", label: "خدمات", count: services, first: null, last: null },
    ],
    checkedAt: new Date().toISOString(),
  });
}
