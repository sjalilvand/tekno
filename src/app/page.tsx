"use client";
// صفحه اصلی — پوسته تک‌صفحه‌ای با پیمایش داخلی
import * as React from "react";
import { AppShell, MetaUser } from "@/components/app-shell";
import { LoginView } from "@/views/login";
import { DashboardView } from "@/views/dashboard";
import { CartableView } from "@/views/cartable";
import { FormsView } from "@/views/forms";
import { ChecklistsView } from "@/views/checklists";
import { BiView } from "@/views/bi";
import { ReportBuilderView } from "@/views/report-builder";
import { ProcessesView } from "@/views/processes";
import { EventsView } from "@/views/events";
import { GroupEventsView } from "@/views/group-events";
import { ReservesView } from "@/views/reserves";
import { ReferralsView } from "@/views/referrals";
import { ReferralRequestsView } from "@/views/referral-requests";
import { EmsView } from "@/views/ems";
import { UsersView } from "@/views/users";
import { CentersView } from "@/views/centers";
import { RolesView } from "@/views/access-control";
import { RiskModelView } from "@/views/risk-model";
import { ContractsView } from "@/views/contracts";
import { BudgetsView } from "@/views/budgets";
import { FinanceView } from "@/views/finance";
import { TaxView } from "@/views/tax";
import { SmsView } from "@/views/sms";
import { MessagesView } from "@/views/messages";
import { OccasionsView } from "@/views/occasions";
import { LogsView } from "@/views/logs";
import { TicketsView } from "@/views/tickets";
import { SettingsView } from "@/views/settings";
import { IntegrationsView } from "@/views/integrations";
import { WebServicesView } from "@/views/webservices";
import { BackupView } from "@/views/backup";
import { HelpsView } from "@/views/helps";
import { ProfileView } from "@/views/profile";
import { api, useHashRoute } from "@/lib/client";
import { Loader2, Flower2 } from "lucide-react";

export default function Page() {
  const [booting, setBooting] = React.useState(true);
  const [me, setMe] = React.useState<{ user: MetaUser; permissions?: string[] | null; unread: number } | null>(null);

  const refreshMe = React.useCallback(async () => {
    try {
      const data = await api<{ user: MetaUser; unread: number }>("/api/auth/me");
      setMe(data);
      return data;
    } catch {
      setMe(null);
      return null;
    }
  }, []);

  React.useEffect(() => {
    refreshMe().finally(() => setBooting(false));
  }, [refreshMe]);

  if (booting) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background" dir="rtl">
        <span className="brand-gradient flex h-16 w-16 items-center justify-center rounded-3xl text-white shadow-xl">
          <Flower2 className="h-8 w-8" />
        </span>
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          در حال بارگذاری سامانه...
        </div>
      </div>
    );
  }

  if (!me) return <LoginView />;

  return (
    <ShellWithRouter
      user={{ ...me.user, permissions: me.permissions }}
      unread={me.unread}
      refreshMe={refreshMe}
    />
  );
}

function ShellWithRouter({
  user, unread, refreshMe,
}: {
  user: MetaUser;
  unread: number;
  refreshMe: () => Promise<{ user: MetaUser; unread: number } | null>;
}) {
  const route = useHashRoute();

  const view = React.useMemo(() => {
    switch (route) {
      case "bi": return <BiView />;
      case "reports": return <ReportBuilderView />;
      case "processes": return <ProcessesView />;
      case "cartable": return <CartableView />;
      case "forms": return <FormsView />;
      case "checklists": return <ChecklistsView />;
      case "webservices": return <WebServicesView />;
      case "backup": return <BackupView />;
      case "events": return <EventsView />;
      case "group-events": return <GroupEventsView />;
      case "reserves": return <ReservesView />;
      case "referrals": return <ReferralsView />;
      case "referral-requests": return <ReferralRequestsView />;
      case "ems": return <EmsView />;
      case "risk-model": return <RiskModelView />;
      case "users": return <UsersView />;
      case "centers": return <CentersView />;
      case "roles": return <RolesView />;
      case "contracts": return <ContractsView />;
      case "budgets": return <BudgetsView />;
      case "finance": return <FinanceView />;
      case "tax": return <TaxView />;
      case "sms": return <SmsView />;
      case "messages": return <MessagesView />;
      case "occasions": return <OccasionsView />;
      case "logs": return <LogsView />;
      case "tickets": return <TicketsView />;
      case "settings": return <SettingsView />;
      case "integrations": return <IntegrationsView />;
      case "helps": return <HelpsView />;
      case "profile": return <ProfileView user={user} refreshMe={refreshMe} />;
      default: return <DashboardView />;
    }
  }, [route, user, refreshMe]);

  return (
    <AppShell user={user} unread={unread} badges={{}}>
      <div key={route} className="view-in">{view}</div>
    </AppShell>
  );
}
