import { Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/i18n/LangContext";
import { Check } from "lucide-react";

// Upsell-диалог при достижении лимита бесплатного тарифа
export default function UpsellDialog({ open, onClose, feature }) {
  const { t } = useLang();

  return (
    <Dialog open={open} onClose={onClose} title={t("upsell.title")} size="md">
      <div className="space-y-5">
        <p className="text-sm leading-relaxed text-muted-foreground">{t("upsell.desc").replace("{feature}", feature)}</p>

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
          <Button asChild variant="gradient" className="sm:flex-1">
            <Link to="/app/settings?tab=plan" onClick={onClose}>
              {t("upsell.cta")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t("upsell.later")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
