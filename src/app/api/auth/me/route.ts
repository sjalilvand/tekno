import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, resolveAccess } from "@/lib/server";

export async function GET(req: NextRequest) {
  const acc = await resolveAccess(req);
  if (!acc) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const unread = await db.message.count({ where: { toUserId: acc.uid, isRead: false } });

  return ok({
    user: {
      id: acc.user.id, name: acc.user.name, family: acc.user.family, username: acc.user.username,
      nid: acc.user.nid, avatarColor: acc.user.avatarColor, mobile: acc.user.mobile, email: acc.user.email,
      consultantLevel: acc.user.consultantLevel, bio: acc.user.bio,
      roles: acc.roles,
    },
    permissions: acc.perms,
    unread,
    // حالت نیابتی — مدیر وارد حساب دیگری شده است
    acting: acc.acting && acc.actor
      ? { actorId: acc.actor.id, actorName: `${acc.actor.name} ${acc.actor.family}` }
      : null,
    // دامنهٔ دادهٔ مؤثر (نسخهٔ ۶.۱۰) — برای برچسب‌ها و تفکیک کلینیک‌ها در UI
    scope: {
      seesAllData: acc.seeAllData,
      isCounselor: acc.isCounselor,
      kind: acc.scope.kind,
      centers: acc.scope.centers,
      provinces: acc.scope.provinces,
    },
  });
}
