import { db } from "@/lib/db";
import psychTestsJson from "@/data/psych-tests.json";
import trainingJson from "@/data/training-items.json";
import roseClinicsJson from "@/data/rose-clinics.json";
import type { PsychTestJson } from "@/lib/psych";

/**
 * درون‌ریزی خودکار بانک‌های دادهٔ آماده (نسخهٔ ۶.۱۳)
 * ---------------------------------------------------------------
 * پیش‌تر آزمون‌ها، آموزش‌ها و مراکز رز فقط با دکمهٔ دستی مدیر
 * وارد می‌شدند و تا مدیر دکمه را نمی‌زد صفحات خالی بودند.
 * از این نسخه، اولین باری که صفحهٔ مربوطه باز شود اگر بانک خالی
 * باشد محتوا به‌صورت خودکار از فایل‌های همراه برنامه بارگذاری
 * می‌شود — بدون نیاز به اینترنت و بدون هیچ کلیکی.
 * همهٔ توابع idempotent هستند و چندبار فراخوانی مشکلی ندارد.
 */

type ImportStat = { imported: number; updated: number; total: number; skipped: boolean; errors?: string[] };

/** پیام خطای خوانا برای لاگ و UI — دیگر هیچ شکستی بی‌صدا نیست (نسخهٔ ۶.۱۴) */
export function bankErrorSummary(stat: ImportStat): string | null {
  if (!stat.errors?.length) return null;
  return stat.errors.slice(0, 3).join(" | ");
}

async function logIt(category: string, description: string) {
  await db.log
    .create({ data: { userId: null, category, level: 1, description, ip: "auto" } })
    .catch(() => {});
}

// ---------------- بانک آزمون‌های روان‌شناختی ----------------
export async function ensurePsychTests(): Promise<ImportStat> {
  const count = await db.psychTest.count();
  // نسخهٔ ۶.۱۴ — اگر کمتر از بانک کامل وارد شده باشد (درون‌ریزی نیمه‌کاره) ترمیم می‌شود؛
  // همهٔ عملیات upsert هستند و چندبار اجرا مشکلی ندارد.
  if (count >= (psychTestsJson as unknown[]).length) {
    return { imported: 0, updated: 0, total: count, skipped: true };
  }

  let imported = 0;
  const errors: string[] = [];
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
    try {
      const existing = await db.psychTest.findUnique({ where: { slug: t.slug } });
      if (existing) await db.psychTest.update({ where: { id: existing.id }, data });
      else { await db.psychTest.create({ data }); imported++; }
    } catch (e) {
      // یک آزمون خراب نباید بقیهٔ بانک را از کار بیندازد — خطا ثبت و گزارش می‌شود (نسخهٔ ۶.۱۴)
      errors.push(`${t.slug}: ${e instanceof Error ? e.message.slice(0, 160) : "خطای نامشخص"}`);
      console.error(`[banks] خطای درون‌ریزی آزمون ${t.slug}:`, e);
    }
  }
  await logIt("آزمون‌ها", `درون‌ریزی خودکار بانک آزمون‌های روان‌شناختی — ${imported} آزمون`);
  return { imported, updated: 0, total: (psychTestsJson as unknown[]).length, skipped: false, errors: errors.length ? errors : undefined };
}

