import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { guardAction, ok, fail } from "@/lib/server";
import { computeScore, maxScore, interpret, computeSubscores, type PsychQuestion, type PsychInterpretation, type PsychScale } from "@/lib/psych";

type Ctx = { params: Promise<{ slug: string }> };

/** جزئیات یک آزمون — سؤال‌ها و جداول تفسیر برای اجرا */
export async function GET(req: NextRequest, ctx: Ctx) {
  const g = await guardAction(req, "psych", "view", "آزمون‌های روان‌شناختی");
  if (g.error) return g.error;
  const { slug } = await ctx.params;

  const t = await db.psychTest.findFirst({
    where: g.acc.isAdmin ? { slug } : { slug, isActive: true },
  });
  if (!t) return fail("آزمون پیدا نشد یا غیرفعال است", 404);

  let questions: PsychQuestion[] = [];
  let interpretations: PsychInterpretation[] = [];
  let scales: PsychScale[] | null = null;
  try { questions = JSON.parse(t.questions); } catch { /* داده خراب */ }
  try { interpretations = JSON.parse(t.interpretations ?? "[]"); } catch { /* داده خراب */ }
  try { scales = t.scales ? JSON.parse(t.scales) : null; } catch { scales = null; }

  return ok({
    id: t.id, slug: t.slug, title: t.title, code: t.code, topic: t.topic,
    description: t.description, ageRange: t.ageRange, minutes: t.minutes, color: t.color,
    questions, interpretations, scales,
    maxScore: maxScore(questions),
  });
}

/** ثبت پاسخ‌ها و صدور نتیجه — نمره‌دهی سمت سرور */
export async function POST(req: NextRequest, ctx: Ctx) {
  const g = await guardAction(req, "psych", "create", "آزمون‌های روان‌شناختی");
  if (g.error) return g.error;
  const { slug } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const t = await db.psychTest.findFirst({
    where: g.acc.isAdmin ? { slug } : { slug, isActive: true },
  });
  if (!t) return fail("آزمون پیدا نشد یا غیرفعال است", 404);

  let questions: PsychQuestion[] = [];
  let interpretations: PsychInterpretation[] = [];
  let scales: PsychScale[] | null = null;
  try { questions = JSON.parse(t.questions); } catch { /* داده خراب */ }
  try { interpretations = JSON.parse(t.interpretations ?? "[]"); } catch { /* داده خراب */ }
  try { scales = t.scales ? JSON.parse(t.scales) : null; } catch { scales = null; }

  const answers: number[] = Array.isArray(body.answers) ? body.answers.map((a: unknown) => Number(a)) : [];
  if (answers.length !== questions.length) {
    return fail(`تعداد پاسخ‌ها کامل نیست — ${questions.length} سؤال، ${answers.length} پاسخ`);
  }

  const score = computeScore(questions, answers);
  const mx = maxScore(questions);
  const percent = mx > 0 ? Math.round((score / mx) * 100) : 0;
  const itp = interpret(interpretations, score);
  const subscores = computeSubscores(questions, answers, scales);

  const subjectName = typeof body.subjectName === "string" ? body.subjectName.trim().slice(0, 120) : null;
  const nidRaw = body.subjectNid !== undefined && body.subjectNid !== null && String(body.subjectNid).trim() !== ""
    ? String(body.subjectNid).replace(/\D/g, "") : "";
  const subjectNid = nidRaw ? BigInt(nidRaw) : null;

  const attempt = await db.psychTestAttempt.create({
    data: {
      testId: t.id, userId: g.acc.uid,
      subjectName: subjectName || `${g.acc.user.name ?? ""} ${g.acc.user.family ?? ""}`.trim() || null,
      subjectNid,
      answers: JSON.stringify(answers),
      score, percent,
      resultLabel: itp?.label ?? null,
      resultGuidance: itp?.guidance ?? null,
      subscores: subscores.length ? JSON.stringify(subscores) : null,
    },
  });

  await db.log.create({
    data: {
      userId: g.acc.uid, category: "آزمون‌ها", level: 3,
      description: `اجرای آزمون «${t.title}» — نمرهٔ ${score} (${percent}٪)`,
      ip: req.headers.get("x-forwarded-for") ?? "-",
    },
  }).catch(() => {});

  return ok({
    attemptId: attempt.id, score, percent, maxScore: mx,
    label: itp?.label ?? null, guidance: itp?.guidance ?? null, subscores,
  });
}
