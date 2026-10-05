// Воркер: опрашивает Supabase на заказы в очереди (automation_orders,
// status=pending), создаёт их на Профи.ру и пишет результат обратно.
import fs from "node:fs";
import { config, assertConfig, CATEGORY_TO_SERVICE, URGENCY_TO_DEADLINE, slotProfileDir } from "./config.mjs";
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

// Данные объекта для вопросов мастера: адрес, площадь, комнаты
async function resolveAddress(order) {
  if (order.address) return order.address;
  if (order.request_id) {
    try {
      const req = await db.getRequest(order.request_id);
      if (req?.property_id) {
        const prop = await db.getProperty(req.property_id);
        if (prop) {
          order.area_sqm = prop.area_sqm ?? null;
          order.rooms = prop.rooms ?? null;
          if (prop.address) return prop.address;
        }
      }
    } catch (err) {
      console.warn(`[${stamp()}] данные объекта не получены: ${err.message}`);
    }
  }
  return config.defaultAddress || null;
}

// Обработка одного заказа слотом. Возвращает true, если заказ был.
async function processQueue(slot, profileDir) {
  const order = await db.nextPendingOrder();
  if (!order) return false;

  // атомарный захват: pending → running; если другой слот успел первым — null
  const claimed = await db.claimOrder(order.id);
  if (!claimed) return false;

  // защита от дублей: если по этой заявке уже есть активный заказ — отменяем
  const duplicate = claimed.request_id
    ? await db.olderActiveOrder(claimed.request_id, claimed.id)
    : null;
  if (duplicate) {
    await db.updateOrder(order.id, {
      status: "cancelled",
      error: "Дубль заявки — заказ уже есть на Профи",
    });
    console.log(`[${stamp()}] дубль заявки — заказ ${order.id} отменён`);
    return false;
  }

  console.log(`[${stamp()}] слот ${slot}: обрабатываю заказ ${order.id} («${claimed.service_query}»)`);
  try {
    claimed.address = await resolveAddress(claimed);
    const result = await createProfiOrder(claimed, { profileDir });
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
    console.log(`[${stamp()}] слот ${slot}: заказ отправлен: ${result.url}`);
  } catch (err) {
    await db.updateOrder(order.id, { status: "failed", error: String(err.message || err) });
    console.error(`[${stamp()}] слот ${slot}: ошибка: ${err.message}`);
  }
  return true;
}

// Цикл одного слота. Слот 0, помимо очереди, ведёт мониторинг и переговоры.
// Приоритет: очередь заявок — всегда первой; чаты — только когда очередь пуста.
async function slotLoop(slot) {
  const profileDir = slotProfileDir(slot);
  for (;;) {
    try {
      let hadOrder = false;
      if (slot === 0) {
        if (config.autoEnqueue) await autoEnqueue();
        await reactOffers(profileDir);
        hadOrder = await processQueue(slot, profileDir);
        if (!hadOrder) await monitorOffers(profileDir);
      } else {
        hadOrder = await processQueue(slot, profileDir);
      }
    } catch (err) {
      console.error(`[${stamp()}] слот ${slot}: цикл прерван: ${err.message}`);
    }
    await sleep(config.pollIntervalSec * 1000);
  }
}

// Профили дополнительных слотов — копии основного (залогиненного)
function ensureSlotProfiles() {
  for (let i = 1; i < config.parallelSlots; i++) {
    const dir = slotProfileDir(i);
    if (!fs.existsSync(dir) && fs.existsSync(config.profileDir)) {
      fs.cpSync(config.profileDir, dir, { recursive: true });
      console.log(`[${stamp()}] слот ${i}: профиль скопирован в ${dir}`);
    }
  }
}

