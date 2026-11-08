import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail } from "@/lib/server";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const [customers, contracts, services] = await Promise.all([
    db.corporateCustomer.findMany({ include: { contracts: { include: { services: true } } } }),
    db.corporateContract.findMany({
      include: {
        customer: true,
        services: { include: {} },
      },
      orderBy: { id: "desc" },
    }),
    db.service.findMany({ select: { id: true, name: true } }),
  ]);
  return ok({ customers, contracts, services });
}
