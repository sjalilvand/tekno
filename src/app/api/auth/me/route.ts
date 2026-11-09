import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok } from "@/lib/server";
import { parseRolePermissions, FULL_ACCESS_ROLES } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const roles = await db.userRole.findMany({
    where: { userId: user.id, isSuspended: false, OR: [{ endDate: null }, { endDate: { gt: new Date() } }] },
    include: { role: true },
  });
  const unread = await db.message.count({ where: { toUserId: user.id, isRead: false } });

  // دسترسی مؤثر — ترکیب همهٔ نقش‌های فعال
  // ["*"] یعنی دسترسی کامل؛ null یعنی نقش legacy بدون ماتریس (همه‌چیز باز)؛ آرایهٔ کلیدها = محدودشده
  const titles = roles.map((r) => r.role.title);
  const isFull = titles.some((t) => FULL_ACCESS_ROLES.some((f) => t.includes(f)) || t.toLowerCase().includes("admin"));
  const rolePermLists = roles.map((r) => parseRolePermissions((r.role as { permissions?: string | null }).permissions ?? null));
  const effective: string[] | null = isFull
    ? ["*"]
    : rolePermLists.some((p) => p === null)
      ? null // حداقل یک نقش legacy بدون ماتریس → همه‌چیز باز (سازگاری با گذشته)
      : [...new Set(rolePermLists.flat())];

  return ok({
    user: {
      id: user.id, name: user.name, family: user.family, username: user.username,
      nid: user.nid, avatarColor: user.avatarColor, mobile: user.mobile, email: user.email,
      consultantLevel: user.consultantLevel, bio: user.bio,
      roles: titles,
    },
    permissions: effective,
    unread,
  });
}
