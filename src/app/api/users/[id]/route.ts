import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail } from "@/lib/server";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const { id } = await ctx.params;
  const uid = Number(id);

  const target = await db.user.findUnique({
    where: { id: uid },
    include: {
      roles: { include: { role: true } },
      province: true, education: true, marriage: true,
    },
  });
  if (!target) return fail("کاربر یافت نشد", 404);

  const [events, taxes, consultantEdu, courses, logs, sessions] = await Promise.all([
    db.event.findMany({
      where: { OR: [{ userId: uid }, { acceptorId: uid }] },
      orderBy: { startDate: "desc" }, take: 15,
      include: { service: { select: { short: true } }, center: { select: { cityTitle: true } } },
    }),
    db.consultantTax.findMany({ where: { userId: uid }, orderBy: [{ year: "desc" }, { month: "desc" }], take: 12 }),
    db.consultantEducation.findMany({ where: { userId: uid } }),
    db.consultantCourse.findMany({ where: { userId: uid } }),
    db.log.findMany({ where: { userId: uid }, orderBy: { timestamp: "desc" }, take: 10 }),
    db.session.findMany({ where: { userId: uid }, orderBy: { dateTime: "desc" }, take: 5 }),
  ]);

  const { passwordHash: _ph, ...safeUser } = target;
  return ok({ user: safeUser, events, taxes, consultantEdu, courses, logs, sessions });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const { id } = await ctx.params;
  const body = await req.json();

  const data: Record<string, unknown> = {};
  if (typeof body.blocked === "boolean") data.blocked = body.blocked;
  if (typeof body.confirm === "number") data.confirm = body.confirm;
  if (typeof body.name === "string" && body.name) data.name = body.name;
  if (typeof body.family === "string" && body.family) data.family = body.family;
  if (typeof body.email === "string") data.email = body.email;
  if (body.mobile) data.mobile = Number(body.mobile);
  if (body.bio !== undefined) data.bio = body.bio;

  const updated = await db.user.update({ where: { id: Number(id) }, data });
  await db.log.create({
    data: { userId: user.id, category: "ویرایش کاربر", description: `ویرایش پرونده کاربر #${id}`, level: 2, ip: req.headers.get("x-forwarded-for") ?? "-" },
  });
  return ok({ id: updated.id });
}
