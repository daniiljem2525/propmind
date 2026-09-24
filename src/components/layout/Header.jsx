import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bell,
  Building2,
  CreditCard,
  FileText,
  LogOut,
  Menu,
  Moon,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
  User,
  UserRound,
  Wrench,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useAuth } from "@/lib/authContext";
import { useLang } from "@/lib/i18n/LangContext";
import { useTheme } from "@/lib/theme";
import { useCollection } from "@/hooks/useCollection";
import { NotificationEntity, Property, Tenant } from "@/lib/api/entities";
import { useDemoSeed } from "@/hooks/useDemoSeed";
import { cn, initials } from "@/lib/utils";

export default function Header({ onOpenMobile }) {
  const { t } = useLang();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const toast = useDemoSeed();

  const { data: notifications } = useCollection(NotificationEntity);
  const { data: properties } = useCollection(Property);
  const { data: tenants } = useCollection(Tenant);
  const unread = notifications.filter((n) => !n.is_read).length;

  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [demoConfirm, setDemoConfirm] = useState(false);
  const menuRef = useRef(null);
  const quickRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
      if (quickRef.current && !quickRef.current.contains(e.target)) setQuickOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchFocused(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const QUICK_CREATE = [
    { to: "/app/properties?new=1", icon: Building2, label: t("properties.addProperty") },
    { to: "/app/tenants?new=1", icon: UserRound, label: t("tenants.addTenant") },
    { to: "/app/payments?new=1", icon: CreditCard, label: t("payments.addPayment") },
    { to: "/app/maintenance?new=1", icon: Wrench, label: t("maintenance.addRequest") },
    { to: "/app/documents?new=1", icon: FileText, label: t("documents.upload") },
  ];

  const q = query.trim().toLowerCase();
  const results =
    q.length >= 2
      ? [
          ...properties
            .filter((p) => (p.name || "").toLowerCase().includes(q) || (p.address || "").toLowerCase().includes(q))
            .slice(0, 4)
            .map((p) => ({ icon: Building2, label: p.name, sub: p.address, to: "/app/properties" })),
          ...tenants
            .filter((x) => (x.full_name || "").toLowerCase().includes(q) || (x.email || "").toLowerCase().includes(q))
            .slice(0, 3)
            .map((x) => ({ icon: User, label: x.full_name, sub: x.email, to: "/app/tenants" })),
        ]
      : [];

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-card/80 px-4 backdrop-blur lg:pr-8">
      <button
        onClick={onOpenMobile}
        className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Глобальный поиск */}
      <div ref={searchRef} className="relative hidden w-full max-w-md sm:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) {
              navigate(results[0].to);
              setQuery("");
              setSearchFocused(false);
            }
          }}
          placeholder={t("common.searchGlobalPlaceholder")}
          className="pl-9"
        />
        {searchFocused && results.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-lg border bg-card shadow-card-hover">
            {results.map((r, i) => (
              <button
                key={i}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted"
                onClick={() => {
                  navigate(r.to);
                  setQuery("");
                  setSearchFocused(false);
                }}
              >
                <r.icon className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate font-medium">{r.label}</span>
                <span className="hidden max-w-[45%] truncate text-xs text-muted-foreground sm:block">{r.sub}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        {/* Быстрое создание */}
        <div ref={quickRef} className="relative">
          <button
            onClick={() => setQuickOpen((v) => !v)}
            title={t("common.add")}
            className="brand-gradient flex h-9 w-9 items-center justify-center rounded-full text-white shadow-sm transition-opacity hover:opacity-90"
          >
            <Plus className="h-5 w-5" />
          </button>
          {quickOpen && (
            <div className="absolute right-0 top-full z-40 mt-2 w-60 overflow-hidden rounded-lg border bg-card p-1.5 shadow-card-hover">
              {QUICK_CREATE.map((item) => (
                <button
                  key={item.to}
                  className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
                  onClick={() => {
                    setQuickOpen(false);
                    navigate(item.to);
                  }}
                >
                  <item.icon className="h-4 w-4 text-primary" />
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={toggleTheme}
          title={t("common.theme")}
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>

        <Link
          to="/app/notifications"
          title={t("nav.notifications")}
          className="relative rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Link>

        {/* Профиль */}
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full p-0.5 transition-colors hover:ring-2 hover:ring-ring"
          >
            <span className="brand-gradient flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white">
              {initials(user?.full_name)}
            </span>
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full z-40 mt-2 w-60 overflow-hidden rounded-lg border bg-card shadow-card-hover">
              <div className="border-b px-4 py-3">
                <p className="truncate text-sm font-semibold">{user?.full_name}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
              </div>
              <div className="p-1.5">
                <button
                  className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate("/app/settings");
                  }}
                >
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  {t("common.settings")}
                </button>
                <button
                  className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted"
                  onClick={() => {
                    setMenuOpen(false);
                    setDemoConfirm(true);
                  }}
                >
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  {toast.loading ? t("common.demoLoading") : t("common.demoData")}
                </button>
                <button
                  className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-rose-600 transition-colors hover:bg-rose-50 dark:hover:bg-rose-500/10"
                  onClick={() => {
                    logout();
                    navigate("/login");
                  }}
                >
                  <LogOut className="h-4 w-4" />
                  {t("common.logout")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={demoConfirm}
        onClose={() => setDemoConfirm(false)}
        onConfirm={() => {
          setDemoConfirm(false);
          toast.run();
        }}
        title={t("dashboard.confirmDemoTitle")}
        description={t("dashboard.confirmDemoDesc")}
        confirmLabel={t("common.demoData")}
      />
    </header>
  );
}