async function main() {
  assertConfig();
  ensureSlotProfiles();
  console.log(`[${stamp()}] воркер запущен. Опрос каждые ${config.pollIntervalSec} сек.`);
  console.log(
    `Слотов: ${config.parallelSlots}; headless=${config.headless}; dry_run=${config.dryRun}; мониторинг чатов: раз в ${config.monitorIntervalSec} сек.`,
  );
  const loops = [];
  for (let i = 0; i < config.parallelSlots; i++) loops.push(slotLoop(i));
  await Promise.all(loops);
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
const introChatIds = new Set(); // вступительное уже отправлено в этот чат

async function sendIntro(order, offer, profileDir = config.profileDir) {
  if (!offer || !offer.chat_id) return;
  if (introChatIds.has(offer.chat_id)) {
    // в чат уже здоровались (дубль-строка отклика) — только помечаем
    if (offer.id) {
      await db
        .updateOffer(offer.id, { intro_sent_at: new Date().toISOString() })
        .catch(() => {});
    }
    return;
  }
  const details = composeDetails(order.title, order.details).slice(0, 400);
  if (!details) return;
  const budget = Number(order.budget) > 0 ? ` Ориентир по бюджету — до ${Math.round(Number(order.budget))} руб.` : "";
  const text = `Здравствуйте! ${details}.${budget} Подскажите, пожалуйста, сколько будет стоить и когда сможете подойти?`;
  try {
    await sendChatMessage(order.result_url.match(/order\/(\d+)/)[1], offer.chat_id, text, profileDir);
    introChatIds.add(offer.chat_id);
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
// заказы, по которым заявка уже закрыта — один раз логируем и больше не трогаем
const closedSkipped = new Set();

async function monitorOffers(profileDir = config.profileDir) {
  let sent;
  try {
    sent = (await db.sentOrders()) || [];
  } catch {
    return;
  }
  const now = Date.now();
  // статусы заявок одним запросом: чтобы не следить за закрытыми задачами
  const reqStatuses = await db.requestStatuses(
    sent.map((o) => o.request_id).filter(Boolean),
  );
  for (const order of sent) {
    if (now - (lastMonitored.get(order.id) || 0) < config.monitorIntervalSec * 1000) continue;
    lastMonitored.set(order.id, now);
    if (
      order.request_id &&
      ["done", "closed", "cancelled"].includes(reqStatuses.get(order.request_id))
    ) {
      if (!closedSkipped.has(order.id)) {
        closedSkipped.add(order.id);
        console.log(`[${stamp()}] заявка закрыта — слежку по заказу ${order.id} прекратил`);
      }
      continue;
    }
    const profiOrderId = profiOrderIdFromUrl(order.result_url);
    if (!profiOrderId) continue;
    let chats;
    try {
      const res = await listChats(profiOrderId);
      if (res.cancelled) {
        // задачу отменили на стороне Профи — гасим слежку навсегда
        await db.updateOrder(order.id, {
          status: "cancelled",
          error: "Задача отменена на Профи.ру",
        });
        console.log(`[${stamp()}] задача ${profiOrderId} отменена на Профи — заказ ${order.id} закрыт`);
        continue;
      }
      chats = res.chats;
    } catch (err) {
      console.error(`[${stamp()}] мониторинг ${profiOrderId}: ${err.message}`);
      continue;
    }
    const existing = (await db.offersForOrder(order.id)) || [];
    // Повторный найм: если на новом заказе ещё никого нет, а у владельца
    // уже есть проверенный мастер этой же специализации — пишем ему первому.
    if (chats.length === 0) {
      const repeat = await tryRepeatHire(order, profiOrderId, profileDir);
      if (repeat?.chatId) {
        repeatIntroChatIds.add(repeat.chatId);
        chats = (await listChats(profiOrderId)).chats;
      }
    }
    for (const chat of chats) {
      const prev = existing.find((x) => x.chat_id === chat.chatId);
      // последнее входящее от мастера (не наше собственное сообщение)
      let lastIncoming = null;
      let readOk = false;
      try {
        const msgs = await readChatMessages(profiOrderId, chat.chatId, profileDir);
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
        if (!isRepeat) await sendIntro(order, created, profileDir);
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
          await sendIntro(order, prev, profileDir);
        }
      }
    }
  }
}

// Владелец уже нанимал мастера этой специализации → новый заказ идёт ему,
// а не в общий поиск. Однократно на заказ (в рамках жизни процесса).
const repeatTried = new Set();
const repeatIntroChatIds = new Set();

async function tryRepeatHire(order, profiOrderId, profileDir) {
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
    const res = await contactSpecialist(profiOrderId, hired.profile_id, text, profileDir);
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
async function reactOffers(profileDir = config.profileDir) {
  const offers = (await db.offersToReact()) || [];
  // один и тот же чат может числиться за несколькими строками откликов
  // (когда заказ отправляли дважды) — отвечаем только один раз
  const processedChats = new Set();
  for (const offer of offers) {
    if (!offer.profi_order_id || !offer.chat_id) continue;
    if (processedChats.has(offer.chat_id)) {
      // дубль-строка: помечаем обработанной без повторной отправки
      await db
        .updateOffer(offer.id, {
          replied_at: new Date().toISOString(),
          reply_text: "(дубль чата — ответ уже отправлен)",
          ...(offer.status === "approved" ? { status: "hired" } : {}),
        })
        .catch(() => {});
      continue;
    }
    processedChats.add(offer.chat_id);
    const address = offer.automation_orders?.address || "";
    const text =
      offer.status === "approved"
        ? `Отлично, договарились! Ждём вас ${offer.scheduled_at || "в согласованное время"}.${address ? ` Адрес: ${address}.` : ""}`
        : offer.status === "countered"
          ? `К сожалению, такое время не подходит. Удобнее: ${offer.scheduled_at || "другое время"}. Подойдёт?`
          : "Спасибо за отклик! Мы уже нашли специалиста. Хорошего дня!";
    try {
      await sendChatMessage(offer.profi_order_id, offer.chat_id, text, profileDir);
      let hireInfo = null;
      if (offer.status === "approved") {
        try {
          hireInfo = await hireSpecialist(offer.profi_order_id, offer.chat_id, profileDir);
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
