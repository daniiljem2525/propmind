import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MailCheck } from "lucide-react";
import AuthLayout from "@/components/auth/AuthLayout";
import { mapAuthError } from "@/components/auth/mapAuthError";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useAuth } from "@/lib/authContext";
import { useLang } from "@/lib/i18n/LangContext";

export default function ForgotPassword() {
  const { t } = useLang();
  const { requestPasswordReset } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [resetLink, setResetLink] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!email) return setError(t("auth.errors.required"));
    setLoading(true);
    try {
      const { token } = requestPasswordReset(email);
      setResetLink(`/reset-password?token=${token}`);
    } catch (err) {
      setError(mapAuthError(err, t));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title={t("auth.resetTitle")}
      subtitle={t("auth.resetSubtitle")}
      footer={
        <Link to="/login" className="font-medium text-primary hover:underline">
          {t("auth.signIn")}
        </Link>
      }
    >
      {resetLink ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm dark:border-emerald-500/20 dark:bg-emerald-500/10">
            <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="text-emerald-800 dark:text-emerald-300">
              <p className="font-medium">{t("auth.resetLinkSent")}</p>
              <p className="mt-0.5">{t("auth.resetLinkHint")}:</p>
              <Link to={resetLink} className="mt-1 block break-all font-medium text-primary underline">
                {resetLink}
              </Link>
            </div>
          </div>
          <Button variant="outline" className="w-full" onClick={() => navigate("/login")}>
            {t("common.back")}
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label={t("auth.email")}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoFocus />
          </Field>
          {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">{error}</p>}
          <Button type="submit" variant="gradient" className="w-full" size="lg" loading={loading}>
            {t("auth.sendLink")}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
