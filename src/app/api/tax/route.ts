import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail, params } from "@/lib/server";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const { q, year, page, pageSize } = params(req);

  const where: Prisma.ConsultantTaxWhereInput = {};
  if (year) where.year = Number(year);
  if (q) {
    where.OR = [
      { user: { name: { contains: q } } },
      { user: { family: { contains: q } } },
      { nid: { equals: Number(q) || -1 } },
    ];
  }

  const [total, taxes, years, sums] = await Promise.all([
    db.consultantTax.count({ where }),
    db.consultantTax.findMany({
      where,
      include: { user: { select: { name: true, family: true, avatarColor: true } } },
      orderBy: [{ year: "desc" }, { month: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.consultantTax.findMany({ select: { year: true }, distinct: ["year"], orderBy: { year: "desc" } }),
    db.consultantTax.aggregate({ where, _sum: { taxAmount: true, totalPayment: true } }),
  ]);
  return ok({ total, page, totalPages: Math.ceil(total / pageSize), taxes, years: years.map((y) => y.year), sums });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const { userId, nid, year, month, taxAmount, exemptionMonths, totalPayment } = await req.json();
  if (!year || !month || !nid) return fail("کد ملی، سال و ماه الزامی است");
  const tax = await db.consultantTax.create({
    data: {
      userId: userId ? Number(userId) : null, nid: BigInt(nid), year: Number(year), month: Number(month),
      taxAmount: BigInt(taxAmount ?? 0), exemptionMonths: Number(exemptionMonths ?? 0),
      totalPayment: BigInt(totalPayment ?? 0), createdByUserId: user.id,
    },
  });
  return ok(tax);
}
