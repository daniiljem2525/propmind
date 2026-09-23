import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Bell,
  Check,
  CreditCard,
  Mail,
  Palette,
  ShieldCheck,
  Sparkles,
  User,
  UserPlus,
  Users,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import UsersPanel from "@/components/UsersPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Switch } from "@/components/ui/input";
import { useAuth } from "@/lib/authContext";
import { useLang } from "@/lib/i18n/LangContext";
import { useTheme } from "@/lib/theme";
import { useToast } from "@/components/ui/toast";
import { PLANS } from "@/lib/config/misc";
import { cn, formatDate, formatMoney, initials } from "@/lib/utils";

const PREFS_KEY = "propmind:prefs";
const PLAN_KEY = "propmind:plan";

// ——— Сегментированный переключатель ———
function Segmented({ options, value, onChange }) {
  return (
    <div className="inline-flex rounded-md border bg-muted/40 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded px-4 py-1.5 text-sm font-medium transition-colors",
            value === o.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ——— Тарифные планы ———
function PricingPlans() {
  const { t, lang } = useLang();
  const toast = useToast();
  const [yearly, setYearly] = useState(false);
  const [plan, setPlan] = useState(() => {
    try {
      return localStorage.getItem(PLAN_KEY) || "free";
    } catch {
      return "free";
    }
  });

  const choose = (id) => {
    try {
      localStorage.setItem(PLAN_KEY, id);
    } catch {}
    setPlan(id);
    toast.success(t("plans.choose"));
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((p) => {
          const price = yearly ? p.yearly : p.monthly;
          const isCurrent = plan === p.id;
          return (
            <Card key={p.id} className={cn("relative flex flex-col p-5", p.highlight && "border-primary ring-2 ring-primary")}>
              {p.highlight && (
                <span className="brand-gradient absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
                  ★ Pro
                </span>
              )}
              <h3 className="text-lg font-bold">{t(`plans.${p.id}.name`)}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{t(`plans.${p.id}.desc`)}</p>
              <p className="mt-4">
                <span className="text-2xl font-extrabold">{formatMoney(price, "RUB", lang)}</span>
                <span className="text-sm font-normal text-muted-foreground">{yearly ? t("plans.perYear") : t("plans.perMonth")}</span>
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
                disabled={isCurrent}
                onClick={() => choose(p.id)}
              >
                {isCurrent ? t("plans.current") : t("plans.choose")}
              </Button>
            </Card>
          );
        })}
      </div>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        <a
          href={`mailto:sales@propmind.app?subject=${encodeURIComponent(t("plans.contactSubject"))}`}
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

// ——— Страница настроек ———
export default function Settings() {
  const { t, lang, setLang } = useLang();
  const { theme, setTheme } = useTheme();
  const { user, updateProfile, changePassword } = useAuth();
  const toast = useToast();

  const [tab, setTab] = useState(() => {
    // Поддержка прямых ссылок вида /app/settings?tab=plan (из upsell-диалога)
    const tabParam = new URLSearchParams(window.location.search).get("tab");
    return ["profile", "appearance", "notifications", "security", "plan", "users"].includes(tabParam)
      ? tabParam
      : "profile";
  });
  const isAdmin = user?.role === "admin";

  // Профиль
  const [name, setName] = useState(user?.full_name || "");
  useEffect(() => setName(user?.full_name || ""), [user?.full_name]);

  // Уведомления
  const [prefs, setPrefs] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(PREFS_KEY)) || { overdue: true, maintenance: true, lease: true };
    } catch {
      return { overdue: true, maintenance: true, lease: true };
    }
  });
  const setPref = (key, value) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {}
  };

  // Смена пароля
  const [pw, setPw] = useState({ current: "", next: "", repeat: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const submitPassword = async (e) => {
    e.preventDefault();
    if (!pw.current || pw.next.length < 6 || pw.next !== pw.repeat) {
      toast.error(pw.next !== pw.repeat ? t("auth.errors.passwordMismatch") : t("auth.errors.weakPassword"));
      return;
    }
    setPwSaving(true);
    try {
      changePassword(user.id, pw.current, pw.next);
      toast.success(t("auth.passwordChanged"));
      setPw({ current: "", next: "", repeat: "" });
    } catch (err) {
      toast.error(err.message === "WRONG_PASSWORD" ? t("settings.wrongPassword") : t("errors.generic"));
    } finally {
      setPwSaving(false);
    }
  };

  const saveProfile = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    updateProfile(user.id, { full_name: name.trim() });
    toast.success(t("settings.profileSaved"));
  };

  const tabs = [
    { id: "profile", icon: User, label: t("settings.tabProfile") },
    { id: "appearance", icon: Palette, label: t("settings.tabAppearance") },
    { id: "notifications", icon: Bell, label: t("settings.tabNotifications") },
    { id: "security", icon: ShieldCheck, label: t("settings.tabSecurity") },
    { id: "plan", icon: CreditCard, label: t("settings.tabPlan") },
    ...(isAdmin ? [{ id: "users", icon: Users, label: t("settings.tabUsers") }] : []),
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />

      {/* Табы */}
      <div className="scrollbar-thin mb-6 flex gap-1 overflow-x-auto border-b pb-px">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-t-md border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              tab === tb.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <tb.icon className="h-4 w-4" />
            {tb.label}
          </button>
        ))}
      </div>

      {tab === "profile" && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>{t("settings.tabProfile")}</CardTitle>
            <CardDescription>
              {t("settings.accountCreated")}: {formatDate(user?.created_date, lang)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveProfile} className="space-y-4">
              <Field label={t("auth.fullName")} required>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label={t("auth.email")}>
                <Input value={user?.email || ""} disabled className="text-muted-foreground" />
              </Field>
              <Button type="submit">{t("common.save")}</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {tab === "appearance" && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>{t("settings.tabAppearance")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{t("settings.language")}</p>
                <p className="text-xs text-muted-foreground">RU / EN</p>
              </div>
              <Segmented
                value={lang}
                onChange={setLang}
                options={[
                  { value: "ru", label: "Русский" },
                  { value: "en", label: "English" },
                ]}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{t("settings.theme")}</p>
                <p className="text-xs text-muted-foreground">{t("common.light")} / {t("common.dark")}</p>
              </div>
              <Segmented
                value={theme}
                onChange={setTheme}
                options={[
                  { value: "light", label: t("common.light") },
                  { value: "dark", label: t("common.dark") },
                ]}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "notifications" && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>{t("settings.tabNotifications")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {[
              { key: "overdue", label: t("settings.notifOverdue") },
              { key: "maintenance", label: t("settings.notifMaintenance") },
              { key: "lease", label: t("settings.notifLease") },
            ].map((row) => (
              <div key={row.key} className="flex items-center justify-between">
                <p className="text-sm font-medium">{row.label}</p>
                <Switch checked={prefs[row.key]} onChange={(v) => setPref(row.key, v)} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {tab === "security" && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>{t("settings.tabSecurity")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitPassword} className="space-y-4">
              <Field label={t("settings.currentPassword")} required>
                <Input type="password" value={pw.current} onChange={(e) => setPw((f) => ({ ...f, current: e.target.value }))} />
              </Field>
              <Field label={t("auth.newPassword")} required>
                <Input type="password" value={pw.next} onChange={(e) => setPw((f) => ({ ...f, next: e.target.value }))} />
              </Field>
              <Field label={t("auth.newPasswordRepeat")} required>
                <Input type="password" value={pw.repeat} onChange={(e) => setPw((f) => ({ ...f, repeat: e.target.value }))} />
              </Field>
              <Button type="submit" loading={pwSaving}>
                {t("auth.setPassword")}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {tab === "plan" && <PricingPlans />}
      {tab === "users" && isAdmin && <UsersPanel />}
    </div>
  );
}
