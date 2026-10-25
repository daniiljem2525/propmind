import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

// Адрес сайта для canonical / og: / JSON-LD / robots.txt / sitemap.xml:
// в index.html, public/robots.txt и public/sitemap.xml стоят токены
// __SITE_URL__ и __BASE__, плагин ниже заменяет их на этапе сборки.
// VITE_SITE_URL задаёт адрес целиком (будущий боевой домен); иначе адрес
// собирается из GitHub Pages и VITE_BASE, как в scripts/deploy-ghp.mjs.
const SITE_URL =
  process.env.VITE_SITE_URL ||
  (process.env.VITE_BASE ? `https://daniiljem2525.github.io${process.env.VITE_BASE}` : "http://localhost:5173/");
const BASE = process.env.VITE_BASE || "/";
// ID Яндекс.Метрики: задаётся при сборке, иначе счётчик не подключается
const METRICA_ID = process.env.VITE_YANDEX_METRICA_ID || "";

// base задаётся переменной окружения VITE_BASE (например, /propmind/
// для GitHub Pages). Через env, а не через аргумент CLI: Git Bash
// на Windows искажает аргументы с ведущим слешем.
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [
    react(),
    {
      name: "site-url",
      transformIndexHtml(html) {
        return html
          .replaceAll("__SITE_URL__", SITE_URL)
          .replaceAll("__BASE__", BASE)
          .replaceAll("__METRICA_ID__", METRICA_ID);
      },
      // public/ копируется в dist как есть — токены в robots/sitemap
      // заменяем прямо в собранной папке после записи бандла.
      closeBundle() {
        for (const f of ["robots.txt", "sitemap.xml"]) {
          const p = path.resolve(__dirname, "dist", f);
          if (existsSync(p)) writeFileSync(p, applyTokens(readFileSync(p, "utf8")));
        }
      },
    },
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    host: true,
    port: 5173,
    // Служебные папки инструментов ловят файловые локи (EBUSY) и роняют вотчер.
    watch: { ignored: ["**/.zcode/**", "**/.zwork/**", "**/recordings/**"] },
  },
  // Бандл один и самодостаточный: деплой инлайнит его в index.html.
  // Ленивую загрузку страниц осознанно не используем — кэшированная
  // оболочка не должна ссылаться на чанки, удалённые с сервера.
  build: {
    chunkSizeWarningLimit: 1600,
  },
});

function applyTokens(text) {
  return text
    .replaceAll("__SITE_URL__", SITE_URL)
    .replaceAll("__BASE__", BASE)
    .replaceAll("__METRICA_ID__", METRICA_ID);
}
