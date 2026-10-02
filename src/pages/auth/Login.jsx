import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Sparkles } from "lucide-react";
import AuthLayout from "@/components/auth/AuthLayout";
import { mapAuthError } from "@/components/auth/mapAuthError";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useAuth } from "@/lib/authContext";
import { ensureDemoAccount, loginDemo } from "@/lib/api/auth";
import { seedDemoData } from "@/lib/demo";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { probeSessionStores } from "@/lib/supabase/config";
import { useLang } from "@/lib/i18n/LangContext";
import { useToast } from "@/components/ui/toast";

// Диагностика хранилища сессии: видно на экране логина, что осталось
// после выгрузки приложения (свайпа). Нули во всех трёх — iOS чистит
// хранилище целиком; данные есть, а логин требуется — проблема восстановления.
function StorageProbe() {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    let alive = true;
    const d = new Date(document.lastModified);
    const build = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    probeSessionStores().then((p) => {
      if (alive)
        setInfo(`LS ${p.ls}Б · cookie ${p.ck}Б · IDB ${p.idb}Б · SW ${p.sw ? "+" : "−"} · билд ${build}`);
    });
    return () => {
      alive = false;
    };
  }, []);
  return info ? (
    <p className="mt-4 text-center text-[11px] text-muted-foreground">diag: {info}</p>
  ) : null;
}

export default function Login() {
  const { t } = useLang();
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  // Демо-аккаунт существует всегда — даже в пустом браузере
  useEffect(() => {
    ensureDemoAccount();
  }, []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  // Демо-вход в облаке: готовый аккаунт + демо-данные, с индикатором
  const demoLogin = async () => {
    setDemoLoading(true);
    setError("");
    try {
      await loginDemo();
      await seedDemoData({});
      // обычный вход по демо-учётке обновит состояние AuthContext
      await login("demo@arendora.app", "arendora-demo");
      navigate("/app", { replace: true });
    } catch (e) {
      console.error("demo login failed:", e);
      toast.error(t("auth.demoUnavailable"));
    } finally {
      setDemoLoading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!email || !password) return setError(t("auth.errors.required"));
    setLoading(true);
    try {
      await login(email, password);
      navigate(location.state?.from?.pathname || "/app", { replace: true });
    } catch (err) {
      setError(mapAuthError(err, t));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title={t("auth.signInTitle")}
      subtitle={t("auth.signInSubtitle")}
      footer={
        <>
          {t("auth.noAccount")}{" "}
          <Link to="/register" className="font-medium text-primary hover:underline">
            {t("auth.signUp")}
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {/* Демо-доступ: один клик заполняет аккаунт администратора */}
        <div className="flex items-start gap-3 rounded-md border border-primary/25 bg-primary/5 px-4 py-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-snug">{t("auth.demoBox")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("auth.demoRegister")}</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={isSupabaseConfigured ? demoLogin : () => {
              setEmail("owner@arendora.test");
              setPassword("secret123");
              toast.success(t("auth.demoFilled"));
            }}
            loading={isSupabaseConfigured ? demoLoading : false}
          >
            {isSupabaseConfigured ? t("auth.demoEnter") : t("auth.demoFill")}
          </Button>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          {t("auth.orEmail")}
          <span className="h-px flex-1 bg-border" />
        </div>

        <Field label={t("auth.email")}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
        </Field>

        <Field label={t("auth.password")}>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>

        {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">{error}</p>}

        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-medium text-primary hover:underline">
            {t("auth.forgotPassword")}
          </Link>
        </div>

        <Button type="submit" variant="gradient" className="w-full" size="lg" loading={loading}>
          {t("auth.signIn")}
        </Button>
      </form>
      {location.search.includes("debug") && <StorageProbe />}
    </AuthLayout>
  );
}
