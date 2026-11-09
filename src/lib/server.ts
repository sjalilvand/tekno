// ابزارهای سمت سرور — احراز هویت با نشست امن و تبدیل امن JSON
import { db } from "@/lib/db";
import { scryptSync, randomBytes, timingSafeEqual, createHash } from "crypto";
import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import {
  parseRolePermissions, FULL_ACCESS_ROLES, ADMIN_TITLE_RE, COUNSELOR_TITLE_RE, SCOPED_MANAGER_TITLE_RE, isFullAccessTitle,
  hasPermission, canAction, actionLabel, SCOPE_ALL, type PermAction,
} from "@/lib/permissions";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

/** آیا رشتهٔ ذخیره‌شده قالب جدید سامانه (scrypt با نمک) است؟ */
export function isScryptHash(stored: string | null | undefined): boolean {
  return typeof stored === "string" && /^[0-9a-f]{32}:[0-9a-f]{64}$/i.test(stored.trim());
}

/** آیا هش ذخیره‌شده از سامانهٔ قدیمی PHP است؟ (هر چیزی غیر از قالب scrypt) */
export function isLegacyHash(stored: string | null | undefined): boolean {
  return Boolean(stored) && !isScryptHash(stored);
}

/**
 * بررسی رمز عبور با پشتیبانی از هش‌های قدیمی سامانهٔ PHP
 * (مهاجرت تدریجی): md5 / sha1 / sha256 (هگز) و در نهایت متن ساده.
 * قالب جدید: scrypt به شکل «salt:hash»
 */
export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const s = String(stored).trim();
  const p = String(password);
  if (isScryptHash(s)) {
    const [salt, hash] = s.split(":");
    try {
      const candidate = scryptSync(p, salt, 32);
      const expected = Buffer.from(hash, "hex");
      return candidate.length === expected.length && timingSafeEqual(candidate, expected);
    } catch {
      return false;
    }
  }
  // ---------- قالب‌های قدیمی (مهاجرت از PHP) ----------
  if (/^[0-9a-f]{32}$/i.test(s)) return s.toLowerCase() === createHash("md5").update(p).digest("hex");
  if (/^[0-9a-f]{40}$/i.test(s)) return s.toLowerCase() === createHash("sha1").update(p).digest("hex");
  if (/^[0-9a-f]{64}$/i.test(s)) return s.toLowerCase() === createHash("sha256").update(p).digest("hex");
  return s === p; // برخی نسخه‌های قدیمی رمز را متن ساده نگه می‌داشتند
}

const SESSION_COOKIE = "rz_session";

export function tokenFor(userId: number): string {
  return createHash("sha256").update(`rz:${userId}:${Date.now()}:${randomBytes(8)}`).digest("hex");
}

export async function createSession(userId: number, ip?: string, browser?: string) {
  const token = tokenFor(userId);
  await db.session.create({ data: { userId, token, ip: ip ?? "-", browser: browser ?? "-" } });
  return token;
}

export function getSessionToken(req: NextRequest): string | null {
  return req.cookies.get(SESSION_COOKIE)?.value ?? null;
}

export async function getSessionUser(req: NextRequest) {
  const token = getSessionToken(req);
  if (!token) return null;
  // findFirst — توکن دیگر یونیک نیست (دادهٔ legacy توکن تکراری دارد)
  const session = await db.session.findFirst({ where: { token }, include: { user: true } });
  if (!session) return null;
  return session.user;
}

/**
 * کاربر مؤثر درخواست — با پشتیبانی ورود نیابتی مدیر (نسخهٔ ۶.۵):
 * اگر کوکی rz_actas موجود باشد و نشستِ اصلی متعلق به مدیر باشد،
 * هویتِ کاربر هدف برگردانده می‌شود — در همهٔ APIها به‌صورت یکپارچه.
 */
