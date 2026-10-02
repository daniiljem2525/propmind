// Email-канал: письма через Edge Function send-email (Resend).
// Приглашение может отправить только авторизованный владелец —
// функция проверяет JWT и шлёт письмо с персональной ссылкой.
import { supabase, isSupabaseConfigured, SUPABASE_URL } from "@/lib/supabase/config";

export async function sendInviteEmail({ to, inviteLink, ownerName }) {
  if (!isSupabaseConfigured) throw new Error("UNSUPPORTED");
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("NOT_AUTHENTICATED");
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      template: "invite",
      to,
      invite_link: inviteLink,
      owner_name: ownerName || "",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
}
