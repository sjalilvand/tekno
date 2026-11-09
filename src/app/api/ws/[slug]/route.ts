// =====================================================================
// اجرای وب‌سرویس عمومی — /api/ws/<slug>?format=json|xml|csv&limit=100
// احراز هویت: apikey در هدر X-API-Key یا پارامتر key (اگر سرویس کلید داشته باشد)
// =====================================================================
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { executeWebService } from "@/lib/ws/execute";

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const svc = await db.webService.findUnique({ where: { slug } });
  if (!svc || !svc.isActive) {
    return Response.json({ error: "وب‌سرویس یافت نشد یا غیرفعال است" }, { status: 404 });
  }
  if (svc.authType === "apikey" && svc.apiKey) {
    const key = req.headers.get("x-api-key") ?? req.nextUrl.searchParams.get("key") ?? "";
    if (key !== svc.apiKey) {
      return Response.json({ error: "کلید API نامعتبر است" }, { status: 401 });
    }
  }
  try {
    const result = await executeWebService(
      {
        slug: svc.slug, table: svc.table,
        columns: JSON.parse(svc.columns || "[]"),
        filters: JSON.parse(svc.filters || "[]"),
        format: svc.format, rowLimit: svc.rowLimit, orderBy: svc.orderBy,
      },
      req.nextUrl.searchParams
    );
    await db.webService.update({ where: { id: svc.id }, data: { callCount: { increment: 1 }, lastCallAt: new Date() } });
    return new Response(result.body, {
      status: 200,
      headers: { "Content-Type": result.contentType, "Cache-Control": "no-store" },
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message ?? "خطای اجرای سرویس" }, { status: 400 });
  }
}
