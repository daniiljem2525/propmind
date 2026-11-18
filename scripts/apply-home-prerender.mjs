// apply-home-prerender.mjs — пост-сборочный шаг: возвращает пререндер главной
// в dist/index.html. Регрессия 18.11 (повтор 13.11): vite build затирает
// dist/index.html шаблоном корневого index.html — SPA-оболочка без единого
// <a>-тега и с одним словом «Arendora» в видимом тексте; краулер получает
// главную без внутренних ссылок. Пререндер-снапшот хранится в
// public/index.html (capture-home.js, NT-020), но vite его перезаписывает.
//
// Что делает скрипт:
//  1. Берёт актуальные имена бандла/CSS из сгенерированного dist/index.html.
//  2. Берёт пререндер-снапшот public/index.html и ретаргает ссылки
//     /assets/index-*.js|css на актуальные (главная — SPA-маршрут «/»,
//     её контент есть в текущем бандле — ретаргет безопасен, тот же
//     принцип, что в sync-snapshot-refs.mjs для legal/блога).
//  3. Валидирует результат: длина видимого текста, число <a>, ссылки
//     /blog и /register, отсутствие «localhost» и «Ошибка интерфейса».
//     Без валидации сборка падает с ошибкой — пустая главная не уедет
//     на прод молча (защита от повторов регрессий 13.11/14.11/18.11).
//
// Подключён в package.json после sync-snapshot-refs.mjs.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dist = join(process.cwd(), "dist");
const rootHtmlPath = join(dist, "index.html");
const snapPath = join(process.cwd(), "public", "index.html");

let rootHtml;
try {
  rootHtml = readFileSync(rootHtmlPath, "utf8");
} catch (e) {
  console.error("apply-home-prerender: не найден dist/index.html — сначала vite build");
  process.exit(1);
}

let snap;
try {
  snap = readFileSync(snapPath, "utf8");
} catch (e) {
  console.error("apply-home-prerender: не найден public/index.html (пререндер-снапшот главной). Запусти capture-home.js и закоммить снапшот.");
  process.exit(1);
}

// Актуальный бандл/CSS — из корневого dist/index.html (его генерирует vite)
const bundle = rootHtml.match(/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0];
const css = rootHtml.match(/assets\/index-[A-Za-z0-9_-]+\.css/)?.[0];
if (!bundle || !css) {
  console.error("apply-home-prerender: не найдены ссылки бандла/CSS в dist/index.html");
  process.exit(1);
}

const before = {
  js: snap.match(/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0] || "(нет)",
  css: snap.match(/assets\/index-[A-Za-z0-9_-]+\.css/)?.[0] || "(нет)",
};
let html = snap
  .replace(/assets\/index-[A-Za-z0-9_-]+\.js/g, bundle)
  .replace(/assets\/index-[A-Za-z0-9_-]+\.css/g, css);
const after = {
  js: html.match(/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0] || "(нет)",
  css: html.match(/assets\/index-[A-Za-z0-9_-]+\.css/)?.[0] || "(нет)",
};

// --- Валидация: снапшот обязан быть живым пререндером, не оболочкой ---
const fail = (msg) => {
  console.error("apply-home-prerender: ОТКАЗ — " + msg);
  console.error("  Снапшот не заменён, dist/index.html остался от vite. Почини public/index.html (capture-home.js).");
  process.exit(1);
};

const anchors = (html.match(/<a[\s>]/gi) || []).length;
const blogLinks = (html.match(/href="\/blog[^"]*"/g) || []).length;
const registerLinks = (html.match(/href="\/register[^"]*"/g) || []).length;
const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
const visible = (bodyMatch ? bodyMatch[1] : html)
  .replace(/<script[\s\S]*?<\/script>/gi, "")
  .replace(/<style[\s\S]*?<\/style>/gi, "")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim();

if (anchors < 20) fail(`слишком мало <a>-тегов: ${anchors} (< 20) — снапшот, похоже, пустая оболочка`);
if (blogLinks < 5) fail(`мало ссылок на блог: ${blogLinks} (< 5)`);
if (registerLinks < 5) fail(`мало ссылок на /register: ${registerLinks} (< 5)`);
if (visible.length < 2000) fail(`видимый текст слишком короткий: ${visible.length} симв. (< 2000)`);
if (/localhost/i.test(html)) fail("в снапшоте «localhost»");
if (/Ошибка интерфейса/.test(html)) fail("в снапшоте «Ошибка интерфейса»");
if (!/rel="canonical" href="https:\/\/arendora\.ru\/"/.test(html)) {
  // канон не критичен для замены, но предупреждение в лог
  console.warn("apply-home-prerender: предупреждение — в снапшоте не найден canonical на https://arendora.ru/");
}

writeFileSync(rootHtmlPath, html);
console.log(`apply-home-prerender: dist/index.html заменён пререндером (${html.length} байт, <a>: ${anchors}, /blog: ${blogLinks}, /register: ${registerLinks}, текст: ${visible.length} симв.)`);
console.log(`  бандл: ${before.js} -> ${after.js}; css: ${before.css} -> ${after.css}`);
