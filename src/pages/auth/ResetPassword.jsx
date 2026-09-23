import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthLayout from "@/components/auth/AuthLayout";
import { mapAuthError } from "@/components/auth/mapAuthError";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useAuth } from "@/lib/authContext";
import { useLang } from "@/lib/i18n/LangContext";
import { useToast } from "@/components/ui/toast";

export default function ResetPassword() {
  const { t } = useLang();
  const { resetPassword } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!password || !token) return setError(t("auth.errors.required"));
    if (password.length < 6) return setError(t("auth.errors.weakPassword"));
    if (password !== confirm) return setError(t("auth.errors.passwordMismatch"));

    setLoading(true);
    try {
      resetPassword(token, password);
      toast.success(t("auth.passwordChanged"));
      navigate("/login", { replace: true });
    } catch (err) {
      setError(mapAuthError(err, t));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title={t("auth.newPasswordTitle")} footer={<Link to="/login" className="font-medium text-primary hover:underline">{t("auth.signIn")}</Link>}>
      <form onSubmit={submit} className="space-y-4">
        {!token && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
            {t("auth.resetLinkHint")}
          </p>
        )}
        <Field label={t("auth.newPassword")}>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoFocus />
        </Field>
        <Field label={t("auth.newPasswordRepeat")}>
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" />
        </Field>
        {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">{error}</p>}
        <Button type="submit" variant="gradient" className="w-full" size="lg" loading={loading}>
          {t("auth.setPassword")}
        </Button>
      </form>
    </AuthLayout>
  );
}
