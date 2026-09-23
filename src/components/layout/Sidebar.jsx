import { NavLink, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Building2,
  ChevronRight,
  ChevronsLeft,
  CreditCard,
  FileText,
  Globe,
  House,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n/LangContext";
import { useAuth } from "@/lib/authContext";

const NAV_ITEMS = [
  { to: "/app", icon: LayoutDashboard, key: "nav.dashboard", end: true },
  { to: "/app/properties", icon: Building2, key: "nav.properties" },
  { to: "/app/tenants", icon: Users, key: "nav.tenants" },
  { to: "/app/payments", icon: CreditCard, key: "nav.payments" },
  { to: "/app/maintenance", icon: Wrench, key: "nav.maintenance" },
  { to: "/app/documents", icon: FileText, key: "nav.documents" },
  { to: "/app/analytics", icon: BarChart3, key: "nav.analytics" },
  { to: "/app/settings", icon: Settings, key: "nav.settings" },
  { to: "/app/admin", icon: ShieldCheck, key: "admin.title", adminOnly: true },
];

export default function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onCloseMobile }) {
  const { t, lang, setLang } = useLang();
  const { user } = useAuth();
  const navigate = useNavigate();
  const items = NAV_ITEMS.filter((item) => !item.adminOnly || user?.role === "admin");

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-[1px] lg:hidden" onClick={onCloseMobile} />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r bg-card transition-all duration-200",
          collapsed ? "lg:w-[60px]" : "lg:w-64",
          "w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0"
        )}
      >
        {/* Логотип */}
        <div className={cn("flex h-16 shrink-0 items-center border-b px-4", collapsed && "lg:justify-center lg:px-0")}>
          <button className="flex items-center gap-2.5" onClick={() => navigate("/app")} title="PropMind">
            <span className="brand-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-sm">
              <House className="h-5 w-5 text-white" />
            </span>
            {!collapsed && (
              <span className="flex flex-col leading-none">
                <span className="text-[15px] font-extrabold tracking-tight">PropMind</span>
                <span className="mt-0.5 text-[10px] font-medium text-muted-foreground">{t("app.tagline")}</span>
              </span>
            )}
          </button>
        </div>

        {/* Навигация */}
        <nav className="scrollbar-thin flex-1 space-y-1 overflow-y-auto px-2.5 py-3">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={collapsed ? t(item.key) : undefined}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                  collapsed && "lg:justify-center lg:px-0",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )
              }
            >
              <item.icon className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span className="truncate">{t(item.key)}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Подвал: язык + сворачивание */}
        <div className="space-y-1 border-t p-2.5">
          <button
            onClick={() => setLang(lang === "ru" ? "en" : "ru")}
            title={t("common.language")}
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              collapsed && "lg:justify-center lg:px-0"
            )}
          >
            <Globe className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && (
              <span className="flex items-center gap-1.5">
                {t("common.language")}
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary">
                  {lang === "ru" ? "RU" : "EN"}
                </span>
              </span>
            )}
          </button>

          <button
            onClick={onToggleCollapse}
            className="hidden w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:flex"
            title={collapsed ? t("app.name") : ""}
          >
            {collapsed ? (
              <ChevronRight className="mx-auto h-[18px] w-[18px]" />
            ) : (
              <>
                <ChevronsLeft className="h-[18px] w-[18px]" />
                <span className="sr-only">Свернуть</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