export async function getCurrentUser(req: NextRequest) {
  const base = await getSessionUser(req);
  if (!base) return null;
  const actas = req.cookies.get(ACTAS_COOKIE)?.value;
  if (actas && /^\d+$/.test(actas)) {
    const baseAdmin = await isAdminUser(base.id);
    if (baseAdmin) {
      const target = await db.user.findUnique({ where: { id: Number(actas) } });
      if (target) return target;
    }
  }
  return base;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  };
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;

// =====================================================================
// دسترسی مؤثر و ورود نیابتی (نسخهٔ ۶.۵)
// resolveAccess — هویت مؤثر (کاربر واقعی یا کاربری که مدیر وارد آن شده)،
// نقش‌ها، ماتریس دسترسی، تشخیص ادمین و محدودسازی دادهٔ مشاور
// =====================================================================

export const ACTAS_COOKIE = "rz_actas";

export type AccessUser = Awaited<ReturnType<typeof db.user.findFirst>>;

export type AccessInfo = {
  user: NonNullable<AccessUser>;
  base: NonNullable<AccessUser>;
  actor: NonNullable<AccessUser> | null; // مدیرِ واردشده (در حالت نیابتی)
  acting: boolean;
  uid: number;
  roles: string[];
  perms: string[] | null; // ["*"] کامل | null قدیمی-باز | آرایهٔ کلیدها
  isAdmin: boolean;
  isCounselor: boolean;
  seeAllData: boolean;
  scope: DataScope; // دامنهٔ دادهٔ مؤثر (نسخهٔ ۶.۱۰)
};

// ------------------------------------------------------------------
// دامنهٔ داده (نسخهٔ ۶.۱۰) — تعریف اینکه هر نقش چه نوع داده‌ای را می‌بیند:
//   all      — همهٔ داده‌ها (مدیر سامانه / نقش با دامنهٔ کامل)
//   province — فقط دادهٔ استان‌های تعیین‌شده (مدیر استان)
//   center   — فقط دادهٔ مراکز/کلینیک‌های تعیین‌شده (مدیر کلینیک)
//   self     — فقط دادهٔ خودِ کاربر (مشاور — مراجعان خودش)
// برای مشاور چندکلینیکی، فهرست «centers» کلینیک‌های همکاری اوست تا
// دادهٔ هر کلینیک جداگانه قابل مشاهده باشد.
// ------------------------------------------------------------------
export type DataScope = {
  kind: "all" | "province" | "center" | "self";
  provinces: number[]; // استان‌های مجاز — مدیر استان
  centers: number[];   // مراکز مجاز — مدیر کلینیک یا کلینیک‌های همکاری مشاور
};

const ALL_SCOPE: DataScope = { kind: "all", provinces: [], centers: [] };
const SELF_SCOPE: DataScope = { kind: "self", provinces: [], centers: [] };

