import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail, resolveAccess, scopeCenterIds } from "@/lib/server";

/** متادیتای فیلترها — یک فراخوانی برای همه دراپ‌داون‌ها */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  // نسخهٔ ۶.۱۰ — فهرست مراکز فقط در محدودهٔ دامنهٔ دادهٔ کاربر
  // (مدیر همه / مدیر استان مراکز استان / مدیر کلینیک و مشاور فقط کلینیک‌های خودشان)
  const acc = await resolveAccess(req);
  const allowedCenters = acc ? await scopeCenterIds(acc) : null;
  const [provinces, services, centers, roles, education, marriage] = await Promise.all([
    db.province.findMany({ select: { id: true, title: true }, orderBy: { id: "asc" } }),
    db.service.findMany({ select: { id: true, name: true, short: true } }),
    db.center.findMany({
      where: allowedCenters ? { id: { in: allowedCenters } } : {},
      select: { id: true, title: true, provinceTitle: true, cityTitle: true, isEnabled: true, tel: true, address: true, provinceId: true, cityId: true },
      orderBy: { title: "asc" },
    }),
    db.role.findMany({ orderBy: { id: "asc" } }),
    db.education.findMany(),
    db.marriage.findMany(),
  ]);
  return ok({ provinces, services, centers, roles, education, marriage, scoped: Boolean(allowedCenters) });
}
