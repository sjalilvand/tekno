// =====================================================================
// تولید نمودارهای BPMN فرایندهای «مرکز مشاوره رز» — خروجی در public/bpmn/
// هر فرایند: استارت → کارها/گیت‌وی → پایان، با مختصات DI معتبر برای bpmn-js
// اجرا: node scripts/gen-bpmn.mjs
// =====================================================================
import { mkdirSync, writeFileSync } from "node:fs";

const W = 100, H = 80;            // ابعاد کار
const GW = 50, GH = 50;           // ابعاد گیت‌وی
const EV = 36;                    // ابعاد رویداد
const STEP = 180;                 // فاصلهٔ ستون‌ها
const MID_Y = 240;                // خط مرکزی

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * تعریف فرایند:
 * nodes: { id, kind: start|end|task|gateway, label, col, row }  row: 0=مرکزی، 1=پایین، -1=بالا
 * flows: [fromId, toId, label?]
 */
function makeDiagram({ file, name, doc, nodes, flows }) {
  const pos = {};
  const size = {};
  for (const n of nodes) {
    const x = 120 + n.col * STEP;
    const y = MID_Y + n.row * 130;
    pos[n.id] = { x, y };
    size[n.id] = n.kind === "gateway" ? [GW, GH] : n.kind === "start" || n.kind === "end" ? [EV, EV] : [W, H];
  }
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const center = (id) => {
    const p = pos[id], s = size[id];
    return { cx: p.x + s[0] / 2, cy: p.y + s[1] / 2, r: p, s };
  };

  const shapes = nodes.map((n) => {
    const { r, s } = center(n.id);
    let lbl = "";
    if (n.kind === "task") {
      lbl = "\n          <bpmndi:BPMNLabel>\n            <dc:Bounds x=\"" + (r.x + 4) + "\" y=\"" + (r.y + 16) + "\" width=\"" + (s[0] - 8) + "\" height=\"" + (s[1] - 32) + "\" />\n          </bpmndi:BPMNLabel>";
    } else if (n.kind === "gateway") {
      lbl = "\n          <bpmndi:BPMNLabel>\n            <dc:Bounds x=\"" + (r.x + GW / 2 - 50) + "\" y=\"" + (r.y + GH + 8) + "\" width=\"100\" height=\"14\" />\n          </bpmndi:BPMNLabel>";
    } else {
      lbl = "\n          <bpmndi:BPMNLabel>\n            <dc:Bounds x=\"" + (r.x + EV / 2 - 55) + "\" y=\"" + (r.y + EV + 6) + "\" width=\"110\" height=\"14\" />\n          </bpmndi:BPMNLabel>";
    }
    return `        <bpmndi:BPMNShape id="Shape_${n.id}" bpmnElement="${n.id}">
          <dc:Bounds x="${r.x}" y="${r.y}" width="${s[0]}" height="${s[1]}" />${lbl}
        </bpmndi:BPMNShape>`;
  }).join("\n");

  const edges = flows.map(([from, to, label], i) => {
    const a = center(from), b = center(to);
    const fa = byId[from], tb = byId[to];
    // خروج از سمت چپ/راست بسته به جهت ستون
    const outX = a.r.x + a.s[0], inX = b.r.x;
    let wpts;
    if (a.cy === b.cy) {
      wpts = [[outX, a.cy], [inX, b.cy]];
    } else {
      const midX = (outX + inX) / 2;
      wpts = [[outX, a.cy], [midX, a.cy], [midX, b.cy], [inX, b.cy]];
    }
    const wp = wpts.map(([x, y]) => `<di:waypoint x="${x}" y="${y}" />`).join("           ");
    return `        <bpmndi:BPMNEdge id="Edge_${i + 1}" bpmnElement="Flow_${i + 1}">
          ${wp}
          ${label ? `<bpmndi:BPMNLabel><dc:Bounds x="${(outX + inX) / 2 - 40}" y="${a.cy - 20}" width="80" height="14" /></bpmndi:BPMNLabel>` : ""}
        </bpmndi:BPMNEdge>`;
  }).join(" ");

  const flowEls = flows.map(([from, to, label], i) =>
    `    <bpmn:sequenceFlow id="Flow_${i + 1}" sourceRef="${from}" targetRef="${to}"${label ? ` name="${esc(label)}"` : ""} />`
  ).join(" ");

  const nodeEls = nodes.map((n) => {
    const label = esc(n.label);
    if (n.kind === "start") return `    <bpmn:startEvent id="${n.id}" name="${label}" />`;
    if (n.kind === "end") return `    <bpmn:endEvent id="${n.id}" name="${label}" />`;
    if (n.kind === "gateway") return `    <bpmn:exclusiveGateway id="${n.id}" name="${label}" />`;
    return `    <bpmn:task id="${n.id}" name="${label}" />`;
  }).join(" ");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  id="Defs_${file.replace(/[^a-z]/g, "")}"
                  targetNamespace="http://raz.ir/bpmn">
  <bpmn:process id="Process_${file.replace(/[^a-z]/g, "")}" isExecutable="false">
${nodeEls}
${flowEls}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_${file.replace(/[^a-z]/g, "")}">
    <bpmndi:BPMNPlane id="Plane_${file.replace(/[^a-z]/g, "")}" bpmnElement="Process_${file.replace(/[^a-z]/g, "")}">
${shapes}
${edges}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`;

  writeFileSync(`public/bpmn/${file}.bpmn`, xml, "utf8");
  console.log(`✓ ${file}.bpmn (${nodes.length} گره، ${flows.length} جریان)`);
}

mkdirSync("public/bpmn", { recursive: true });

// ---------------------------------------------------------------- ۱) ثبت و پذیرش جلسه
makeDiagram({
  file: "01-register-session",
  name: "ثبت و پذیرش جلسه مشاوره",
  doc: "مسیر درخواست مراجع تا ثبت جلسه با کنترل سهمیه و تعرفه",
  nodes: [
    { id: "s", kind: "start", label: "درخواست مراجع", col: 0, row: 0 },
    { id: "check", kind: "task", label: "بررسی هویت و پروندهٔ مراجع", col: 1, row: 0 },
    { id: "g_budget", kind: "gateway", label: "سهمیه دارد؟", col: 2, row: 0 },
    { id: "budget", kind: "task", label: "رزرو سهمیهٔ بودجه (فردی/گروهی/شغلی)", col: 3, row: -1 },
    { id: "no_budget", kind: "task", label: "اعلام عدم امکان پذیرش به مراجع", col: 3, row: 1 },
    { id: "service", kind: "task", label: "تعیین خدمت، مرکز و مشاور", col: 4, row: -1 },
    { id: "tariff", kind: "task", label: "محاسبهٔ تعرفه و سهم‌های مالی", col: 5, row: -1 },
    { id: "reserve", kind: "task", label: "ثبت رزرو وقت و اطلاع‌رسانی پیامکی", col: 6, row: -1 },
    { id: "session", kind: "task", label: "برگزاری جلسه و ثبت پایان جلسه", col: 7, row: -1 },
    { id: "e_ok", kind: "end", label: "جلسه ثبت شد", col: 8, row: -1 },
    { id: "e_no", kind: "end", label: "درخواست رد شد", col: 4, row: 1 },
  ],
  flows: [
    ["s", "check"], ["check", "g_budget"],
    ["g_budget", "budget", "دارد"],
    ["g_budget", "no_budget", "ندارد"],
    ["no_budget", "e_no"],
    ["budget", "service"], ["service", "tariff"], ["tariff", "reserve"], ["reserve", "session"], ["session", "e_ok"],
  ],
});

// ---------------------------------------------------------------- ۲) زنجیرهٔ تایید پنج‌مرحله‌ای
makeDiagram({
  file: "02-approval-chain",
  name: "زنجیرهٔ تایید پنج‌مرحله‌ای جلسات",
  doc: "مدیر مرکز → مسئول فنی → نظارت حرفه‌ای → ناظر استان → ناظر کشور → تسویه",
  nodes: [
    { id: "s", kind: "start", label: "پایان جلسه مشاوره", col: 0, row: 0 },
    { id: "t1", kind: "task", label: "بررسی و تایید مدیر مرکز", col: 1, row: 0 },
    { id: "g1", kind: "gateway", label: "تایید؟", col: 2, row: 0 },
    { id: "t2", kind: "task", label: "بررسی و تایید مسئول فنی", col: 3, row: 0 },
    { id: "g2", kind: "gateway", label: "تایید؟", col: 4, row: 0 },
    { id: "t3", kind: "task", label: "بررسی نظارت حرفه‌ای", col: 5, row: 0 },
    { id: "g3", kind: "gateway", label: "تایید؟", col: 6, row: 0 },
    { id: "t4", kind: "task", label: "تایید ناظر استان", col: 7, row: 0 },
    { id: "g4", kind: "gateway", label: "تایید؟", col: 8, row: 0 },
    { id: "t5", kind: "task", label: "تایید نهایی ناظر کشور", col: 9, row: 0 },
    { id: "settle", kind: "task", label: "ثبت حقوق‌و‌دستمزد و تسویهٔ مشاور", col: 10, row: 0 },
    { id: "reject", kind: "task", label: "اعلام رد با ذکر دلیل به مشاور", col: 5, row: 1 },
    { id: "e_rej", kind: "end", label: "جلسه رد شد", col: 6, row: 2 },
    { id: "e_ok", kind: "end", label: "تایید نهایی و تسویه", col: 11, row: 0 },
  ],
  flows: [
    ["s", "t1"], ["t1", "g1"], ["g1", "t2", "بله"], ["t2", "g2"], ["g2", "t3", "بله"],
    ["t3", "g3"], ["g3", "t4", "بله"], ["t4", "g4"], ["g4", "t5", "بله"], ["t5", "settle"], ["settle", "e_ok"],
    ["g1", "reject", "خیر"], ["g2", "reject", "خیر"], ["g3", "reject", "خیر"],
    ["g4", "reject", "خیر"], ["reject", "e_rej"],
  ],
});

// ---------------------------------------------------------------- ۳) رزرو و پیگیری
makeDiagram({
  file: "03-reserve",
  name: "رزرو وقت و پیگیری حضور",
  doc: "درخواست رزرو تا تبدیل به جلسه یا انصراف",
  nodes: [
    { id: "s", kind: "start", label: "درخواست رزرو کاربر", col: 0, row: 0 },
    { id: "check", kind: "task", label: "بررسی درخواست توسط مدیر مرکز", col: 1, row: 0 },
    { id: "g_acc", kind: "gateway", label: "پذیرش؟", col: 2, row: 0 },
    { id: "book", kind: "task", label: "ثبت رزرو وقت و ارسال پیامک", col: 3, row: 0 },
    { id: "g_show", kind: "gateway", label: "حضور مراجع؟", col: 4, row: 0 },
    { id: "conv", kind: "task", label: "تبدیل رزرو به جلسهٔ مشاوره", col: 5, row: -1 },
    { id: "follow", kind: "task", label: "تماس پیگیری ۲۴ ساعت بعد", col: 5, row: 0 },
    { id: "g2nd", kind: "gateway", label: "رزرو مجدد؟", col: 6, row: 0 },
    { id: "cancel", kind: "task", label: "بستن رزرو بی‌نتیجه", col: 7, row: 1 },
    { id: "reject", kind: "task", label: "اعلام رد رزرو با دلیل", col: 3, row: 1 },
    { id: "e_ok", kind: "end", label: "جلسه قطعی شد", col: 6, row: -1 },
    { id: "e_no", kind: "end", label: "رزرو بسته شد", col: 8, row: 1 },
    { id: "e_rej", kind: "end", label: "درخواست رد شد", col: 4, row: 1 },
  ],
  flows: [
    ["s", "check"], ["check", "g_acc"],
    ["g_acc", "book", "بله"], ["g_acc", "reject", "خیر"], ["reject", "e_rej"],
    ["book", "g_show"], ["g_show", "conv", "بله"], ["conv", "e_ok"],
    ["g_show", "follow", "خیر"], ["follow", "g2nd"], ["g2nd", "book", "بله"], ["g2nd", "cancel", "خیر"], ["cancel", "e_no"],
  ],
});

// ---------------------------------------------------------------- ۴) ارجاع سها
makeDiagram({
  file: "04-seha-referral",
  name: "دریافت و اجرای ارجاع سها",
  doc: "ارجاع سازمانی از سامانهٔ سها تا اعلام نتیجه",
  nodes: [
    { id: "s", kind: "start", label: "ارجاع از سامانهٔ سها", col: 0, row: 0 },
    { id: "recv", kind: "task", label: "دریافت مشخصات و خدمت ارجاعی", col: 1, row: 0 },
    { id: "g_ok", kind: "gateway", label: "قابل پذیرش؟", col: 2, row: 0 },
    { id: "accept", kind: "task", label: "پذیرش ارجاع و معرفی به مرکز", col: 3, row: 0 },
    { id: "assign", kind: "task", label: "تعیین مشاور و برنامهٔ جلسات", col: 4, row: 0 },
    { id: "run", kind: "task", label: "اجرای جلسات و ثبت گزارش", col: 5, row: 0 },
    { id: "g_fin", kind: "gateway", label: "تعداد جلسات تکمیل شد؟", col: 6, row: 0 },
    { id: "report", kind: "task", label: "اعلام نتیجه و وضعیت به سها", col: 7, row: 0 },
    { id: "reject", kind: "task", label: "ثبت دلیل عدم پذیرش", col: 3, row: 1 },
    { id: "e_ok", kind: "end", label: "ارجاع بسته شد", col: 8, row: 0 },
    { id: "e_rej", kind: "end", label: "ارجاع رد شد", col: 4, row: 1 },
  ],
  flows: [
    ["s", "recv"], ["recv", "g_ok"],
    ["g_ok", "accept", "بله"], ["g_ok", "reject", "خیر"], ["reject", "e_rej"],
    ["accept", "assign"], ["assign", "run"], ["run", "g_fin"],
    ["g_fin", "run", "خیر — ادامهٔ جلسات"], ["g_fin", "report", "بله"], ["report", "e_ok"],
  ],
});

// ---------------------------------------------------------------- ۵) مدیریت مورد حاد (EMS)
makeDiagram({
  file: "05-ems-acute",
  name: "مدیریت مورد حاد (آسیب به خود)",
  doc: "تشخیص، ارزیابی شدت، اقدام فوری، کمک مالی و پیگیری",
  nodes: [
    { id: "s", kind: "start", label: "تشخیص مورد حاد", col: 0, row: 0 },
    { id: "form", kind: "task", label: "ثبت فرم مورد حاد (EMS) توسط مشاور", col: 1, row: 0 },
    { id: "g_risk", kind: "gateway", label: "شدت خطر؟", col: 2, row: 0 },
    { id: "urgent", kind: "task", label: "اقدام فوری و اطلاع به مسئولین", col: 3, row: -1 },
    { id: "review", kind: "task", label: "بررسی در جلسهٔ بعد و برنامهٔ درمان", col: 3, row: 0 },
    { id: "low", kind: "task", label: "پایش و مشاورهٔ تکمیلی", col: 3, row: 1 },
    { id: "act", kind: "task", label: "ثبت اقدامات انجام‌شده", col: 4, row: 0 },
    { id: "g_pay", kind: "gateway", label: "درخواست کمک مالی؟", col: 5, row: 0 },
    { id: "pay", kind: "task", label: "بررسی و تایید پرداخت کمک هزینه", col: 6, row: -1 },
    { id: "follow", kind: "task", label: "پیگیری وضعیت مراجع", col: 6, row: 0 },
    { id: "e_ok", kind: "end", label: "پرونده بسته شد", col: 7, row: 0 },
    { id: "e_pay", kind: "end", label: "پرداخت انجام شد", col: 7, row: -1 },
  ],
  flows: [
    ["s", "form"], ["form", "g_risk"],
    ["g_risk", "urgent", "بالا"], ["g_risk", "review", "متوسط"], ["g_risk", "low", "کم"],
    ["urgent", "act"], ["review", "act"], ["low", "act"],
    ["act", "g_pay"], ["g_pay", "pay", "دارد"], ["g_pay", "follow", "ندارد"],
    ["pay", "e_pay"], ["pay", "follow"], ["follow", "e_ok"],
  ],
});

// ---------------------------------------------------------------- ۶) چرخهٔ مالی جلسه
makeDiagram({
  file: "06-finance-cycle",
  name: "چرخهٔ مالی و تسویهٔ جلسات",
  doc: "از تایید نهایی تا تسویهٔ مشاور و مالیات",
  nodes: [
    { id: "s", kind: "start", label: "تایید نهایی جلسه", col: 0, row: 0 },
    { id: "calc", kind: "task", label: "محاسبهٔ سهم‌ها (مشاور/مرکز/سامانه)", col: 1, row: 0 },
    { id: "reg", kind: "task", label: "ثبت حقوق‌و‌دستمزد مشاور", col: 2, row: 0 },
    { id: "g_month", kind: "gateway", label: "پایان ماه؟", col: 3, row: 0 },
    { id: "tax", kind: "task", label: "محاسبهٔ مالیات مشاوران", col: 4, row: -1 },
    { id: "wait", kind: "task", label: "ادامهٔ ثبت جلسات ماه", col: 4, row: 1 },
    { id: "report", kind: "task", label: "تهیهٔ گزارش تسویهٔ ماهانه", col: 5, row: 0 },
    { id: "g_pay", kind: "gateway", label: "تایید پرداخت؟", col: 6, row: 0 },
    { id: "pay", kind: "task", label: "پرداخت تسویه و اعلام به مشاور", col: 7, row: 0 },
    { id: "e_ok", kind: "end", label: "تسویه کامل شد", col: 8, row: 0 },
    { id: "e_rej", kind: "end", label: "بازگشت برای اصلاح", col: 7, row: 1 },
  ],
  flows: [
    ["s", "calc"], ["calc", "reg"], ["reg", "g_month"],
    ["g_month", "tax", "بله"], ["g_month", "wait", "خیر"], ["wait", "reg"],
    ["tax", "report"], ["report", "g_pay"],
    ["g_pay", "pay", "بله"], ["g_pay", "e_rej", "خیر"], ["pay", "e_ok"],
  ],
});

console.log(" همهٔ نمودارهای BPMN ساخته شدند.");
