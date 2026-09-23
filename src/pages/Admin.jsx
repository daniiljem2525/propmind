import { useMemo } from "react";
import {
  Banknote,
  Building2,
  Database,
  Download,
  HardDrive,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import UsersPanel from "@/components/UsersPanel";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/authContext";
import { useLang } from "@/lib/i18n/LangContext";
import { readCollection } from "@/lib/api/db";
import { downloadFile } from "@/lib/csv";
import { cn, formatMoney, formatNumber } from "@/lib/utils";

// Админ-панель: метрики платформы, управление пользователями, данные.
// Доступ только для роли admin.
export default function Admin() {
  const { t, lang } = useLang();
  const { user } = useAuth();

  const stats = useMemo(() => {
    const users = readCollection("users");
    const properties = readCollection("properties");
    const tenants = readCollection("tenants");
    const payments = readCollection("payments");
    const requests = readCollection("maintenance_requests");

    const paidSum = payments
      .filter((p) => p.status === "paid" || p.status === "partial")
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);

    const storageBytes = Object.keys(localStorage)
      .filter((k) => k.startsWith("propmind:"))
      .reduce((s, k) => s + (localStorage.getItem(k)?.length || 0), 0);

    return {
      users: users.length,
      activeUsers: users.filter((u) => u.status === "active").length,
      properties: properties.length,
      tenants: tenants.length,
      payments: payments.length,
      paidSum,
      openRequests: requests.filter((r) => r.status === "new" || r.status === "in_progress").length,
      storageBytes: storageBytes * 2, // UTF-16 ≈ 2 байта на символ
    };
  }, []);

  if (user?.role !== "admin") {
    return (
      <div className="animate-fade-in">
        <PageHeader title={t("admin.title")} subtitle={t("admin.subtitle")} />
        <EmptyState icon={ShieldCheck} title={t("settings.usersOnly")} description={t("admin.adminOnly")} />
      </div>
    );
  }

  const exportBackup = () => {
    const data = {};
    ["users", "properties", "tenants", "payments", "maintenance_requests", "documents", "notifications"].forEach((name) => {
      data[name] = readCollection(name);
    });
    downloadFile(JSON.stringify(data, null, 2), `propmind-backup-${new Date().toISOString().slice(0, 10)}.json`, "application/json");
  };

  return (
    <div className="animate-fade-in">
      <PageHeader title={t("admin.title")} subtitle={t("admin.subtitle")} />

      {/* Метрики платформы */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={Users} tile="bg-indigo-500" label={t("admin.metricUsers")} value={stats.users} sub={`${t("admin.metricActive")}: ${stats.activeUsers}`} />
        <StatCard icon={Building2} tile="bg-teal-500" label={t("admin.metricObjects")} value={stats.properties} />
        <StatCard icon={Users} tile="bg-violet-500" label={t("admin.metricTenants")} value={stats.tenants} />
        <StatCard icon={Banknote} tile="bg-emerald-500" label={t("admin.metricRevenue")} value={formatMoney(stats.paidSum, "RUB", lang)} />
        <StatCard icon={Banknote} tile="bg-amber-500" label={t("admin.metricPayments")} value={formatNumber(stats.payments, lang)} />
        <StatCard icon={Wrench} tile="bg-rose-500" label={t("admin.metricRequests")} value={stats.openRequests} />
      </div>

      {/* Пользователи */}
      <div className="mt-6">
        <UsersPanel />
      </div>

      {/* Данные */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("admin.tabData")}</CardTitle>
          <CardDescription>{t("admin.dataDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-teal-500 text-white">
              <HardDrive className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium">{t("admin.storage")}</p>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-2 w-40 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", stats.storageBytes > 4e6 ? "bg-rose-500" : "brand-gradient")}
                    style={{ width: `${Math.min((stats.storageBytes / 5e6) * 100, 100)}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground">{formatNumber(Math.round(stats.storageBytes / 1024), lang)} КБ / 5 МБ</span>
              </div>
            </div>
          </div>
          <Button onClick={exportBackup}>
            <Download className="h-4 w-4" />
            {t("admin.backup")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
