#!/usr/bin/env bash
# Сборка фронтенда и выкладка статики на сервер.
# Запуск из корня репозитория:
#   ANON_KEY=<anon-ключ из stack/.env> ./deploy/build-frontend.sh root@SERVER_IP
#
# Адрес API берётся из API_EXTERNAL_URL (по умолчанию https://api.arendora.ru).
# Пока домен не оплачен — задайте адрес явно, например:
#   API_EXTERNAL_URL=http://203.0.113.10 ANON_KEY=... ./deploy/build-frontend.sh root@IP
set -euo pipefail
SERVER="${1:?usage: ANON_KEY=... ./deploy/build-frontend.sh root@SERVER_IP}"
SSH="ssh -i ~/.ssh/arendora_deploy -o StrictHostKeyChecking=no"

: "${ANON_KEY:?задайте ANON_KEY (node deploy/generate-keys.mjs → /opt/arendora/stack/.env)}"

cd "$(dirname "$0")/.."
VITE_SUPABASE_URL="${API_EXTERNAL_URL:-https://api.arendora.ru}" \
VITE_SUPABASE_ANON_KEY="$ANON_KEY" \
npm run build

echo "==> Выкладка dist/ на $SERVER:/var/www/arendora/"
$SSH "$SERVER" "mkdir -p /var/www/arendora"
tar czf - -C dist . | $SSH "$SERVER" "tar xzf - -C /var/www/arendora"
echo "==> Готово: ${SITE_URL:-https://arendora.ru}"
