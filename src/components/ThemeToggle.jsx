import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useLang } from "@/lib/i18n/LangContext";
import { cn } from "@/lib/utils";

// Кнопка светлой/тёмной темы для публичных страниц (вход, блог, документы).
// На лендинге и в шапке приложения — такие же встроенные варианты.
export default function ThemeToggle({ className }) {
  const { theme, toggleTheme } = useTheme();
  const { t } = useLang();

  return (
    <button
      onClick={toggleTheme}
      title={t("common.theme")}
      aria-label={t("common.theme")}
      className={cn(
        "rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className
      )}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