/** حل دامنهٔ دادهٔ مؤثر کاربر — نقش‌ها + محدودهٔ انتساب‌ها + عضویت مراکز */
async function resolveDataScope(
  user: NonNullable<AccessUser>,
  urs: Awaited<ReturnType<typeof activeRolesOf>>,
  perms: string[] | null,
  isAdmin: boolean,
): Promise<DataScope> {
  if (isAdmin) return ALL_SCOPE;
  if (perms && perms.includes(SCOPE_ALL)) return ALL_SCOPE; // کلید ویژهٔ «همهٔ داده‌ها»

  const provinces = new Set<number>();
  const centers = new Set<number>();
  let hasCenterRole = false; // حداقل یک نقش با دامنهٔ «مرکز»
  let hasProvinceRole = false;

  for (const ur of urs) {
    const ds = (ur.role as { dataScope?: string | null } | null)?.dataScope ?? null;
    if (ds === "all") return ALL_SCOPE;
    if (ds === "province") {
      hasProvinceRole = true;
      const pid = (ur as { provinceId?: number | null }).provinceId ?? user.provinceId ?? null;
      if (pid) provinces.add(Number(pid));
    } else if (ds === "center") {
      hasCenterRole = true;
      const cid = (ur as { centerId?: number | null }).centerId;
      if (cid) centers.add(Number(cid));
    }
  }

  // عضویت‌های مرکزی کاربر — کلینیک‌های همکاری (برای مشاور چندکلینیکی هم ملاک تفکیک است)
  const memberships = await db.userCenter.findMany({ where: { userId: user.id }, select: { centerId: true } });
  const memberIds = memberships.map((m) => Number(m.centerId));

  // اولویت: استان > مرکز > خودِ کاربر > همه (رفتار قدیمی نقش‌های بدون دامنه)
  if (hasProvinceRole) {
    if (!provinces.size && user.provinceId) provinces.add(Number(user.provinceId));
    if (!provinces.size) return SELF_SCOPE; // مدیر استان بدون استان تعیین‌شده — امن‌ترین حالت
    return { kind: "province", provinces: [...provinces], centers: [] };
  }
  if (hasCenterRole) {
    if (!centers.size) for (const c of memberIds) centers.add(c);
    if (!centers.size) return SELF_SCOPE; // مدیر مرکز بدون مرکز تعیین‌شده — امن‌ترین حالت
    return { kind: "center", provinces: [], centers: [...centers] };
  }
  // رفتار خودکار گذشته: نقش‌های مشاور فقط دادهٔ خودشان؛ سایر نقش‌ها همه‌چیز
  const isCounselor = urs.some((ur) => COUNSELOR_TITLE_RE.test(ur.role?.title ?? ""));
  if (isCounselor) return { kind: "self", provinces: [], centers: [...memberIds] };
  return ALL_SCOPE;
}

/** نقش‌های فعال کاربر (غیرمعلق و بدون تاریخ انقضا) */
export async function activeRolesOf(userId: number) {
  return db.userRole.findMany({
    where: { userId, isSuspended: false, OR: [{ endDate: null }, { endDate: { gt: new Date() } }] },
    include: { role: { select: { id: true, title: true, permissions: true, dataScope: true } } },
  });
}

// ------------------------------------------------------------------
// تشخیص مدیر — نسخهٔ ۶.۶ (سه لایه):
//   ۱) نقش فعال با عنوان مدیریتی یا کلید "*" در ماتریس دسترسی
//   ۲) مشخصات خودِ کاربر — حساب‌های قدیمی که «مدیر سامانه» در نام یا
//      نام‌خانوادگی‌شان است و هیچ رکورد نقشی ندارند
//   ۳) اگر جدول نقش‌ها به‌کلی خالی باشد، اولین کاربر سامانه = مدیر
// ------------------------------------------------------------------

/** الگوی سخت‌گیرانه برای مشخصات شخصی — «مدیری»/«مدیرزاده» مدیر حساب نمی‌شوند */
const ADMIN_SELF_RE = /مدیر\s*(سامانه|سیستم|کل|ارشد|فنی|عامل|مرکز|کلینیک)|sysadmin|superuser|administrator|^admin$/i;

/** آیا نام/نام‌خانوادگی/نام‌کاربری خودِ کاربر نشانهٔ مدیر بودن است؟ */
export function selfAdminSignal(u: { name?: string | null; family?: string | null; username?: string | null }): boolean {
  const hay = `${u.name ?? ""} ${u.family ?? ""}`.trim();
  if (hay && ADMIN_SELF_RE.test(hay)) return true;
  return /^(admin|administrator|sysadmin|root)$/i.test((u.username ?? "").trim());
}

/** در پایگاه‌های قدیمی بدون هیچ نقشی، اولین کاربر (کوچک‌ترین id) مدیر است */
async function legacyFirstAdminId(): Promise<number | null> {
  const count = await db.userRole.count();
  if (count > 0) return null;
  const first = await db.user.findFirst({ orderBy: { id: "asc" }, select: { id: true } });
  return first?.id ?? null;
}

