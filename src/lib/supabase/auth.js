import { supabase } from "./config";

// Supabase Auth: тот же интерфейс, что у localStorage-версии.
// Роль и имя хранятся в profiles (создаются триггером при регистрации).

async function currentUserWithProfile() {
  // getSession() читает локальную сессию без сетевого запроса. getUser()
  // ходит в сеть под внутренним локом auth и в ряде окружений зависает
  // навсегда — из-за него приложение "залипало" в загрузке.
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return null;
  // Холодный старт PWA часто обгоняет сеть: упавший запрос профиля
  // не должен выглядеть как «не залогинен» и выкидывать на логин.
  let profile = null;
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    if (!error) profile = data;
  } catch {}
  return {
    id: user.id,
    email: user.email,
    full_name: profile?.full_name || user.user_metadata?.full_name || "",
    role: profile?.role || user.user_metadata?.role || "tenant",
    is_platform_admin: profile?.is_platform_admin === true,
    plan: profile?.plan || "free",
    invite_code: profile?.invite_code || null,
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
        // Без приглашения человек регистрирует свой воркспейс — он владелец.
        // Роль по приглашению назначит RPC claim_invite после регистрации.
        role: invite_code ? undefined : "owner",
        invite_code: invite_code || undefined,
      },
    },
  });
  if (error) {
    if (error.message.toLowerCase().includes("already")) throw new Error("EMAIL_EXISTS");
    // настоящий текст ошибки (например, сбой триггера профиля) — виден сразу
    console.error("signup failed:", error);
    throw new Error(error.message || "SIGNUP_FAILED");
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
    .select("id, full_name, email, role, plan, created_date")
    .order("created_date");
  if (error) return [];
  return (data || []).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    role: p.role,
    plan: p.plan || "free",
    status: "active",
    created_date: p.created_date,
  }));
}

// Выдача тарифа пользователю (только владелец платформы — RLS)
export async function updateUserPlan(id, plan) {
  const { error } = await supabase.rpc("set_user_plan", { p_user: id, p_plan: plan });
  if (error) throw error;
  return true;
}

// Персональный код арендодателя: генерируется при первом обращении
export async function getOrCreateInviteCode() {
  // через RPC: прямой UPDATE invite_code закрыт колоночными правами
  const { data, error } = await supabase.rpc("get_or_create_invite_code");
  if (error) {
    console.error("getOrCreateInviteCode failed:", error);
    return null;
  }
  return data || null;
}

export async function updateUserRole(id, role) {
  // через RPC: прямой UPDATE профилей закрыт колоночными правами (эскалация)
  const { error } = await supabase.rpc("set_user_role", { p_user: id, p_role: role });
  if (error) throw error;
  return true;
}

// Демо-вход: готовый аккаунт в Supabase. При первом входе аккаунт
// создаётся (если регистрация открыта), данные наполняет Login через seedDemoData.
export const DEMO_CREDENTIALS = { email: "demo@arendora.app", password: "arendora-demo" };

export async function loginDemo() {
  const { error } = await supabase.auth.signInWithPassword(DEMO_CREDENTIALS);
  if (error) {
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: DEMO_CREDENTIALS.email,
      password: DEMO_CREDENTIALS.password,
      options: { data: { full_name: "Демо-аккаунт", role: "owner" } },
    });
    if (signUpError) throw new Error("DEMO_SIGNUP_FAILED");
    if (!data.session) throw new Error("DEMO_NEEDS_CONFIRMATION");
  }
  return currentUserWithProfile();
}

// Совместимость со старым интерфейсом (в облачном режиме не используется)
export const verifyOtp = () => {
  throw new Error("NOT_SUPPORTED");
};

export const ensureDemoAccount = () => false;
