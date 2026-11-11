import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { guardAction, guardAdmin, ok, fail, params } from "@/lib/server";
import trainingJson from "@/data/training-items.json";
import { ensureTrainingItems, bankErrorSummary } from "@/lib/banks";

type ExamQuestion = { prompt: string; options: string[]; correctIndex: number };

/** فهرست آموزش‌ها — محتوا، دوره‌ها و آزمون‌های آموزشی (نسخهٔ ۶.۱۲) */
export async function GET(req: NextRequest) {
  const g = await guardAction(req, "training", "view", "آموزش‌ها");
  if (g.error) return g.error;

  // اگر بانک آموزش خالی باشد، محتوای آکادمی رز خودکار بارگذاری می‌شود (نسخهٔ ۶.۱۳)
  // نسخهٔ ۶.۱۴ — خطای درون‌ریزی دیگر بی‌صدا نیست
  const bank = await ensureTrainingItems().catch((e: unknown) => ({
    imported: 0, updated: 0, total: 0, skipped: false,
    errors: [e instanceof Error ? e.message.slice(0, 200) : "خطای نامشخص درون‌ریزی"],
  }));
  const bankError = bankErrorSummary(bank);
  if (bankError) console.error("[training] خطای درون‌ریزی خودکار:", bankError);
  const { q } = params(req);
  const allParam = req.nextUrl.searchParams.get("all") === "1";

  const where = g.acc.isAdmin && allParam ? {} : { status: "published" };
  const search = q ? { title: { contains: q } } : {};

  const items = await db.trainingItem.findMany({
    where: { ...where, ...search },
    orderBy: [{ kind: "asc" }, { id: "asc" }],
    include: { _count: { select: { attempts: true } } },
  });

  return ok({
    items: items.map((it) => {
      let qCount = 0, sessionCount = 0;
      try { if (it.questions) qCount = (JSON.parse(it.questions) as unknown[]).length; } catch { /* داده خراب */ }
      try { if (it.sessions) sessionCount = (JSON.parse(it.sessions) as unknown[]).length; } catch { /* داده خراب */ }
      return {
        id: it.id, kind: it.kind, slug: it.slug, title: it.title, summary: it.summary,
        topic: it.topic, tag: it.tag, price: it.price, capacity: it.capacity,
        startAt: it.startAt, sessionCount, questionsCount: qCount,
        passPercent: it.passPercent, durationMinutes: it.durationMinutes,
        status: it.status, attemptsCount: it._count.attempts, createdAt: it.createdAt,
      };
    }),
    bankError,
  });
}

/** عملیات: درون‌ریزی محتوای آموزشی مخزن special-spoon + ایجاد/ویرایش (مدیر) */
export async function POST(req: NextRequest) {
  const g = await guardAdmin(req);
  if (g.error) return g.error;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  if (action === "import") {
    let imported = 0, updated = 0;
    const rows: { kind: string; slug: string; title: string; summary?: string; body?: string; topic?: string; tag?: string; price?: number; capacity?: number; sessions?: unknown[]; questions?: unknown[]; passPercent?: number; durationMinutes?: number }[] = [];
    for (const c of trainingJson.contents ?? []) rows.push({ kind: "content", ...c });
    for (const c of trainingJson.courses ?? []) rows.push({ kind: "course", ...c });
    for (const c of trainingJson.exams ?? []) rows.push({ kind: "exam", ...c });
    for (const r of rows) {
      const data = {
        kind: r.kind, slug: r.slug, title: r.title, summary: r.summary ?? null,
        body: r.body ?? null, topic: r.topic ?? null, tag: r.tag ?? null,
        price: r.price ?? 0, capacity: r.capacity ?? null,
        sessions: r.sessions ? JSON.stringify(r.sessions) : null,
        questions: r.questions ? JSON.stringify(r.questions) : null,
        passPercent: r.passPercent ?? 60, durationMinutes: r.durationMinutes ?? 20,
        status: "published",
      };
      const existing = await db.trainingItem.findUnique({ where: { slug: r.slug } });
      if (existing) { await db.trainingItem.update({ where: { id: existing.id }, data }); updated++; }
      else { await db.trainingItem.create({ data }); imported++; }
    }
    await db.log.create({
      data: {
        userId: g.acc.uid, category: "آموزش", level: 2,
        description: `درون‌ریزی محتوای آموزشی — ${imported} جدید، ${updated} به‌روزرسانی`,
        ip: req.headers.get("x-forwarded-for") ?? "-",
      },
    }).catch(() => {});
    return ok({ imported, updated, total: rows.length });
  }

  if (action === "create" || action === "update") {
    const title = String(body.title ?? "").trim();
    if (!title) return fail("عنوان الزامی است");
    const data: Record<string, unknown> = {
      title,
      kind: ["content", "course", "exam"].includes(body.kind) ? body.kind : "content",
      summary: body.summary ?? null, body: body.body ?? null, topic: body.topic ?? null, tag: body.tag ?? null,
      price: Number(body.price) || 0, capacity: body.capacity ? Number(body.capacity) : null,
      status: body.status === "draft" ? "draft" : "published",
    };
    if (action === "update") {
      const id = Number(body.id);
      if (!id) return fail("شناسه الزامی است");
      await db.trainingItem.update({ where: { id }, data });
    } else {
      const base = `item-${Date.now()}`;
      await db.trainingItem.create({ data: { ...(data as { [k: string]: unknown }), slug: `${base}`, createdBy: g.acc.uid } as never });
    }
    return ok();
  }

  if (action === "toggle") {
    const id = Number(body.id);
    if (!id) return fail("شناسه الزامی است");
    const it = await db.trainingItem.findUnique({ where: { id } });
    if (!it) return fail("مورد پیدا نشد", 404);
    await db.trainingItem.update({ where: { id }, data: { status: it.status === "published" ? "draft" : "published" } });
    return ok();
  }

  return fail("عملیات ناشناخته");
}

export async function DELETE(req: NextRequest) {
  const g = await guardAdmin(req);
  if (g.error) return g.error;
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) return fail("شناسه الزامی است");
  const it = await db.trainingItem.findUnique({ where: { id }, include: { _count: { select: { attempts: true } } } });
  if (!it) return fail("مورد پیدا نشد", 404);
  if (it._count.attempts > 0) return fail("به‌دلیل وجود نتایج ثبت‌شده، حذف ممکن نیست — می‌توانید آن را «پیش‌نویس» کنید");
  await db.trainingItem.delete({ where: { id } });
  return ok();
}
