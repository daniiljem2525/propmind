#!/usr/bin/env bash
# Ежедневный бэкап self-hosted Supabase (вешается на cron).
# Cron: 0 4 * * * /opt/arendora/backup.sh
# Хранит 14 ежедневных дампов в /var/backups/arendora.
set -euo pipefail

OUT=/var/backups/arendora
STAMP=$(date +%Y%m%d-%H%M)
KEEP=14

mkdir -p "$OUT"
docker exec supabase-db pg_dump -U supabase_admin -d postgres \
  --schema=public --no-owner \
  > "$OUT/public-$STAMP.sql"
docker exec supabase-db pg_dump -U supabase_admin -d postgres \
  --schema=auth --table=auth.users --data-only \
  > "$OUT/auth-$STAMP.sql"

# Ротация: старше 14 дампов — удалить
ls -1t "$OUT"/public-*.sql | tail -n +$((KEEP + 1)) | xargs -r rm --
ls -1t "$OUT"/auth-*.sql | tail -n +$((KEEP + 1)) | xargs -r rm --

echo "бэкап готов: $OUT/public-$STAMP.sql"
