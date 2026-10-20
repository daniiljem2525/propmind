#!/usr/bin/env bash
# Заливает стек, edge-функции, миграции и код воркера на сервер.
# Запуск из корня репозитория:  ./deploy/upload.sh root@SERVER_IP
set -euo pipefail
SERVER="${1:?usage: ./deploy/upload.sh root@SERVER_IP}"
SSH="ssh -i ~/.ssh/arendora_deploy -o StrictHostKeyChecking=no"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

# --- 1. Стек: compose, Caddyfile, volumes, env-шаблон, edge-функции ---
mkdir -p "$STAGE/stack"
cp -r "$REPO/deploy/stack/." "$STAGE/stack/"
# функции репозитория (oauth, send-email, send-push) — рядом с роутером main
cp -r "$REPO/supabase/functions/." "$STAGE/stack/functions/"

# --- 2. Миграции и бэкап ---
mkdir -p "$STAGE/migration"
cp -r "$REPO/deploy/migrate/." "$STAGE/migration/"
cp "$REPO/deploy/backup.sh" "$STAGE/backup.sh"
cp "$REPO/deploy/init-server.sh" "$STAGE/init-server.sh"
cp -r "$REPO/deploy/worker" "$STAGE/worker"

echo "==> Заливка на $SERVER:/opt/arendora/"
$SSH "$SERVER" "mkdir -p /opt/arendora"
tar czf - -C "$STAGE" . | $SSH "$SERVER" "tar xzf - -C /opt/arendora"
# код воркера — без node_modules, профиля браузера и локальных логов
tar czf - -C "$REPO" \
  --exclude='automation/node_modules' \
  --exclude='automation/state' \
  --exclude='automation/*.log' \
  --exclude='automation/*.png' \
  automation | $SSH "$SERVER" "tar xzf - -C /opt/arendora"
$SSH "$SERVER" "chmod +x /opt/arendora/migration/*.sh /opt/arendora/backup.sh /opt/arendora/init-server.sh /opt/arendora/worker/*.sh"

echo "==> Готово. Дальше:"
echo "  1) ssh $SERVER 'bash /opt/arendora/init-server.sh'   (один раз)"
echo "  2) node deploy/generate-keys.mjs  → вывод вставить в /opt/arendora/stack/.env"
echo "     (дописать SMTP и, когда появятся, ключи соцвхода — см. stack/.env.example)"
echo "  3) ssh $SERVER 'cd /opt/arendora/stack && docker compose up -d'"
