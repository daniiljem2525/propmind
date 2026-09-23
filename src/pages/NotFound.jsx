import { Link } from "react-router-dom";
import { Compass, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/i18n/LangContext";

export default function NotFound() {
  const { t } = useLang();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <span className="brand-gradient flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-card">
        <Compass className="h-8 w-8" />
      </span>
      <p className="mt-6 text-6xl font-extrabold text-brand-gradient">404</p>
      <h1 className="mt-2 text-xl font-bold">{t("notFound.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("notFound.subtitle")}</p>
      <Button asChild className="mt-6">
        <Link to="/app">
          <Home className="h-4 w-4" />
          {t("notFound.back")}
        </Link>
      </Button>
    </div>
  );
}
