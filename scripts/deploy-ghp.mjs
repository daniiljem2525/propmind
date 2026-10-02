// Деплой статики на GitHub Pages: сборка с base по имени репозитория,
// копия index.html → 404.html (SPA-маршруты), пуш в ветку gh-pages.
// Запуск: npm run deploy:ghp
//
// Имя репозитория выводится из git remote: после переименования репо на
// GitHub (например, propmind → arendora) деплой сам начнёт собираться с
// новым base-путём — менять скрипт не нужно.
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const run = (cmd, opts = {}) => execSync(cmd, { stdio: "inherit", ...opts });

const remote = execSync("git remote get-url origin", { encoding: "utf8" }).trim();
const repoName = (remote.match(/github\.com[:/][^/]+\/([^/.]+?)(?:\.git)?$/) || [])[1] || "arendora";
const user = (remote.match(/github\.com[:/]([^/]+)\//) || [])[1] || "daniiljem2525";
const BASE = `/${repoName}/`;

run("npx vite build", { env: { ...process.env, VITE_BASE: BASE } });

// Инлайн JS и CSS в index.html: одна самодостаточная страница —
// невозможен рассинхрон кэша между index и ассетами на GitHub Pages.
// (Ленивые чанки страниц остаются отдельными файлами в assets/ —
// их кэширует сервис-воркер.)
let html = readFileSync("dist/index.html", "utf8");
html = html.replace(
  /<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/,
  (_, p) => `<script type="module">${readFileSync("dist" + p.replace(BASE, "/"), "utf8")}</script>`
);
html = html.replace(
  /<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/,
  (_, p) => `<style>${readFileSync("dist" + p.replace(BASE, "/"), "utf8")}</style>`
);
writeFileSync("dist/index.html", html);
copyFileSync("dist/index.html", "dist/404.html");

if (!existsSync("dist/.git")) {
  run("git init -b gh-pages", { cwd: "dist" });
  run(`git remote add origin https://github.com/${user}/${repoName}.git`, { cwd: "dist" });
  run('git config user.name "Arendora Deploy"', { cwd: "dist" });
  run('git config user.email "deploy@arendora.local"', { cwd: "dist" });
}
run("git add -A", { cwd: "dist" });
try {
  run('git commit -m "deploy"', { cwd: "dist" });
} catch {}
run("git push -f origin gh-pages", { cwd: "dist" });
console.log(`Deployed: https://${user}.github.io${BASE}`);
