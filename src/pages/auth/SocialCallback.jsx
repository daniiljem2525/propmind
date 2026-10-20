import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import AuthLayout from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/config";
import { useLang } from "@/lib/i18n/LangContext";

// Приёмник соц-входа (Яндекс / VK / Mail.ru): edge-функция oauth
// возвращает сюда одноразовый token_hash — обмениваем его на
// обычную сессию Supabase и попадаем в приложение.
export default function SocialCallback() {
  const { t } = useLang();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError(t("auth.socialFailed"));
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get("token_hash");
    const type = params.get("type") === "signup" ? "signup" : "magiclink";
    if (params.get("error") || !tokenHash) {
      console.error("social login failed:", params.get("error"), params.get("error_description"));
      setError(t("auth.socialFailed"));
      return;
    }
    (async () => {
      const { error: otpError } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      if (otpError) {
        console.error("verifyOtp failed:", otpError);
        setError(t("auth.socialFailed"));
        return;
      }
      navigate("/app", { replace: true });
    })();
  }, [navigate, t]);

  return (
    <AuthLayout title={t("auth.socialTitle")} subtitle={t("auth.socialSubtitle")}>
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
        <p className="text-center text-sm text-muted-foreground">
          <Link to="/login" className="text-primary hover:underline">
            {t("auth.socialBack")}
          </Link>
        </p>
      )}
    </AuthLayout>
  );
}
