import BpmnModdle from "bpmn-moddle";
import { readFileSync } from "node:fs";
const process = globalThis.process;

const moddle = new BpmnModdle();
const file = process.argv[2] ?? "public/bpmn/01-register-session.bpmn";
const xml = readFileSync(file, "utf8");
const { rootElement, warnings } = await moddle.fromXML(xml, "bpmn:Definitions");
console.log("warnings:", warnings.length);
for (const w of warnings.slice(0, 5)) console.log("  -", (w.message ?? String(w)).slice(0, 140));
const proc = rootElement.get("rootElements")[0];
console.log("flowElements:", proc.get("flowElements").length);
const di = rootElement.get("diagrams")[0];
const plane = di.get("plane");
console.log("plane elements:", plane.get("planeElement").length);
const first = plane.get("planeElement")[0];
console.log("first DI:", first.$type, "bounds:", JSON.stringify(first.get("bounds")));
for (const fe of proc.get("flowElements").slice(0, 4)) {
  console.log("element:", fe.$type, fe.get("id"), "name:", JSON.stringify(fe.get("name")));
}
