// =====================================================================
// GET /api/bi/csv?chart=<id> — خروجی CSV هر نمودار توصیفی (سازگار با اکسل فارسی)
// از همان کش داشبورد تغذیه می‌شود؛ محاسبهٔ تازه‌ای انجام نمی‌دهد
// =====================================================================
import { NextRequest, NextResponse } from "next/server";
import { fail, resolveAccess } from "@/lib/server";
import { buildBiPayload } from "@/lib/bi-build";
import { csvFromChart } from "@/lib/analytics";

export const dynamic = "force-dynamic";

type Payload = { budgetTable: { headers: string[]; rows: unknown[][] }; charts: { id: string; kind: string }[] };

export async function GET(req: NextRequest) {
  const acc = await resolveAccess(req);
  if (!acc) return fail("UNAUTHORIZED", 401);
  const sp = req.nextUrl.searchParams;
  const chartId = sp.get("chart") ?? "";
  try {
    const payload = (await buildBiPayload(
      sp.get("provinceId"), sp.get("from"), sp.get("to"),
      acc.seeAllData ? null : (acc.scope.kind === "self" ? acc.uid : null),
      acc.seeAllData ? null : { provinces: acc.scope.provinces, centers: acc.scope.centers },
    )) as unknown as Payload;
    if (chartId === "budgets") {
      const t = payload.budgetTable;
      const esc = (v: unknown) => {
        const s = String(v ?? "");
        return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines = [t.headers.map(esc).join(",")];
      for (const row of t.rows) lines.push(row.map(esc).join(","));
      return new NextResponse("\uFEFF" + lines.join("\r\n"), {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="bi-budgets.csv"` },
      });
    }
    const chart = payload.charts.find((c) => c.id === chartId);
    if (!chart) return fail("نمودار موردنظر یافت نشد", 404);
    return new NextResponse(csvFromChart(chart as never), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="bi-${chartId}.csv"` },
    });
  } catch {
    return fail("خطا در تولید CSV", 500);
  }
}
