import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail } from "@/lib/server";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const tickets = await db.userTicket.findMany({
    include: { user: { select: { name: true, family: true, avatarColor: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return ok({ tickets });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const { subject, text, priority } = await req.json();
  if (!subject?.trim()) return fail("موضوع تیکت الزامی است");
  const ticket = await db.userTicket.create({
    data: { userId: user.id, subject: subject.trim(), text: text?.trim(), priority: priority ?? "متوسط" },
  });
  return ok(ticket);
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const { id, status } = await req.json();
  if (!id || !status) return fail("شناسه و وضعیت الزامی است");
  await db.userTicket.update({ where: { id: Number(id) }, data: { status, updatedAt: new Date() } });
  return ok();
}
