import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, guardAdmin, ok, fail, params } from "@/lib/server";
import roseClinicsJson from "@/data/rose-clinics.json";
import type { Prisma } from "@prisma/client";

type RoseClinic = {
  province_code: string; province_name: string; city: string; name: string;
  address: string; postal_code: string; phone: string;
  manager_name: string; manager_phone: string;
  exec_name?: string; exec_phone?: string;
  working_hours: string; latitude: number; longitude: number; map_url: string | null;
};

/** درون‌ریزی ۳۱ مرکز رز از نقشهٔ ایران (مخزن special-spoon) — فقط مدیر */
export async function POST(req: NextRequest) {
  const g = await guardAdmin(req);
  if (g.error) return g.error;
  const body = await req.json().catch(() => ({}));
  if (String(body.action ?? "") !== "import-rose") return fail("عملیات ناشناخته");

  let imported = 0, updated = 0;
  const errors: string[] = [];

  for (const c of roseClinicsJson as unknown as RoseClinic[]) {
    try {
      // استان — اول با کد رسمی، بعد با عنوان
      const codeNum = Number(c.province_code);
      let province = await db.province.findUnique({ where: { id: codeNum } });
      if (!province) province = await db.province.findFirst({ where: { title: c.province_name } });
      if (!province) province = await db.province.create({ data: { id: codeNum, title: c.province_name } });

      // شهر — با عنوان در همان استان، وگرنه ایجاد
      let city = await db.city.findFirst({ where: { provinceId: province.id, title: c.city } });
      if (!city) {
        const maxCity = await db.city.aggregate({ _max: { id: true } });
        city = await db.city.create({
          data: { id: (maxCity._max.id ?? 0) + 1, provinceId: province.id, title: c.city },
        });
      }

      const data = {
        title: c.name, isEnabled: true,
        address: c.address ?? null, tel: c.phone ?? null,
        postalCode: c.postal_code ?? null,
        managerName: c.manager_name ?? null, managerPhone: c.manager_phone ?? null,
        workingHours: c.working_hours ?? null,
        latitude: typeof c.latitude === "number" ? c.latitude : null,
        longitude: typeof c.longitude === "number" ? c.longitude : null,
        mapUrl: c.map_url ?? null,
        cityId: city.id, cityTitle: c.city,
        provinceId: province.id, provinceTitle: c.province_name,
      };

      const existing = await db.center.findFirst({ where: { title: c.name } });
      if (existing) {
        await db.center.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        const maxCenter = await db.center.aggregate({ _max: { id: true } });
        await db.center.create({ data: { ...data, id: (maxCenter._max.id ?? 0) + 1 } });
        imported++;
      }
    } catch (e) {
      errors.push(`${c.name}: ${e instanceof Error ? e.message : "خطای نامشخص"}`);
    }
  }

  await db.log.create({
    data: {
      userId: g.acc.uid, category: "مراکز", level: 2,
      description: `درون‌ریزی مراکز رز از نقشهٔ ایران — ${imported} جدید، ${updated} به‌روزرسانی`,
      ip: req.headers.get("x-forwarded-for") ?? "-",
    },
  }).catch(() => {});

  return ok({ imported, updated, errors, total: (roseClinicsJson as unknown[]).length });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const { id, isEnabled, address, tel } = await req.json();
  if (!id) return fail("شناسه مرکز الزامی است");
  const data: Record<string, unknown> = {};
  if (typeof isEnabled === "boolean") data.isEnabled = isEnabled;
  if (typeof address === "string") data.address = address;
  if (typeof tel === "string") data.tel = tel;
  await db.center.update({ where: { id: Number(id) }, data });
  return ok();
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const { q, provinceId, page, pageSize } = params(req);

  const where: Prisma.CenterWhereInput = {};
  if (q) where.title = { contains: q };
  if (provinceId) where.provinceId = Number(provinceId);

  const [total, centers] = await Promise.all([
    db.center.count({ where }),
    db.center.findMany({
      where,
      include: { category: true, _count: { select: { events: true } } },
      orderBy: { title: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return ok({ total, page, totalPages: Math.ceil(total / pageSize), centers });
}
