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
const PAGES = ["details", "privacy", "terms", "agreement", "payments", "consent", "cookies", "usepolicy", "blog/samozanyatost-podvodnye-kamni", "blog/remont-bez-vladeltsa"];

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
