import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, params, resolveAccess, applyEventScope, guardAction, scopeCenterIds } from "@/lib/server";
import { hashPassword } from "@/lib/server";
import type { Prisma } from "@prisma/client";

const selectEvent = {
  id: true, trackingCode: true, startDate: true, endDate: true, status: true,
  weight: true, userTariff: true, topic: true, isGroup: true,
  user: { select: { id: true, name: true, family: true, avatarColor: true, nid: true, mobile: true } },
  acceptor: { select: { id: true, name: true, family: true, consultantLevel: true } },
  service: { select: { id: true, short: true, name: true } },
  center: { select: { id: true, title: true, cityTitle: true, provinceTitle: true } },
} as const;

export async function GET(req: NextRequest) {
  const acc = await resolveAccess(req);
  if (!acc) return fail("UNAUTHORIZED", 401);
  const { q, status, serviceId, centerId, page, pageSize } = params(req);
  const view = req.nextUrl.searchParams.get("view") ?? "all"; // all | pending | done | rejected | undone

  // اسکوپ مشاور — فقط جلسات خودش (مشاور/ناظر)؛ با AND تا جستجو دورش نزند
  const where: Prisma.EventWhereInput = applyEventScope({}, acc);
  if (status) where.status = status;
  else if (view === "pending") where.status = { contains: "در انتظار" };
  else if (view === "done") where.status = "تایید نهایی";
  else if (view === "rejected") where.status = "رد شده";
  else if (view === "undone") where.status = "ناتمام";
  if (serviceId) where.serviceId = Number(serviceId);
  if (centerId) where.centerId = Number(centerId);
  if (q) {
    where.OR = [
      { topic: { contains: q } },
      { trackingCode: { equals: Number(q) || -1 } },
      { user: { OR: [{ name: { contains: q } }, { family: { contains: q } }] } },
      { nid: { equals: Number(q) || -1 } },
    ];
  }

  const [total, events, statusAgg] = await Promise.all([
    db.event.count({ where }),
    db.event.findMany({
      where, orderBy: { startDate: "desc" },
      skip: (page - 1) * pageSize, take: pageSize,
      select: selectEvent,
    }),
    // نسخهٔ ۶.۱۰ — آمار وضعیت هم در همان محدودهٔ دادهٔ کاربر
    db.event.groupBy({ by: ["status"], _count: true, where: applyEventScope({}, acc) }),
  ]);

  return ok({
    total, page, totalPages: Math.ceil(total / pageSize), events,
    statusAgg: statusAgg.map((s) => ({ status: s.status, count: s._count })),
  });
}

// =====================================================================
// ثبت جلسه جدید (نسخهٔ ۶.۱۱)
// POST /api/events
//   { userId?, newClient?{nid,name,family,mobile,gender?}, serviceId, centerId,
//     startDate (ISO), topic?, description?, userTariff?, done?, acceptorId? }
// • مشاور: پذیرنده خودش + کلینیک در محدودهٔ عضویت
// • مدیر کلینیک/استان/سامانه: انتخاب پذیرنده آزاد در محدودهٔ خود
// • متقاضی جدید همزمان ساخته می‌شود (ورود با کد ملی + رمز 123456)
// =====================================================================

const DEFAULT_CLIENT_PASSWORD = "123456";

