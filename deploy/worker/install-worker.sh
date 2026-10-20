#!/usr/bin/env bash
# Установка воркера Профи.ру на сервере. Запуск: bash install-worker.sh
# Требует: код automation/ уже залит в /opt/arendora/automation (upload.sh),
# профиль браузера (state/profi-profile) — в /opt/arendora/worker/profi-profile.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then echo "запускать от root"; exit 1; fi

echo "1/5 Node.js 20…"
if ! command -v node >/dev/null || [ "$(node -v | cut -dv -f2 | cut -d. -f1)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "2/5 Зависимости и Chromium (headless)…"
cd /opt/arendora/automation
npm ci
npx playwright install --with-deps chromium

echo "3/5 Профиль браузера Профи.ру…"
if [ ! -d state/profi-profile ] && [ -d /opt/arendora/worker/profi-profile ]; then
  cp -r /opt/arendora/worker/profi-profile state/profi-profile
  echo "профиль скопирован из /opt/arendora/worker/profi-profile"
fi
[ -d state/profi-profile ] || echo "ВНИМАНИЕ: профиля нет — при первом старте воркер потребует логин (npm run login)"

echo "4/5 worker.env…"
if [ ! -f /opt/arendora/worker.env ]; then
  cat > /opt/arendora/worker.env <<'ENV'
# SUPABASE_URL — публичный адрес своего стека
SUPABASE_URL=https://api.arendora.ru
# SERVICE_ROLE_KEY — из /opt/arendora/stack/.env (СТРОКО СЕКРЕТ)
SUPABASE_SERVICE_KEY=ВСТАВЬТЕ_SERVICE_ROLE_KEY
HEADLESS=1
PARALLEL_SLOTS=1
POLL_INTERVAL_SEC=20
MONITOR_INTERVAL_SEC=120
ENV
  chmod 600 /opt/arendora/worker.env
  echo "создан /opt/arendora/worker.env — впишите SERVICE_ROLE_KEY!"
fi

echo "5/5 systemd…"
cp /opt/arendora/worker/arendora-worker.service /etc/systemd/system/arendora-worker.service
systemctl daemon-reload
systemctl enable arendora-worker
echo "Готово. Тест без последствий: cd /opt/arendora/automation && DRY_RUN=1 npm start"
echo "Запуск: systemctl start arendora-worker; логи: journalctl -u arendora-worker -f"
