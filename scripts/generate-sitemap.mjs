// Генератор public/sitemap.xml — запускается при каждой сборке
// (npm run build → prebuild; см. package.json). Токен __SITE_URL__
// заменяется на этапе сборки плагином site-url (vite.config.js).
//
// Состав URL (актуально на 2026-11-01, спринт «Программисты на прод»):
//   1. Статические страницы (главная — ПЕРВОЙ, решение CEO G/в: выдача
//      по бренду «Arendora» должна вести на главную);
//   2. Статьи блога — из front-matter date файлов content/blog/*.md
//      (слаг = имя файла; новая статья попадает сама);
//   3. Магниты ×3 (/magnit-dogovor, /magnit-kalkulyator, /magnit-kurs);
//   4. GEO-страницы Release 2 (5 шт., /blog/…);
//   5. Посадочные /features/*: uchet-platezhey (спринт 2, пакет NT-018),
//      napominaniya (пакет №2, 05.11), zayavki-zhilcov (пакет №3, 06.11) и
//      upravlenie-nedvizhimostyu (SEO-смена 2026-11-10) — features не из
//      content/blog, поэтому включаются явно через EXTRA_PAGES.
//
// lastmod вручную не правится: берётся из EXTRA_LASTMOD/STATIC-списка или
// front-matter статьи. Файл public/sitemap.xml перезаписывается целиком —
// править руками не нужно.
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Дата сборки: lastmod статических/EXTRA-страниц всегда актуален на выкат
const TODAY = new Date().toISOString().slice(0, 10);

// Статические канонические URL. Главная — всегда первый элемент.
const STATIC_PAGES = [
  { loc: "", lastmod: TODAY }, // главная https://arendora.ru/
  { loc: "blog", lastmod: TODAY },
  { loc: "register", lastmod: "2026-11-07" },
  { loc: "tariffs", lastmod: "2026-11-07" },
  { loc: "terms", lastmod: "2026-11-07" },
  { loc: "privacy", lastmod: "2026-11-07" },
  { loc: "agreement", lastmod: "2026-11-07" },
  { loc: "consent", lastmod: "2026-11-07" },
  { loc: "payments", lastmod: "2026-11-07" },
  { loc: "usepolicy", lastmod: "2026-11-07" },
  { loc: "cookies", lastmod: "2026-11-07" },
];

// Страницы вне content/blog/: магниты (Р3), GEO-релиз 2 (5 страниц),
// посадочная /features/uchet-platezhey (спринт 2).
const EXTRA_PAGES = [
  { loc: "magnit-dogovor", lastmod: "2026-11-07" },
  { loc: "magnit-kalkulyator", lastmod: "2026-11-07" },
  { loc: "magnit-kurs", lastmod: "2026-11-07" },
  // lastmod 2026-11-05: retargeting заголовков + FAQ «арендор» (синхронно с правкой прода 05.11)
  { loc: "blog/luchshie-servisy-dlya-arendodateley-2026", lastmod: "2026-11-05" },
  { loc: "blog/servisy-upravleniya-arendoy-nedvizhimostyu", lastmod: "2026-11-05" },
  { loc: "blog/programma-dlya-ucheta-arendy-kvartir", lastmod: "2026-11-07" },
  { loc: "blog/prilozhenie-dlya-arendodatelya", lastmod: "2026-11-07" },
  { loc: "blog/kak-avtomatizirovat-sdachu-kvartiry", lastmod: "2026-11-07" },
  { loc: "features/uchet-platezhey", lastmod: "2026-11-07" },
  // Посадочные волны 2 (пакеты №2/№3 SEO, утверждены NT-001 04.11, даты — из Р1.6)
  { loc: "features/napominaniya", lastmod: "2026-11-05" },
  { loc: "features/zayavki-zhilcov", lastmod: "2026-11-06" },
  { loc: "details", lastmod: "2026-11-08" },
  { loc: "features/dlya-arendodatelya", lastmod: "2026-11-05" },
  // Посадочная «Управление недвижимостью» (SEO-смена 2026-11-10, NT-019/NT-009)
  { loc: "features/upravlenie-nedvizhimostyu", lastmod: "2026-11-10" },
];

function frontMatterDate(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const d = m[1].match(/^date:\s*(\d{4}-\d{2}-\d{2})\s*$/m);
  return d ? d[1] : null;
}

const blogDir = path.join(root, "content", "blog");
const blogPosts = existsSync(blogDir)
  ? readdirSync(blogDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => {
        const slug = f.replace(/\.md$/, "");
        const md = readFileSync(path.join(blogDir, f), "utf8");
        return { loc: `blog/${slug}`, lastmod: frontMatterDate(md) || TODAY };
      })
  : [];

// Статьи, которые уже на проде, но ещё не перенесены в content/blog/
// (рабочая копия деплой-конвейера опережает main). Когда файл статьи
// появится в content/blog/, из этого списка он уберётся дедупликацией.
const LIVE_ONLY_BLOG = [
  { loc: "blog/zalog-pri-sdache-kvartiry", lastmod: "2026-10-29" },
  { loc: "blog/sosed-zhaluetsya-na-kvartiranta", lastmod: "2026-10-29" },
  { loc: "blog/samozanyatost-sdacha-kvartiry", lastmod: "2026-10-29" },
  { loc: "blog/posutochno-ili-dolgosrok", lastmod: "2026-10-29" },
  { loc: "blog/obrazec-dogovora-naima-kvartiry", lastmod: "2026-10-29" },
  { loc: "blog/kto-dolzhen-delat-remont", lastmod: "2026-10-29" },
  { loc: "blog/kak-povysit-arendnuyu-platu", lastmod: "2026-10-29" },
  { loc: "blog/avtomatizaciya-sdachi-kvartiry", lastmod: "2026-10-29" },
  { loc: "blog/arendora-vs-google-tablicy", lastmod: "2026-11-06" },
  { loc: "blog/akt-priema-peredachi-kvartiry", lastmod: "2026-10-29" },
];

const seen = new Set();
const urls = [...STATIC_PAGES, ...blogPosts, ...LIVE_ONLY_BLOG, ...EXTRA_PAGES].filter(
  (u) => !seen.has(u.loc) && seen.add(u.loc)
);
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Генерируется скриптом scripts/generate-sitemap.mjs при каждой сборке:
     править руками не нужно. Новая статья попадает сюда сама — по
     front-matter date из content/blog/. Токен __SITE_URL__ заменяется
     на этапе сборки (vite.config.js). -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>__SITE_URL__${u.loc}</loc><lastmod>${u.lastmod}</lastmod></url>`).join("\n")}
</urlset>
`;

writeFileSync(path.join(root, "public", "sitemap.xml"), xml);
console.log(`sitemap.xml: ${urls.length} URL (главная первой)`);