// ---------------- آکادمی رز — محتوای آموزشی ----------------
export async function ensureTrainingItems(): Promise<ImportStat> {
  const rows0: { slug: string }[] = [];
  for (const c of trainingJson.contents ?? []) rows0.push(c as any);
  for (const c of trainingJson.courses ?? []) rows0.push(c as any);
  for (const c of trainingJson.exams ?? []) rows0.push(c as any);
  const count = await db.trainingItem.count();
  // نسخهٔ ۶.۱۴ — ترمیم درون‌ریزی نیمه‌کاره (همهٔ عملیات upsert و idempotent)
  if (count >= rows0.length) {
    return { imported: 0, updated: 0, total: count, skipped: true };
  }

  const rows: { kind: string; slug: string; title: string; summary?: string; body?: string; topic?: string; tag?: string; price?: number; capacity?: number; sessions?: unknown[]; questions?: unknown[]; passPercent?: number; durationMinutes?: number }[] = [];
  for (const c of trainingJson.contents ?? []) rows.push({ kind: "content", ...c });
  for (const c of trainingJson.courses ?? []) rows.push({ kind: "course", ...c });
  for (const c of trainingJson.exams ?? []) rows.push({ kind: "exam", ...c });

  let imported = 0;
  const errors: string[] = [];
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
    try {
      const existing = await db.trainingItem.findUnique({ where: { slug: r.slug } });
      if (existing) await db.trainingItem.update({ where: { id: existing.id }, data });
      else { await db.trainingItem.create({ data }); imported++; }
    } catch (e) {
      errors.push(`${r.slug}: ${e instanceof Error ? e.message.slice(0, 160) : "خطای نامشخص"}`);
      console.error(`[banks] خطای درون‌ریزی آموزش ${r.slug}:`, e);
    }
  }
  await logIt("آموزش", `درون‌ریزی خودکار محتوای آموزشی آکادمی رز — ${imported} مورد${errors.length ? ` — ${errors.length} خطا` : ""}`);
  return { imported, updated: 0, total: rows.length, skipped: false, errors: errors.length ? errors : undefined };
}

// ---------------- اطلس مراکز رز — ۳۱ کلینیک از نقشهٔ ایران ----------------
type RoseClinic = {
  province_code: string; province_name: string; city: string; name: string;
  address: string; postal_code: string; phone: string;
  manager_name: string; manager_phone: string;
  exec_name?: string; exec_phone?: string;
  working_hours: string; latitude: number; longitude: number; map_url: string | null;
};

export async function ensureRoseClinics(): Promise<ImportStat> {
  // تعداد مراکزی که مختصات جغرافیایی دارند — اگر از کلینیک‌های رز (۳۱) بیشتر باشد، وارد شده است
  const geoCount = await db.center.count({ where: { latitude: { not: null } } });
  // نسخهٔ ۶.۱۴ — درون‌ریزی نیمه‌کاره هم ترمیم می‌شود (upsert idempotent)
  if (geoCount >= (roseClinicsJson as unknown[]).length) {
    return { imported: 0, updated: 0, total: geoCount, skipped: true };
  }

  let imported = 0, updated = 0;
  const errors: string[] = [];

  for (const c of roseClinicsJson as unknown as RoseClinic[]) {
    try {
      const codeNum = Number(c.province_code);
      let province = await db.province.findUnique({ where: { id: codeNum } });
      if (!province) province = await db.province.findFirst({ where: { title: c.province_name } });
      if (!province) province = await db.province.create({ data: { id: codeNum, title: c.province_name } });

      let city = await db.city.findFirst({ where: { provinceId: province.id, title: c.city } });
      if (!city) {
        const maxCity = await db.city.aggregate({ _max: { id: true } });
        city = await db.city.create({
          data: { id: (maxCity._max.id ?? 0) + 1, provinceId: province.id, title: c.city },
        });
      }

      const data = {
        title: c.name, isEnabled: true,
        address: c.address ?? null, tel: c.phone ?? null,
        postalCode: c.postal_code ?? null,
        managerName: c.manager_name ?? null, managerPhone: c.manager_phone ?? null,
        workingHours: c.working_hours ?? null,
        latitude: typeof c.latitude === "number" ? c.latitude : null,
        longitude: typeof c.longitude === "number" ? c.longitude : null,
        mapUrl: c.map_url ?? null,
        cityId: city.id, cityTitle: c.city,
        provinceId: province.id, provinceTitle: c.province_name,
      };

      const existing = await db.center.findFirst({ where: { title: c.name } });
      if (existing) {
        await db.center.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        const maxCenter = await db.center.aggregate({ _max: { id: true } });
        await db.center.create({ data: { ...data, id: (maxCenter._max.id ?? 0) + 1 } });
        imported++;
      }
    } catch (e) {
      errors.push(`${c.name}: ${e instanceof Error ? e.message : "خطای نامشخص"}`);
    }
  }

  await logIt("مراکز", `درون‌ریزی خودکار مراکز رز از نقشهٔ ایران — ${imported} جدید، ${updated} به‌روزرسانی${errors.length ? ` — ${errors.length} خطا` : ""}`);
  return { imported, updated, total: (roseClinicsJson as unknown[]).length, skipped: false, errors: errors.length ? errors : undefined };
}
