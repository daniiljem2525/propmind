// Минимальный REST-клиент PostgREST (Supabase) без зависимостей.
import { config } from "./config.mjs";

const base = () => `${config.supabaseUrl}/rest/v1`;

function headers(extra = {}) {
  return {
    apikey: config.supabaseKey,
    Authorization: `Bearer ${config.supabaseKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function request(method, path, { query = {}, body } = {}) {
  const qs = new URLSearchParams(query).toString();
  const res = await fetch(`${base()}${path}${qs ? `?${qs}` : ""}`, {
    method,
    headers: headers(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  if (res.status === 204) return null;
  const ct = res.headers.get("content-type") || "";
  return ct.includes("json") ? res.json() : res.text();
}

export const db = {
  async nextPendingOrder() {
    const rows = await request("GET", "/automation_orders", {
      query: {
        select: "*",
        status: "eq.pending",
        order: "created_date.asc",
        limit: "1",
      },
    });
    return rows && rows[0] ? rows[0] : null;
  },

  updateOrder(id, patch) {
    return request("PATCH", "/automation_orders", {
      query: { id: `eq.${id}` },
      body: { ...patch, updated_at: new Date().toISOString() },
    });
  },

  async newRequests() {
    return (
      (await request("GET", "/maintenance_requests", {
        query: {
          select: "id,owner_id,title,description,category,urgency,estimate_cost,property_name",
          status: "eq.new",
          order: "created_date.asc",
        },
      })) || []
    );
  },

  async enqueuedRequestIds(platform = "profi") {
    const rows =
      (await request("GET", "/automation_orders", {
        query: { select: "request_id", platform: `eq.${platform}` },
      })) || [];
    return new Set(rows.map((r) => r.request_id).filter(Boolean));
  },

  enqueueOrder(row) {
    return request("POST", "/automation_orders", { body: row });
  },
};
