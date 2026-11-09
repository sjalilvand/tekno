// =====================================================================
// وب‌سرویس‌ساز — مدیریت سرویس‌ها (مدیر سامانه)
// =====================================================================
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail, safeJson } from "@/lib/server";
import { CATALOG, findTable, safeColumns, isAllowedOp } from "@/lib/ws/catalog";
import { randomBytes } from "crypto";

async function requireAdmin(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return null;
  const full = await db.user.findUnique({ where: { id: user.id }, include: { roles: { include: { role: true } } } });
  const roles = full?.roles.map((r) => r.role.title).join("|") ?? "";
  if (!/مدیر سامانه|مدیر سیستم|admin/i.test(roles)) return null;
  return user;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return fail("UNAUTHORIZED", 401);
  const services = await db.webService.findMany({ orderBy: { createdAt: "desc" } });
  return ok({
    services: services.map((s) => ({ ...s, apiKey: s.apiKey ? `${s.apiKey.slice(0, 6)}••••••` : null, hasKey: Boolean(s.apiKey) })),
    catalog: CATALOG,
  });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return fail("UNAUTHORIZED", 401);
  try {
    const body = await req.json();
    const table = findTable(String(body.table ?? ""));
    if (!table) return fail("جدول انتخابی مجاز نیست");
    const columns = safeColumns(table, Array.isArray(body.columns) ? body.columns.map(String) : []);
    const filters = (Array.isArray(body.filters) ? body.filters : [])
      .filter((f: { col?: string; op?: string }) => f?.col && table.columns.includes(f.col) && isAllowedOp(String(f.op)))
      .slice(0, 8)
      .map((f: { col: string; op: string; value?: string }) => ({ col: f.col, op: f.op, value: String(f.value ?? "") }));
    const format = ["json", "xml", "csv"].includes(String(body.format)) ? String(body.format) : "json";
    const authType = body.authType === "none" ? "none" : "apikey";
    const apiKey = authType === "apikey" ? `rzws_${randomBytes(16).toString("hex")}` : null;
    const slugBase = String(body.slug ?? body.title ?? table.name)
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || table.name.toLowerCase();
    const data = {
      title: String(body.title ?? "").trim() || `سرویس ${table.label}`,
      table: table.name,
      columns: JSON.stringify(columns),
      filters: JSON.stringify(filters),
      format, authType, apiKey,
      rowLimit: Math.max(1, Math.min(Number(body.rowLimit) || 1000, 10000)),
      orderBy: body.orderBy ? String(body.orderBy).replace(/[^A-Za-z0-9_ ]/g, "").trim() : null,
      isActive: body.isActive !== false,
    };
    if (body.id) {
      const existing = await db.webService.findUnique({ where: { id: Number(body.id) } });
      if (!existing) return fail("سرویس یافت نشد", 404);
      const updated = await db.webService.update({ where: { id: existing.id }, data: { ...data, apiKey: body.regenerateKey ? apiKey : existing.apiKey } });
      return ok(safeJson(updated));
    }
    // slug یکتا
    let slug = slugBase, i = 1;
    while (await db.webService.findUnique({ where: { slug } })) slug = `${slugBase}-${++i}`;
    const created = await db.webService.create({ data: { ...data, slug } });
    return ok(safeJson(created));
  } catch (e) {
    return fail((e as Error).message ?? "خطا در ذخیرهٔ سرویس");
  }
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return fail("UNAUTHORIZED", 401);
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) return fail("شناسه لازم است");
  await db.webService.delete({ where: { id } });
  return ok(true);
}
