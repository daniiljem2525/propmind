// sync-snapshot-refs.mjs — пост-сборочный шаг: пререндеренные снапшоты
// юрстраниц (public/<path>/index.html → dist) ссылаются на бандл той сборки,
// которой снимались; после пересборки хэш меняется и ссылки умирали.
// Скрипт переписывает ссылки на актуальный бандл/CSS ТОЛЬКО для страниц,
// у которых есть SPA-маршрут и title снапшота совпадает с runtime-title
// (LegalPage). Live-only страницы (магниты, /features/*, 15 статей без md,
// /tariffs с кастомным SEO-title) НЕ трогаются — их статический HTML с
// родным бандлом и есть контент (см. отчёт об инциденте 07.11).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dist = join(process.cwd(), "dist");

// Текущий бандл/CSS — из корневого dist/index.html (его генерирует vite)
const rootHtml = readFileSync(join(dist, "index.html"), "utf8");
const bundle = rootHtml.match(/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0];
const css = rootHtml.match(/assets\/index-[A-Za-z0-9_-]+\.css/)?.[0];
if (!bundle || !css) {
  console.error("sync-snapshot-refs: не найдены ссылки бандла/CSS в dist/index.html");
  process.exit(1);
}

// Страницы-снапшоты, безопасно загружающие актуальный бандл
// Страницы-снапшоты, безопасно загружающие актуальный бандл:
// юрстраницы + логин/регистрация + блог-индекс + ВСЕ статьи с md-исходниками
// (их данные в bundled md — SPA-рендер безопасен). Live-only страницы
// (без md в content/blog), магниты и /features/* — НЕ трогаются: их
// контента в текущем бандле нет, актуальный бандл заменил бы их 404-й.
const blogDir = "content/blog";
const blogSlugs = readdirSync(blogDir)
  .filter((f) => f.endsWith(".md"))
  .map((f) => "blog/" + f.replace(/\.md$/, ""));
// CSS-only ретаргет: страницы без <script src> (чистая статика + inline-скрипты).
// У них нет SPA-роутов/данных в бандле, поэтому JS-рендер им ничего не заменит —
// но старый CSS-хэш мог быть вычищен из assets (инцидент 07.11, P0 2026-11-15:
// 4 features-страницы и blog/programma-dlya-ucheta-arendy-kvartir с 404-CSS).
// Ретаргет CSS безопасен: контент целиком в статическом HTML, JS не грузится.
const CSS_ONLY_PAGES = [
  "features/uchet-platezhey",
  "features/napominaniya",
  "features/zayavki-zhilcov",
  "features/upravlenie-nedvizhimostyu",
  "features/dlya-arendodatelya",
  "blog/programma-dlya-ucheta-arendy-kvartir",
];
const PAGES = ["details", "privacy", "terms", "agreement", "payments", "consent", "cookies", "usepolicy", "login", "register", "blog", ...blogSlugs, ...CSS_ONLY_PAGES];

let fixed = 0;
for (const p of PAGES) {
  const file = join(dist, p, "index.html");
  try {
    let html = readFileSync(file, "utf8");
    const before = html;
    html = html.replace(/assets\/index-[A-Za-z0-9_-]+\.js/g, bundle);
    html = html.replace(/assets\/index-[A-Za-z0-9_-]+\.css/g, css);
    if (html !== before) {
      writeFileSync(file, html);
      fixed++;
    }
  } catch {
    console.error(`sync-snapshot-refs: ${p} — файл не найден (страница без снапшота?)`);
    process.exit(1);
  }
}
console.log(`sync-snapshot-refs: бандл ${bundle}, обновлено страниц: ${fixed}/${PAGES.length}`);
