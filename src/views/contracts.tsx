"use client";
// قراردادهای سازمانی و تعرفه‌ها
import * as React from "react";
import { PageHeader, DataTable, SectionCard, StatusBadge, Column, LoadingView } from "@/components/shared";
import { faNum, faMoney, jDate } from "@/lib/jalali";
import { api, useQuery } from "@/lib/client";
import { FileSignature, Building, Percent, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ContractRow = {
  id: number; startDate: string; endDate: string; appDefault: boolean;
  customer: { id: number; title: string; discount: number | null; phone: string | null };
  services: { id: number; serviceId: number; userTariff: number; consultantLevel1: number; consultantDR: number; centerFee: number }[];
};

export function ContractsView() {
  const { data, loading } = useQuery<{
    customers: { id: number; title: string; discount: number | null; phone: string | null; contracts: { id: number }[] }[];
    contracts: ContractRow[];
    services: { id: number; name: string }[];
  }>(() => api("/api/contracts"), []);

  if (loading) return <LoadingView />;

  const columns: Column<ContractRow>[] = [
    {
      header: "سازمان",
      cell: (c) => (
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <Building className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[13px] font-semibold leading-5">{c.customer.title}</p>
            <p className="text-[10.5px] text-muted-foreground leading-4">{faNum(c.services.length)} خدمت تحت تعرفه</p>
          </div>
        </div>
      ),
    },
    { header: "تخفیف", cell: (c) => <Badge variant="outline" className="text-[10.5px] font-bold">{faNum(c.customer.discount ?? 0)}٪</Badge> },
    {
      header: "بازه قرارداد",
      cell: (c) => (
        <span className="text-xs tabular-nums text-muted-foreground">
          {jDate(c.startDate)} — {jDate(c.endDate)}
        </span>
      ),
    },
    { header: "میانگین تعرفه", cell: (c) => <span className="text-xs font-bold tabular-nums">{faMoney(Math.round(c.services.reduce((s, x) => s + x.userTariff, 0) / Math.max(c.services.length, 1)))} ریال</span> },
    { header: "پیش‌فرض اپ", cell: (c) => <StatusBadge status={c.appDefault ? "تایید شده" : "منقضی"} className={c.appDefault ? "" : "opacity-40"} /> },
  ];

  return (
    <div>
      <PageHeader title="قراردادهای سازمانی" subtitle={`${faNum(data?.contracts.length ?? 0)} قرارداد — ${faNum(data?.customers.length ?? 0)} سازمان طرف قرارداد`} icon={<FileSignature className="h-5 w-5" />} />

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {data?.customers.slice(0, 4).map((c) => (
          <div key={c.id} className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <Building className="h-4.5 w-4.5 text-primary" />
              {c.discount ? <Badge variant="outline" className="gap-1 text-[10px]"><Percent className="h-3 w-3" /> {faNum(c.discount)}٪</Badge> : null}
            </div>
            <p className="mt-2.5 truncate text-xs font-bold">{c.title}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{faNum(c.contracts.length)} قرارداد فعال</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="contracts" dir="rtl">
        <TabsList>
          <TabsTrigger value="contracts" className="gap-1.5"><FileSignature className="h-3.5 w-3.5" /> قراردادها</TabsTrigger>
          <TabsTrigger value="tariffs" className="gap-1.5"><Layers className="h-3.5 w-3.5" /> جدول تعرفه‌ها</TabsTrigger>
        </TabsList>

        <TabsContent value="contracts" className="mt-4 rounded-2xl border bg-card shadow-sm">
          <DataTable columns={columns} rows={data?.contracts ?? []} emptyText="قراردادی یافت نشد" />
        </TabsContent>

        <TabsContent value="tariffs" className="mt-4">
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                    <th className="px-4 py-3 text-right font-semibold">خدمت</th>
                    <th className="px-4 py-3 text-right font-semibold">سازمان</th>
                    <th className="px-4 py-3 text-right font-semibold">تعرفه کاربر</th>
                    <th className="px-4 py-3 text-right font-semibold">سطح ۱</th>
                    <th className="px-4 py-3 text-right font-semibold">سطح ۳</th>
                    <th className="px-4 py-3 text-right font-semibold">سطح ۵</th>
                    <th className="px-4 py-3 text-right font-semibold">دکتر</th>
                    <th className="px-4 py-3 text-right font-semibold">سهم مرکز</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.contracts.flatMap((c) =>
                    c.services.slice(0, 6).map((s) => (
                      <tr key={s.id} className="border-b border-border/60 last:border-0 transition-colors hover:bg-muted/40">
                        <td className="px-4 py-2.5 text-xs font-semibold">{data.services.find((x) => x.id === s.serviceId)?.name ?? "—"}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{c.customer.title}</td>
                        <td className="px-4 py-2.5 text-xs tabular-nums font-bold">{faNum(s.userTariff)}</td>
                        <td className="px-4 py-2.5 text-xs tabular-nums">{faNum(s.consultantLevel1)}</td>
                        <td className="px-4 py-2.5 text-xs tabular-nums">{faNum(Math.round((s.consultantLevel1 + s.consultantDR) / 2))}</td>
                        <td className="px-4 py-2.5 text-xs tabular-nums">{faNum(Math.round(s.consultantDR))}</td>
                        <td className="px-4 py-2.5 text-xs tabular-nums">{faNum(s.consultantDR)}</td>
                        <td className="px-4 py-2.5 text-xs tabular-nums">{faNum(s.centerFee)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
