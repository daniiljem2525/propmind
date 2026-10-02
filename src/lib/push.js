// Web Push: подписка устройства и хранение её в Supabase.
// Отправку делает Edge Function send-push (см. supabase/functions/).
import { supabase, isSupabaseConfigured, SUPABASE_URL } from "@/lib/supabase/config";

// Публичный VAPID-ключ (публичный по дизайну; приватный — в секретах функции)
const VAPID_PUBLIC_KEY =
  "BAqN2QoWqgYD7SujCHnSZupGpskTsIYyE2uHUz7fWVkX8fbjkrxDLlC2yq3akNBLRWIs02b2LFB4azntqHbyDv8";

export function pushSupported() {
  return (
    isSupabaseConfigured &&
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToUint8Array(base64) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// Состояние: unsupported | blocked | default (можно включить) | enabled
export async function getPushState() {
  if (!pushSupported()) return { state: "unsupported" };
  const perm = Notification.permission;
  if (perm === "denied") return { state: "blocked" };
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return { state: "default" };
  // Подписка на устройстве есть — сверяемся с базой: до фикса включение
  // падало после подписки, не сохранив её, и пушу было некуда приходить.
  const { data } = await supabase
    .from("push_subscriptions")
    .select("id")
    .eq("endpoint", sub.endpoint)
    .maybeSingle();
  if (!data) return { state: "default" };
  return { state: "enabled", subscription: sub };
}

export async function enablePush() {
  if (!pushSupported()) throw new Error("UNSUPPORTED");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("PERMISSION_DENIED");

  const reg = await navigator.serviceWorker.register(
    `${import.meta.env.BASE_URL}sw.js`
  );
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  const json = sub.toJSON();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error("NOT_AUTHENTICATED");
  // Сохраняем через RPC: устройство могло быть записано в базе под другим
  // аккаунтом, и по RLS прямой upsert с другого аккаунта отклоняется.
  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth,
    p_user_agent: navigator.userAgent,
  });
  if (error) throw error;
  return sub;
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
}

// Тестовая отправка: Edge Function со своим JWT шлёт пуш на мои подписки
// и возвращает отчёт { ok, sent, subs, errors } — видно, где обрыв.
export async function testPush() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("NOT_AUTHENTICATED");
  const res = await fetch(`${SUPABASE_URL}/functions/v1/bright-processor`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ title: "Arendora", message: "Тестовый push", link: "/app" }),
  });
  return res.json();
}

// Проверка настоящего канала: запись в notifications запускает push-триггер
// в базе. Ответы pg_net добираем с клиента отдельными быстрыми вызовами —
// долгий опрос внутри RPC упирается в statement timeout.
export async function dbTestPush() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const { data, error } = await supabase.rpc("push_selfcheck");
  if (error) throw error;
  const since = data?.since;
  if (!since) return data;
  // до ~30 секунд: pg_net — фоновый воркер, задержка бывает больше 10 секунд
  for (let i = 0; i < 10; i++) {
    await sleep(3000);
    const { data: st, error: e2 } = await supabase.rpc("push_selfcheck_status", {
      p_since: since,
    });
    if (e2) throw e2;
    if ((st || []).length) return { ok: true, deliveries: st };
  }
  return { ok: true, deliveries: [] };
}
