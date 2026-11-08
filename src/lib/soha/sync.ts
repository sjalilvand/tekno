// =====================================================================
// وب‌سرویس سها — همگام‌سازی تدریجی با منطق منتقل‌شده از کد PHP
// • هر عملیات یک رکورد SyncLog می‌نویسد (قابل مشاهده در پنل یکپارچه‌سازی‌ها)
// • نشانگر افزایشی (cursor) هر موجودیت در Settings ذخیره می‌شود تا
//   هر بار فقط تغییرات جدید دریافت/ارسال شود.
// • نقاطی که باید با سورس PHP یا مستندات واقعی سها تنظیم شوند با TODO
//   مشخص شده‌اند؛ بقیهٔ سامانه از این جزئیات بی‌اطلاع است.
// =====================================================================
import { db } from "@/lib/db";
import { SohaClient, SohaError } from "./client";
import {
  SOHA_SETTING_KEYS, sohaCursorKey,
  type SohaConfig, type SohaEntity, type SohaPatient, type SohaReferral, type SohaSyncResult,
} from "./types";

export * from "./types";
export { SohaError };

const SYNC_PAGE_SIZE = 200;

// ------------------------------- پیکربندی -------------------------------
export async function getSohaConfig(): Promise<SohaConfig> {
  const rows = await db.setting.findMany({ where: { name: { startsWith: "soha." } } });
  const map = new Map(rows.map((r) => [r.name, r.value ?? ""]));
  const pick = (key: string, env: string, dflt = "") => {
    const v = map.get(key);
    return v !== undefined && v !== "" ? v : (process.env[env] || dflt);
  };
  return {
    enabled: (pick(SOHA_SETTING_KEYS.enabled, "SOHA_ENABLED", "false")) === "true",
    baseUrl: pick(SOHA_SETTING_KEYS.baseUrl, "SOHA_BASE_URL"),
    username: pick(SOHA_SETTING_KEYS.username, "SOHA_USERNAME"),
    password: pick(SOHA_SETTING_KEYS.password, "SOHA_PASSWORD"),
    apiKey: pick(SOHA_SETTING_KEYS.apiKey, "SOHA_API_KEY"),
    centerCode: pick(SOHA_SETTING_KEYS.centerCode, "SOHA_CENTER_CODE"),
    protocol: (pick(SOHA_SETTING_KEYS.protocol, "SOHA_PROTOCOL", "rest") === "soap" ? "soap" : "rest"),
  };
}

export async function saveSohaConfig(values: Partial<Record<keyof typeof SOHA_SETTING_KEYS, string>>) {
  const entries = Object.entries(values).filter(([, v]) => v !== undefined) as [string, string][];
  for (const [key, value] of entries) {
    const name = SOHA_SETTING_KEYS[key as keyof typeof SOHA_SETTING_KEYS];
    if (!name) continue;
    await db.setting.upsert({ where: { name }, update: { value }, create: { name, value, group: "وب‌سرویس سها" } });
  }
}

// ------------------------------- ثبت اجرا -------------------------------
async function beginLog(service: string, entity: string, direction: "IN" | "OUT") {
  return db.syncLog.create({ data: { service, entity, direction, status: "در حال اجرا" } });
}

async function endLog(id: number, opts: { ok: boolean; records: number; cursor?: string; message?: string; startedAt: number }) {
  await db.syncLog.update({
    where: { id },
    data: {
      status: opts.ok ? "موفق" : "ناموفق",
      records: opts.records,
      cursor: opts.cursor,
      message: (opts.message ?? "").slice(0, 900),
      duration: Date.now() - opts.startedAt,
    },
  });
}

async function readCursor(entity: string): Promise<string | undefined> {
  const row = await db.setting.findUnique({ where: { name: sohaCursorKey(entity) } });
  return row?.value ?? undefined;
}

async function writeCursor(entity: string, cursor: string) {
  await db.setting.upsert({
    where: { name: sohaCursorKey(entity) },
    update: { value: cursor },
    create: { name: sohaCursorKey(entity), value: cursor, group: "وب‌سرویس سها" },
  });
}

// --------------------------- نگاشت فیلدها ---------------------------
// TODO(انتقال از PHP): نگاشت دقیق فیلدها را از ماژول PHP فعلی (توابع
// تبدیل آرایهٔ سها به مدل محلی) کپی کنید. نگاشت زیر بر اساس ساختار
// جدول‌های User و Referrs این سامانه نوشته شده است.

