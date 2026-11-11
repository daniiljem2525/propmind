import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useLang } from "@/lib/i18n/LangContext";
import { supabase, SUPABASE_URL } from "@/lib/supabase/config";

// Умный чат-помощник — iPhone Messages стиль.
// Центральное модальное окно на десктопе, полный экран на мобильном.
export default function SupportChat() {
  const { t } = useLang();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: "bot", text: t("support.greeting") },
  ]);
  const [input, setInput] = useState("");
  const [showContact, setShowContact] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [contactMsg, setContactMsg] = useState("");
  const [sending, setSending] = useState(false);
  const bodyRef = useRef(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, showContact]);

  // ——— Задать вопрос боту (один вызов = одно сообщение) ———
  const ask = (question) => {
    setMessages((m) => [...m, { role: "user", text: question }]);
    setInput("");
    // «печатает…»
    setMessages((m) => [...m, { role: "bot", text: t("support.thinking"), typing: true }]);
    fetch(`${SUPABASE_URL}/functions/v1/support-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ask", message: question }),
    })
      .then((r) => r.json())
      .then((data) => {
        setMessages((m) => [...m.slice(0, -1), { role: "bot", text: data.answer || t("support.fallback") }]);
      })
      .catch(() => {
        setMessages((m) => [...m.slice(0, -1), { role: "bot", text: t("support.fallback") }]);
      });
  };

  // ——— Отправить в поддержку ———
  const sendContact = (msg) => {
    setSending(true);
    fetch(`${SUPABASE_URL}/functions/v1/support-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "contact", name: name.trim(), email: email.trim() || user?.email || "", message: msg.trim() }),
    })
      .then((r) => r.json())
      .then(() => {
        setMessages((m) => [...m, { role: "bot", text: t("support.contactSent") }]);
        setShowContact(false);
      })
      .catch(() => setMessages((m) => [...m, { role: "bot", text: t("support.error") }]))
      .finally(() => setSending(false));
  };

  const handleSend = () => {
    const msg = input.trim();
    if (!msg) return;
    ask(msg);
  };

  const handleContact = () => {
    const msg = contactMsg.trim();
    if (!msg || sending) return;
    sendContact(msg);
  };

  // ——— Быстрые вопросы ———
  const quickReplies = [t("support.faqPricing"), t("support.faqStart"), t("support.faqSecurity")];

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg transition-all hover:scale-110"
          title={t("support.title")}
          aria-label={t("support.title")}
        >
          <MessageCircle className="h-7 w-7 text-white" />
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute h-full w-full rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
          </span>
        </button>
      )}

      {/* Modal — iPhone Messages style */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-slate-950/40" />

          <div
            className="relative flex h-[80vh] max-h-[600px] w-full max-w-sm flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl sm:h-[600px]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header — iOS style */}
            <div className="flex items-center justify-between border-b bg-card px-4 py-3">
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
              <div className="flex flex-col items-center">
                <span className="text-sm font-semibold">{t("support.title")}</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {t("support.subtitle")}
                </span>
              </div>
              <div className="w-5" />
            </div>

            {/* Messages */}
            <div ref={bodyRef} className="flex-1 space-y-3 overflow-y-auto bg-muted/30 px-4 py-4">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  {m.typing ? (
                    <div className="rounded-2xl rounded-bl-sm bg-muted px-4 py-2.5 text-sm text-muted-foreground">
                      <span className="inline-flex gap-1">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
                      </span>
                    </div>
                  ) : (
                    <div
                      className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${
                        m.role === "user"
                          ? "rounded-br-sm bg-primary text-white"
                          : "rounded-bl-sm border bg-card text-foreground"
                      }`}
                    >
                      {m.text}
                    </div>
                  )}
                </div>
              ))}

              {/* Contact form */}
              {showContact && (
                <div className="space-y-2 rounded-xl border bg-card p-3">
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("support.namePlaceholder")} className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
                  <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder={t("support.emailPlaceholder")} className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
                  <textarea value={contactMsg} onChange={(e) => setContactMsg(e.target.value)} placeholder={t("support.contactPlaceholder")} rows={3} className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
                  <button onClick={handleContact} disabled={!contactMsg.trim() || sending} className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    {sending ? t("support.sending") : t("support.contactSend")}
                  </button>
                </div>
              )}
            </div>

            {/* Quick replies */}
            <div className="flex flex-wrap gap-1.5 border-t px-3 pt-2">
              {quickReplies.map((q) => (
                <button
                  key={q}
                  onClick={() => ask(q)}
                  className="rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {q}
                </button>
              ))}
              {!showContact && (
                <button
                  onClick={() => { setShowContact(true); setMessages((m) => [...m, { role: "bot", text: t("support.contactPrompt") }]); }}
                  className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs text-primary transition-colors hover:bg-primary/10"
                >
                  {t("support.contactUs")}
                </button>
              )}
            </div>

            {/* Input */}
            <div className="border-t p-3">
              {showContact ? (
                <button onClick={() => setShowContact(false)} className="w-full rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">
                  {t("support.backToFaq")}
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                    placeholder={t("support.inputPlaceholder")}
                    className="flex-1 rounded-full border bg-background px-4 py-2.5 text-sm"
                    maxLength={500}
                  />
                  <button onClick={handleSend} disabled={!input.trim()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white transition-opacity disabled:opacity-40">
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              )}
              <p className="mt-1.5 text-center text-xs text-muted-foreground">{t("support.responseTime")}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
