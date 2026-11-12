import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail, params } from "@/lib/server";
import type { Prisma } from "@prisma/client";

/**
 * ارجاعات سها — نسخهٔ ۶.۱۹: نمایش همهٔ آیتم‌ها (بدون خلاصه‌سازی)
 * فیلترها: جستجو، وضعیت، استان، شهر، مرکز، بازهٔ تاریخ
 * خروجی: همهٔ فیلدهای رکورد + نام استان/شهر/مرکز/خدمت + پذیرنده + تاریخچهٔ پیگیری
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const { q, status, provinceId, centerId, from, to, page, pageSize } = params(req);
  const cityId = req.nextUrl.searchParams.get("cityId") ?? "";

  const where: Prisma.ReferrWhereInput = {};
  if (status) where.status = status;
  if (provinceId) where.provinceId = Number(provinceId) || -1;
  if (cityId) where.cityId = Number(cityId) || -1;
  if (centerId) where.centerId = Number(centerId) || -1;
  if (from || to) {
    const cd: Prisma.DateTimeFilter = {};
    if (from) cd.gte = new Date(`${from}T00:00:00.000Z`);
    if (to) cd.lte = new Date(`${to}T23:59:59.999Z`);
    where.creationDate = cd;
  }
  if (q) {
    where.OR = [
      { userName: { contains: q } },
      { refId: { equals: Number(q) || -1 } },
      { userNid: { equals: Number(q) || -1 } },
      { userMobile: { equals: Number(q) || -1 } },
    ];
  }

  const [total, referrs, statusAgg, provinces, cities, centers] = await Promise.all([
    db.referr.count({ where }),
    db.referr.findMany({
      where,
      include: {
        service: { select: { short: true, name: true } },
        followUps: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { creationDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.referr.groupBy({ by: ["status"], _count: true }),
    db.province.findMany({ select: { id: true, title: true } }),
    db.city.findMany({ select: { id: true, title: true } }),
    db.center.findMany({ select: { id: true, title: true } }),
  ]);

  // نام کاربران (پذیرنده / پیگیری‌کننده) در یک فراخوانی
  const userIds = new Set<number>();
  for (const r of referrs) {
    if (r.acceptorId) userIds.add(r.acceptorId);
    for (const f of r.followUps) userIds.add(f.userId);
  }
  const users = userIds.size
    ? await db.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, name: true, family: true } })
    : [];
  const userMap = new Map(users.map((u) => [u.id, `${u.name} ${u.family}`.trim()]));
  const pMap = new Map(provinces.map((p) => [p.id, p.title]));
  const cMap = new Map(cities.map((c) => [c.id, c.title]));
  const ctrMap = new Map(centers.map((c) => [c.id, c.title]));

  const rows = referrs.map((r) => ({
    id: r.id,
    refId: String(r.refId),
    userId: r.userId,
    userName: r.userName,
    userNid: r.userNid === null ? null : String(r.userNid),
    userMobile: r.userMobile === null ? null : String(r.userMobile),
    provinceId: r.provinceId,
    cityId: r.cityId,
    centerId: r.centerId,
    provinceTitle: pMap.get(r.provinceId) ?? null,
    cityTitle: r.cityId ? cMap.get(r.cityId) ?? null : null,
    centerTitle: r.centerId ? ctrMap.get(r.centerId) ?? null : null,
    serviceId: r.serviceId,
    service: r.service,
    description: r.description,
    isReferr: r.isReferr,
    acceptorId: r.acceptorId,
    acceptorName: r.acceptorId ? userMap.get(r.acceptorId) ?? null : null,
    sessionsCount: r.sessionsCount,
    status: r.status,
    creationDate: r.creationDate,
    followUps: r.followUps.map((f) => ({
      id: f.id,
      userId: f.userId,
      userName: userMap.get(f.userId) ?? "کاربر",
      comment: f.comment,
      createdAt: f.createdAt,
    })),
  }));

  return ok({
    total,
    page,
    totalPages: Math.ceil(total / pageSize),
    referrs: rows,
    statusAgg: statusAgg.map((s) => ({ status: s.status, count: s._count })),
  });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const body = await req.json();
  const { id, action } = body;
  if (!id) return fail("شناسه ارجاع الزامی است");

  if (action === "accept") {
    const referr = await db.referr.update({ where: { id: Number(id) }, data: { status: "پذیرش‌شده", isReferr: true, acceptorId: user.id } });
    await db.referrFollowUp.create({ data: { referrId: referr.id, userId: user.id, comment: "ارجاع توسط سامانه پذیرش شد." } });
    return ok(referr);
  }
  if (action === "followup") {
    const { comment } = body;
    if (!comment?.trim()) return fail("متن پیگیری الزامی است");
    await db.referrFollowUp.create({ data: { referrId: Number(id), userId: user.id, comment: comment.trim() } });
    return ok();
  }
  if (action === "edit") {
    // ویرایش کامل رکورد ارجاع — وضعیت، استان، شهر، مرکز، توضیحات، تعداد جلسات، پذیرنده
    const data: Prisma.ReferrUpdateInput = {};
    if (typeof body.status === "string" && body.status.trim()) data.status = body.status.trim();
    if (body.provinceId !== undefined) data.provinceId = Number(body.provinceId) || 1;
    if (body.cityId !== undefined) data.cityId = body.cityId === null || body.cityId === "" ? null : Number(body.cityId);
    if (body.centerId !== undefined) data.centerId = body.centerId === null || body.centerId === "" ? null : Number(body.centerId);
    if (typeof body.description === "string") data.description = body.description.trim() || null;
    if (body.sessionsCount !== undefined) data.sessionsCount = Math.max(0, Number(body.sessionsCount) || 0);
    if (body.acceptorId !== undefined) data.acceptorId = body.acceptorId === null || body.acceptorId === "" ? null : Number(body.acceptorId);
    if (Object.keys(data).length === 0) return fail("فیلدی برای ویرایش ارسال نشده است");
    const referr = await db.referr.update({ where: { id: Number(id) }, data });
    await db.referrFollowUp.create({ data: { referrId: referr.id, userId: user.id, comment: "ویرایش رکورد ارجاع توسط " + user.name + (user.family ? " " + user.family : "") } });
    return ok(referr);
  }
  return fail("عملیات نامعتبر");
}
