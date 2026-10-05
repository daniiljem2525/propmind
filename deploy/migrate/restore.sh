#!/usr/bin/env bash
# Восстановление дампов на self-hosted Supabase (выполняется НА СЕРВЕРЕ).
# Использование: ./restore.sh /opt/migration
# Предполагается, что стек уже поднят (docker compose up -d).
set -euo pipefail

DIR="${1:?укажите папку с дампами, например /opt/migration}"
DB_CONTAINER="supabase-db"
DB_USER="supabase_admin"
DB_NAME="postgres"

LATEST_PUBLIC=$(ls -t "$DIR"/public-*.sql 2>/dev/null | head -1)
LATEST_AUTH=$(ls -t "$DIR"/auth-users-*.sql 2>/dev/null | head -1)
LATEST_SESSIONS=$(ls -t "$DIR"/auth-sessions-*.sql 2>/dev/null | head -1)

[ -z "$LATEST_PUBLIC" ] && { echo "нет дампа public в $DIR"; exit 1; }

echo "1/4 Схема public (структура + данные)…"
docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 \
  < "$LATEST_PUBLIC"

echo "2/4 Пользователи auth.users…"
[ -n "$LATEST_AUTH" ] && docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" \
  -v ON_ERROR_STOP=0 < "$LATEST_AUTH"

echo "3/4 Сессии и refresh-токены…"
[ -n "$LATEST_SESSIONS" ] && docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" \
  -v ON_ERROR_STOP=0 < "$LATEST_SESSIONS"

echo "4/4 Перезагрузка схемы PostgREST…"
docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" \
  -c "NOTIFY pgrst, 'reload schema';" || true

echo "Готово. Проверка: войти в приложение, данные и пользователи на месте."
echo "Если сессии не восстановились — пользователи перелогинятся один раз."
