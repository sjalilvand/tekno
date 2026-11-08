import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail } from "@/lib/server";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const settings = await db.setting.findMany({ orderBy: { name: "asc" } });
  const apiTokens = await db.apiToken.findMany();
  const sessions = await db.session.findMany({
    include: { user: { select: { name: true, family: true } } },
    orderBy: { dateTime: "desc" }, take: 12,
  });
  return ok({ settings, apiTokens, sessions });
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const { name, value } = await req.json();
  if (!name) return fail("نام تنظیم الزامی است");
  await db.setting.upsert({
    where: { name },
    update: { value },
    create: { name, value },
  });
  return ok();
}
