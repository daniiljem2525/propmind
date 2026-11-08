import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import PricingPlans from "@/components/PricingPlans";
import { useAuth } from "@/lib/authContext";
import { useLang } from "@/lib/i18n/LangContext";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getBillingStatus } from "@/lib/billing";
import { formatDate, formatMoney } from "@/lib/utils";

// Отдельная страница тарифа (задача CEO 08.11: «создай под тариф отдельно всё»):
// текущий тариф и срок, карточки тарифов с оплатой ЮKassa, история платежей.
export default function Plan() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let alive = true;
    getBillingStatus()
      .then((s) => alive && setStatus(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const planLabel = (p) =>
    p === "free" ? t("plans.free.name") : p === "start" ? t("plans.start.name") : p === "pro" ? t("plans.pro.name") : p === "business" ? t("plans.business.name") : p || t("plans.free.name");

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t("plan.title")} subtitle={t("plan.subtitle")} />

      {isSupabaseConfigured && (
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("plan.current")}</p>
            <p className="mt-1 text-lg font-bold">{planLabel(user?.plan || "free")}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("plan.paidUntil")}</p>
            <p className="mt-1 text-lg font-bold">
              {status?.plan_until ? formatDate(status.plan_until.split("T")[0], lang) : "—"}
            </p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("plan.paymentProvider")}</p>
            <p className="mt-1 text-lg font-bold">ЮKassa</p>
          </div>
        </div>
      )}

      <PricingPlans />

      {isSupabaseConfigured && (
        <div className="mt-10">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("plan.history")}</p>
          {status?.payments?.length ? (
            <div className="mt-3 overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2">{t("plan.colDate")}</th>
                    <th className="px-3 py-2">{t("plan.colPlan")}</th>
                    <th className="px-3 py-2">{t("plan.colPeriod")}</th>
                    <th className="px-3 py-2">{t("plan.colAmount")}</th>
                    <th className="px-3 py-2">{t("plan.colStatus")}</th>
                  </tr>
                </thead>
                <tbody>
                  {status.payments.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="px-3 py-2">{formatDate(String(p.created_at).split("T")[0], lang)}</td>
                      <td className="px-3 py-2">{planLabel(p.plan)}</td>
                      <td className="px-3 py-2">{p.period === "year" ? t("plans.yearly") : t("plans.monthly")}</td>
                      <td className="px-3 py-2">{formatMoney(p.amount, p.currency || "RUB", lang)}</td>
                      <td className="px-3 py-2">
                        {p.status === "succeeded" ? t("plan.statusPaid") : p.status === "pending" ? t("plan.statusPending") : p.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">{t("plan.historyEmpty")}</p>
          )}
        </div>
      )}
    </div>
  );
}
