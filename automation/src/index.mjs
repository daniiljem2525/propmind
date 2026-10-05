// Воркер: опрашивает Supabase на заказы в очереди (automation_orders,
// status=pending), создаёт их на Профи.ру и пишет результат обратно.
import { config, assertConfig, CATEGORY_TO_SERVICE, URGENCY_TO_DEADLINE } from "./config.mjs";
import { db } from "./supabase-rest.mjs";
import { createProfiOrder } from "./profi.mjs";

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

async function processQueue() {
  const order = await db.nextPendingOrder();
  if (!order) return false;

  console.log(`[${stamp()}] обрабатываю заказ ${order.id} («${order.service_query}»)`);
  await db.updateOrder(order.id, { status: "running" });
  try {
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
    } catch (err) {
      console.error(`[${stamp()}] цикл прерван: ${err.message}`);
    }
    await sleep(config.pollIntervalSec * 1000);
  }
}

main();
