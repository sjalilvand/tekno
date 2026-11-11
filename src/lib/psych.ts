// =====================================================================
// موتور نمره‌دهی آزمون‌های روان‌شناختی — نسخهٔ ۶.۱۲
// منبع بانک آزمون‌ها: مخزن special-spoon (بانک روان‌سنجی رز)
// بدون وابستگی خارجی؛ هم سمت سرور (API) و هم سمت کلاینت قابل استفاده است.
// =====================================================================

export type PsychQuestion = {
  prompt: string;
  options: [string, number][]; // [برچسب، نمره]
  subscale?: string;
  image?: string;
};

export type PsychInterpretation = {
  score_min: number;
  score_max: number;
  label: string;
  guidance: string;
};

export type PsychScale = {
  key: string;
  title: string;
  description?: string | null;
  match_names?: string[] | null;
  levels: { min: number; max: number; label: string; text?: string }[];
};

export type PsychTestJson = {
  slug: string;
  title: string;
  topic: string;
  description: string;
  code: string | null;
  ageRange: string | null;
  minutes: number | null;
  color: string;
  sortOrder: number;
  questions: PsychQuestion[];
  interpretations: PsychInterpretation[];
  scales: PsychScale[] | null;
};

export type SubscoreResult = { key: string; title: string; score: number; level?: string; text?: string };

/** نمرهٔ کل از پاسخ‌ها (آرایهٔ اندیس گزینهٔ انتخابی هر سؤال) */
export function computeScore(questions: PsychQuestion[], answers: number[]): number {
  let total = 0;
  for (let i = 0; i < questions.length; i++) {
    const a = answers[i];
    const q = questions[i];
    if (q && typeof a === "number" && q.options[a]) total += Number(q.options[a][1]) || 0;
  }
  return total;
}

/** بیشترین نمرهٔ ممکن — برای درصد */
export function maxScore(questions: PsychQuestion[]): number {
  return questions.reduce((s, q) => s + Math.max(...q.options.map((o) => Number(o[1]) || 0), 0), 0);
}

/** تفسیر کل نمره بر پایهٔ جدول interpretations */
export function interpret(
  interpretations: PsychInterpretation[],
  score: number
): { label: string; guidance: string } | null {
  for (const it of interpretations) {
    if (score >= it.score_min && score <= it.score_max) return { label: it.label, guidance: it.guidance };
  }
  return null;
}

/** تطبیق نام زیرمقیاس سؤال با match_names مقیاس — تحمل فاصله/نیم‌فاصله/اختلاف جزئی */
function subscaleMatches(questionSub: string, scale: PsychScale): boolean {
  const norm = (s: string) => (s ?? "").replace(/[\u200c\s]+/g, " ").trim();
  const qn = norm(questionSub);
  if (!qn) return false;
  const names = scale.match_names?.length ? scale.match_names : [scale.title];
  return names.some((n) => {
    const nn = norm(n);
    return nn === qn || nn.includes(qn) || qn.includes(nn.split(" (")[0]);
  });
}

/** نمرهٔ زیرمقیاس‌ها + سطح تفسیر هر کدام */
export function computeSubscores(
  questions: PsychQuestion[],
  answers: number[],
  scales: PsychScale[] | null
): SubscoreResult[] {
  if (!scales?.length) return [];
  const out: SubscoreResult[] = [];
  for (const scale of scales) {
    let score = 0;
    let matched = false;
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.subscale || !subscaleMatches(q.subscale, scale)) continue;
      matched = true;
      const a = answers[i];
      if (typeof a === "number" && q.options[a]) score += Number(q.options[a][1]) || 0;
    }
    if (!matched) continue;
    const level = scale.levels.find((l) => score >= l.min && score <= l.max);
    out.push({ key: scale.key, title: scale.title, score, level: level?.label, text: level?.text });
  }
  return out;
}

/** برچسب فارسی وضعیت برای کنترل منفی و جدول‌ها */
export function percentTone(percent: number): "emerald" | "amber" | "rose" {
  if (percent < 34) return "emerald";
  if (percent < 67) return "amber";
  return "rose";
}
