import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Inbox, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase, SUPABASE_URL } from "@/lib/supabase/config";
import { useLang } from "@/lib/i18n/LangContext";
import { cn } from "@/lib/utils";

// Инбокс чата поддержки для админ-панели: слева список всех диалогов,
// клик — открывается переписка, ответ уходит пользователю в чат (он видит
// его раз в 5с). Треды по session_id; ответ через edge-функцию (PUT).
export default function SupportPanel() {
  const { t, lang } = useLang();
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [replying, setReplying] = useState(false);
  const [drafts, setDrafts] = useState({}); // { [sessionId]: текст ответа }
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const chatRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`${SUPABASE_URL}/functions/v1/support-chat?all=1`, {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const msgs = data.messages || [];

      // Группируем по session_id; сообщения без сессии (старые) — отдельные треды
      const groups = new Map();
      for (const m of msgs) {
        const key = m.session_id || `id:${m.id}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(m);
      }
      const list = [...groups.values()].map((arr) => {
        const sorted = [...arr].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        const firstUser = sorted.find((x) => x.sender !== "support") || sorted[0];
        const lastUser = [...sorted].reverse().find((x) => x.sender !== "support");
        return {
          sessionId: sorted[0].session_id || `id:${sorted[0].id}`,
          isLegacy: !sorted[0].session_id,
          messages: sorted,
          last: sorted[sorted.length - 1],
          contact: { name: firstUser.name, email: firstUser.email, at: firstUser.created_at },
          preview: (lastUser || sorted[0]).message,
          unread: sorted.filter((x) => x.sender !== "support" && x.status === "new" && !x.response).length,
          hasUnanswered: sorted.some((x) => x.sender !== "support" && x.status === "new" && !x.response),
        };
      });
      list.sort((a, b) => new Date(b.last.created_at) - new Date(a.last.created_at));
      setThreads(list);
      setError("");
      // Автовыбор первого диалога, чтобы сразу видно переписку
      setSelectedId((cur) => (cur && list.some((th) => th.sessionId === cur) ? cur : list[0]?.sessionId ?? null));
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [load]);

  // Держим видимой последнюю реплику открытого диалога
  const selected = threads.find((th) => th.sessionId === selectedId) || null;
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [selected?.messages.length, selectedId]);

  const reply = async () => {
    if (!selected) return;
    const text = (drafts[selected.sessionId] || "").trim();
    if (!text || replying) return;
    setReplying(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      // Режим чата: ответ = отдельная строка треда. Legacy-треды (без session_id) —
      // как раньше: response в колонку последнего сообщения без ответа.
      const payload = selected.isLegacy
        ? { message_id: ([...selected.messages].reverse().find((x) => !x.response) || selected.last).id, response: text }
        : { session_id: selected.sessionId, response: text };
      const r = await fetch(`${SUPABASE_URL}/functions/v1/support-chat`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setDrafts((d) => ({ ...d, [selected.sessionId]: "" }));
      await load();
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setReplying(false);
    }
  };

  const fmt = (iso) =>
    new Date(iso).toLocaleString(lang === "ru" ? "ru-RU" : "en-US", { dateStyle: "short", timeStyle: "short" });

  // Реплика диалога: сообщение пользователя или ответ поддержки
  const renderMsg = (m) => {
    if (m.sender === "support") {
      return (
        <div className="ml-auto max-w-[90%] rounded-lg rounded-br-sm bg-primary/10 px-3 py-1.5 text-sm">
          <span className="mb-0.5 block text-xs font-semibold text-primary">{t("admin.supportReplyLabel")}</span>
          <span className="whitespace-pre-wrap">{m.message}</span>
        </div>
      );
    }
    return (
      <div className="space-y-1">
        <div className="max-w-[90%] rounded-lg rounded-bl-sm border bg-card px-3 py-1.5 text-sm">
          <span className="whitespace-pre-wrap">{m.message}</span>
        </div>
        {m.response && (
          <div className="ml-auto max-w-[90%] rounded-lg rounded-br-sm bg-primary/10 px-3 py-1.5 text-sm">
            <span className="mb-0.5 block text-xs font-semibold text-primary">{t("admin.supportReplyLabel")}</span>
            <span className="whitespace-pre-wrap">{m.response}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {t("admin.supportTitle")}
              {threads.some((th) => th.hasUnanswered) && (
                <span className="inline-flex h-2 w-2 rounded-full bg-amber-500" />
              )}
            </CardTitle>
            <CardDescription>{t("admin.supportDesc")}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            {t("admin.supportRefresh")}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="mb-3 text-sm text-rose-600">{t("admin.supportError")}: {error}</p>}

        {!loading && threads.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
            <Inbox className="h-8 w-8 opacity-40" />
            <p className="text-sm">{t("admin.supportEmpty")}</p>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-[300px_1fr]">
          {/* Список всех сообщений — клик открывает диалог */}
          <div className={cn("max-h-[420px] space-y-2 overflow-y-auto", selected && "hidden md:block")}>
            {threads.map((th) => (
              <button
                key={th.sessionId}
                onClick={() => setSelectedId(th.sessionId)}
                className={cn(
                  "w-full rounded-xl border p-3 text-left transition-colors",
                  th.sessionId === selectedId ? "border-primary/40 bg-primary/5" : "hover:bg-muted/50"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">
                    {th.contact.name?.trim() || th.contact.email?.trim() || t("admin.supportAnonymous")}
                  </span>
                  {th.unread > 0 && (
                    <span className="shrink-0 rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-white">{th.unread}</span>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{th.preview}</p>
                <p className="mt-1 text-xs text-muted-foreground">{fmt(th.last.created_at)}</p>
              </button>
            ))}
          </div>

          {/* Диалог: переписка + поле ответа */}
          {selected ? (
            <div className="md:border-l md:pl-4">
              <div className="mb-2 flex items-center gap-2">
                <button onClick={() => setSelectedId(null)} className="text-muted-foreground hover:text-foreground md:hidden" aria-label={t("support.backToFaq")}>
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {selected.contact.name?.trim() || selected.contact.email?.trim() || t("admin.supportAnonymous")}
                  </p>
                  {selected.contact.email?.trim() && (
                    <p className="truncate text-xs text-muted-foreground">{selected.contact.email}</p>
                  )}
                </div>
              </div>

              <div ref={chatRef} className="max-h-[320px] space-y-2 overflow-y-auto rounded-xl bg-muted/30 p-3">
                {selected.messages.map((m) => (
                  <div key={m.id}>{renderMsg(m)}</div>
                ))}
              </div>

              <div className="mt-3 flex items-center gap-2">
                <input
                  value={drafts[selected.sessionId] || ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [selected.sessionId]: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && reply()}
                  placeholder={t("admin.supportReplyPlaceholder")}
                  className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
                  maxLength={2000}
                />
                <Button size="sm" onClick={reply} disabled={!drafts[selected.sessionId]?.trim() || replying}>
                  <Send className="h-4 w-4" />
                  {t("admin.supportReply")}
                </Button>
              </div>
            </div>
          ) : (
            !loading && threads.length > 0 && (
              <div className="hidden items-center justify-center text-sm text-muted-foreground md:flex">
                {t("admin.supportSelectChat")}
              </div>
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
}