function toIsoDate(input?: string): Date | undefined {
  if (!input) return undefined;
  const d = new Date(input);
  return isNaN(d.getTime()) ? undefined : d;
}

// ------------------------- Patients: دریافت -------------------------
// بیماران/مراجعان سها را در جدول Users (با کد ملی به‌عنوان کلید) ثبت می‌کند.
export async function syncPatientsFromSoha(opts: { limit?: number } = {}): Promise<SohaSyncResult> {
  const cfg = await getSohaConfig();
  const startedAt = Date.now();
  const log = await beginLog("SOHA", "Patients", "IN");
  try {
    const client = new SohaClient(cfg);
    const cursor = await readCursor("Patients");
    // TODO(انتقال از PHP): مسیر واقعی سرویس فهرست بیماران در PHP را اینجا بگذارید.
    const res = await client.request<any>("GET", "/patients", {
      centerCode: cfg.centerCode, updatedSince: cursor, take: opts.limit ?? SYNC_PAGE_SIZE,
    });
    const items: SohaPatient[] = Array.isArray(res) ? res : (res?.items ?? res?.data ?? []);
    let records = 0;
    let newest = cursor ?? "";
    for (const p of items) {
      const nid = BigInt(String(p.nationalId ?? "").replace(/\D/g, "") || "0");
      if (!nid) continue;
      await db.user.upsert({
        where: { nid },
        update: {
          name: p.firstName || undefined,
          family: p.lastName || undefined,
          father: p.fatherName ?? undefined,
          gender: p.gender === "men" ? "مرد" : p.gender === "women" ? "زن" : undefined,
          birthday: toIsoDate(p.birthDate),
          mobile: p.mobile ? BigInt(p.mobile.replace(/\D/g, "").replace(/^98/, "0").padStart(11, "0")) : undefined,
          address: p.address ?? undefined,
          zipCode: p.postalCode ? BigInt(p.postalCode.replace(/\D/g, "")) : undefined,
        },
        create: {
          nid,
          username: String(nid),
          passwordHash: "-", // ورود محلی غیرفعال تا تغییر توسط مدیر
          name: p.firstName ?? "",
          family: p.lastName ?? "",
          father: p.fatherName,
          gender: p.gender === "men" ? "مرد" : p.gender === "women" ? "زن" : undefined,
          birthday: toIsoDate(p.birthDate),
          mobile: p.mobile ? BigInt(p.mobile.replace(/\D/g, "").replace(/^98/, "0").padStart(11, "0")) : BigInt(0),
          address: p.address,
          zipCode: p.postalCode ? BigInt(p.postalCode.replace(/\D/g, "")) : undefined,
        },
      });
      records++;
      if (p.birthDate && p.birthDate > newest) newest = p.birthDate;
    }
    if (newest) await writeCursor("Patients", newest);
    await endLog(log.id, { ok: true, records, cursor: newest || undefined, message: `همگام‌سازی ${records} بیمار از سها`, startedAt });
    return { ok: true, records, cursor: newest || undefined };
  } catch (e: any) {
    const msg = e instanceof SohaError ? e.message : (e?.message ?? "خطای ناشناخته");
    await endLog(log.id, { ok: false, records: 0, message: msg, startedAt });
    return { ok: false, records: 0, message: msg };
  }
}

