import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail, params } from "@/lib/server";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const { q, status, page, pageSize } = params(req);

  const where: Prisma.SmsWhereInput = {};
  if (status) where.status = status;
  if (q) where.message = { contains: q };

  const [total, sms, statusAgg] = await Promise.all([
    db.sms.count({ where }),
    db.sms.findMany({
      where,
      include: {
        sender: { select: { name: true, family: true } },
        receiver: { select: { id: true, name: true, family: true, mobile: true } },
      },
      orderBy: { createTime: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.sms.groupBy({ by: ["status"], _count: true }),
  ]);
  return ok({ total, page, totalPages: Math.ceil(total / pageSize), sms, statusAgg });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const { message, targetRole, targetProvinceId } = await req.json();
  if (!message?.trim()) return fail("متن پیامک الزامی است");

  const where: Prisma.UserWhereInput = {};
  if (targetRole) where.roles = { some: { role: { title: targetRole } } };
  if (targetProvinceId) where.provinceId = Number(targetProvinceId);
  const receivers = await db.user.findMany({ where, select: { id: true }, take: 500 });

  await db.sms.createMany({
    data: receivers.map((r) => ({
      senderId: user.id, receiverId: r.id, message: message.trim(),
      status: "در صف", createTime: new Date(),
    })),
  });
  await db.log.create({ data: { userId: user.id, category: "ارسال پیامک", description: `ارسال گروهی پیامک به ${receivers.length} کاربر`, level: 2 } });
  return ok({ count: receivers.length });
}
