import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, params, guardAction, getCurrentUser } from "@/lib/server";
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

  // مشخصات متقاضی (کد ملی، موبایل، ...) با اتصال به جدول کاربران — برای ستون کاربر و لینک کارتابل
  const userIds = [...new Set(requests.map((r) => r.userId).filter((id) => id > 0))];
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, family: true, nid: true, mobile: true, avatarColor: true },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));
  const withUsers = requests.map((r) => ({ ...r, user: userById.get(r.userId) ?? null }));

  return ok({ total, page, totalPages: Math.ceil(total / pageSize), requests: withUsers });
}

export async function PATCH(req: NextRequest) {
  // سطح دسترسی عملیاتی — تایید/رد درخواست = ویرایش (نسخهٔ ۶.۵)
  const g = await guardAction(req, "referral-requests", "edit", "درخواست‌های رزرو");
  if (g.error) return g.error;
  const { id, action } = await req.json();
  if (!id) return fail("شناسه درخواست الزامی است");
  const status = action === "approve" ? "تایید شده" : action === "reject" ? "رد شده" : null;
  if (!status) return fail("عملیات نامعتبر");
  await db.referrRequest.update({ where: { id: Number(id) }, data: { status, editionDate: new Date() } });
  return ok();
}
