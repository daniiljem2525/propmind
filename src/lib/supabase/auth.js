import { supabase } from "./config";

// Supabase Auth: тот же интерфейс, что у localStorage-версии.
// Роль и имя хранятся в profiles (создаются триггером при регистрации).

async function currentUserWithProfile() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  return {
    id: user.id,
    email: user.email,
    full_name: profile?.full_name || user.user_metadata?.full_name || "",
    role: profile?.role || user.user_metadata?.role || "tenant",
    status: "active",
    created_date: profile?.created_date || user.created_at,
  };
}

export async function getCurrentUser() {
  if (!supabase) return null;
  return currentUserWithProfile();
}

export async function login(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.message.toLowerCase().includes("confirm")) throw new Error("PENDING_ACCOUNT");
    throw new Error("WRONG_CREDENTIALS");
  }
  return currentUserWithProfile();
}

// Регистрация. invite_code (если есть) превращает аккаунт в жильца/исполнителя
// и привязывает к объекту владельца — обработка в триггере БД (supabase/schema.sql).
export async function signup({ full_name, email, password, invite_code }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name,
        role: invite_code ? undefined : "tenant",
        invite_code: invite_code || undefined,
      },
    },
  });
  if (error) {
    if (error.message.toLowerCase().includes("already")) throw new Error("EMAIL_EXISTS");
    throw new Error("SIGNUP_FAILED");
  }
  // Если подтверждение email включено в Supabase — сессии не будет:
  // сообщаем интерфейсу показать экран «проверь почту»
  if (!data.session) return { needsConfirmation: true, email };

  // Роль и квартиру по коду приглашения назначает RPC (детерминированно).
  // Если схема не обновлена (RPC нет) — аккаунт всё равно создаётся,
  // но код нужно применить после обновления схемы.
  let claimed = false;
  if (invite_code) {
    try {
      const { data: claimedData, error: rpcError } = await supabase.rpc("claim_invite", { p_code: invite_code });
      claimed = !rpcError && claimedData?.ok === true;
    } catch {
      claimed = false;
    }
  }
  return { ...(await currentUserWithProfile()), invite_claimed: claimed, invite_code };
}

export async function logout() {
  await supabase.auth.signOut();
}

export async function updateProfile(userId, { full_name }) {
  await supabase.from("profiles").update({ full_name }).eq("id", userId);
  return currentUserWithProfile();
}

export async function changePassword(_userId, _current, next) {
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) throw new Error("WRONG_PASSWORD");
  return true;
}

export async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw new Error("USER_NOT_FOUND");
  return true;
}

// Приглашение: владелец создаёт код и отправляет его жильцу/исполнителю.
// Код вводится при регистрации — роль и привязка к объекту применяются в БД.
export async function createInvite(role, propertyId) {
  const me = await currentUserWithProfile();
  const { data, error } = await supabase
    .from("invites")
    .insert({ role, property_id: propertyId || null, owner_id: me.id })
    .select()
    .single();
  if (error) throw error;
  return { code: data.code, role: data.role, property_id: data.property_id };
}

export async function listUsers() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, created_date")
    .order("created_date");
  if (error) return [];
  return (data || []).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    role: p.role,
    status: "active",
    created_date: p.created_date,
  }));
}

export async function updateUserRole(id, role) {
  const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
  if (error) throw error;
  return true;
}

// Совместимость со старым интерфейсом (в облачном режиме не используется)
export const verifyOtp = () => {
  throw new Error("NOT_SUPPORTED");
};

export const ensureDemoAccount = () => false;
