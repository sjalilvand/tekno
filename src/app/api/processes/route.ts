import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, ok, fail } from "@/lib/server";
import { jDate } from "@/lib/jalali";

// =====================================================================
// فرایندهای سفارشی — تعریف و نمونه‌های اجرا
// • GET              : فهرست تعریف‌ها + نمونه‌های در جریان
// • POST {action}    :
//    create  {title, desc, steps:[{name,slaHours}], bpmnFile?}
//    update  {id, title?, desc?, steps?, isActive?}
//    delete  {id}
//    start   {processId, refType, refId, title?}   → ایجاد نمونهٔ اجرا
//    advance {instanceId, note?}                    → تکمیل مرحلهٔ جاری
//    stop    {instanceId} / complete {instanceId}
// =====================================================================

type StepDef = { name: string; slaHours: number };

function parseSteps(raw: unknown): StepDef[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: StepDef[] = [];
  for (const s of raw as any[]) {
    const name = String(s?.name ?? "").trim();
    const sla = Number(s?.slaHours ?? 24);
    if (!name) return null;
    out.push({ name, slaHours: Number.isFinite(sla) && sla > 0 ? sla : 24 });
  }
  return out;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const defs = await db.processDefinition.findMany({ orderBy: { id: "desc" } });
  const instances = await db.processInstance.findMany({
    orderBy: { startedAt: "desc" },
    take: 100,
    include: {
      process: { select: { title: true, bpmnFile: true, steps: true } },
      stepLogs: { orderBy: { stepIdx: "asc" } },
    },
  });
  return ok({
    definitions: defs.map((d) => ({ ...d, steps: JSON.parse(d.steps || "[]") })),
    instances: instances.map((i) => ({
      id: i.id, processId: i.processId, processTitle: i.process.title,
      bpmnFile: i.process.bpmnFile,
      steps: JSON.parse(i.process.steps || "[]"),
      refType: i.refType, refId: i.refId, title: i.title,
      currentStep: i.currentStep, status: i.status,
      startedAt: i.startedAt, completedAt: i.completedAt,
      logs: i.stepLogs.map((l) => ({ stepIdx: l.stepIdx, name: l.name, enteredAt: l.enteredAt, exitedAt: l.exitedAt, durationMin: l.durationMin })),
    })),
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return fail("UNAUTHORIZED", 401);
  const body = await req.json().catch(() => null);
  if (!body?.action) return fail("BAD_REQUEST");

  switch (body.action) {
    case "create": {
      const steps = parseSteps(body.steps);
      if (!steps) return fail("مرحله‌های فرایند نامعتبر است");
      const title = String(body.title ?? "").trim();
      if (!title) return fail("عنوان فرایند الزامی است");
      const base = title.replace(/\s+/g, "-").slice(0, 40);
      const def = await db.processDefinition.create({
        data: {
          key: `custom-${base}-${Date.now().toString(36)}`,
          title,
          desc: body.desc ? String(body.desc).slice(0, 500) : null,
          bpmnFile: body.bpmnFile ? String(body.bpmnFile) : null,
          steps: JSON.stringify(steps),
        },
      });
      return ok({ id: def.id });
    }
    case "update": {
      const data: Record<string, unknown> = {};
      if (body.title !== undefined) data.title = String(body.title).slice(0, 120);
      if (body.desc !== undefined) data.desc = body.desc ? String(body.desc).slice(0, 500) : null;
      if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
      if (body.steps !== undefined) {
        const steps = parseSteps(body.steps);
        if (!steps) return fail("مرحله‌های فرایند نامعتبر است");
        data.steps = JSON.stringify(steps);
      }
      await db.processDefinition.update({ where: { id: Number(body.id) }, data }).catch(() => null);
      return ok();
    }
    case "delete": {
      const id = Number(body.id);
      await db.processStepLog.deleteMany({ where: { instance: { processId: id } } });
      await db.processInstance.deleteMany({ where: { processId: id } });
      await db.processDefinition.delete({ where: { id } }).catch(() => null);
      return ok();
    }
    case "start": {
      const pid = Number(body.processId);
      const def = await db.processDefinition.findUnique({ where: { id: pid } });
      if (!def) return fail("فرایند یافت نشد", 404);
      const refType = ["Event", "User", "GroupEvent"].includes(body.refType) ? body.refType : "Event";
      const refId = Number(body.refId);
      if (!refId) return fail("مرجع نمونهٔ اجرا نامعتبر است");
      const existing = await db.processInstance.findUnique({
        where: { processId_refType_refId: { processId: pid, refType, refId } },
      });
      if (existing) {
        // شروع مجدد — پاک‌سازی لاگ‌های قبلی
        await db.processStepLog.deleteMany({ where: { instanceId: existing.id } });
        await db.processInstance.update({
          where: { id: existing.id },
          data: {
            status: "در جریان", currentStep: 0, completedAt: null,
            title: body.title ? String(body.title).slice(0, 120) : undefined,
            stepLogs: { create: [{ stepIdx: 0, name: (JSON.parse(def.steps || "[]") as StepDef[])[0]?.name ?? "مرحلهٔ اول" }] },
          },
        });
        return ok({ id: existing.id, restarted: true });
      }
      const inst = await db.processInstance.create({
        data: {
          processId: pid, refType, refId,
          title: body.title ? String(body.title).slice(0, 120) : null,
          stepLogs: {
            create: [{ stepIdx: 0, name: (JSON.parse(def.steps || "[]") as StepDef[])[0]?.name ?? "مرحلهٔ اول" }],
          },
        },
      });
      return ok({ id: inst.id });
    }
    case "advance": {
      const inst = await db.processInstance.findUnique({
        where: { id: Number(body.instanceId) },
        include: { process: true, stepLogs: true },
      });
      if (!inst) return fail("نمونهٔ اجرا یافت نشد", 404);
      const steps = JSON.parse(inst.process.steps || "[]") as StepDef[];
      const cur = inst.stepLogs.find((l) => l.stepIdx === inst.currentStep && !l.exitedAt);
      const now = new Date();
      if (cur) {
        await db.processStepLog.update({
          where: { id: cur.id },
          data: { exitedAt: now, durationMin: Math.max(0, Math.round((now.getTime() - cur.enteredAt.getTime()) / 60000)) },
        });
      }
      if (inst.currentStep + 1 >= steps.length) {
        await db.processInstance.update({ where: { id: inst.id }, data: { status: "تکمیل", completedAt: now } });
        return ok({ completed: true });
      }
      await db.processInstance.update({ where: { id: inst.id }, data: { currentStep: inst.currentStep + 1 } });
      await db.processStepLog.create({
        data: { instanceId: inst.id, stepIdx: inst.currentStep + 1, name: steps[inst.currentStep + 1]?.name ?? "مرحلهٔ بعدی", note: body.note ? String(body.note).slice(0, 300) : null },
      });
      return ok({ advancedTo: inst.currentStep + 1 });
    }
    case "stop": {
      await db.processInstance.update({ where: { id: Number(body.instanceId) }, data: { status: "متوقف" } });
      return ok();
    }
    case "complete": {
      const inst = await db.processInstance.findUnique({
        where: { id: Number(body.instanceId) }, include: { process: true, stepLogs: true },
      });
      if (!inst) return fail("نمونهٔ اجرا یافت نشد", 404);
      const now = new Date();
      const cur = inst.stepLogs.find((l) => l.stepIdx === inst.currentStep && !l.exitedAt);
      if (cur) {
        await db.processStepLog.update({
          where: { id: cur.id },
          data: { exitedAt: now, durationMin: Math.max(0, Math.round((now.getTime() - cur.enteredAt.getTime()) / 60000)) },
        });
      }
      await db.processInstance.update({ where: { id: inst.id }, data: { status: "تکمیل", completedAt: now, currentStep: Math.max(0, inst.currentStep) } });
      return ok();
    }
    default:
      return fail("عملیات نامعتبر");
  }
}
