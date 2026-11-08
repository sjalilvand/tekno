import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail } from "@/lib/server";
import { simulateEvent } from "@/lib/monitoring";
import { jDate } from "@/lib/jalali";

// =====================================================================
// شبیه‌سازی فرایند روی BPMN — برای هر درخواست واقعی
// • GET ?q=کد پیگیری/نام متقاضی : جستجوی جلسات برای انتخاب
// • GET ?eventId=123            : خط زمانی کامل مرحله‌ها برای پویانمایی توکن
// =====================================================================

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const sp = req.nextUrl.searchParams;
  const eventId = sp.get("eventId");
  const q = sp.get("q")?.trim() ?? "";

  if (eventId) {
    const sim = await simulateEvent(Number(eventId));
    if (!sim) return fail("جلسه یافت نشد", 404);
    return ok(sim);
  }

  // جستجوی جلسات — کد پیگیری، نام متقاضی یا آخرین جلسات فعال
  const digits = q.replace(/\D/g, "");
  const rows = await db.event.findMany({
    where: q
      ? {
          OR: [
            ...(digits.length >= 3 ? [{ trackingCode: Number(digits) }, { id: Number(digits) || -1 }] : []),
            { user: { OR: [{ name: { contains: q } }, { family: { contains: q } }] } },
          ],
        }
      : { status: { contains: "در انتظار" } },
    orderBy: { startDate: "desc" },
    take: 12,
    select: {
      id: true, trackingCode: true, status: true, startDate: true, isEms: true,
      user: { select: { name: true, family: true } },
      service: { select: { short: true } },
      center: { select: { title: true } },
    },
  });
  return ok({
    events: rows.map((r) => ({
      id: r.id, trackingCode: r.trackingCode, status: r.status, isEms: r.isEms,
      client: `${r.user.name} ${r.user.family}`,
      service: r.service?.short ?? "—", center: r.center?.title ?? "—",
      startDate: r.startDate ? jDate(r.startDate) : null,
    })),
  });
}
