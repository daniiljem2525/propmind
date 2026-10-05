#!/usr/bin/env bash
# Дамп данных из облачного Supabase перед миграцией.
# Использование: ./dump.sh "postgresql://postgres:ПАРОЛЬ@db.ПРОЕКТ.supabase.co:5432/postgres"
# Требуется postgresql-client 16+: apt install -y postgresql-client-16
set -euo pipefail

CONN="${1:?укажите connection string облачного Supabase}"
OUT="$(dirname "$0")/../dump"
mkdir -p "$OUT"
STAMP=$(date +%Y%m%d-%H%M)

echo "1/3 Схема public (структура + данные + RLS/триггеры/RPC)…"
PGSSLMODE=require pg_dump "$CONN" \
  --schema=public --no-owner --no-privileges \
  -f "$OUT/public-$STAMP.sql"

echo "2/3 Пользователи auth.users (только данные)…"
PGSSLMODE=require pg_dump "$CONN" \
  --schema=auth --table=auth.users --data-only --column-inserts \
  -f "$OUT/auth-users-$STAMP.sql"

echo "3/3 Идентичности и refresh-токены auth (данные)…"
PGSSLMODE=require pg_dump "$CONN" \
  --schema=auth --table=auth.identities --table=auth.sessions \
  --table=auth.refresh_tokens --data-only \
  -f "$OUT/auth-sessions-$STAMP.sql" || true

echo "Готово: файлы в $OUT/"
echo "ВАЖНО: JWT_SECRET нового сервера должен совпадать со старым"
echo "(дашборд старого проекта: Settings → API → JWT Settings),"
echo "тогда сессии и пароли пользователей переедут без перелогина."
