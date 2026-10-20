#!/usr/bin/env bash
# Восстановление дампов на self-hosted Supabase (выполняется НА СЕРВЕРЕ).
# Использование: ./restore.sh /opt/migration
# Предполагается, что стек уже поднят (docker compose up -d)
# и /opt/arendora/stack/.env заполнен.
set -euo pipefail

DIR="${1:?укажите папку с дампами, например /opt/migration}"
STACK="/opt/arendora/stack"
DB_CONTAINER="supabase-db"
DB_USER="supabase_admin"
DB_NAME="postgres"

LATEST_PUBLIC=$(ls -t "$DIR"/public-*.sql 2>/dev/null | head -1)
LATEST_AUTH=$(ls -t "$DIR"/auth-users-*.sql 2>/dev/null | head -1)

[ -z "$LATEST_PUBLIC" ] && { echo "нет дампа public в $DIR"; exit 1; }

psql() { docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" "$@"; }

echo "1/5 Схема public (структура + данные)…"
psql -v ON_ERROR_STOP=1 < "$LATEST_PUBLIC"

if [ -n "$LATEST_AUTH" ]; then
  echo "2/5 Пользователи auth.users (триггер handle_new_user отключён —
        профили уже лежат в дампе public, иначе будут дубли)…"
  psql -c "ALTER TABLE auth.users DISABLE TRIGGER USER;"
  psql -v ON_ERROR_STOP=1 < "$LATEST_AUTH"
  psql -c "ALTER TABLE auth.users ENABLE TRIGGER USER;"
else
  echo "2/5 Дампа auth.users нет — пропускаю"
fi

echo "3/5 Realtime publication + вебхуки на свой edge-runtime…"
ENV_FILE="$STACK/.env"
PUSH_SECRET=$(grep -E '^PUSH_WEBHOOK_SECRET=' "$ENV_FILE" | cut -d= -f2-)
EMAIL_SECRET=$(grep -E '^EMAIL_WEBHOOK_SECRET=' "$ENV_FILE" | cut -d= -f2-)
ANON_KEY=$(grep -E '^ANON_KEY=' "$ENV_FILE" | cut -d= -f2-)
sed -e "s|__PUSH_WEBHOOK_SECRET__|$PUSH_SECRET|" \
    -e "s|__EMAIL_WEBHOOK_SECRET__|$EMAIL_SECRET|" \
    -e "s|__ANON_KEY__|$ANON_KEY|" \
    "$DIR/post-restore.sql" | psql -v ON_ERROR_STOP=1

echo "4/5 Перезагрузка схемы PostgREST…"
psql -c "NOTIFY pgrst, 'reload schema';" || true

echo "5/5 Готово."
echo "Проверка: войти в приложение (потребуется перелогин — сессии не переезжают)."
echo "Пароли переезжают вместе с auth.users."
