import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok } from "@/lib/server";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const roles = await db.userRole.findMany({
    where: { userId: user.id, isSuspended: false, OR: [{ endDate: null }, { endDate: { gt: new Date() } }] },
    include: { role: true },
  });
  const unread = await db.message.count({ where: { toUserId: user.id, isRead: false } });
  return ok({
    user: {
      id: user.id, name: user.name, family: user.family, username: user.username,
      nid: user.nid, avatarColor: user.avatarColor, mobile: user.mobile, email: user.email,
      consultantLevel: user.consultantLevel, bio: user.bio,
      roles: roles.map((r) => r.role.title),
    },
    unread,
  });
}
