import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail, params } from "@/lib/server";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const { q, status, page, pageSize } = params(req);

  const where: Prisma.ReferrWhereInput = {};
  if (status) where.status = status;
  if (q) {
    where.OR = [
      { userName: { contains: q } },
      { refId: { equals: Number(q) || -1 } },
      { userNid: { equals: Number(q) || -1 } },
    ];
  }

  const [total, referrs, statusAgg] = await Promise.all([
    db.referr.count({ where }),
    db.referr.findMany({
      where,
      include: { service: { select: { short: true, name: true } } },
      orderBy: { creationDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.referr.groupBy({ by: ["status"], _count: true }),
  ]);
  return ok({ total, page, totalPages: Math.ceil(total / pageSize), referrs, statusAgg: statusAgg.map((s) => ({ status: s.status, count: s._count })) });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const { id, action, comment } = await req.json();
  if (!id) return fail("شناسه ارجاع الزامی است");

  if (action === "accept") {
    const referr = await db.referr.update({ where: { id: Number(id) }, data: { status: "پذیرش‌شده", isReferr: true, acceptorId: user.id } });
    await db.referrFollowUp.create({ data: { referrId: referr.id, userId: user.id, comment: "ارجاع توسط سامانه پذیرش شد." } });
    return ok(referr);
  }
  if (action === "followup") {
    if (!comment?.trim()) return fail("متن پیگیری الزامی است");
    await db.referrFollowUp.create({ data: { referrId: Number(id), userId: user.id, comment: comment.trim() } });
    return ok();
  }
  return fail("عملیات نامعتبر");
}
