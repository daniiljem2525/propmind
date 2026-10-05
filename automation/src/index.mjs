// Воркер: опрашивает Supabase на заказы в очереди (automation_orders,
// status=pending), создаёт их на Профи.ру и пишет результат обратно.
import { config, assertConfig, CATEGORY_TO_SERVICE, URGENCY_TO_DEADLINE } from "./config.mjs";
import { db } from "./supabase-rest.mjs";
import { createProfiOrder, listChats, readChatMessages, sendChatMessage, hireSpecialist, contactSpecialist } from "./profi.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toLocaleTimeString("ru-RU");

// Уточнение услуги по названию заявки: узкий запрос приводит профильных
// местных мастеров вместо «онлайн-консультаций» со всей России.
const APPLIANCE_HINTS = [
  [/стиральн/i, "ремонт стиральных машин"],
  [/холодильник|морозильн/i, "ремонт холодильников"],
  [/посудомоечн/i, "ремонт посудомоечных машин"],
  [/пылесос/i, "ремонт пылесосов"],
  [/духовк|электроплит|газов. плит/i, "ремонт плит и духовок"],
  [/кофемашин|кофеварок/i, "ремонт кофемашин"],
  [/телевизор/i, "ремонт телевизоров"],
  [/микроволновк|свч/i, "ремонт микроволновых печей"],
  [/бойлер|водонагрев/i, "ремонт водонагревателей"],
  [/кондиционер/i, "ремонт кондиционеров"],
];

// Неремонтные услуги — убираются в любой категории
const OTHER_HINTS = [
  [/уборк|клининг|мыть[яе] окн|горнич/i, "клининг"],
  [/перевез|грузчик|вывоз мебель|такелаж/i, "грузоперевозки"],
  [/собрать|сборка мебель|разобрать шкаф/i, "сборка мебели"],
  [/повесить полк|картин|светильник|муж на час/i, "муж на час"],
  [/ремонт квартир|отделочн|поклейка обо/i, "ремонт квартир"],
];

function serviceFromRequest(req) {
  const title = req.title || "";
  if (req.category === "appliances") {
    const hit = APPLIANCE_HINTS.find(([re]) => re.test(title));
    if (hit) return hit[1];
  }
  const other = OTHER_HINTS.find(([re]) => re.test(title));
  if (other) return other[1];
  return CATEGORY_TO_SERVICE[req.category] || title || "мастер на час";
}

// Семейство услуг — чтобы повторный найм уходил мастеру той же специализации
function serviceFamily(serviceQuery) {
  const s = (serviceQuery || "").toLowerCase();
  if (/клининг|уборк/.test(s)) return "cleaning";
  return s.split(/\s+/)[0] || "";
}

