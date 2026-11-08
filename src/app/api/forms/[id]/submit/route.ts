import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail } from "@/lib/server";

// =====================================================================
// فرم‌ساز — ثبت پاسخ فرم (متصل به متقاضی و/یا جلسه — اختیاری)
// POST /api/forms/[id]/submit  {data:{key:value}, userId?, eventId?}
// =====================================================================

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const { id } = await ctx.params;
  const form = await db.formDefinition.findUnique({ where: { id: Number(id) } });
  if (!form) return fail("فرم یافت نشد", 404);
  const body = await req.json().catch(() => null);
  if (!body?.data || typeof body.data !== "object") return fail("BAD_REQUEST");

  // اعتبارسنجی بر اساس تعریف فیلدها
  const fields = JSON.parse(form.fields || "[]") as { key: string; label: string; type: string; required?: boolean; options?: string[] }[];
  const data: Record<string, string> = {};
  for (const f of fields) {
    let v = body.data[f.key];
    if (v === undefined || v === null || v === "") v = f.type === "checkbox" ? "false" : "";
    v = String(v).slice(0, 2000);
    if (f.required && !v && f.type !== "checkbox") return fail(`فیلد «${f.label}» الزامی است`);
    if (f.type === "select" && v && f.options && !f.options.includes(v)) return fail(`مقدار «${f.label}» نامعتبر است`);
    if (f.type === "number" && v && isNaN(Number(v))) return fail(`فیلد «${f.label}» باید عدد باشد`);
    data[f.key] = v;
  }
  const sub = await db.formSubmission.create({
    data: {
      formId: form.id,
      data: JSON.stringify(data),
      userId: body.userId ? Number(body.userId) : null,
      eventId: body.eventId ? Number(body.eventId) : null,
      createdById: user.id,
    },
  });
  return ok({ id: sub.id });
}
