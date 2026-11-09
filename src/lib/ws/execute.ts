// =====================================================================
// وب‌سرویس‌ساز — اجرای سرویس و سریال‌سازی JSON / XML / CSV
// =====================================================================
import { rawRows } from "@/lib/analytics";
import { findTable, safeColumns, isAllowedOp } from "@/lib/ws/catalog";

export type WsConfig = {
  slug: string;
  table: string;
  columns: string[]; // خالی = همهٔ ستون‌های مجاز
  filters: { col: string; op: string; value: string }[];
  format: string; // json | xml | csv
  rowLimit: number;
  orderBy?: string | null;
};

export type WsResult = { contentType: string; body: string; rowCount: number };

/** ساخت XML ساده از ردیف‌ها — <rows><row><col>v</col></row></rows> */
function toXml(rows: Record<string, unknown>[], rootName: string): string {
  const esc = (s: unknown) =>
    String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const tag = (k: string) => k.replace(/[^A-Za-z0-9_.]/g, "_");
  const lines = [`<?xml version="1.0" encoding="UTF-8"?>`, `<${tag(rootName)}>`, `  <rows>`];
  for (const r of rows) {
    lines.push(`    <row>`);
    for (const [k, v] of Object.entries(r)) lines.push(`      <${tag(k)}>${esc(v)}</${tag(k)}>`);
    lines.push(`    </row>`);
  }
  lines.push(`  </rows>`, `</${tag(rootName)}>`);
  return lines.join("\n");
}

function toCsv(rows: Record<string, unknown>[]): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => esc(r[h])).join(","));
  return "\uFEFF" + lines.join("\r\n");
}

export async function executeWebService(cfg: WsConfig, params: URLSearchParams): Promise<WsResult> {
  const table = findTable(cfg.table);
  if (!table) throw new Error("جدول مجاز نیست");
  const cols = safeColumns(table, cfg.columns ?? []);
  const colSql = cols.map((c) => `\`${c}\``).join(", ");
  const where: string[] = [];
  const args: unknown[] = [];
  for (const f of (cfg.filters ?? []).slice(0, 8)) {
    if (!cols.includes(f.col)) continue;
    if (!isAllowedOp(f.op)) continue;
    // مقدار می‌تواند از query string هم override شود: ?f_<col>=value
    const qval = params.get(`f_${f.col}`);
    const val = qval !== null ? qval : f.value;
    if (val === "" || val === undefined) continue;
    where.push(`\`${f.col}\` ${f.op} ?`);
    args.push(f.op === "LIKE" ? `%${val}%` : val);
  }
  // فیلتر پویا از query string — فقط ستون‌های مجاز
  for (const [k, v] of params.entries()) {
    if (!k.startsWith("q_") || v === "") continue;
    const col = k.slice(2);
    if (!cols.includes(col)) continue;
    where.push(`\`${col}\` = ?`);
    args.push(v);
  }
  const limit = Math.max(1, Math.min(Number(params.get("limit")) || cfg.rowLimit || 1000, 10000));
  let orderBy = "";
  if (cfg.orderBy) {
    const m = cfg.orderBy.match(/^([A-Za-z0-9_]+)\s*(ASC|DESC)?$/i);
    if (m && cols.includes(m[1])) orderBy = ` ORDER BY \`${m[1]}\` ${m[2]?.toUpperCase() ?? "ASC"}`;
  }
  const sql = `SELECT ${colSql} FROM \`${table.name}\`${where.length ? ` WHERE ${where.join(" AND ")}` : ""}${orderBy} LIMIT ${limit}`;
  const rows = await rawRows(sql, args);
  const fmt = (params.get("format") || cfg.format || "json").toLowerCase();
  if (fmt === "csv") return { contentType: "text/csv; charset=utf-8", body: toCsv(rows), rowCount: rows.length };
  if (fmt === "xml") return { contentType: "application/xml; charset=utf-8", body: toXml(rows, `${table.name}_service`), rowCount: rows.length };
  return { contentType: "application/json; charset=utf-8", body: JSON.stringify({ table: table.name, count: rows.length, rows }, null, 2), rowCount: rows.length };
}
