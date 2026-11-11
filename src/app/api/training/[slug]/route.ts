import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { guardAction, ok, fail } from "@/lib/server";

type Ctx = { params: Promise<{ slug: string }> };
type ExamQuestion = { prompt: string; options: string[]; correctIndex: number };

/** جزئیات یک مورد آموزشی — برای نمایش محتوا/دوره یا اجرای آزمون */
export async function GET(req: NextRequest, ctx: Ctx) {
  const g = await guardAction(req, "training", "view", "آموزش‌ها");
  if (g.error) return g.error;
  const { slug } = await ctx.params;

  const it = await db.trainingItem.findFirst({
    where: g.acc.isAdmin ? { slug } : { slug, status: "published" },
    include: { _count: { select: { attempts: true } } },
  });
  if (!it) return fail("مورد آموزشی پیدا نشد", 404);

  let questions: ExamQuestion[] = [];
  let sessions: { title: string; durationMinutes: number }[] = [];
  try { if (it.questions) questions = JSON.parse(it.questions); } catch { /* داده خراب */ }
  try { if (it.sessions) sessions = JSON.parse(it.sessions); } catch { /* داده خراب */ }

  // پاسخ صحیح هرگز به کلاینت نمی‌رود — فقط شمارهٔ گزینه‌ها
  return ok({
    id: it.id, kind: it.kind, slug: it.slug, title: it.title, summary: it.summary,
    body: it.body, topic: it.topic, tag: it.tag, price: it.price, capacity: it.capacity,
    startAt: it.startAt, sessions, questionsCount: questions.length,
    durationMinutes: it.durationMinutes, passPercent: it.passPercent,
    options: questions.map((q) => q.options),
    prompts: questions.map((q) => q.prompt),
    attemptsCount: it._count.attempts,
  });
}

/** ثبت نتیجهٔ آزمون آموزشی — نمره‌دهی سمت سرور، پاسخ صحیح هرگز به کلاینت نمی‌رود */
export async function POST(req: NextRequest, ctx: Ctx) {
  const g = await guardAction(req, "training", "create", "آموزش‌ها");
  if (g.error) return g.error;
  const { slug } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const it = await db.trainingItem.findFirst({
    where: g.acc.isAdmin ? { slug } : { slug, status: "published" },
  });
  if (!it) return fail("مورد آموزشی پیدا نشد", 404);
  if (it.kind !== "exam") return fail("این مورد آزمون نیست");

  let questions: ExamQuestion[] = [];
  try { questions = JSON.parse(it.questions ?? "[]"); } catch { /* داده خراب */ }
  const answers: number[] = Array.isArray(body.answers) ? body.answers.map((a: unknown) => Number(a)) : [];
  if (answers.length !== questions.length) return fail("پاسخ‌ها کامل نیست");

  let correct = 0;
  for (let i = 0; i < questions.length; i++) if (answers[i] === questions[i].correctIndex) correct++;
  const percent = questions.length ? Math.round((correct / questions.length) * 100) : 0;
  const passed = percent >= it.passPercent;

  await db.trainingAttempt.create({
    data: {
      itemId: it.id, userId: g.acc.uid,
      answers: JSON.stringify(answers), scorePercent: percent, passed,
    },
  });

  await db.log.create({
    data: {
      userId: g.acc.uid, category: "آموزش", level: 3,
      description: `آزمون آموزشی «${it.title}» — ${passed ? "قبول" : "مردود"} با ${percent}٪`,
      ip: req.headers.get("x-forwarded-for") ?? "-",
    },
  }).catch(() => {});

  return ok({ percent, correct, total: questions.length, passed, passPercent: it.passPercent });
}
