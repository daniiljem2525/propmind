import { NavLink, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Building2,
  ChevronRight,
  ChevronsLeft,
  ClipboardList,
  CreditCard,
  FileText,
  Globe,
  House,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Users,
  Wrench,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n/LangContext";
import { useAuth } from "@/lib/authContext";
import { hasAccess } from "@/lib/config/statuses";

// Роли → страницы: матрица ROLE_ACCESS в config/statuses.js (единственный
// источник прав: сайдбар, RoleRoute, Header). legacy-роли ("user", undefined)
// hasAccess трактует как полный доступ — прежнее поведение сайдбара сохранено.
const NAV_ITEMS = [
  { to: "/app", page: "dashboard", icon: LayoutDashboard, key: "nav.dashboard", end: true },
  { to: "/app/properties", page: "properties", icon: Building2, key: "nav.properties" },
  { to: "/app/tenants", page: "tenants", icon: Users, key: "nav.tenants" },
  { to: "/app", page: "portal", icon: House, key: "portal.myHome", end: true },
  { to: "/app/payments", page: "payments", icon: CreditCard, key: "nav.payments" },
  { to: "/app/maintenance", page: "maintenance", icon: Wrench, key: "nav.maintenance" },
  { to: "/app/inspections", page: "inspections", icon: ClipboardList, key: "nav.inspections" },
  { to: "/app/documents", page: "documents", icon: FileText, key: "nav.documents" },
  { to: "/app/analytics", page: "analytics", icon: BarChart3, key: "nav.analytics" },
  { to: "/app/plan", page: "plan", icon: Wallet, key: "nav.plan" },
  { to: "/app/settings", page: "settings", icon: Settings, key: "nav.settings" },
  { to: "/app/admin", icon: ShieldCheck, key: "admin.title", adminOnly: true },
];

export default function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onCloseMobile }) {
  const { t, lang, setLang } = useLang();
  const { user } = useAuth();
  const navigate = useNavigate();
  const items = NAV_ITEMS.filter(
    (item) =>
      // Админ-панель — только платформенному администратору (is_platform_admin в профиле)
      (!item.adminOnly || user?.is_platform_admin === true) &&
      (!item.page || hasAccess(user, item.page))
  );

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
          <button className="flex items-center gap-2.5" onClick={() => navigate("/app")} title="Arendora">
            <span className="brand-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-sm">
              <House className="h-5 w-5 text-white" />
            </span>
            {!collapsed && (
              <span className="flex flex-col leading-none">
                <span className="text-[15px] font-extrabold tracking-tight">Arendora</span>
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
