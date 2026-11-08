import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail } from "@/lib/server";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const budgets = await db.budget.findMany({
    include: {
      provinces: { include: { province: { select: { title: true } } }, orderBy: { amount: "desc" } },
    },
    orderBy: { id: "asc" },
  });
  const provinces = await db.province.findMany({ select: { id: true, title: true } });
  return ok({ budgets, provinces });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const { title, kind, amount, startDate, endDate } = await req.json();
  if (!title || !amount) return fail("عنوان و سقف سهمیه الزامی است");
  const budget = await db.budget.create({
    data: {
      title, kind: kind ?? "فردی", amount: Number(amount),
      remained: Number(amount), startDate: startDate ? new Date(startDate) : null, endDate: endDate ? new Date(endDate) : null,
    },
  });
  await db.log.create({ data: { userId: user.id, category: "سهمیه", description: `ایجاد سهمیه «${title}»`, level: 2 } });
  return ok(budget);
}
