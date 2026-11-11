// =====================================================================
// مدیریت جدول‌ها — عملیات ردیف‌ها (نسخهٔ ۶.۱۸)
// ---------------------------------------------------------------------
// GET    /api/data-tables/[table]?page=&pageSize=&q=&options=<field>
// POST   /api/data-tables/[table]      { data: {...} }            افزودن
// PATCH  /api/data-tables/[table]      { id, data: {...} }        ویرایش
// DELETE /api/data-tables/[table]?id=                             حذف
// فقط مدیر سامانه. نام مدل باید در TABLE_META باشد (white-list) و فقط
// فیلدهای اسکالر مجاز (بدون فیلدهای حساس) پذیرفته می‌شود.
// =====================================================================
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, fail, guardAdmin, safeJson } from "@/lib/server";
import { findTableMeta, HIDDEN_FIELDS, FK_TARGETS } from "@/lib/table-catalog";

type DmmfField = { name: string; type: string; kind: string; isRequired: boolean; hasDefault: boolean; isId: boolean };

/** ساختار مدل از dmmf + اعتبارسنجی white-list */
function modelInfo(modelParam: string) {
  const meta = findTableMeta(modelParam);
  if (!meta) return null;
  const dm = Prisma.dmmf.datamodel.models.find((m) => m.name === modelParam);
  if (!dm) return null;
  const hidden = new Set(HIDDEN_FIELDS[meta.model] ?? []);
  const scalars = (dm.fields.filter((f) => f.kind === "scalar" && !hidden.has(f.name)) as DmmfField[]).map((f) => ({
    ...f,
    // autoincrement/now در dmmf داخل فیلد default است و مقدارهای ثابت هم
    // در default می‌آیند؛ در این نسخه hasDefault همیشه ست نمی‌شود
    hasDefault: f.hasDefault || ((f as any).default !== undefined && (f as any).default !== null),
  }));
  const idField = dm.fields.find((f) => f.isId) as DmmfField | undefined;
  return { meta, scalars, idField: idField ?? null };
}

/** تبدیل مقدار ورودی به نوع Prisma — خروجی null یعنی «خالی / بدون مقدار» */
function coerce(field: DmmfField, raw: unknown): { value: unknown; empty: boolean } {
  const v = raw;
  const isBlank = v === undefined || v === null || (typeof v === "string" && v.trim() === "");
  if (isBlank) {
    if (!field.isRequired && !field.hasDefault) return { value: null, empty: true };
    if (!field.isRequired) return { value: null, empty: true };
    return { value: undefined, empty: true }; // اجباری خالی — خطا در validate
  }
  switch (field.type) {
    case "Int":
    case "Float": {
      const n = Number(v);
      if (!Number.isFinite(n)) throw new Error(`مقدار «${field.name}» باید عدد باشد`);
      return { value: field.type === "Int" ? Math.trunc(n) : n, empty: false };
    }
    case "BigInt": {
      try {
        const s = String(v).replace(/[,\s]/g, "");
        if (!/^-?\d+$/.test(s)) throw new Error();
        return { value: BigInt(s), empty: false };
      } catch {
        throw new Error(`مقدار «${field.name}» باید عدد صحیح باشد`);
      }
    }
    case "Boolean":
      return { value: v === true || v === "true" || v === 1 || v === "1", empty: false };
    case "DateTime": {
      const d = new Date(String(v));
      if (isNaN(d.getTime())) throw new Error(`تاریخ «${field.name}» نامعتبر است`);
      return { value: d, empty: false };
    }
    default:
      return { value: String(v), empty: false };
  }
}

/** ساخت data معتبر از بدنهٔ درخواست */
function buildData(info: NonNullable<ReturnType<typeof modelInfo>>, body: Record<string, unknown>, forCreate: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const byName = new Map(info.scalars.map((f) => [f.name, f]));
  for (const [key, raw] of Object.entries(body)) {
    const f = byName.get(key);
    if (!f) continue; // فیلد ناشناخته — نادیده (نه خطا)
    if (f.isId && !forCreate) continue; // شناسه در ویرایش تغییر نمی‌کند
    const { value, empty } = coerce(f, raw);
    if (value === undefined) {
      if (forCreate && f.isRequired && !f.hasDefault) {
        throw new Error(`فیلد «${key}» الزامی است`);
      }
      continue;
    }
    out[key] = value;
  }
  // فیلدهای اجباری بدون مقدار پیش‌فرض که در بدنه نیامده‌اند
  if (forCreate) {
    for (const f of info.scalars) {
      if (f.isRequired && !f.hasDefault && !(f.name in out)) {
        throw new Error(`فیلد «${f.name}» الزامی است`);
      }
    }
  }
  return out;
}

