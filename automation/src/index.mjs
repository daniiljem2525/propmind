// Воркер: опрашивает Supabase на заказы в очереди (automation_orders,
// status=pending), создаёт их на Профи.ру и пишет результат обратно.
import { config, assertConfig, CATEGORY_TO_SERVICE, URGENCY_TO_DEADLINE } from "./config.mjs";
import { db } from "./supabase-rest.mjs";
import { createProfiOrder, listChats, readChatMessages, sendChatMessage, hireSpecialist } from "./profi.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toLocaleTimeString("ru-RU");

function orderFromRequest(req) {
  return {
    request_id: req.id,
    owner_id: req.owner_id,
    platform: "profi",
    status: "pending",
    service_query:
      CATEGORY_TO_SERVICE[req.category] || req.title || "мастер на час",
    details: [req.title, req.description].filter(Boolean).join(". ").slice(0, 900),
    address: null,
    budget: req.estimate_cost || null,
    deadline: URGENCY_TO_DEADLINE[req.urgency] || "week",
  };
}

// AUTO_ENQUEUE_NEW_REQUESTS=1: новые заявки status=new попадают в очередь сами.
async function autoEnqueue() {
  try {
    const [requests, enqueued] = await Promise.all([
      db.newRequests(),
      db.enqueuedRequestIds(),
    ]);
    const fresh = requests.filter((r) => !enqueued.has(r.id));
    for (const req of fresh) {
      await db.enqueueOrder(orderFromRequest(req));
      console.log(`[${stamp()}] в очередь добавлена заявка ${req.id} («${req.title}»)`);
    }
  } catch (err) {
    console.error(`[${stamp()}] auto-enqueue: ${err.message}`);
  }
}

// Адрес для шага «Улица и номер дома»: из заказа → из объекта заявки →
// DEFAULT_ADDRESS из .env
async function resolveAddress(order) {
  if (order.address) return order.address;
  if (order.request_id) {
    try {
      const req = await db.getRequest(order.request_id);
      if (req?.property_id) {
        const prop = await db.getProperty(req.property_id);
        if (prop?.address) return prop.address;
      }
    } catch (err) {
      console.warn(`[${stamp()}] адрес объекта не получен: ${err.message}`);
    }
  }
  return config.defaultAddress || null;
}

async function processQueue() {
  const order = await db.nextPendingOrder();
  if (!order) return false;

  console.log(`[${stamp()}] обрабатываю заказ ${order.id} («${order.service_query}»)`);
  await db.updateOrder(order.id, { status: "running" });
  try {
    order.address = await resolveAddress(order);
    const result = await createProfiOrder(order);
    if (!result.published) {
      await db.updateOrder(order.id, {
        status: "failed",
        error: "DRY_RUN: заказ не отправлялся",
      });
      console.log(`[${stamp()}] DRY_RUN — шаги мастера:\n${result.log.join("\n")}`);
      return true;
    }
    await db.updateOrder(order.id, { status: "sent", result_url: result.url });
    console.log(`[${stamp()}] заказ отправлен: ${result.url}`);
    console.log(result.log.join("\n"));
  } catch (err) {
    await db.updateOrder(order.id, { status: "failed", error: String(err.message || err) });
    console.error(`[${stamp()}] ошибка: ${err.message}`);
    console.error(err.stack);
  }
  return true;
}

async function main() {
  assertConfig();
  console.log(`[${stamp()}] воркер запущен. Опрос каждые ${config.pollIntervalSec} сек.`);
  console.log(`Профи-профиль: ${config.profileDir}; headless=${config.headless}; dry_run=${config.dryRun}`);
  for (;;) {
    try {
      if (config.autoEnqueue) await autoEnqueue();
      await processQueue();
      await monitorOffers();
      await reactOffers();
    } catch (err) {
      console.error(`[${stamp()}] цикл прерван: ${err.message}`);
    }
    await sleep(config.pollIntervalSec * 1000);
  }
}

// ============ Мониторинг откликов и согласование встречи ============

// примерное время из текста мастера: «завтра после 15:00», «в 14:00»
function extractProposedTime(text) {
  if (!text) return null;
  const m = text.match(
    /(?:сегодня|завтра|послезавтра)?[^.!?\n]{0,40}\d{1,2}[:.]\d{2}[^.!?\n]{0,20}/i,
  );
  return m ? m[0].replace(/\s+/g, " ").trim().slice(0, 80) : null;
}

const profiOrderIdFromUrl = (url) => (url.match(/order\/(\d+)/) || [])[1] || null;

