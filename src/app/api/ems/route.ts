import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, params, resolveAccess, guardAction, childEventScopeWhere, eventScopeWhere } from "@/lib/server";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const acc = await resolveAccess(req);
  if (!acc) return fail("UNAUTHORIZED", 401);
  const { q, page, pageSize } = params(req);

  // اسکوپ داده (نسخهٔ ۶.۱۱) — موارد حادِ جلسات در محدودهٔ مجاز
  // از رابطهٔ «event» — ستون‌های Event مستقیم روی EventsEms وجود ندارند
  const where: Prisma.EventsEmsWhereInput = childEventScopeWhere(acc);
  if (q) {
    where.OR = [
      { event: { user: { name: { contains: q } } } },
      { event: { user: { family: { contains: q } } } },
      { event: { trackingCode: { equals: Number(q) || -1 } } },
    ];
  }

  const [total, ems, sevAgg, payAgg] = await Promise.all([
    db.eventsEms.count({ where }),
    db.eventsEms.findMany({
      where,
      include: {
        event: {
          select: {
            id: true, trackingCode: true, startDate: true,
            user: { select: { name: true, family: true, avatarColor: true, nid: true } },
            center: { select: { title: true, cityTitle: true } },
          },
        },
        comments: { orderBy: { date: "desc" }, take: 3 },
      },
      orderBy: { dateTime: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.eventsEms.groupBy({ by: ["severity"], _count: true }),
    db.eventsEms.groupBy({ by: ["hadPaymentStatus"], _count: true, _sum: { hadPaymentAmount: true } }),
  ]);
  return ok({ total, page, totalPages: Math.ceil(total / pageSize), ems, sevAgg, payAgg });
}

export async function PATCH(req: NextRequest) {
  // سطح دسترسی عملیاتی — بررسی مورد حاد = ویرایش (نسخهٔ ۶.۵)
  const g = await guardAction(req, "ems", "edit", "موارد حاد (EMS)");
  if (g.error) return g.error;
  const user = g.acc.user;
  const { id, status, amount, comment } = await req.json();
  if (!id) return fail("شناسه مورد حاد الزامی است");
  const data: Record<string, unknown> = { confirmedByUserId: user.id };
  if (status) data.hadPaymentStatus = status;
  if (amount !== undefined) data.hadPaymentAmount = Number(amount);
  if (comment) data.hadPaymentDescription = comment;
  await db.eventsEms.update({ where: { id: Number(id) }, data });
  await db.log.create({ data: { userId: user.id, category: "موارد حاد", description: `بررسی مورد حاد #${id}`, level: 3 } });
  return ok();
}

// =====================================================================
// ثبت مورد حاد جدید (نسخهٔ ۶.۱۱)
// POST /api/ems
//   { eventId, severity, emsType?, suicidalFrom?, psychiatricDisorders?,
//     socialFactors?, protectiveFactors?, suggestedActions?, actionsTaken?,
//     financialAssistanceRequest?, description? }
// • جلسه باید در محدودهٔ دادهٔ کاربر باشد؛ جلسه «مورد حاد» علامت می‌خورد
// • فهرست‌ها به‌صورت JSON در همان ستون‌های سازگار با سامانهٔ قدیمی ذخیره می‌شوند
// =====================================================================

const SEVERITIES = ["کم", "متوسط", "بالا"];
const JSON_FIELDS = [
  "emsType", "suicidalFrom", "psychiatricDisorders", "socialFactors", "protectiveFactors", "suggestedActions",
] as const;

function toJson(value: unknown): string | null {
  if (Array.isArray(value)) {
    const arr = value.map((v) => String(v).slice(0, 120)).filter(Boolean);
    return arr.length ? JSON.stringify(arr) : null;
  }
  if (typeof value === "string" && value.trim()) return JSON.stringify([value.trim().slice(0, 120)]);
  return null;
}

export async function POST(req: NextRequest) {
  const g = await guardAction(req, "ems", "create", "موارد حاد (EMS)");
  if (g.error) return g.error;
  const acc = g.acc;
  const user = acc.user;
  const body = await req.json().catch(() => null);
  if (!body) return fail("BAD_REQUEST");

  const eventId = Number(body.eventId);
  if (!eventId) return fail("انتخاب جلسه الزامی است");
  const event = await db.event.findFirst({
    where: { id: eventId, ...eventScopeWhere(acc) },
    select: { id: true, userId: true, acceptorId: true, isEms: true },
  });
  if (!event) return fail("این جلسه در محدودهٔ دسترسی شما نیست", 403);

  const severity = SEVERITIES.includes(body.severity) ? body.severity : "متوسط";
  const data: Record<string, unknown> = {
    eventId: event.id,
    secretaryNID: user.nid,
    severity,
    dateTime: body.dateTime ? new Date(body.dateTime) : new Date(),
    financialAssistanceRequest: body.financialAssistanceRequest ? 1 : 0,
    hadPaymentStatus: body.financialAssistanceRequest ? "در انتظار بررسی" : "بدون درخواست",
    hadPaymentAmount: 0,
  };
  for (const f of JSON_FIELDS) {
    const j = toJson(body[f]);
    if (j) data[f] = j;
  }
  if (body.actionsTaken) data.actionsTaken = String(body.actionsTaken).slice(0, 2000);
  if (body.description) data.hadPaymentDescription = String(body.description).slice(0, 1000);

  const ems = await db.eventsEms.create({ data: { ...data, eventId: event.id } as any, select: { id: true, severity: true } });
  if (!event.isEms) await db.event.update({ where: { id: event.id }, data: { isEms: true } });
  await db.log.create({
    data: { userId: acc.uid, category: "موارد حاد", description: `ثبت مورد حاد #${ems.id} برای جلسه #${event.id} (شدت: ${severity})`, level: 3 },
  });
  return ok({ ems });
}
