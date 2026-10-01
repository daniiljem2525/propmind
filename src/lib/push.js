// Web Push: подписка устройства и хранение её в Supabase.
// Отправку делает Edge Function send-push (см. supabase/functions/).
import { supabase, isSupabaseConfigured } from "@/lib/supabase/config";

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
  if (sub) return { state: "enabled", subscription: sub };
  return { state: "default" };
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
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: navigator.userAgent,
    },
    { onConflict: "endpoint" }
  );
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
