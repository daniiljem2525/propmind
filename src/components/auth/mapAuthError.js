import { useLang } from "@/lib/i18n/LangContext";

// Коды ошибок auth.js → ключи i18n
export function mapAuthError(e, t) {
  const map = {
    WRONG_CREDENTIALS: "auth.errors.wrongCredentials",
    EMAIL_EXISTS: "auth.errors.emailExists",
    USER_NOT_FOUND: "auth.errors.userNotFound",
    PASSWORD_MISMATCH: "auth.errors.passwordMismatch",
    WEAK_PASSWORD: "auth.errors.weakPassword",
    WRONG_OTP: "auth.errors.wrongOtp",
    WRONG_PASSWORD: "settings.wrongPassword",
    REQUIRED: "auth.errors.required",
    PENDING_ACCOUNT: "auth.errors.wrongCredentials",
  };
  return t(map[e?.message] || "errors.generic");
}
