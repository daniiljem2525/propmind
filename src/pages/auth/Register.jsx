import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, KeyRound, MailCheck } from "lucide-react";
import AuthLayout from "@/components/auth/AuthLayout";
import { mapAuthError } from "@/components/auth/mapAuthError";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useAuth } from "@/lib/authContext";
import { useLang } from "@/lib/i18n/LangContext";

// Многошаговая регистрация: данные → OTP → редирект
export default function Register() {
  const { t, lang } = useLang();
  const { signup, verifyOtp } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState("form");
  const [form, setForm] = useState({ full_name: "", email: "", password: "", confirm: "" });
  const [otp, setOtp] = useState("");
  const [demoCode, setDemoCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submitForm = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.full_name || !form.email || !form.password) return setError(t("auth.errors.required"));
    if (form.password.length < 6) return setError(t("auth.errors.weakPassword"));
    if (form.password !== form.confirm) return setError(t("auth.errors.passwordMismatch"));

    setLoading(true);
    try {
      const { otp: code } = signup(form);
      setDemoCode(code);
      setStep("otp");
    } catch (err) {
      setError(mapAuthError(err, t));
    } finally {
      setLoading(false);
    }
  };

  const submitOtp = async (e) => {
    e.preventDefault();
    setError("");
    if (otp.length !== 6) return setError(t("auth.errors.wrongOtp"));
    setLoading(true);
    try {
      verifyOtp(form.email, otp);
      navigate("/app", { replace: true });
    } catch (err) {
      setError(mapAuthError(err, t));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title={step === "form" ? t("auth.signUpTitle") : t("auth.otpTitle")}
      subtitle={step === "form" ? t("auth.signUpSubtitle") : t("auth.otpSubtitle").replace("{email}", form.email)}
      footer={
        <>
          {t("auth.haveAccount")}{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            {t("auth.signIn")}
          </Link>
        </>
      }
    >
      {step === "form" ? (
        <form onSubmit={submitForm} className="space-y-4">
          <Field label={t("auth.fullName")}>
            <Input value={form.full_name} onChange={set("full_name")} placeholder={lang === "ru" ? "Иван Петров" : "John Smith"} autoComplete="name" />
          </Field>
          <Field label={t("auth.email")}>
            <Input type="email" value={form.email} onChange={set("email")} placeholder="you@example.com" autoComplete="email" />
          </Field>
          <Field label={t("auth.password")}>
            <Input type="password" value={form.password} onChange={set("password")} placeholder="••••••••" autoComplete="new-password" />
          </Field>
          <Field label={t("auth.confirmPassword")}>
            <Input type="password" value={form.confirm} onChange={set("confirm")} placeholder="••••••••" autoComplete="new-password" />
          </Field>

          {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">{error}</p>}

          <Button type="submit" variant="gradient" className="w-full" size="lg" loading={loading}>
            {t("auth.signUp")}
          </Button>
        </form>
      ) : (
        <form onSubmit={submitOtp} className="space-y-4">
          <button
            type="button"
            onClick={() => setStep("form")}
            className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("common.back")}
          </button>

          <div className="flex items-start gap-3 rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm dark:border-sky-500/20 dark:bg-sky-500/10">
            <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
            <p className="text-sky-800 dark:text-sky-300">
              {t("auth.otpDemoHint")}: <span className="select-all font-mono text-base font-bold tracking-widest">{demoCode}</span>
            </p>
          </div>

          <Field label={t("auth.otpCode")}>
            <Input
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="text-center font-mono text-lg tracking-[0.5em]"
              inputMode="numeric"
              autoFocus
            />
          </Field>

          {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">{error}</p>}

          <Button type="submit" variant="gradient" className="w-full" size="lg" loading={loading}>
            <KeyRound className="h-4 w-4" />
            {t("auth.verify")}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
