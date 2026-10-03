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
  // Индивидуальная ссылка арендодателя: /register?ref=КОД (или ?code=КОД)
  const refCode = String(
    new URLSearchParams(window.location.search).get("ref") ||
      new URLSearchParams(window.location.search).get("code") ||
      ""
  ).toUpperCase();
  const [form, setForm] = useState({ full_name: "", email: "", password: "", confirm: "", invite_code: refCode });
  const [otp, setOtp] = useState("");
  const [demoCode, setDemoCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submitForm = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.full_name || !form.email || !form.password) return setError(t("auth.errors.required"));
    if (form.password.length < 8) return setError(t("auth.errors.weakPassword"));
    if (form.password !== form.confirm) return setError(t("auth.errors.passwordMismatch"));

    setLoading(true);
    try {
      const result = await signup(form);
      if (result?.needsConfirmation) {
        setStep("confirm-email");
        return;
      }
      if (result?.otp) {
        setDemoCode(result.otp);
        setStep("otp");
        return;
      }
      // облачный режим с выключенным подтверждением — сразу в приложение
      navigate("/app", { replace: true });
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
      title={step === "confirm-email" ? t("auth.checkEmailTitle") : step === "form" ? t("auth.signUpTitle") : t("auth.otpTitle")}
      subtitle={step === "confirm-email" ? form.email : step === "form" ? t("auth.signUpSubtitle") : t("auth.otpSubtitle").replace("{email}", form.email)}
      footer={
        <>
          {t("auth.haveAccount")}{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            {t("auth.signIn")}
          </Link>
        </>
      }
    >
      {step === "confirm-email" ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm dark:border-emerald-500/20 dark:bg-emerald-500/10">
            <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="leading-relaxed text-emerald-800 dark:text-emerald-300">
              Мы отправили письмо для подтверждения на {form.email}.
              Подтверди аккаунт и войди под своим паролем.
            </div>
          </div>
          <Link
            to="/login"
            className="inline-flex h-11 w-full items-center justify-center rounded-md brand-gradient text-sm font-semibold text-white"
          >
            {t("auth.signIn")}
          </Link>
        </div>
      ) : step === "form" ? (
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
          <Field label={t("auth.inviteCode")} hint={t("auth.inviteHint")}>
            <Input value={form.invite_code} onChange={set("invite_code")} placeholder="AB12CD34" className="uppercase" />
          </Field>

          {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">{error}</p>}

          <Button type="submit" variant="gradient" className="w-full" size="lg" loading={loading}>
            {t("auth.signUp")}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {"Регистрируясь, вы принимаете "}
            <Link to="/terms" className="text-primary hover:underline">оферту</Link>
            {" и "}
            <Link to="/privacy" className="text-primary hover:underline">политику конфиденциальности</Link>
          </p>
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
