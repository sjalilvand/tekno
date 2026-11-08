// تست headless رندر bpmn-js با jsdom — بررسی موقعیت لیبل تسک‌ها
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";

const dom = new JSDOM("<!doctype html><html><body><div id='c' style='width:1600px;height:900px'></div></body></html>", {
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });
global.SVGElement = dom.window.SVGElement;
global.HTMLElement = dom.window.HTMLElement;
global.getComputedStyle = dom.window.getComputedStyle;
// matrix helpers used by diagram-js
global.DOMParser = dom.window.DOMParser;
global.XMLSerializer = dom.window.XMLSerializer;
global.Image = dom.window.Image;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

import { createRequire } from "node:module";
const require = createRequire("/home/z/my-project/tekno/scripts/");
const Viewer = require("bpmn-js/dist/bpmn-navigated-viewer.development.js");

const xml = readFileSync(process.argv[2] ?? "public/bpmn/01-register-session.bpmn", "utf8");
const viewer = new Viewer({ container: document.getElementById("c") });
const { warnings } = await viewer.importXML(xml);
console.log("import warnings:", warnings.length);
for (const w of warnings.slice(0, 3)) console.log("  w:", (w.message ?? "").slice(0, 100));

try { await viewer.get("canvas").zoom("fit-viewport", "auto"); } catch (e) { console.log("zoom skipped (jsdom SVG limit):", e.message?.slice(0, 60)); }

const texts = [...document.querySelectorAll(".djs-label tspan")].slice(0, 5).map((t) => ({
  txt: (t.textContent ?? "").slice(0, 24),
  x: t.getAttribute("x"),
  anchor: t.getAttribute("text-anchor"),
}));
console.log(JSON.stringify(texts, null, 0));
