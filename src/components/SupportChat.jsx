import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useLang } from "@/lib/i18n/LangContext";
import { supabase, SUPABASE_URL } from "@/lib/supabase/config";

// Плавающий чат поддержки: кнопка → панель → сообщение → ответ ≤1 час.
// POST на /functions/v1/support-chat (JWT если залогинен, аноним без JWT).
export default function SupportChat() {
  const { t } = useLang();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const panelRef = useRef(null);

  const send = async () => {
    const msg = message.trim();
    if (!msg) return;
    setSending(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { "Content-Type": "application/json" };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/support-chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: name.trim() || (user?.email || "").split("@")[0] || "",
          email: email.trim() || user?.email || "",
          message: msg,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setSent(true);
      setMessage("");
    } catch (e) {
      setError(e.message || "Ошибка отправки");
    } finally {
      setSending(false);
    }
  };

  // Закрытие по клику вне
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <>
      {/* Кнопка */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary shadow-lg transition-transform hover:scale-110"
          title={t("support.title")}
          aria-label={t("support.title")}
        >
          <MessageCircle className="h-6 w-6 text-white" fill="currentColor" />
        </button>
      )}

      {/* Панель чата */}
      {open && (
        <div ref={panelRef} className="fixed bottom-6 right-4 z-50 w-80 rounded-lg border bg-card shadow-card-hover">
          {/* Шапка */}
          <div className="flex items-center justify-between rounded-t-lg bg-primary px-4 py-3">
            <span className="text-sm font-semibold text-white">{t("support.title")}</span>
            <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Тело */}
          <div className="p-4">
            {sent ? (
              <div className="py-6 text-center">
                <p className="text-sm text-muted-foreground">{t("support.sent")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("support.responseTime")}</p>
              </div>
            ) : (
              <>
                {!user && (
                  <>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t("support.namePlaceholder")}
                      className="mb-2 w-full rounded-md border bg-background px-3 py-2 text-sm"
                    />
                    <input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      type="email"
                      placeholder={t("support.emailPlaceholder")}
                      className="mb-2 w-full rounded-md border bg-background px-3 py-2 text-sm"
                    />
                  </>
                )}
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t("support.messagePlaceholder")}
                  rows={4}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  maxLength={2000}
                />
                {error && <p className="mt-2 text-xs text-rose-500">{error}</p>}
                <button
                  onClick={send}
                  disabled={!message.trim() || sending}
                  className="mt-3 w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {sending ? t("support.sending") : t("support.send")}
                </button>
                <p className="mt-2 text-center text-xs text-muted-foreground">{t("support.responseTime")}</p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
