import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Cookie } from "lucide-react";
import { useLang } from "@/lib/i18n/LangContext";
import { useToast } from "@/components/ui/toast";

const KEY = "arendora:cookie-consent";

// Баннер согласия на cookie. Сервис использует только строго
// необходимые cookie (см. /cookies), поэтому выбор пользователя
// лишь фиксирует факт информирования и скрывает баннер.
export default function CookieBanner() {
  const { t } = useLang();
  const toast = useToast();
  const location = useLocation();
  const [choice, setChoice] = useState(() => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  });

  if (choice || location.pathname === "/cookies") return null;

  const decide = (value) => {
    try {
      localStorage.setItem(KEY, value);
    } catch {}
    setChoice(value);
    if (value === "rejected") toast.info(t("cookie.rejectedToast"));
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={t("cookie.title")}
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-card/95 p-4 shadow-lg backdrop-blur"
    >
      <div className="mx-auto flex max-w-4xl flex-col items-start gap-3 sm:flex-row sm:items-center">
        <Cookie className="h-5 w-5 shrink-0 text-primary" aria-hidden />
        <p className="flex-1 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{t("cookie.title")} </span>
          {t("cookie.text")}{" "}
          <Link to="/cookies" className="text-primary hover:underline">
            {t("cookie.more")}
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => decide("rejected")}
            className="rounded-lg border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
          >
            {t("cookie.reject")}
          </button>
          <button
            onClick={() => decide("accepted")}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
          >
            {t("cookie.accept")}
          </button>
        </div>
      </div>
    </div>
  );
}
