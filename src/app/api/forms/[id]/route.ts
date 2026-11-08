import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail } from "@/lib/server";

// =====================================================================
// فرم‌ساز — جزئیات فرم، حذف و ثبت پاسخ
// • GET    /api/forms/[id]        : فرم + پاسخ‌ها
// • DELETE /api/forms/[id]        : حذف فرم و پاسخ‌ها
// • POST   /api/forms/[id]/submit : ثبت پاسخ (در route.ts پوشهٔ submit)
// =====================================================================

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const { id } = await ctx.params;
  const form = await db.formDefinition.findUnique({
    where: { id: Number(id) },
    include: { submissions: { orderBy: { createdAt: "desc" }, take: 200 } },
  });
  if (!form) return fail("فرم یافت نشد", 404);
  return ok({
    id: form.id, title: form.title, desc: form.desc,
    fields: JSON.parse(form.fields || "[]"),
    isActive: form.isActive, createdAt: form.createdAt,
    submissions: form.submissions.map((s) => ({
      id: s.id, userId: s.userId, eventId: s.eventId,
      data: JSON.parse(s.data || "{}"), createdAt: s.createdAt,
    })),
  });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const { id } = await ctx.params;
  const fid = Number(id);
  await db.formSubmission.deleteMany({ where: { formId: fid } });
  await db.formDefinition.delete({ where: { id: fid } }).catch(() => null);
  return ok();
}
