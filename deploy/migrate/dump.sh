#!/usr/bin/env bash
# Дамп данных из облачного Supabase перед миграцией.
# Использование: ./dump.sh "postgresql://postgres:ПАРОЛЬ@db.ПРОЕКТ.supabase.co:5432/postgres"
# Если прямой хост не отвечает (нужен IPv4 add-on) — возьмите connection
# string из Session pooler (Dashboard → Database → Connection string).
# Требуется postgresql-client 16+: apt install -y postgresql-client-16
set -euo pipefail

CONN="${1:?укажите connection string облачного Supabase}"
OUT="$(dirname "$0")/../dump"
mkdir -p "$OUT"
STAMP=$(date +%Y%m%d-%H%M)

echo "1/2 Схема public (структура + данные + RLS/триггеры/RPC)…"
PGSSLMODE=require pg_dump "$CONN" \
  --schema=public --no-owner --no-privileges \
  -f "$OUT/public-$STAMP.sql"

echo "2/2 Пользователи auth.users (данные: пароли переезжают)…"
PGSSLMODE=require pg_dump "$CONN" \
  --schema=auth --table=auth.users --table=auth.identities \
  --data-only --column-inserts \
  -f "$OUT/auth-users-$STAMP.sql"

echo "Готово: файлы в $OUT/"
echo "Дальше: scp $OUT/*.sql root@НОВЫЙ_IP:/opt/migration/ и на сервере ./restore.sh /opt/migration"
echo "Сессии не переносим: на новом сервере свой JWT_SECRET — пользователи перелогинятся один раз."
