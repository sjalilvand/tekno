import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { guardAction, ok, params } from "@/lib/server";

/** تاریخچهٔ نتایج آزمون‌ها — مشاور فقط نتایج خودش، مدیران و نقش‌های دامنه‌دار همه */
export async function GET(req: NextRequest) {
  const g = await guardAction(req, "psych", "view", "آزمون‌های روان‌شناختی");
  if (g.error) return g.error;
  const { page, pageSize, q } = params(req);

  // اسکوپ: مشاور (دامنهٔ «فقط خود») فقط نتایج خودش؛ سایر نقش‌ها همه
  const where = g.acc.scope.kind === "self" ? { userId: g.acc.uid } : {};
  const search = q ? { test: { title: { contains: q } } } : {};

  const [total, rows] = await Promise.all([
    db.psychTestAttempt.count({ where: { ...where, ...search } }),
    db.psychTestAttempt.findMany({
      where: { ...where, ...search },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        test: { select: { title: true, slug: true, topic: true, color: true } },
        user: { select: { name: true, family: true, username: true } },
      },
    }),
  ]);

  return ok({
    total, page, totalPages: Math.ceil(total / pageSize),
    items: rows.map((r) => ({
      id: r.id, testTitle: r.test.title, testSlug: r.test.slug, topic: r.test.topic, color: r.test.color,
      subjectName: r.subjectName, subjectNid: r.subjectNid ? String(r.subjectNid) : null,
      userName: `${r.user.name ?? ""} ${r.user.family ?? ""}`.trim(),
      score: r.score, percent: r.percent, resultLabel: r.resultLabel,
      resultGuidance: r.resultGuidance, subscores: r.subscores, createdAt: r.createdAt,
    })),
  });
}