// ------------------------ Referrals: دریافت ------------------------
// ارجاعات سها را در جدول Referrs (کلید یکتا: refId) ثبت می‌کند.
export async function syncReferralsFromSoha(opts: { limit?: number } = {}): Promise<SohaSyncResult> {
  const cfg = await getSohaConfig();
  const startedAt = Date.now();
  const log = await beginLog("SOHA", "Referrals", "IN");
  try {
    const client = new SohaClient(cfg);
    const cursor = await readCursor("Referrals");
    // TODO(انتقال از PHP): مسیر واقعی سرویس ارجاعات در PHP را اینجا بگذارید.
    const res = await client.request<any>("GET", "/referrals", {
      centerCode: cfg.centerCode, updatedSince: cursor, take: opts.limit ?? SYNC_PAGE_SIZE,
    });
    const items: SohaReferral[] = Array.isArray(res) ? res : (res?.items ?? res?.data ?? []);
    const services = await db.service.findMany({ select: { id: true, sohaId: true } });
    const bySohaId = new Map(services.map((s) => [s.sohaId, s.id]));
    let records = 0;
    let newest = cursor ?? "";
    for (const r of items) {
      const refId = BigInt(String(r.refId ?? "").replace(/\D/g, "") || "0");
      if (!refId) continue;
      const serviceId = bySohaId.get(Number(r.serviceCode)) ?? 1; // TODO(انتقال از PHP): رفتار خدمت ناشناخته
      const userNid = BigInt(String(r.nationalId ?? "").replace(/\D/g, "") || "0");
      const user = userNid ? await db.user.findUnique({ where: { nid: userNid }, select: { id: true } }) : null;
      const createdAt = toIsoDate(r.createdAt) ?? new Date();
      await db.referr.upsert({
        where: { refId },
        update: {
          description: r.description ?? undefined,
          sessionsCount: r.sessionsCount ?? undefined,
          status: r.status ?? undefined,
        },
        create: {
          refId,
          userId: user?.id ?? 0, // TODO(انتقال از PHP): سیاست ارجاع بدون کاربر ثبت‌شده
          userName: user ? undefined : "—",
          userNid: userNid || undefined,
          serviceId,
          description: r.description,
          isReferr: true,
          provinceId: 1, // TODO(انتقال از PHP): نگاشت کد استان سها به Province.apiCode
          cityId: undefined,
          centerId: cfg.centerCode ? undefined : undefined,
          sessionsCount: r.sessionsCount ?? 0,
          status: r.status ?? "در انتظار",
          creationDate: createdAt,
        },
      });
      records++;
      if (r.createdAt && r.createdAt > newest) newest = r.createdAt;
    }
    if (newest) await writeCursor("Referrals", newest);
    await endLog(log.id, { ok: true, records, cursor: newest || undefined, message: `همگام‌سازی ${records} ارجاع از سها`, startedAt });
    return { ok: true, records, cursor: newest || undefined };
  } catch (e: any) {
    const msg = e instanceof SohaError ? e.message : (e?.message ?? "خطای ناشناخته");
    await endLog(log.id, { ok: false, records: 0, message: msg, startedAt });
    return { ok: false, records: 0, message: msg };
  }
}

// ------------------------ Referrals: ارسال ------------------------
// TODO(انتقال از PHP): این خروجی باید نتیجهٔ جلسات/ارجاعات محلی را به سها
// اعلام کند. منطق دقیق (کدام رکوردها، با چه پیشوند وضعیتی) از PHP منتقل شود.
export async function pushReferralsToSoha(opts: { limit?: number } = {}): Promise<SohaSyncResult> {
  const cfg = await getSohaConfig();
  const startedAt = Date.now();
  const log = await beginLog("SOHA", "Referrals", "OUT");
  try {
    const client = new SohaClient(cfg);
    const pending = await db.referr.findMany({
      where: { status: "پذیرش‌شده" },
      take: Math.min(opts.limit ?? 50, 200),
      select: { id: true, refId: true, status: true, sessionsCount: true },
    });
    let records = 0;
    for (const r of pending) {
      // TODO(انتقال از PHP): مسیر واقعی اعلام وضعیت ارجاع به سها
      await client.request("POST", "/referrals/status", {
        centerCode: cfg.centerCode,
        refId: String(r.refId),
        status: r.status,
        sessionsCount: r.sessionsCount,
      });
      records++;
    }
    await endLog(log.id, { ok: true, records, message: `اعلام وضعیت ${records} ارجاع به سها`, startedAt });
    return { ok: true, records };
  } catch (e: any) {
    const msg = e instanceof SohaError ? e.message : (e?.message ?? "خطای ناشناخته");
    await endLog(log.id, { ok: false, records: 0, message: msg, startedAt });
    return { ok: false, records: 0, message: msg };
  }
}

// ------------------------------- نما (facade) -------------------------------
export async function runSohaSync(entity: SohaEntity, direction: "IN" | "OUT"): Promise<SohaSyncResult> {
  if (entity === "Patients") return syncPatientsFromSoha();
  if (entity === "Services") {
    // TODO(انتقال از PHP): دریافت فهرست خدمات سها و به‌روزرسانی Service.sohaId
    const cfg = await getSohaConfig();
    return { ok: false, records: 0, message: cfg.baseUrl ? "همگام‌سازی خدمات هنوز از PHP منتقل نشده است (TODO)" : "ابتدا آدرس وب‌سرویس سها را تنظیم کنید" };
  }
  return direction === "OUT" ? pushReferralsToSoha() : syncReferralsFromSoha();
}