function parseId(idField: DmmfField, raw: string | undefined): unknown {
  if (raw === undefined || raw === "") return null;
  if (idField.type === "Int") {
    const n = Number(raw);
    if (!Number.isInteger(n)) return null;
    return n;
  }
  return raw; // String PK
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ table: string }> }) {
  const g = await guardAdmin(req);
  if (g.error) return g.error;
  const { table } = await ctx.params;
  const info = modelInfo(table);
  if (!info) return fail("جدول یافت نشد", 404);
  const { meta, scalars, idField } = info;
  const delegate = (db as any)[meta.delegate];
  if (!delegate) return fail("مدل در دسترس نیست", 404);

  const sp = req.nextUrl.searchParams;

  // حالت ویژه: فهرست شناسه‌های جدول مقصد برای فیلدهای ارتباطی
  const optionsField = sp.get("options");
  if (optionsField) {
    const fk = FK_TARGETS[optionsField];
    if (!fk) return fail("فیلد ارتباطی شناخته‌شده نیست");
    const targetInfo = modelInfo(fk.model);
    if (!targetInfo) return fail("جدول مقصد یافت نشد", 404);
    const tDelegate = (db as any)[fk.delegate];
    const dmmfModel = Prisma.dmmf.datamodel.models.find((m) => m.name === fk.model);
    const labelFields = fk.labelFields.filter((lf) => dmmfModel?.fields.some((x) => x.name === lf && x.kind === "scalar"));
    const orderBy = (dmmfModel?.fields.find((x) => x.name === "id")?.type ?? "Int") === "Int" ? { id: "desc" } : undefined;
    const rows = await tDelegate.findMany({
      select: { id: true, ...Object.fromEntries(labelFields.map((lf) => [lf, true])) },
      take: 200,
      ...(orderBy ? { orderBy } : {}),
    });
    const options = (rows as any[]).map((r) => ({
      id: String(r.id),
      label: labelFields.length ? labelFields.map((lf) => r[lf]).filter(Boolean).join(" ") || `#${r.id}` : `#${r.id}`,
    }));
    return ok({ options });
  }

  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const pageSize = Math.min(50, Math.max(5, Number(sp.get("pageSize") ?? 20)));
  const q = (sp.get("q") ?? "").trim();

  // جستجو: شامل بودن در فیلدهای متنی + تساوی عددی
  let where: Record<string, unknown> | undefined;
  if (q) {
    const textFields = scalars.filter((f) => f.type === "String" && f.name !== idField?.name).slice(0, 8);
    const or: unknown[] = textFields.map((f) => ({ [f.name]: { contains: q } }));
    if (/^-?\d+$/.test(q)) {
      for (const f of scalars) {
        if (f.type === "BigInt") or.push({ [f.name]: BigInt(q) });
        else if (f.type === "Int") or.push({ [f.name]: Number(q) });
      }
    }
    where = or.length ? { OR: or } : undefined;
  }

  const [count, rows] = await Promise.all([
    delegate.count({ where }),
    delegate.findMany({
      where,
      orderBy: idField ? { [idField.name]: idField.type === "Int" ? "desc" : "asc" } : undefined,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return ok({ count, page, pageSize, rows: safeJson(rows) });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ table: string }> }) {
  const g = await guardAdmin(req);
  if (g.error) return g.error;
  const { table } = await ctx.params;
  const info = modelInfo(table);
  if (!info) return fail("جدول یافت نشد", 404);
  const delegate = (db as any)[info.meta.delegate];
  if (!delegate) return fail("مدل در دسترس نیست", 404);
  let body: Record<string, unknown>;
  try {
    body = (await req.json())?.data ?? {};
  } catch {
    return fail("BAD_REQUEST");
  }
  let data: Record<string, unknown>;
  try {
    data = buildData(info, body, true);
  } catch (e: any) {
    return fail(String(e?.message ?? e));
  }
  try {
    const row = await delegate.create({ data });
    return ok(safeJson(row));
  } catch (e: any) {
    return fail("ثبت رکورد ناموفق بود: " + String(e?.message ?? e).slice(0, 300), 500);
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ table: string }> }) {
  const g = await guardAdmin(req);
  if (g.error) return g.error;
  const { table } = await ctx.params;
  const info = modelInfo(table);
  if (!info?.idField) return fail("جدول یافت نشد", 404);
  const delegate = (db as any)[info.meta.delegate];
  if (!delegate) return fail("مدل در دسترس نیست", 404);
  let body: { id?: unknown; data?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return fail("BAD_REQUEST");
  }
  const id = parseId(info.idField, body?.id === undefined || body?.id === null ? undefined : String(body.id));
  if (id === null) return fail("شناسه رکورد نامعتبر است");
  let data: Record<string, unknown>;
  try {
    data = buildData(info, body?.data ?? {}, false);
  } catch (e: any) {
    return fail(String(e?.message ?? e));
  }
  if (!Object.keys(data).length) return fail("تغییری ارسال نشده است");
  try {
    const row = await delegate.update({ where: { [info.idField.name]: id }, data });
    return ok(safeJson(row));
  } catch (e: any) {
    return fail("ویرایش رکورد ناموفق بود: " + String(e?.message ?? e).slice(0, 300), 500);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ table: string }> }) {
  const g = await guardAdmin(req);
  if (g.error) return g.error;
  const { table } = await ctx.params;
  const info = modelInfo(table);
  if (!info?.idField) return fail("جدول یافت نشد", 404);
  const delegate = (db as any)[info.meta.delegate];
  if (!delegate) return fail("مدل در دسترس نیست", 404);
  const id = parseId(info.idField, req.nextUrl.searchParams.get("id") ?? undefined);
  if (id === null) return fail("شناسه رکورد نامعتبر است");
  try {
    await delegate.delete({ where: { [info.idField.name]: id } });
    return ok({ deleted: true });
  } catch (e: any) {
    const code = String(e?.code ?? "");
    if (code === "P2025") return fail("رکورد یافت نشد", 404);
    if (code === "P2003") return fail("این رکورد به داده‌های دیگری متصل است و حذف نمی‌شود — ابتدا ارتباط‌ها را حذف کنید");
    return fail("حذف رکورد ناموفق بود: " + String(e?.message ?? e).slice(0, 300), 500);
  }
}
