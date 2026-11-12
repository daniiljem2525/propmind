import { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, Send } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useLang } from "@/lib/i18n/LangContext";
import { supabase, SUPABASE_URL } from "@/lib/supabase/config";

const SESSION_KEY = "arendora:support-session";

// Умный чат-помощник — iPhone Messages стиль, двухсторонний:
// FAQ-ответы бота + сообщения в поддержку (тред по session_id) +
// поллинг ответов поддержки раз в 5с, пока чат открыт.
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

  // session_id треда — переживает перезагрузку страницы
  const sessionRef = useRef(null);
  try { sessionRef.current = localStorage.getItem(SESSION_KEY); } catch { /* private mode */ }
  const [sessionTick, setSessionTick] = useState(0); // триггерит poll-эффект, когда сессия создана

  // id строк support_messages, уже показанных в чате (чтобы поллинг не дублировал)
  const shownMsgIds = useRef(new Set());
  const shownRespIds = useRef(new Set());

  const ensureSession = () => {
    if (!sessionRef.current) {
      sessionRef.current = crypto.randomUUID();
      try { localStorage.setItem(SESSION_KEY, sessionRef.current); } catch { /* private mode */ }
      setSessionTick((x) => x + 1); // стартует poll-эффект
    }
    return sessionRef.current;
  };

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, showContact]);

  // Открытие извне: на телефонах плавающий шарик скрыт (занимает место и
  // перекрывает sticky-CTA лендинга), чат открывают иконка в шапке
  // приложения и кнопка в sticky-панели лендинга — через window-событие.
  useEffect(() => {
    const openChat = () => setOpen(true);
    window.addEventListener("arendora:open-support-chat", openChat);
    return () => window.removeEventListener("arendora:open-support-chat", openChat);
  }, []);

  // ——— Дозагрузка строк из БД: история треда + ответы поддержки ———
  const applyRows = useCallback((rows) => {
    setMessages((m) => {
      const add = [];
      for (const row of rows) {
        if (row.sender === "support") {
          // Ответ поддержки — отдельное сообщение треда (режим чата)
          if (!shownMsgIds.current.has(row.id)) {
            shownMsgIds.current.add(row.id);
            add.push({ role: "support", text: row.message });
          }
        } else {
          if (!shownMsgIds.current.has(row.id)) {
            shownMsgIds.current.add(row.id);
            add.push({ role: "user", text: row.message, contact: true });
          }
          // Legacy: ответ в колонке response старой строки
          if (row.response && !shownRespIds.current.has(row.id)) {
            shownRespIds.current.add(row.id);
            add.push({ role: "support", text: row.response });
          }
        }
      }
      return add.length ? [...m, ...add] : m;
    });
  }, []);

  // ——— Poll: пока чат открыт и есть тред — раз в 5с забираем ответы поддержки ———
  useEffect(() => {
    if (!open || !sessionRef.current) return undefined;
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(
          `${SUPABASE_URL}/functions/v1/support-chat?session=${encodeURIComponent(sessionRef.current)}`
        );
        if (!r.ok) return;
        const data = await r.json();
        if (alive && Array.isArray(data.messages) && data.messages.length) applyRows(data.messages);
      } catch { /* сеть моргнула — попробуем на следующем тике */ }
    };
    load();
    const timer = setInterval(load, 5000);
    return () => { alive = false; clearInterval(timer); };
  }, [open, applyRows, sessionTick]);

  // ——— Задать вопрос боту (один вызов = одно сообщение) ———
  const ask = (question) => {
    const sessionId = ensureSession();
    setMessages((m) => [...m, { role: "user", text: question }]);
    setInput("");
    // «печатает…»
    setMessages((m) => [...m, { role: "bot", text: t("support.thinking"), typing: true }]);
    fetch(`${SUPABASE_URL}/functions/v1/support-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ask", message: question, session_id: sessionId }),
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
  // silent: в режиме диалога подтверждение не нужно — просто добавляем сообщение
  const sendContact = (msg, { silent = false } = {}) => {
    setSending(true);
    const sessionId = ensureSession();
    // Своё сообщение показываем сразу; id строки придёт в ответе
    setMessages((m) => [...m, { role: "user", text: msg, contact: true }]);
    fetch(`${SUPABASE_URL}/functions/v1/support-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "contact", name: name.trim(), email: email.trim() || user?.email || "", message: msg.trim(), session_id: sessionId }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.id) shownMsgIds.current.add(data.id); // поллинг не задублирует
        if (!silent) setMessages((m) => [...m, { role: "bot", text: t("support.contactSent") }]);
        setShowContact(false);
      })
      .catch(() => setMessages((m) => [...m, { role: "bot", text: t("support.error") }]))
      .finally(() => setSending(false));
  };

  // Активная переписка с поддержкой → поле ввода пишет в тред, а не боту
  const hasThread = messages.some((m) => m.contact || m.role === "support");

  const handleSend = () => {
    const msg = input.trim();
    if (!msg) return;
    if (hasThread) sendContact(msg, { silent: true });
    else ask(msg);
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
      {/* Floating button — от sm (≥640px): на телефонах скрыт, чат там
          открывается из шапки приложения и sticky-панели лендинга */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-4 z-50 hidden h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg transition-all hover:scale-110 sm:flex"
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
                  ) : m.role === "support" ? (
                    // Ответ живого сотрудника поддержки
                    <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-primary/30 bg-primary/5 px-3.5 py-2 text-sm text-foreground">
                      <span className="mb-0.5 block text-xs font-semibold text-primary">{t("support.replyLabel")}</span>
                      <span className="whitespace-pre-wrap">{m.text}</span>
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

            {/* Quick replies — только до начала диалога с поддержкой */}
            {!hasThread && (
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
            )}

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
                    placeholder={hasThread ? t("support.chatPlaceholder") : t("support.inputPlaceholder")}
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
