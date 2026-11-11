// =====================================================================
// مدیریت جدول‌ها — کاتالوگ (نسخهٔ ۶.۱۸)
// ---------------------------------------------------------------------
// GET /api/data-tables
//   فهرست کامل جدول‌های سامانه (۷۵ جدول legacy + جدول‌های جدید) به‌همراه
//   ساختار فیلدها از Prisma.dmmf — فقط مدیر سامانه.
//   فیلدهای حساس (رمز/توکن) حذف می‌شوند.
// =====================================================================
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { ok, guardAdmin } from "@/lib/server";
import { TABLE_META, HIDDEN_FIELDS, fieldLabel, FK_TARGETS } from "@/lib/table-catalog";

export async function GET(req: NextRequest) {
  const g = await guardAdmin(req);
  if (g.error) return g.error;

  const dmmf = Prisma.dmmf.datamodel.models;
  const dmmfByName = new Map(dmmf.map((m) => [m.name, m]));

  const tables = [];
  for (const t of TABLE_META) {
    const dm = dmmfByName.get(t.model);
    if (!dm) continue; // مدل در اسکیما نیست — نادیده
    const hidden = new Set(HIDDEN_FIELDS[t.model] ?? []);
    const fields = dm.fields
      .filter((f) => f.kind === "scalar" && !hidden.has(f.name))
      .map((f) => {
        const fk = FK_TARGETS[f.name];
        return {
          name: f.name,
          type: f.type,
          // مقدار پیش‌فرض ثابت در dmmf داخل «default» است (hasDefault ست نمی‌شود)
          required: f.isRequired && !(f.hasDefault || ((f as any).default !== undefined && (f as any).default !== null)),
          hasDefault: f.hasDefault || ((f as any).default !== undefined && (f as any).default !== null),
          isId: f.isId,
          label: fieldLabel(f.name),
          fk: fk ? { model: fk.model, hasLabel: fk.labelFields.some((lf) => dmmfByName.get(fk.model)?.fields.some((x) => x.name === lf)) } : undefined,
        };
      });
    tables.push({
      model: t.model,
      table: t.table,
      label: t.label,
      domain: t.domain,
      isNew: Boolean(t.isNew),
      idField: dm.fields.find((f) => f.isId)?.name ?? "id",
      idType: dm.fields.find((f) => f.isId)?.type ?? "Int",
      fields,
    });
  }

  return ok({ tables, total: tables.length });
}
