import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { guardAction, guardAdmin, ok, fail } from "@/lib/server";
import psychTestsJson from "@/data/psych-tests.json";
import type { PsychTestJson } from "@/lib/psych";
import { ensurePsychTests } from "@/lib/banks";

/** فهرست آزمون‌های روان‌شناختی — بانک واردشده از مخزن special-spoon (نسخهٔ ۶.۱۲) */
export async function GET(req: NextRequest) {
  const g = await guardAction(req, "psych", "view", "آزمون‌های روان‌شناختی");
  if (g.error) return g.error;

  // اگر بانک خالی باشد، ۴۰ آزمون استاندارد خودکار بارگذاری می‌شود (نسخهٔ ۶.۱۳)
  await ensurePsychTests().catch(() => {});

  const tests = await db.psychTest.findMany({
    where: g.acc.isAdmin ? {} : { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    include: { _count: { select: { attempts: true } } },
  });

  const items = tests.map((t) => {
    let qCount = 0;
    try { qCount = (JSON.parse(t.questions) as unknown[]).length; } catch { /* داده خراب */ }
    return {
      id: t.id, slug: t.slug, title: t.title, code: t.code, topic: t.topic,
      description: t.description, ageRange: t.ageRange, minutes: t.minutes,
      color: t.color, isActive: t.isActive, questionsCount: qCount,
      attemptsCount: t._count.attempts,
    };
  });
  const topics = [...new Set(items.map((i) => i.topic).filter(Boolean))];
  return ok({ items, topics, total: items.length });
}

/** عملیات مدیر: درون‌ریزی بانک آزمون‌ها و فعال/غیرفعال‌سازی */
export async function POST(req: NextRequest) {
  const g = await guardAdmin(req);
  if (g.error) return g.error;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  if (action === "import") {
    let imported = 0, updated = 0;
    for (const t of psychTestsJson as unknown as PsychTestJson[]) {
      const data = {
        slug: t.slug, title: t.title, code: t.code ?? null, topic: t.topic ?? "عمومی",
        description: t.description ?? null, ageRange: t.ageRange ?? null,
        minutes: t.minutes ?? null, color: t.color ?? "#a83a54", sortOrder: t.sortOrder ?? 999,
        questions: JSON.stringify(t.questions ?? []),
        interpretations: JSON.stringify(t.interpretations ?? []),
        scales: t.scales ? JSON.stringify(t.scales) : null,
        isActive: true,
      };
      const existing = await db.psychTest.findUnique({ where: { slug: t.slug } });
      if (existing) { await db.psychTest.update({ where: { id: existing.id }, data }); updated++; }
      else { await db.psychTest.create({ data }); imported++; }
    }
    await db.log.create({
      data: {
        userId: g.acc.uid, category: "آزمون‌ها", level: 2,
        description: `درون‌ریزی بانک آزمون‌های روان‌شناختی — ${imported} جدید، ${updated} به‌روزرسانی`,
        ip: req.headers.get("x-forwarded-for") ?? "-",
      },
    }).catch(() => {});
    return ok({ imported, updated, total: psychTestsJson.length });
  }

  if (action === "toggle") {
    const id = Number(body.id);
    if (!id) return fail("شناسه آزمون الزامی است");
    const t = await db.psychTest.findUnique({ where: { id } });
    if (!t) return fail("آزمون پیدا نشد", 404);
    await db.psychTest.update({ where: { id }, data: { isActive: body.isActive ?? !t.isActive } });
    return ok();
  }

  return fail("عملیات ناشناخته");
}
