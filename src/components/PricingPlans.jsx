import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, CreditCard, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/authContext";
import { useLang } from "@/lib/i18n/LangContext";
import { useToast } from "@/components/ui/toast";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { PLANS } from "@/lib/config/misc";
import { cn, formatMoney } from "@/lib/utils";
import { createBillingPayment, getBillingStatus, verifyBillingPayment } from "@/lib/billing";

const PLAN_KEY = "arendora:plan";

function Segmented({ options, value, onChange }) {
  return (
    <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm transition-colors",
            value === o.value ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PricingPlans() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const toast = useToast();
  const [yearly, setYearly] = useState(false);
  const [paying, setPaying] = useState(null);
  const [plan, setPlan] = useState(() => {
    try {
      return localStorage.getItem(PLAN_KEY) || "free";
    } catch {
      return "free";
    }
  });

  // В облаке тариф привязан к аккаунту (profiles.plan, меняется через оплату)
  const current = isSupabaseConfigured ? user?.plan || "free" : plan;

  // Возврат с экрана ЮKassa: ?billing=return — проверяем статус платежа
  // сервером (edge-функция сама не применяет план до вебхука ЮKassa)
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (!isSupabaseConfigured || searchParams.get("billing") !== "return") return;
    setSearchParams({}, { replace: true });
    verifyBillingPayment()
      .then((s) => {
        if (s.status === "succeeded") toast.success(t("billing.returnOk"));
        else toast.info(t("billing.returnPending"));
      })
      .catch(() => toast.error(t("billing.failed")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (id) => {
    if (isSupabaseConfigured) {
      pay(id);
      return;
    }
    try {
      localStorage.setItem(PLAN_KEY, id);
    } catch {}
    setPlan(id);
    toast.success(t("plans.choose"));
  };

  const pay = async (id) => {
    try {
      setPaying(id);
      const { confirmation_url } = await createBillingPayment({
        plan: id,
        period: yearly ? "year" : "month",
      });
      if (confirmation_url) window.location.assign(confirmation_url);
    } catch (e) {
      if (e.code === "BILLING_NOT_CONFIGURED") toast.error(t("billing.notConfigured"));
      else toast.error(e.message || t("billing.failed"));
    } finally {
      setPaying(null);
    }
  };

  return (
    <div>
      <div className="mb-8 flex justify-center">
        <div className="inline-flex items-center gap-3">
          <Segmented
            value={yearly ? "yearly" : "monthly"}
            onChange={(v) => setYearly(v === "yearly")}
            options={[
              { value: "monthly", label: t("plans.monthly") },
              { value: "yearly", label: t("plans.yearly") },
            ]}
          />
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
            {t("plans.yearlyBadge")}
          </span>
        </div>
      </div>

      {/* Основная сетка Free/Start/Pro/Business — всегда одна строка на десктопе (от lg/1024) */}
      <div className="grid gap-4 sm:grid-cols-4">
        {PLANS.map((p) => {
          const price = yearly ? p.yearly : p.monthly;
          const isCurrent = current === p.id;
          return (
            <Card key={p.id} className={cn(
                "relative flex flex-col p-4",
                p.highlight && "border-primary ring-2 ring-primary",
                p.id === "individual" && "sm:col-span-4"
              )}>
              {p.highlight && (
                <span className="brand-gradient absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
                  ★ Pro
                </span>
              )}
              <h3 className="text-lg font-bold">{t(`plans.${p.id}.name`)}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{t(`plans.${p.id}.desc`)}</p>
              <p className="mt-4">
                {p.monthly == null ? (
                  <span className="text-2xl font-extrabold">{t("plans.individual.price")}</span>
                ) : (
                  <>
                    <span className="text-2xl font-extrabold">{formatMoney(price, "RUB", lang)}</span>
                    <span className="text-sm font-normal text-muted-foreground">{yearly ? t("plans.perYear") : t("plans.perMonth")}</span>
                  </>
                )}
              </p>
              <ul className="mt-4 flex-1 space-y-2.5">
                {t(`plans.${p.id}.features`)
                  .split("|")
                  .map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {f}
                    </li>
                  ))}
              </ul>
              <Button
                className="mt-5 w-full"
                variant={p.highlight ? "gradient" : "outline"}
                disabled={isCurrent || p.monthly == null || paying === p.id}
                onClick={() => choose(p.id)}
              >
                {isCurrent
                  ? t("plans.current")
                  : paying === p.id
                    ? t("billing.redirecting")
                    : p.monthly == null
                      ? t("plans.contactUs")
                      : isSupabaseConfigured
                        ? t("plans.payNow")
                        : t("plans.choose")}
              </Button>
            </Card>
          );
        })}
      </div>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        <a
          href={`mailto:sales@arendora.app?subject=${encodeURIComponent(t("plans.contactSubject"))}`}
          className="font-medium text-primary hover:underline"
        >
          {t("plans.contactUs")}
        </a>
      </p>

      <div className="mt-8 grid gap-4 rounded-lg border bg-muted/30 p-5 sm:grid-cols-3">
        {[
          { key: "plans.assure1", icon: Sparkles },
          { key: "plans.assure2", icon: CreditCard },
          { key: "plans.assure3", icon: Check },
        ].map((a) => (
          <div key={a.key} className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <a.icon className="h-4 w-4" />
            </span>
            <p className="text-sm leading-snug text-muted-foreground">{t(a.key)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default PricingPlans;