/** آیا این کاربر مدیر است؟ (نقش، مشخصات شخصی یا جانشین اولین کاربر)
 *  نسخهٔ ۶.۱۰ — نقش‌های «مدیر استان/کلینیک/مرکز» ادمین کامل حساب نمی‌شوند؛
 *  دسترسی‌شان از دامنهٔ دادهٔ نقش (dataScope) تعیین می‌شود. */
export async function isAdminUser(userId: number): Promise<boolean> {
  const urs = await activeRolesOf(userId);
  const roleAdmin = urs.some((ur) => {
    const t = ur.role?.title ?? "";
    if (isFullAccessTitle(t)) return true;
    if (SCOPED_MANAGER_TITLE_RE.test(t)) return false; // مدیر محدود — نه ادمین
    return ADMIN_TITLE_RE.test(t) || (parseRolePermissions((ur.role as { permissions?: string | null })?.permissions ?? null)?.includes("*") ?? false);
  });
  if (roleAdmin) return true;
  const u = await db.user.findUnique({ where: { id: userId }, select: { name: true, family: true, username: true } });
  if (u && selfAdminSignal(u)) return true;
  const firstId = await legacyFirstAdminId();
  return firstId !== null && firstId === userId;
}

/** حل کامل دسترسی درخواست — هویت مؤثر + نقش‌ها + ماتریس + اسکوپ داده */
export async function resolveAccess(req: NextRequest): Promise<AccessInfo | null> {
  const base = await getSessionUser(req);
  if (!base) return null;

  // getCurrentUser خودش نیابت را حل می‌کند — اینجا فقط هویت مؤثر و پایه را تفکیک می‌کنیم
  const user = (await getCurrentUser(req)) ?? base;
  const acting = user.id !== base.id;
  const actor = acting ? base : null;

  const urs = await activeRolesOf(user.id);
  const titles = urs.map((ur) => ur.role?.title ?? "");
  const permLists = urs.map((ur) => parseRolePermissions((ur.role as { permissions?: string | null })?.permissions ?? null));
  const isFull =
    titles.some((t) => isFullAccessTitle(t)) ||
    (titles.some((t) => ADMIN_TITLE_RE.test(t)) && !titles.every((t) => !ADMIN_TITLE_RE.test(t) || SCOPED_MANAGER_TITLE_RE.test(t))) ||
    permLists.some((p) => p?.includes("*")) ||
    selfAdminSignal(user) ||
    (await legacyFirstAdminId()) === user.id;
  const perms: string[] | null = isFull ? ["*"] : permLists.some((p) => p === null) ? null : [...new Set(permLists.flatMap((p) => p ?? []))];
  const isAdmin = isFull;
  const isCounselor = !isAdmin && titles.some((t) => COUNSELOR_TITLE_RE.test(t));
  const scope = await resolveDataScope(user, urs, perms, isAdmin);
  const seeAllData = scope.kind === "all";

  return { user, base, actor, acting, uid: user.id, roles: titles, perms, isAdmin, isCounselor, seeAllData, scope };
}

/** شرط اسکوپ جلسات — بر پایهٔ دامنهٔ دادهٔ مؤثر (نسخهٔ ۶.۱۰)
 *  all → همه | province → جلسات مراکز آن استان‌ها | center → جلسات آن مراکز | self → جلسات خود مشاور */
export function eventScopeWhere(acc: AccessInfo): Prisma.EventWhereInput {
  if (acc.seeAllData) return {};
  const s = acc.scope;
  if (s.kind === "province" && s.provinces.length) return { center: { provinceId: { in: s.provinces } } };
  if (s.kind === "center" && s.centers.length) return { centerId: { in: s.centers } };
  return { OR: [{ acceptorId: acc.uid }, { supervisorId: acc.uid }] };
}

/** شرط اسکوپ جلسات در SQL خام — قابل حمل بین SQLite و MySQL
 *  alias خالی («») برای زیرکوئری‌های بدون نام مستعار */
