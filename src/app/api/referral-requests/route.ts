import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail, params } from "@/lib/server";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const { q, status, page, pageSize } = params(req);
  const where: Prisma.ReferrRequestWhereInput = {};
  if (status) where.status = status;
  if (q) where.userName = { contains: q };

  const [total, requests] = await Promise.all([
    db.referrRequest.count({ where }),
    db.referrRequest.findMany({ where, orderBy: { creationDate: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return ok({ total, page, totalPages: Math.ceil(total / pageSize), requests });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const { id, action } = await req.json();
  if (!id) return fail("شناسه درخواست الزامی است");
  const status = action === "approve" ? "تایید شده" : action === "reject" ? "رد شده" : null;
  if (!status) return fail("عملیات نامعتبر");
  await db.referrRequest.update({ where: { id: Number(id) }, data: { status, editionDate: new Date() } });
  return ok();
}
