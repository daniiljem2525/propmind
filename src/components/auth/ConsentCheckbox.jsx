import { Link } from "react-router-dom";
import { useLang } from "@/lib/i18n/LangContext";

// Обязательное согласие на обработку ПДн (ч. 1 и 4 ст. 9 152-ФЗ):
// без активной отметки форма не отправляется.
export default function ConsentCheckbox({ checked, onChange, error }) {
  const { t } = useLang();
  return (
    <div className="space-y-1">
      <label className="flex cursor-pointer items-start gap-2.5 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          required
          className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
        />
        <span>
          {t("auth.consentText")}{" "}
          <Link to="/consent" className="text-primary hover:underline">
            {t("auth.consentLink")}
          </Link>
          {", "}
          <Link to="/privacy" className="text-primary hover:underline">
            {t("auth.privacyLink")}
          </Link>
          {" и "}
          <Link to="/agreement" className="text-primary hover:underline">
            {t("auth.agreementLink")}
          </Link>
          .
        </span>
      </label>
      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