export function eventScopeSql(acc: AccessInfo, alias = "e"): { clause: string; args: unknown[] } {
  if (acc.seeAllData) return { clause: "", args: [] };
  const s = acc.scope;
  const col = (name: string) => (alias ? `\`${alias}\`.\`${name}\`` : `\`${name}\``);
  if (s.kind === "province" && s.provinces.length) {
    const ph = s.provinces.map(() => "?").join(",");
    return { clause: ` AND ${col("centerId")} IN (SELECT c.\`id\` FROM \`Centers\` c WHERE c.\`provinceId\` IN (${ph}))`, args: [...s.provinces] };
  }
  if (s.kind === "center" && s.centers.length) {
    const ph = s.centers.map(() => "?").join(",");
    return { clause: ` AND ${col("centerId")} IN (${ph})`, args: [...s.centers] };
  }
  return { clause: ` AND (${col("acceptorId")} = ? OR ${col("supervisorId")} = ?)`, args: [acc.uid, acc.uid] };
}

/** شرط اسکوپ بدون «AND» — برای جایگذاری داخل شرط‌های ترکیبی */
export function eventScopeBare(acc: AccessInfo, alias = ""): { sql: string; args: unknown[] } {
  const { clause, args } = eventScopeSql(acc, alias);
  return { sql: clause.replace(/^\s*AND\s+/, "") || "1=1", args };
}

/** شرط اسکوپ «کاربران/مراجعان قابل مشاهده» — Prisma */
export function clientScopeWhere(acc: AccessInfo): Prisma.UserWhereInput {
  if (acc.seeAllData) return {};
  const s = acc.scope;
  if (s.kind === "province" && s.provinces.length) {
    return {
      OR: [
        { provinceId: { in: s.provinces } },
        { eventsAsClient: { some: { center: { provinceId: { in: s.provinces } } } } },
      ],
    };
  }
  if (s.kind === "center" && s.centers.length) {
    return { eventsAsClient: { some: { centerId: { in: s.centers } } } };
  }
  return {
    OR: [
      { id: acc.uid },
      { eventsAsClient: { some: { OR: [{ acceptorId: acc.uid }, { supervisorId: acc.uid }] } } },
    ],
  };
}

/** شرط اسکوپ «کاربران/مراجعان قابل مشاهده» — SQL خام (ستون‌های جدول Users) */
export function clientScopeSql(acc: AccessInfo, alias = "u"): { clause: string; args: unknown[] } {
  if (acc.seeAllData) return { clause: "", args: [] };
  const s = acc.scope;
  const a = `\`${alias}\``;
  if (s.kind === "province" && s.provinces.length) {
    const ph = s.provinces.map(() => "?").join(",");
    return {
      clause: ` AND (${a}.\`provinceId\` IN (${ph}) OR ${a}.\`id\` IN (SELECT e.\`userId\` FROM \`Events\` e JOIN \`Centers\` c ON e.\`centerId\` = c.\`id\` WHERE c.\`provinceId\` IN (${ph})))`,
      args: [...s.provinces, ...s.provinces],
    };
  }
  if (s.kind === "center" && s.centers.length) {
    const ph = s.centers.map(() => "?").join(",");
    return { clause: ` AND ${a}.\`id\` IN (SELECT e.\`userId\` FROM \`Events\` e WHERE e.\`centerId\` IN (${ph}))`, args: [...s.centers] };
  }
  return { clause: ` AND (${a}.\`id\` = ? OR ${a}.\`id\` IN (SELECT e.\`userId\` FROM \`Events\` e WHERE e.\`acceptorId\` = ? OR e.\`supervisorId\` = ?))`, args: [acc.uid, acc.uid, acc.uid] };
}

