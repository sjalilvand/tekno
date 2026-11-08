import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail } from "@/lib/server";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const [occasions, helps] = await Promise.all([
    db.specialOccasion.findMany({ orderBy: { displayDate: "desc" } }),
    db.help.findMany({ orderBy: { id: "asc" } }),
  ]);
  return ok({ occasions, helps });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const { title, displayDate } = await req.json();
  if (!title || !displayDate) return fail("عنوان و تاریخ الزامی است");
  const occasion = await db.specialOccasion.create({
    data: { title, displayDate: new Date(displayDate), createdByUserId: user.id },
  });
  return ok(occasion);
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const { id, isActive } = await req.json();
  if (!id) return fail("شناسه الزامی است");
  await db.specialOccasion.update({ where: { id: Number(id) }, data: { isActive: Boolean(isActive) } });
  return ok();
}
