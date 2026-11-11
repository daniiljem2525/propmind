import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useLang } from "@/lib/i18n/LangContext";
import { SUPABASE_URL } from "@/lib/supabase/config";

// Умный чат-помощник: слайд-панель справа, база знаний + связь с поддержкой.
export default function SupportChat() {
  const { t } = useLang();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: "bot", text: t("support.greeting") },
  ]);
  const [input, setInput] = useState("");
  const [contactMode, setContactMode] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [contactMsg, setContactMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [sentOk, setSentOk] = useState(false);
  const bodyRef = useRef(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, contactMode, sentOk]);

  const ask = async (question) => {
    setMessages((m) => [...m, { role: "user", text: question }]);
    setInput("");
    setMessages((m) => [...m, { role: "bot", text: t("support.thinking"), typing: true }]);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/support-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ask", message: question }),
      });
      const data = await res.json();
      setMessages((m) => [...m.slice(0, -1), { role: "bot", text: data.answer || t("support.fallback") }]);
    } catch {
      setMessages((m) => [...m.slice(0, -1), { role: "bot", text: t("support.fallback") }]);
    }
  };

  const sendContact = async () => {
    if (!contactMsg.trim()) return;
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { "Content-Type": "application/json" };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      await fetch(`${SUPABASE_URL}/functions/v1/support-chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "contact",
          name: name.trim(),
          email: email.trim() || user?.email || "",
          message: contactMsg.trim(),
        }),
      });
      setMessages((m) => [...m, { role: "bot", text: t("support.contactSent") }]);
      setContactMode(false);
      setContactMsg("");
    } catch {
      setMessages((m) => [...m, { role: "bot", text: t("support.error") }]);
    } finally {
      setSending(false);
    }
  };

  const handleSend = () => {
    const msg = input.trim();
    if (!msg || sending) return;
    setMessages((m) => [...m, { role: "user", text: msg }]);
    setInput("");
    ask(msg);
  };

  const handleContact = () => {
    const msg = contactMsg.trim();
    if (!msg || sending) return;
    setSending(true);
    fetch(`${SUPABASE_URL}/functions/v1/support-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "contact", name: name.trim(), email: email.trim() || user?.email || "", message: msg }),
    })
      .then((r) => r.json())
      .then(() => {
        setMessages((m) => [...m, { role: "bot", text: t("support.contactSent") }]);
        setContactMode(false);
      })
      .catch(() => setMessages((m) => [...m, { role: "bot", text: t("support.error") }]))
      .finally(() => setSending(false));
  };

  const showContact = contactMode;

  return (
    <>
      {/* Кнопка */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg transition-all hover:scale-110 hover:shadow-xl"
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

      {/* Панель — слайд справа */}
      {open && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md flex flex-col bg-background border-l shadow-2xl animate-slide-in">
          {/* Шапка */}
          <div className="flex items-center justify-between bg-primary px-5 py-4">
            <div className="flex items-center gap-2.5">
              <Sparkles className="h-5 w-5 text-white" />
              <div>
                <p className="text-sm font-semibold text-white">{t("support.title")}</p>
                <p className="text-xs text-white/70">{t("support.subtitle")}</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Сообщения */}
          <div ref={bodyRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-primary text-white rounded-br-none"
                      : "bg-muted text-foreground rounded-bl-none"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {showContact && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("support.namePlaceholder")} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder={t("support.emailPlaceholder")} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
                <textarea value={contactMsg} onChange={(e) => setContactMsg(e.target.value)} placeholder={t("support.contactPlaceholder")} rows={3} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
                <button onClick={handleContact} disabled={!contactMsg.trim() || sending} className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {sending ? t("support.sending") : t("support.contactSend")}
                </button>
              </div>
            )}
            {sentOk && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700">
                {t("support.contactSent")}
              </div>
            )}
          </div>

          {/* Быстрые кнопки */}
          <div className="px-4 py-2 border-t flex flex-wrap gap-1.5">
            {[
              t("support.faqPricing"),
              t("support.faqStart"),
              t("support.faqSecurity"),
            ].map((q) => (
              <button key={q} onClick={() => { setMessages(m => [...m, { role: "user", text: q }]); ask(q); }} className="rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors">
                {q}
              </button>
            ))}
            <button onClick={() => { setContactMode(true); setMessages(m => [...m, { role: "bot", text: t("support.contactPrompt") }]); }} className="rounded-full border px-3 py-1 text-xs text-primary hover:bg-primary/5 transition-colors">
              {t("support.contactUs")}
            </button>
          </div>

          {/* Ввод */}
          <div className="p-3 border-t">
            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                placeholder={t("support.inputPlaceholder")}
                className="flex-1 rounded-lg border bg-background px-3 py-2.5 text-sm"
                maxLength={500}
              />
              <button onClick={handleSend} disabled={!input.trim() || sending} className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-white disabled:opacity-40 transition-opacity">
                <Send className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <button onClick={() => setContactMode(!showContact)} className="text-xs text-muted-foreground hover:text-primary transition-colors">
                {showContact ? t("support.backToFaq") : t("support.writeToUs")}
              </button>
              <span className="text-xs text-muted-foreground">{t("support.responseTime")}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
