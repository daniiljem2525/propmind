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

async function request(method, path, { query = {}, body, headers: extraHeaders = {} } = {}) {
  const qs = new URLSearchParams(query).toString();
  const res = await fetch(`${base()}${path}${qs ? `?${qs}` : ""}`, {
    method,
    headers: headers(extraHeaders),
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

  async getRequest(id) {
    const rows =
      (await request("GET", "/maintenance_requests", {
        query: { select: "id,property_id", id: `eq.${id}`, limit: "1" },
      })) || [];
    return rows[0] || null;
  },

  async getProperty(id) {
    const rows =
      (await request("GET", "/properties", {
        query: { select: "id,name,address", id: `eq.${id}`, limit: "1" },
      })) || [];
    return rows[0] || null;
  },

  // ---- отклики мастеров ----

  sentOrders() {
    return request("GET", "/automation_orders", {
      query: {
        select: "*",
        platform: "eq.profi",
        status: "eq.sent",
        result_url: "not.is.null",
      },
    });
  },

  offersForOrder(orderId) {
    return request("GET", "/profi_offers", {
      query: { select: "*", order_id: `eq.${orderId}` },
    });
  },

  offersToReact() {
    return request("GET", "/profi_offers", {
      query: {
        select: "*, automation_orders(address)",
        status: "in.(approved,countered,declined)",
        replied_at: "is.null",
      },
    });
  },

  async findOffer(orderId, chatId) {
    const rows =
      (await request("GET", "/profi_offers", {
        query: { select: "*", order_id: `eq.${orderId}`, chat_id: `eq.${chatId}`, limit: "1" },
      })) || [];
    return rows[0] || null;
  },

  createOffer(row) {
    // return=representation — чтобы получить созданную строку с id
    return request("POST", "/profi_offers", {
      body: row,
      headers: { Prefer: "return=representation" },
    });
  },

  updateOffer(id, patch) {
    return request("PATCH", "/profi_offers", {
      query: { id: `eq.${id}` },
      body: { ...patch, updated_at: new Date().toISOString() },
    });
  },

  notify(userId, { title, message, relatedId = null }) {
    return request("POST", "/notifications", {
      body: {
        user_id: userId,
        type: "profi_offer",
        title,
        message,
        link: "/app/maintenance",
        related_id: relatedId,
      },
    });
  },
};