function orderFromRequest(req) {
  return {
    request_id: req.id,
    owner_id: req.owner_id,
    platform: "profi",
    status: "pending",
    service_query: serviceFromRequest(req),
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

  // пользователь мог отменить заказ, пока он ждал в очереди
  const fresh = await db.getOrder(order.id);
  if (!fresh || fresh.status !== "pending") {
    console.log(`[${stamp()}] заказ ${order.id} отменён — пропускаю`);
    return false;
  }

  console.log(`[${stamp()}] обрабатываю заказ ${order.id} («${order.service_query}»)`);
  await db.updateOrder(order.id, { status: "running" });
  try {
    // повторная проверка после пометки running: отмена могла прийти в этот момент
    const recheck = await db.getOrder(order.id);
    if (recheck?.status === "cancelled") {
      console.log(`[${stamp()}] заказ ${order.id} отменён — не создаю`);
      return true;
    }
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
      if (!/cabinet\/order\/\d+/.test(result.url)) {
        await db.updateOrder(order.id, {
          status: "failed",
          error: "Финальная кнопка нажата, но публикация не подтвердилась (нет ссылки на задачу)",
        });
        console.error(`[${stamp()}] публикация не подтвердилась, заказ ${order.id}`);
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

// Служебные подсказки Профи (не сообщения людей) — в отклики не попадают.
const SYSTEM_HINT = /выберите специалиста|попросите специалиста|чтобы быстрее обсудить задачу|договаривайтесь со специалистом|обменяйтесь контактами/i;

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
// Один и тот же чат Профи может числиться за несколькими заказами очереди —
// уведомляем о новом сообщении только один раз.
const notifiedKeys = new Set();
// заказы, проверенные недавно: старые заказы не дёргаем каждые 20 секунд
const lastMonitored = new Map();

async function monitorOffers() {
  let sent;
  try {
    sent = (await db.sentOrders()) || [];
  } catch {
    return;
  }
  const now = Date.now();
  for (const order of sent) {
    if (now - (lastMonitored.get(order.id) || 0) < config.monitorIntervalSec * 1000) continue;
    lastMonitored.set(order.id, now);
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
    // Повторный найм: если на новом заказе ещё никого нет, а у владельца
    // уже есть проверенный мастер этой же специализации — пишем ему первому.
    if (chats.length === 0) {
      const repeat = await tryRepeatHire(order, profiOrderId);
      if (repeat?.chatId) {
        repeatIntroChatIds.add(repeat.chatId);
        chats = await listChats(profiOrderId);
      }
    }
    for (const chat of chats) {
      const prev = existing.find((x) => x.chat_id === chat.chatId);
      // последнее входящее от мастера (не наше собственное сообщение)
      let lastIncoming = null;
      let readOk = false;
      try {
        const msgs = await readChatMessages(profiOrderId, chat.chatId);
        readOk = true;
        const incoming = msgs.filter((m) => !m.mine && m.text && !SYSTEM_HINT.test(m.text));
        if (incoming.length) lastIncoming = incoming[incoming.length - 1];
      } catch (err) {
        console.error(`[${stamp()}] чтение чата ${chat.chatId}: ${err.message}`);
      }
      if (readOk && !lastIncoming) continue; // в чате только наши сообщения
      const incomingText = (lastIncoming ? lastIncoming.text : chat.preview).slice(0, 900);
      if (prev && prev.last_message === incomingText && prev.intro_sent_at) {
        continue; // нового от мастера нет, вступительное уже отправлено
      }
      // один и тот же чат может числиться за несколькими заказами очереди —
      // уведомление о новом сообщении отправляем только один раз
      const notifyKey = `${chat.chatId}:${incomingText.slice(0, 120)}`;
      if (notifiedKeys.has(notifyKey)) continue;
      notifiedKeys.add(notifyKey);
      const incomingRaw = lastIncoming ? lastIncoming.text : chat.preview;
      const proposed = extractProposedTime(incomingRaw);
      if (!prev) {
        const isRepeat = repeatIntroChatIds.has(chat.chatId);
        const createdOffer = await db.createOffer({
          owner_id: order.owner_id,
          order_id: order.id,
          request_id: order.request_id,
          profi_order_id: profiOrderId,
          chat_id: chat.chatId,
          profile_id: chat.profileId || null,
          master_name: chat.name,
          price_text: null,
          last_message: incomingText,
          proposed_time: proposed,
          status: "new",
          ...(isRepeat ? { intro_sent_at: new Date().toISOString() } : {}),
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
        if (!isRepeat) await sendIntro(order, created);
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

// Владелец уже нанимал мастера этой специализации → новый заказ идёт ему,
// а не в общий поиск. Однократно на заказ (в рамках жизни процесса).
const repeatTried = new Set();
const repeatIntroChatIds = new Set();

async function tryRepeatHire(order, profiOrderId) {
  if (repeatTried.has(order.id)) return null;
  repeatTried.add(order.id);
  try {
    const hired = await db.lastHiredOffer(order.owner_id);
    if (!hired?.profile_id || !hired.master_name) return null;
    if (serviceFamily(hired.automation_orders?.service_query) !== serviceFamily(order.service_query)) {
      console.log(`[${stamp()}] проверенный мастер (${hired.master_name}) — другая специализация, ищем заново`);
      return null;
    }
    const details = composeDetails(order.title, order.details).slice(0, 400);
    if (!details) return null;
    const text = `Здравствуйте! Обращаемся повторно — в прошлый раз вы отлично помогли. Новая задача: ${details}. Подскажите, пожалуйста, сколько будет стоить и когда сможете подойти?`;
    const res = await contactSpecialist(profiOrderId, hired.profile_id, text);
    await db.notify(order.owner_id, {
      title: `Профи: написали проверенному мастеру — ${hired.master_name}`,
      message: res.contacted
        ? "Ждём ответ в чате; дальше — как обычно: время согласуем с вами"
        : res.reason || "не удалось написать",
      relatedId: order.request_id,
    });
    console.log(
      res.contacted
        ? `[${stamp()}] повторный найм: написали ${hired.master_name} по заказу ${profiOrderId}`
        : `[${stamp()}] повторный найм не удался: ${res.reason}`,
    );
    return res;
  } catch (err) {
    console.error(`[${stamp()}] повторный найм: ${err.message}`);
    return null;
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
