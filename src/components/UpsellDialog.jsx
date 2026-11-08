import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/i18n/LangContext";
import { useToast } from "@/components/ui/toast";
import { createBillingPayment } from "@/lib/billing";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { Check } from "lucide-react";

// Кнопка оплаты Start из диалога апселла: платёж ЮKassa (месяц) сразу.
// В localStorage-режиме или до подключения ключей — фолбэк на /settings.
function PayStartButton() {
  const { t } = useLang();
  const toast = useToast();
  const [paying, setPaying] = useState(false);

  const pay = async () => {
    try {
      setPaying(true);
      const { confirmation_url } = await createBillingPayment({ plan: "start", period: "month" });
      if (confirmation_url) window.location.assign(confirmation_url);
    } catch (e) {
      setPaying(false);
      toast.error(t("billing.notConfigured"));
      if (!isSupabaseConfigured) window.location.assign("/app/plan");
    }
  };

  return (
    <Button variant="gradient" className="sm:flex-1" disabled={paying} onClick={pay}>
      {paying ? t("billing.redirecting") : t("billing.payStart")}
    </Button>
  );
}

// Upsell-диалог при достижении лимита бесплатного тарифа
export default function UpsellDialog({ open, onClose, variant = "properties" }) {
  const { t } = useLang();

  return (
    <Dialog open={open} onClose={onClose} title={t(`upsell.title.${variant}`)} size="md">
      <div className="space-y-5">
        <p className="text-sm leading-relaxed text-muted-foreground">{t(`upsell.desc.${variant}`)}</p>

        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-primary">
            <Sparkles className="h-4 w-4" />
            {t("plans.start.name")} — 990 ₽{t("plans.perMonth")}
          </p>
          <ul className="mt-3 space-y-2">
            {t("plans.start.features")
              .split("|")
              .map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {f}
                </li>
              ))}
          </ul>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <PayStartButton />
          <Button variant="ghost" onClick={onClose}>
            {t("upsell.later")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
