import { useCallback, useEffect, useState } from "react";
import { Inbox, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase, SUPABASE_URL } from "@/lib/supabase/config";
import { useLang } from "@/lib/i18n/LangContext";
import { cn } from "@/lib/utils";

// Диалоги чата поддержки для админ-панели: треды по session_id,
// ответ через edge-функцию (PUT) — пользователь видит его в чате раз в 5с.
export default function SupportPanel() {
  const { t, lang } = useLang();
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [replying, setReplying] = useState(false);
  const [drafts, setDrafts] = useState({}); // { [sessionId]: текст ответа }
  const [error, setError] = useState("");

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
        return {
          sessionId: sorted[0].session_id || `id:${sorted[0].id}`,
          isLegacy: !sorted[0].session_id,
          messages: sorted,
          last: sorted[sorted.length - 1],
          contact: { name: firstUser.name, email: firstUser.email, at: firstUser.created_at },
          hasUnanswered: sorted.some((x) => x.sender !== "support" && x.status === "new" && !x.response),
        };
      });
      list.sort((a, b) => new Date(b.last.created_at) - new Date(a.last.created_at));
      setThreads(list);
      setError("");
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

  const reply = async (thread) => {
    const text = (drafts[thread.sessionId] || "").trim();
    if (!text || replying) return;
    setReplying(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      // Режим чата: ответ = отдельная строка треда. Legacy-треды (без session_id) —
      // как раньше: response в колонку последнего сообщения без ответа.
      const payload = thread.isLegacy
        ? { message_id: ([...thread.messages].reverse().find((x) => !x.response) || thread.last).id, response: text }
        : { session_id: thread.sessionId, response: text };
      const r = await fetch(`${SUPABASE_URL}/functions/v1/support-chat`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setDrafts((d) => ({ ...d, [thread.sessionId]: "" }));
      await load();
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setReplying(false);
    }
  };

  const fmt = (iso) =>
    new Date(iso).toLocaleString(lang === "ru" ? "ru-RU" : "en-US", { dateStyle: "short", timeStyle: "short" });

  return (
    <Card className="mt-6">
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

        <div className="space-y-4">
          {threads.map((thread) => (
            <div key={thread.sessionId} className="rounded-xl border bg-muted/30 p-3">
              {/* Шапка треда: кто написал, статус */}
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <span className="font-medium">{thread.contact.name?.trim() || thread.contact.email?.trim() || t("admin.supportAnonymous")}</span>
                  {thread.contact.email?.trim() && thread.contact.name?.trim() && (
                    <span className="ml-2 text-muted-foreground">{thread.contact.email}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{fmt(thread.last.created_at)}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      thread.hasUnanswered ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    )}
                  >
                    {thread.hasUnanswered ? t("admin.supportNew") : t("admin.supportAnswered")}
                  </span>
                </div>
              </div>

              {/* Сообщения треда — чат: пользователь слева, поддержка справа */}
              <div className="space-y-2">
                {thread.messages.map((m) => (
                  <div key={m.id} className="space-y-1">
                    {m.sender === "support" ? (
                      <div className="ml-auto max-w-[90%] rounded-lg rounded-br-sm bg-primary/10 px-3 py-1.5 text-sm">
                        <span className="mb-0.5 block text-xs font-semibold text-primary">{t("admin.supportReplyLabel")}</span>
                        <span className="whitespace-pre-wrap">{m.message}</span>
                      </div>
                    ) : (
                      <>
                        <div className="max-w-[90%] rounded-lg rounded-bl-sm border bg-card px-3 py-1.5 text-sm">
                          <span className="whitespace-pre-wrap">{m.message}</span>
                        </div>
                        {m.response && (
                          <div className="ml-auto max-w-[90%] rounded-lg rounded-br-sm bg-primary/10 px-3 py-1.5 text-sm">
                            <span className="mb-0.5 block text-xs font-semibold text-primary">{t("admin.supportReplyLabel")}</span>
                            <span className="whitespace-pre-wrap">{m.response}</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>

              {/* Форма ответа */}
              <div className="mt-3 flex items-center gap-2">
                <input
                  value={drafts[thread.sessionId] || ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [thread.sessionId]: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && reply(thread)}
                  placeholder={t("admin.supportReplyPlaceholder")}
                  className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
                  maxLength={2000}
                />
                <Button size="sm" onClick={() => reply(thread)} disabled={!drafts[thread.sessionId]?.trim() || replying}>
                  <Send className="h-4 w-4" />
                  {t("admin.supportReply")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
