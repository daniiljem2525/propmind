import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, Loader2 } from "lucide-react";
import AuthLayout from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/config";
import { useAuth } from "@/lib/authContext";
import { useLang } from "@/lib/i18n/LangContext";

// Приёмник ссылки подтверждения почты (/auth/confirm — emailRedirectTo в
// signup, src/lib/supabase/auth.js). Автологин: подтвердивший почту
// пользователь попадает сразу в /app, без ручного /login (P0 №3 ревью
// NT-027). Обрабатываются оба варианта, какой ни включён в GoTrue:
//  1) token_hash в query — серверный verify-флоу: обмен на сессию сами;
//  2) #access_token (implicit-флоу) — сессию в storage кладёт сам
//     supabase-js (detectSessionInUrl), нам остаётся дождаться её.
export default function AuthCallback() {
  const { t } = useLang();
  const { refreshUser } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError(t("auth.socialFailed"));
      return;
    }
    let alive = true;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      // GoTrue возвращает ошибку подтверждения и в query, и во фрагменте
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      if (params.get("error") || fragment.get("error")) {
        console.error(
          "email confirm failed:",
          params.get("error_description") || fragment.get("error_description")
        );
        setError(t("auth.socialFailed"));
        return;
      }

      // Вариант 1: token_hash (verify-флоу) — обмениваем на обычную сессию
      const tokenHash = params.get("token_hash");
      if (tokenHash) {
        const type = params.get("type") === "magiclink" ? "magiclink" : "signup";
        const { error: otpError } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
        if (otpError) {
          console.error("verifyOtp failed:", otpError);
          setError(t("auth.socialFailed"));
          return;
        }
      }

      // Дожидаемся сессии (в implicit-флоу её кладёт supabase-js при старте;
      // в verify-флоу она уже после verifyOtp). Без таймаута — экран
      // загрузки висел бы вечно при погашенной вкладке из письма.
      let session = null;
      for (let attempt = 0; attempt < 20 && alive; attempt++) {
        const { data } = await supabase.auth.getSession();
        session = data?.session || null;
        if (session) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (!alive) return;
      if (!session) {
        setError(t("auth.socialFailed"));
        return;
      }
      await refreshUser();
      navigate("/app", { replace: true });
    })();
    return () => {
      alive = false;
    };
  }, [navigate, t, refreshUser]);

  return (
    <AuthLayout title={t("auth.confirmTitle")} subtitle={t("auth.confirmSubtitle")}>
      {error ? (
        <div className="space-y-4">
          <p className="flex items-start gap-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
          <Button variant="outline" className="w-full" onClick={() => navigate("/login", { replace: true })}>
            {t("auth.socialRetry")}
          </Button>
        </div>
      ) : (
        <div className="space-y-4 text-center">
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("auth.confirmLoading")}
          </p>
          <p className="text-sm text-muted-foreground">
            <Link to="/login" className="text-primary hover:underline">
              {t("auth.socialBack")}
            </Link>
          </p>
        </div>
      )}
    </AuthLayout>
  );
}
