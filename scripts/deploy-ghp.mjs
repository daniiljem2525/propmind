// Деплой статики на GitHub Pages: сборка с base /propmind/,
// копия index.html → 404.html (SPA-маршруты), пуш в ветку gh-pages.
// Запуск: npm run deploy:ghp
import { execSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";

const run = (cmd, opts = {}) => execSync(cmd, { stdio: "inherit", ...opts });

run("npx vite build", { env: { ...process.env, VITE_BASE: "/propmind/" } });
copyFileSync("dist/index.html", "dist/404.html");

if (!existsSync("dist/.git")) {
  run("git init -b gh-pages", { cwd: "dist" });
  run('git remote add origin https://github.com/daniiljem2525/propmind.git', { cwd: "dist" });
  run('git config user.name "PropMind Deploy"', { cwd: "dist" });
  run('git config user.email "deploy@propmind.local"', { cwd: "dist" });
}
run("git add -A", { cwd: "dist" });
try {
  run('git commit -m "deploy"', { cwd: "dist" });
} catch {}
run("git push -f origin gh-pages", { cwd: "dist" });
console.log("Deployed: https://daniiljem2525.github.io/propmind/");
