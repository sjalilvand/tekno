import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { guardAction, ok, fail, params, scopeCenterIds, type AccessInfo } from "@/lib/server";
import type { Prisma } from "@prisma/client";

const MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];

function txWhere(centerIds: number[] | null, kind: string, q: string, centerFilter: string, from: string, to: string): Prisma.FinanceTransactionWhereInput {
  const where: Prisma.FinanceTransactionWhereInput = {};
  const centerScope = centerIds ? [...centerIds] : [];
  if (centerFilter) centerScope.push(Number(centerFilter));
  if (centerScope.length) where.centerId = { in: centerScope };
  if (kind === "income" || kind === "expense") where.kind = kind;
  if (q) where.OR = [{ title: { contains: q } }, { description: { contains: q } }, { category: { contains: q } }];
  if (from || to) {
    where.occurredAt = {};
    if (from) where.occurredAt.gte = new Date(from);
    if (to) where.occurredAt.lte = new Date(`${to}T23:59:59.999Z`);
  }
  return where;
}

/** حسابداری — خلاصهٔ عملکرد + دفتر تراکنش‌های درآمد/هزینه (نسخهٔ ۶.۱۲) */
export async function GET(req: NextRequest) {
  const g = await guardAction(req, "finance", "view", "عملکرد مالی");
  if (g.error) return g.error;
  const acc: AccessInfo = g.acc;
  const centerIds = await scopeCenterIds(acc);
  const sp = req.nextUrl.searchParams;

  // ─── حالت فهرست تراکنش‌ها ───
  if (sp.get("list") === "1") {
    const where = txWhere(
      centerIds, sp.get("kind") ?? "", sp.get("q") ?? "",
      sp.get("centerId") ?? "", sp.get("from") ?? "", sp.get("to") ?? ""
    );
    const page = Math.max(1, Number(sp.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(5, Number(sp.get("pageSize") ?? 20)));
    const [total, rows, sums] = await Promise.all([
      db.financeTransaction.count({ where }),
      db.financeTransaction.findMany({
        where, orderBy: { occurredAt: "desc" },
        skip: (page - 1) * pageSize, take: pageSize,
      }),
      db.financeTransaction.aggregate({ where, _sum: { amount: true } }),
    ]);
    const centerTitles = new Map(
      (await db.center.findMany({
        where: { id: { in: rows.map((r) => r.centerId).filter((x): x is number => typeof x === "number") } },
        select: { id: true, title: true },
      })).map((c) => [c.id, c.title])
    );
    return ok({
      total, page, totalPages: Math.ceil(total / pageSize), sum: sums._sum.amount ?? 0,
      items: rows.map((r) => ({
        id: r.id, kind: r.kind, title: r.title, category: r.category, amount: Number(r.amount),
        method: r.method, centerId: r.centerId, centerTitle: r.centerId ? centerTitles.get(r.centerId) ?? "—" : null,
        eventId: r.eventId, occurredAt: r.occurredAt, description: r.description,
      })),
    });
  }

  // ─── خلاصهٔ عملکرد مالی ───
  const now = new Date();
  const eventWhere: Prisma.EventWhereInput = { status: "تایید نهایی" };
  if (centerIds) eventWhere.centerId = { in: centerIds };
  const emsWhere: Prisma.EventsEmsWhereInput = centerIds ? { event: { centerId: { in: centerIds } } } : {};
  const txScopeWhere = txWhere(centerIds, "", "", "", "", "");

  const [feeSums, emsSums, emsPaidCount, monthlyEvents, centerIncome, contractIncome, txAgg, monthlyTx, txByCategory] = await Promise.all([
    db.event.aggregate({ where: eventWhere, _sum: { userTariff: true, acceptorFee: true, supervisorFee: true, centerFee: true, adminFee: true, secretaryFee: true }, _count: true }),
    db.eventsEms.aggregate({ where: emsWhere, _sum: { hadPaymentAmount: true } }),
    db.eventsEms.count({ where: { ...emsWhere, hadPaymentStatus: "پرداخت شده" } }),
    db.event.findMany({
      where: { ...eventWhere, startDate: { gte: new Date(now.getTime() - 330 * 86400000) } },
      select: { startDate: true, userTariff: true, acceptorFee: true, centerFee: true },
    }),
    db.event.groupBy({ by: ["centerId"], where: eventWhere, _sum: { userTariff: true }, _count: true, orderBy: { _sum: { userTariff: "desc" } }, take: 8 }),
    db.corporateContractService.aggregate({ _sum: { userTariff: true }, _count: true }),
    db.financeTransaction.aggregate({ where: { ...txScopeWhere, kind: "income" }, _sum: { amount: true }, _count: true }),
    db.financeTransaction.findMany({
      where: { ...txScopeWhere, occurredAt: { gte: new Date(now.getTime() - 330 * 86400000) } },
      select: { kind: true, amount: true, occurredAt: true },
    }),
    db.financeTransaction.groupBy({ by: ["kind", "category"], where: txScopeWhere, _sum: { amount: true }, _count: true, orderBy: { _sum: { amount: "desc" } } }),
  ]);

  // تراز حسابداری: درآمد جلسات + تراکنش‌های دستی درآمد − هزینه‌ها
  const txIncome = Number(txAgg._sum.amount ?? 0);
  const expenseAgg = await db.financeTransaction.aggregate({ where: { ...txScopeWhere, kind: "expense" }, _sum: { amount: true }, _count: true });
  const txExpense = Number(expenseAgg._sum.amount ?? 0);

  const centers = await db.center.findMany({ where: { id: { in: centerIncome.map((c) => c.centerId) } }, select: { id: true, title: true } });

  const monthMap = new Map<string, { income: number; fee: number; center: number; expense: number }>();
  for (let i = 10; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthMap.set(`${d.getFullYear()}-${d.getMonth()}`, { income: 0, fee: 0, center: 0, expense: 0 });
  }
  for (const ev of monthlyEvents) {
    if (!ev.startDate) continue;
    const d = new Date(ev.startDate);
    const m = monthMap.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (m) { m.income += ev.userTariff; m.fee += ev.acceptorFee; m.center += ev.centerFee; }
  }
  for (const tx of monthlyTx) {
    const d = new Date(tx.occurredAt);
    const m = monthMap.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (!m) continue;
    const amt = Number(tx.amount);
    if (tx.kind === "income") m.income += amt;
    else m.expense += amt;
  }
  const series = Array.from(monthMap.entries()).map(([key, v]) => {
    const [, mo] = key.split("-").map(Number);
    return { month: MONTHS[mo], ...v };
  });

  const gross = feeSums._sum.userTariff ?? 0;

  return ok({
    totals: {
      gross,
      consultantFees: feeSums._sum.acceptorFee ?? 0,
      supervisorFees: feeSums._sum.supervisorFee ?? 0,
      centerFees: feeSums._sum.centerFee ?? 0,
      adminFees: feeSums._sum.adminFee ?? 0,
      secretaryFees: feeSums._sum.secretaryFee ?? 0,
      events: feeSums._count,
      emsPaid: Number(emsSums._sum.hadPaymentAmount ?? 0),
      emsCount: emsPaidCount,
      txIncome, txIncomeCount: txAgg._count,
      txExpense, txExpenseCount: expenseAgg._count,
      balance: gross + txIncome - txExpense,
    },
    series,
    centerIncome: centerIncome.map((c) => ({
      name: centers.find((x) => x.id === c.centerId)?.title ?? "—",
      income: c._sum.userTariff ?? 0, sessions: c._count,
    })),
    contractTotal: contractIncome._count,
    categories: txByCategory.map((c) => ({
      kind: c.kind, category: c.category, amount: Number(c._sum.amount ?? 0), count: c._count,
    })),
  });
}

/** ثبت تراکنش مالی — درآمد یا هزینه */
export async function POST(req: NextRequest) {
  const g = await guardAction(req, "finance", "create", "عملکرد مالی");
  if (g.error) return g.error;
  const body = await req.json().catch(() => ({}));

  const kind = body.kind === "expense" ? "expense" : "income";
  const title = String(body.title ?? "").trim();
  const amount = Math.round(Number(body.amount));
  if (!title) return fail("عنوان تراکنش الزامی است");
  if (!amount || amount <= 0) return fail("مبلغ باید عددی مثبت باشد");

  const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date();
  if (isNaN(occurredAt.getTime())) return fail("تاریخ نامعتبر است");

  const tx = await db.financeTransaction.create({
    data: {
      kind, title: title.slice(0, 200),
      category: String(body.category ?? "عمومی").slice(0, 80),
      amount: BigInt(amount),
      method: body.method ? String(body.method).slice(0, 30) : null,
      centerId: body.centerId ? Number(body.centerId) : null,
      eventId: body.eventId ? Number(body.eventId) : null,
      occurredAt,
      description: body.description ? String(body.description).slice(0, 1000) : null,
      createdBy: g.acc.uid,
    },
  });

  await db.log.create({
    data: {
      userId: g.acc.uid, category: "مالی", level: 2,
      description: `ثبت تراکنش ${kind === "income" ? "درآمد" : "هزینه"} «${title}» به مبلغ ${amount} ریال`,
      ip: req.headers.get("x-forwarded-for") ?? "-",
    },
  }).catch(() => {});

  return ok({ id: tx.id });
}

/** حذف تراکنش — فقط با دسترسی حذف مالی */
export async function DELETE(req: NextRequest) {
  const g = await guardAction(req, "finance", "delete", "عملکرد مالی");
  if (g.error) return g.error;
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) return fail("شناسه تراکنش الزامی است");
  const tx = await db.financeTransaction.findUnique({ where: { id } });
  if (!tx) return fail("تراکنش پیدا نشد", 404);
  await db.financeTransaction.delete({ where: { id } });
  await db.log.create({
    data: {
      userId: g.acc.uid, category: "مالی", level: 1,
      description: `حذف تراکنش «${tx.title}»`,
      ip: req.headers.get("x-forwarded-for") ?? "-",
    },
  }).catch(() => {});
  return ok();
}
