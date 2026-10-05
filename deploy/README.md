# Комплект перехода с облачного Supabase на self-hosted (VPS в РФ)

Цель: локализация персональных данных (152-ФЗ, ч. 5 ст. 18) при полном
сохранении функциональности. Клиент приложения меняет только SUPABASE_URL
и ключи — весь код (RLS, триггеры, RPC, Realtime) совместим без правок.

## Этапы

1. [ ] VPS куплен (2 vCPU / 2–4 ГБ / NVMe 20+ ГБ / Ubuntu 22.04, РФ)
2. [ ] Домен куплен, DNS: `supabase.arendora.ru` → IP сервера (A-запись)
3. [ ] `generate-keys.mjs` → сгенерированы JWT_SECRET и ключи
4. [ ] Клонирование стека + `.env` (см. ниже)
5. [ ] `docker compose up -d` → сервисы поднялись
6. [ ] `migrate/dump.sh` → дамп из облачного Supabase
7. [ ] `migrate/restore.sh` → восстановление на новый сервер
8. [ ] Caddy (HTTPS) → `docker compose -f caddy-compose.yml up -d`
9. [ ] Проверки: регистрация, вход, пуши, Realtime
10. [ ] Клиент переключён (config.js → новый URL), деплой
11. [ ] Старый Supabase держим включённым 3 дня как страховку → off
12. [ ] Уведомление в РКН + правка Политики конфиденциальности

## Установка стека (этап 4–5)

```bash
ssh root@IP
git clone --depth 1 https://github.com/supabase/supabase /opt/supabase
cd /opt/supabase/docker
cp .env.example .env   # заполнить значениями из generate-keys.mjs
docker compose pull && docker compose up -d
```

В `.env` критичные поля: POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY,
SERVICE_ROLE_KEY, SITE_URL=https://supabase.arendora.ru, API_EXTERNAL_URL.

Панель Studio (порт 3000) на слабом VPS (2 ГБ) отключить в compose
(сервис studio — удалить или профили profiles ограничить).

## HTTPS (этап 8)

Caddy автоматически получает сертификаты Let's Encrypt.
Скопировать Caddyfile, поправить домен, запустить `caddy-compose.yml`.

## Миграция данных (этап 6–7)

Дамп делается с машины, где стоит postgresql-client 16:

```bash
apt install -y postgresql-client-16
./migrate/dump.sh "postgresql://postgres:ПАРОЛЬ@db.СТАРЫЙ-ПРОЕКТ.supabase.co:5432/postgres"
scp dump/*.sql root@НОВЫЙ_IP:/opt/migration/
./migrate/restore.sh   # уже на новом сервере
```

Дамп включает: схему public (структура + данные), пользователей
auth.users, storage.objects. Пароли пользователей переезжают вместе
с auth.users — перелогин не требуется, если JWT_SECRET новый сервера
совпадает со старым (взять его в дашборде старого проекта: Settings →
API → JWT Settings, и указать в новом .env).

## Бэкапы

`backup.sh` вешается на cron сервера (ежедневно 04:00), хранит 14
ежедневных дампов в /var/backups/arendora. Проверка восстановления —
раз в месяц (см. restore/verify.sh).

## После переключения

- Старый проект: Settings → Pause project (не удалять 3 дня)
- РКН: уведомление об обработке ПДн (rkn.gov.ru)
- Privacy.jsx: раздел 6 переписать на «собственный сервер в РФ»