/** شناسهٔ مراکز مجاز برای فیلترهای UI — null یعنی بدون محدودیت */
export async function scopeCenterIds(acc: AccessInfo): Promise<number[] | null> {
  if (acc.seeAllData) return null;
  const s = acc.scope;
  if (s.kind === "province" && s.provinces.length) {
    const rows = await db.center.findMany({ where: { provinceId: { in: s.provinces } }, select: { id: true } });
    return rows.map((c) => Number(c.id));
  }
  if (s.centers.length) return s.centers;
  return null; // مشاور بدون کلینیک ثبت‌شده — محدودیتی روی فیلتر نیست
}

/** الحاق امن شرط اسکوپ به where موجود (با AND — تا OR جستجو خراب نشود) */
export function applyEventScope<T extends { AND?: object[] }>(where: T, acc: AccessInfo): T {
  const scope = eventScopeWhere(acc);
  if (!scope.OR) return where;
  where.AND = [...(where.AND ?? []), scope];
  return where;
}

/** شرط اسکوپ برای مدل‌های فرزند جلسه (رزرو/مورد حاد/…) — از رابطهٔ «event»
 *  نسخهٔ ۶.۱۱ — applyEventScope روی این مدل‌ها ستون‌های Event را مستقیم
 *  می‌گذاشت و برای کاربران محدود (مشاور/مدیر استان/کلینیک) خطای ۵۰۰ می‌داد. */
export function childEventScopeWhere(acc: AccessInfo): { event: Prisma.EventWhereInput } {
  return { event: eventScopeWhere(acc) };
}

/** گارد عملیات — دسترسی مؤثر را برمی‌گرداند یا پاسخ خطای 403/401 می‌دهد */
export async function guardAction(
  req: NextRequest,
  module: string,
  action: PermAction,
  moduleLabel?: string
): Promise<{ acc: AccessInfo; error: null } | { acc: null; error: Response }> {
  const acc = await resolveAccess(req);
  if (!acc) return { acc: null, error: fail("UNAUTHORIZED", 401) };
  if (!canAction(acc.perms, module, action)) {
    return {
      acc: null,
      error: fail(`دسترسی «${actionLabel(action)}» در بخش ${moduleLabel ?? module} برای نقش شما باز نیست`, 403),
    };
  }
  return { acc, error: null };
}

/** گارد مدیر — برای بخش‌های حساس سیستم */
export async function guardAdmin(req: NextRequest): Promise<{ acc: AccessInfo; error: null } | { acc: null; error: Response }> {
  const acc = await resolveAccess(req);
  if (!acc) return { acc: null, error: fail("UNAUTHORIZED", 401) };
  if (!acc.isAdmin) return { acc: null, error: fail("فقط مدیر سامانه به این بخش دسترسی دارد", 403) };
  return { acc, error: null };
}

/** آیا مسیرِ ماژول در ماتریس دسترسی کاربر باز است؟ */
export function hasModuleAccess(acc: AccessInfo, module: string): boolean {
  return hasPermission(acc.perms, module);
}

/** تبدیل امن به JSON — BigInt و Date به نوع قابل سریال‌شدن تبدیل می‌شوند */
 
export function safeJson(data: any): any {
  return JSON.parse(
    JSON.stringify(data, (_k, v) => {
      if (typeof v === "bigint") return Number(v);
      return v;
    })
  );
}

/** پاسخ استاندارد موفق */
 
export function ok(data: any = true) {
  return Response.json(safeJson(data));
}

/** پاسخ خطا */
export function fail(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

/** خواندن پارامترهای جستجو */
export function params(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  return {
    q: sp.get("q")?.trim() ?? "",
    status: sp.get("status") ?? "",
    serviceId: sp.get("serviceId") ?? "",
    centerId: sp.get("centerId") ?? "",
    provinceId: sp.get("provinceId") ?? "",
    roleId: sp.get("roleId") ?? "",
    level: sp.get("level") ?? "",
    year: sp.get("year") ?? "",
    from: sp.get("from") ?? "",
    to: sp.get("to") ?? "",
    page: Math.max(1, Number(sp.get("page") ?? 1)),
    pageSize: Math.min(100, Math.max(5, Number(sp.get("pageSize") ?? 20))),
  };
}