// Суть заявки без повторов: заголовок и описание часто совпадают слово в слово.
function composeDetails(title, description) {
  const raw = (description || "").trim() || (title || "").trim();
  const seen = new Set();
  return raw
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => {
      const key = s.toLowerCase().replace(/[.!,]+$/, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(". ");
}

// Шаг 1 переговоров: здороваемся и спрашиваем цену/сроки. Адрес не раскрываем —
// он уйдёт только после согласования времени владельцем.
async function sendIntro(order, offer) {
  if (!offer || !offer.chat_id) return;
  const details = composeDetails(order.title, order.details).slice(0, 400);
  if (!details) return;
  const budget = Number(order.budget) > 0 ? ` Ориентир по бюджету — до ${Math.round(Number(order.budget))} руб.` : "";
  const text = `Здравствуйте! ${details}.${budget} Подскажите, пожалуйста, сколько будет стоить и когда сможете подойти?`;
  try {
    await sendChatMessage(order.result_url.match(/order\/(\d+)/)[1], offer.chat_id, text);
    if (offer.id) {
      await db.updateOffer(offer.id, {
        intro_sent_at: new Date().toISOString(),
        reply_text: text,
      });
    }
    console.log(`[${stamp()}] вступительное отправлено мастеру ${offer.master_name || ""}`);
  } catch (err) {
    console.error(`[${stamp()}] вступительное ${offer.master_name || ""}: ${err.message}`);
  }
}

// Новые отклики/сообщения мастеров → profi_offers + уведомление владельцу.
async function monitorOffers() {
  let sent;
  try {
    sent = (await db.sentOrders()) || [];
  } catch {
    return;
  }
  for (const order of sent) {
    const profiOrderId = profiOrderIdFromUrl(order.result_url);
    if (!profiOrderId) continue;
    let chats;
    try {
      chats = await listChats(profiOrderId);
    } catch (err) {
      console.error(`[${stamp()}] мониторинг ${profiOrderId}: ${err.message}`);
      continue;
    }
    const existing = (await db.offersForOrder(order.id)) || [];
    for (const chat of chats) {
      const prev = existing.find((x) => x.chat_id === chat.chatId);
      // последнее входящее от мастера (не наше собственное сообщение)
      let lastIncoming = null;
      let readOk = false;
      try {
        const msgs = await readChatMessages(profiOrderId, chat.chatId);
        readOk = true;
        const incoming = msgs.filter((m) => !m.mine && m.text);
        if (incoming.length) lastIncoming = incoming[incoming.length - 1];
      } catch (err) {
        console.error(`[${stamp()}] чтение чата ${chat.chatId}: ${err.message}`);
      }
      if (readOk && !lastIncoming) continue; // в чате только наши сообщения
      const incomingText = (lastIncoming ? lastIncoming.text : chat.preview).slice(0, 900);
      if (prev && prev.last_message === incomingText && prev.intro_sent_at) {
        continue; // нового от мастера нет, вступительное уже отправлено
      }
      const incomingRaw = lastIncoming ? lastIncoming.text : chat.preview;
      const proposed = extractProposedTime(incomingRaw);
      if (!prev) {
        const createdOffer = await db.createOffer({
          owner_id: order.owner_id,
          order_id: order.id,
          request_id: order.request_id,
          profi_order_id: profiOrderId,
          chat_id: chat.chatId,
          master_name: chat.name,
          price_text: null,
          last_message: incomingText,
          proposed_time: proposed,
          status: "new",
        });
        await db.notify(order.owner_id, {
          title: `Профи: отклик — ${chat.name}`,
          message: proposed
            ? `«${incomingRaw.slice(0, 160)}» · предложил время: ${proposed}`
            : `«${incomingRaw.slice(0, 160)}»`,
          relatedId: order.request_id,
        });
        console.log(`[${stamp()}] новый отклик: ${chat.name} по заказу ${profiOrderId}`);
        const created = Array.isArray(createdOffer) ? createdOffer[0] : createdOffer;
        await sendIntro(order, created);
      } else {
        await db.updateOffer(prev.id, {
          last_message: incomingText,
          proposed_time: proposed ?? prev.proposed_time,
        });
        await db.notify(order.owner_id, {
          title: `Профи: новое сообщение — ${chat.name}`,
          message: incomingRaw.slice(0, 200),
          relatedId: order.request_id,
        });
        console.log(`[${stamp()}] обновление чата: ${chat.name} по заказу ${profiOrderId}`);
        if (prev.status === "new" && !prev.intro_sent_at) {
          await sendIntro(order, prev);
        }
      }
    }
  }
}

// Владелец решил (approved/countered/declined) → пишем мастеру в чат Профи.
async function reactOffers() {
  const offers = (await db.offersToReact()) || [];
  for (const offer of offers) {
    if (!offer.profi_order_id || !offer.chat_id) continue;
    const address = offer.automation_orders?.address || "";
    const text =
      offer.status === "approved"
        ? `Отлично, договарились! Ждём вас ${offer.scheduled_at || "в согласованное время"}.${address ? ` Адрес: ${address}.` : ""}`
        : offer.status === "countered"
          ? `К сожалению, такое время не подходит. Удобнее: ${offer.scheduled_at || "другое время"}. Подойдёт?`
          : "Спасибо за отклик! Мы уже нашли специалиста. Хорошего дня!";
    try {
      await sendChatMessage(offer.profi_order_id, offer.chat_id, text);
      let hireInfo = null;
      if (offer.status === "approved") {
        try {
          hireInfo = await hireSpecialist(offer.profi_order_id, offer.chat_id);
          console.log(`[${stamp()}] «Выбрать специалиста»: ${JSON.stringify(hireInfo)}`);
        } catch (err) {
          console.error(`[${stamp()}] выбор специалиста не удался: ${err.message}`);
        }
      }
      await db.updateOffer(offer.id, {
        replied_at: new Date().toISOString(),
        reply_text: text,
        ...(offer.status === "approved" ? { status: "hired" } : {}),
      });
      console.log(`[${stamp()}] ответ отправлен мастеру ${offer.master_name}: ${offer.status}`);
    } catch (err) {
      console.error(`[${stamp()}] ответ мастеру ${offer.master_name}: ${err.message}`);
    }
  }
}

main();
