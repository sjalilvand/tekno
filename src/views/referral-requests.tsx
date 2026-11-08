"use client";
// درخواست‌های رزرو کاربران
import * as React from "react";
import { PageHeader, DataTable, StatusBadge, Column, LoadingView } from "@/components/shared";
import { faNum, jDate, jDateTime } from "@/lib/jalali";
import { api, useQuery } from "@/lib/client";
import { Inbox, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type RequestRow = {
  id: number; userName: string | null; description: string | null;
  status: string; creationDate: string; editionDate: string | null;
};

export function ReferralRequestsView() {
  const { toast } = useToast();
  const { data, loading, refetch } = useQuery<{ total: number; requests: RequestRow[] }>(() => api("/api/referral-requests?page=1&pageSize=50"), []);

  const act = async (id: number, action: string) => {
    await api("/api/referral-requests", { method: "PATCH", body: JSON.stringify({ id, action }) });
    toast({ title: action === "approve" ? "درخواست تایید شد" : "درخواست رد شد" });
    refetch();
  };

  const columns: Column<RequestRow>[] = [
    { header: "کد", cell: (r) => <span className="text-xs font-bold tabular-nums text-primary">{faNum(r.id)}</span> },
    { header: "کاربر", cell: (r) => <span className="text-[13px] font-semibold">{r.userName ?? "—"}</span> },
    { header: "توضیحات", cell: (r) => <span className="block max-w-md truncate text-xs text-muted-foreground" title={r.description ?? ""}>{r.description ?? "—"}</span> },
    { header: "ثبت", cell: (r) => <span className="text-xs tabular-nums text-muted-foreground">{jDateTime(r.creationDate)}</span> },
    { header: "آخرین ویرایش", cell: (r) => <span className="text-xs tabular-nums text-muted-foreground">{r.editionDate ? jDate(r.editionDate) : "—"}</span> },
    { header: "وضعیت", cell: (r) => <StatusBadge status={r.status} /> },
    {
      header: "عملیات",
      cell: (r) => r.status === "در انتظار بررسی" ? (
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px] text-emerald-600" onClick={() => act(r.id, "approve")}>
            <CheckCircle2 className="h-3 w-3" /> تایید
          </Button>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px] text-rose-600" onClick={() => act(r.id, "reject")}>
            <XCircle className="h-3 w-3" /> رد
          </Button>
        </div>
      ) : <span className="text-[11px] text-muted-foreground">بررسی شده</span>,
    },
  ];

  return (
    <div>
      <PageHeader title="درخواست‌های رزرو کاربران" subtitle={`${faNum(data?.total ?? 0)} درخواست ثبت‌شده`} icon={<Inbox className="h-5 w-5" />} />
      <div className="rounded-2xl border bg-card shadow-sm">
        <DataTable columns={columns} rows={data?.requests ?? []} loading={loading} emptyText="درخواستی یافت نشد" />
      </div>
    </div>
  );
}
