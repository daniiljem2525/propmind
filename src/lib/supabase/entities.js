import { supabase } from "./config";
import { makeEntity } from "./db";

// RPC-вызов смены статуса заявки: возвращает { ok, error? } из БД
async function rpcAction(fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data || { ok: false, error: "no_result" };
}

// Supabase-сущности: те же имена и интерфейс, что у localStorage-версии.
// owner_id проставляется в БД (default auth.uid()), доступ ограничен RLS.

export const Property = makeEntity("properties", {
  type: "apartment",
  currency: "RUB",
  status: "vacant",
});

export const Payment = makeEntity("payments", {
  currency: "RUB",
  status: "pending",
});

export const MaintenanceRequest = {
  ...makeEntity("maintenance_requests", {
    urgency: "medium",
    status: "new",
    source: "manual",
    category: "other",
  }),
  // Смена статуса — только через RPC БД: проверяют права и переходы,
  // события и уведомления пишет триггер on_request_changed.
  async assign(id, { contractor_id, scheduled_at, estimate_cost } = {}) {
    return rpcAction("assign_request", {
      p_request: id,
      p_contractor: contractor_id,
      p_scheduled: scheduled_at || null,
      p_estimate: estimate_cost ?? null,
    });
  },
  async decline(id) {
    return rpcAction("decline_request", { p_request: id });
  },
  async accept(id) {
    return rpcAction("accept_request", { p_request: id });
  },
  async report(id, { work_cost = 0, work_photo_url, work_notes } = {}) {
    return rpcAction("report_work", {
      p_request: id,
      p_cost: Number(work_cost) || 0,
      p_photo: work_photo_url || null,
      p_notes: work_notes || null,
    });
  },
  async close(id) {
    return rpcAction("close_request", { p_request: id });
  },
  async cancel(id, reason) {
    return rpcAction("cancel_request", { p_request: id, p_reason: reason || null });
  },
};

export const RequestComment = makeEntity("request_comments", {});
export const RequestEvent = makeEntity("request_events", {});

export const Document = makeEntity("documents", {
  type: "other",
});

export const NotificationEntity = makeEntity("notifications", {
  type: "general",
  is_read: false,
});

// Исполнители и жильцы — профили с ролями (для dropdown назначения)
export async function listProfiles(role) {
  let q = supabase.from("profiles").select("id, full_name, role").order("full_name");
  if (role) q = q.eq("role", role);
  const { data, error } = await q;
  if (error) return [];
  return data || [];
}

// Жильцы в облачном режиме = профили с ролью tenant.
// «Добавить жильца» создаёт код приглашения: владелец передаёт его жильцу,
// при регистрации по коду профиль привяжется к объекту автоматически.
export const Tenant = {
  collection: "profiles",

  async list() {
    const { data: profs, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, phone, created_date")
      .eq("role", "tenant")
      .order("full_name");
    if (error) return [];
    const { data: props } = await supabase
      .from("properties")
      .select("id, name, tenant_id")
      .not("tenant_id", "is", null);
    const byTenant = Object.fromEntries(
      (props || []).map((p) => [p.tenant_id, { property_id: p.id, property_name: p.name }])
    );
    return (profs || []).map((p) => ({
      id: p.id,
      full_name: p.full_name,
      email: p.email,
      phone: p.phone,
      status: "active",
      created_date: p.created_date,
      ...(byTenant[p.id] || {}),
    }));
  },

  async create(data) {
    const { data: { user } } = await supabase.auth.getUser();
    const code = (crypto.randomUUID().replace(/-/g, "")).slice(0, 8).toUpperCase();
    const { data: inv, error } = await supabase
      .from("invites")
      .insert({
        code,
        owner_id: user.id,
        role: "tenant",
        property_id: data.property_id || null,
      })
      .select()
      .single();
    if (error) throw error;
    return {
      id: null,
      invite_code: inv.code,
      invite_role: "tenant",
      full_name: data.full_name,
      email: data.email,
      property_id: data.property_id || null,
    };
  },

  async update(id, patch) {
    await supabase.from("profiles").update(cleanLite(patch)).eq("id", id);
    return { id, ...patch };
  },

  async delete(id) {
    await supabase.from("properties").update({ tenant_id: null, tenant_name: null, status: "vacant" }).eq("tenant_id", id);
    return true;
  },

  async bulkCreate(items) {
    return [];
  },
};

const cleanLite = (obj) =>
  Object.fromEntries(Object.entries(obj || {}).filter(([, v]) => v !== undefined));