async function findOrCreateClient(
  acc: { uid: number; user: { id: number } },
  body: {
    userId?: number | string;
    newClient?: { nid?: string | number; name?: string; family?: string; mobile?: string | number; gender?: string };
  },
): Promise<{ id: number; nid: bigint; name: string; family: string } | { error: string }> {
  if (body.userId) {
    const u = await db.user.findUnique({
      where: { id: Number(body.userId) },
      select: { id: true, nid: true, name: true, family: true },
    });
    if (!u) return { error: "متقاضی انتخاب‌شده یافت نشد" };
    return u;
  }
  const nc = body.newClient;
  const nidDigits = String(nc?.nid ?? "").replace(/\D/g, "");
  const name = String(nc?.name ?? "").trim();
  const family = String(nc?.family ?? "").trim();
  const mobileDigits = String(nc?.mobile ?? "").replace(/\D/g, "");
  if (nidDigits.length < 8) return { error: "کد ملی متقاضی باید حداقل ۸ رقم باشد" };
  if (!name || !family) return { error: "نام و نام خانوادگی متقاضی الزامی است" };
  if (mobileDigits.length < 10) return { error: "شماره موبایل متقاضی نامعتبر است" };

  const nid = BigInt(nidDigits);
  const existing = await db.user.findUnique({ where: { nid }, select: { id: true, nid: true, name: true, family: true } });
  if (existing) return existing; // قبلاً ثبت شده — از همان پرونده استفاده می‌شود

  // نام کاربری یکتا بر پایهٔ کد ملی
  let username = nidDigits;
  let suffix = 0;
  while (await db.user.findUnique({ where: { username }, select: { id: true } })) {
    suffix += 1;
    username = `${nidDigits}${suffix}`;
  }
  const created = await db.user.create({
    data: {
      nid, username,
      passwordHash: hashPassword(DEFAULT_CLIENT_PASSWORD),
      name, family,
      gender: nc?.gender === "مرد" || nc?.gender === "زن" ? nc.gender : null,
      mobile: BigInt(mobileDigits),
    },
    select: { id: true, nid: true, name: true, family: true },
  });
  await db.log.create({
    data: { userId: acc.uid, category: "کاربران", description: `ثبت متقاضی جدید «${name} ${family}» هنگام ثبت جلسه`, level: 2 },
  });
  return created;
}

export async function POST(req: NextRequest) {
  const g = await guardAction(req, "events", "create", "جلسات مشاوره");
  if (g.error) return g.error;
  const acc = g.acc;
  const body = await req.json().catch(() => null);
  if (!body) return fail("BAD_REQUEST");

  // ---- متقاضی (موجود یا جدید)
  const client = await findOrCreateClient(acc, body);
  if ("error" in client) return fail(client.error);

  // ---- خدمت و مرکز
  const serviceId = Number(body.serviceId);
  if (!serviceId) return fail("انتخاب خدمت الزامی است");
  const service = await db.service.findUnique({ where: { id: serviceId }, select: { id: true, weight: true } });
  if (!service) return fail("خدمت انتخاب‌شده یافت نشد");

  const centerId = Number(body.centerId);
  if (!centerId) return fail("انتخاب کلینیک/مرکز الزامی است");
  const center = await db.center.findUnique({ where: { id: centerId }, select: { id: true, title: true } });
  if (!center) return fail("مرکز انتخاب‌شده یافت نشد");
  const allowedCenters = await scopeCenterIds(acc);
  if (allowedCenters !== null && !allowedCenters.includes(centerId))
    return fail("این کلینیک در محدودهٔ دسترسی شما نیست", 403);

  // ---- پذیرنده بر اساس دامنهٔ دسترسی
  let acceptorId: number | null = null;
  if (acc.seeAllData || acc.scope.kind === "province" || acc.scope.kind === "center") {
    if (body.acceptorId) {
      const ac = await db.user.findUnique({ where: { id: Number(body.acceptorId) }, select: { id: true } });
      if (!ac) return fail("مشاور پذیرنده یافت نشد");
      acceptorId = ac.id;
    }
  } else {
    acceptorId = acc.uid; // مشاور — جلسه به نام خودش
  }

  // ---- تاریخ جلسه
  let startDate: Date | null = null;
  if (body.startDate) {
    const d = new Date(body.startDate);
    if (isNaN(d.getTime())) return fail("تاریخ جلسه نامعتبر است");
    startDate = d;
  }

  const done = Boolean(body.done);
  const now = new Date();
  const trackingCode = Number(String(Date.now()).slice(-9));

  const event = await db.event.create({
    data: {
      userId: client.id,
      nid: client.nid,
      trackingCode,
      centerId,
      serviceId,
      userTariff: Math.max(0, Number(body.userTariff ?? 0) || 0),
      topic: body.topic ? String(body.topic).slice(0, 200) : null,
      description: body.description ? String(body.description).slice(0, 2000) : null,
      startDate: startDate ?? now,
      endDate: done ? (startDate ?? now) : null,
      status: done ? "در انتظار تایید مدیر مرکز" : "در انتظار پذیرش",
      acceptorId,
      acceptorLevel: acceptorId ? 1 : 1,
      weight: service.weight ?? 1,
      isEms: false,
    },
    select: { id: true, trackingCode: true, status: true },
  });
  await db.log.create({
    data: { userId: acc.uid, category: "جلسات", description: `ثبت جلسه #${event.id} برای «${client.name} ${client.family}»`, level: 2 },
  });
  return ok({ event, client: { id: client.id, name: client.name, family: client.family } });
}
