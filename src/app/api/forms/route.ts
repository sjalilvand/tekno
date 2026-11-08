import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail } from "@/lib/server";

// =====================================================================
// فرم‌ساز — تعریف فرم‌های دلخواه سازمان
// • GET  : فهرست فرم‌ها با تعداد پاسخ‌ها (+ ?tab=submissions فهرست پاسخ‌ها)
// • POST : ایجاد فرم جدید {title, desc, fields:[{key,label,type,required,options}]}
// • PUT  : ویرایش {id, title, desc, fields, isActive}
// =====================================================================

type FieldDef = { key: string; label: string; type: string; required?: boolean; options?: string[] };

function validateFields(fields: unknown): FieldDef[] | null {
  if (!Array.isArray(fields) || fields.length === 0) return null;
  const out: FieldDef[] = [];
  const seen = new Set<string>();
  for (const f of fields as any[]) {
    const key = String(f.key ?? "").trim();
    const label = String(f.label ?? "").trim();
    const type = String(f.type ?? "text");
    if (!key || !label || seen.has(key)) return null;
    if (!["text", "textarea", "number", "date", "select", "checkbox"].includes(type)) return null;
    if (type === "select" && (!Array.isArray(f.options) || f.options.length < 1)) return null;
    seen.add(key);
    out.push({
      key, label, type,
      required: Boolean(f.required),
      ...(type === "select" ? { options: (f.options as string[]).map(String) } : {}),
    });
  }
  return out;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const tab = req.nextUrl.searchParams.get("tab");

  if (tab === "submissions") {
    const formId = req.nextUrl.searchParams.get("formId");
    const subs = await db.formSubmission.findMany({
      where: formId ? { formId: Number(formId) } : {},
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        form: { select: { id: true, title: true, fields: true } },
      },
    });
    return ok({
      submissions: subs.map((s) => ({
        id: s.id, formId: s.formId, formTitle: s.form.title,
        fields: JSON.parse(s.form.fields || "[]"),
        data: JSON.parse(s.data || "{}"),
        userId: s.userId, eventId: s.eventId, createdAt: s.createdAt,
      })),
    });
  }

  const forms = await db.formDefinition.findMany({
    orderBy: { id: "desc" },
    include: { submissions: { select: { id: true } } },
  });
  return ok({
    forms: forms.map((f) => ({
      id: f.id, title: f.title, desc: f.desc,
      fields: JSON.parse(f.fields || "[]"),
      isActive: f.isActive, createdAt: f.createdAt,
      submissionsCount: f.submissions.length,
    })),
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const body = await req.json().catch(() => null);
  if (!body) return fail("BAD_REQUEST");
  const fields = validateFields(body.fields);
  if (!fields) return fail("فیلدهای فرم نامعتبر است (کلید تکراری/خالی یا نوع نامعتبر)");
  const form = await db.formDefinition.create({
    data: {
      title: String(body.title ?? "فرم بدون عنوان").slice(0, 120),
      desc: body.desc ? String(body.desc).slice(0, 500) : null,
      fields: JSON.stringify(fields),
      createdBy: user.id,
    },
  });
  return ok({ id: form.id });
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const body = await req.json().catch(() => null);
  if (!body?.id) return fail("BAD_REQUEST");
  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = String(body.title).slice(0, 120);
  if (body.desc !== undefined) data.desc = body.desc ? String(body.desc).slice(0, 500) : null;
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
  if (body.fields !== undefined) {
    const fields = validateFields(body.fields);
    if (!fields) return fail("فیلدهای فرم نامعتبر است");
    data.fields = JSON.stringify(fields);
  }
  await db.formDefinition.update({ where: { id: Number(body.id) }, data });
  return ok();
}
