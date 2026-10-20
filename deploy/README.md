# Переезд Arendora на собственный сервер (reg.ru, РФ)

## Текущее состояние

**Стек описан и готов к запуску, но на VPS ещё не поднят.** Домен `arendora.ru`
не оплачен, DNS не настроен. Поэтому всё ниже — инструкция на момент, когда
домен появится; до этого проверять стек можно на временном имени
(см. «Домен ещё не оплачен»).

Цель: полное снятие с облачного Supabase — всё работает на своём VPS
(152-ФЗ, ч. 5 ст. 18). Код приложения меняет только адрес API и ключи.

**Почему в тексте встречается слово «Supabase»**: это название
открытого кода (Postgres + GoTrue + PostgREST + Realtime + Edge
Runtime), который мы запускаем НА НАШЕМ сервере из образов Docker.
Никаких обращений к облачному supabase.com нет и не будет — компоненты
общаются только между собой внутри сервера. Названия путей API
(`/rest/v1`, `/auth/v1`…) сохранены, чтобы не переписывать фронтенд.

- Домен задаётся **в одном месте** — `stack/.env`: `APP_DOMAIN` и `API_DOMAIN`
  (плюс производные `SITE_URL`, `API_EXTERNAL_URL`). `Caddyfile` и
  `docker-compose.yml` берут их из окружения, литералов в них нет.
- Изначально планировался `arendora.ru` (приложение) + `api.arendora.ru` (API).
- Стек: обрезанный self-hosted Supabase в Docker — Postgres, GoTrue
  (Auth), PostgREST, Realtime, Edge Runtime, Caddy. Kong/Studio/Storage/
  analytics выброшены: на сервере 2 ГБ RAM они не помещаются.
- Письма: собственный SMTP-хостинг домена arendora.ru.
- Воркер Профи.ру: systemd-сервис на том же сервере.

## Состав набора

```
deploy/
  generate-keys.mjs       генератор секретов (JWT, ключи API, пароль БД)
  upload.sh               заливка стека+функций+воркера на сервер
  build-frontend.sh       сборка dist с новым URL и выкладка в /var/www
  init-server.sh          подготовка чистого сервера (docker, swap, firewall, cron)
  backup.sh               ежедневный бэкап (cron 04:00, 14 копий)
  stack/
    docker-compose.yml    обрезанный стек
    Caddyfile             HTTPS: статика + маршрутизация API вместо Kong
    .env.example          шаблон секретов
    volumes/db/*.sql      init-скрипты БД (роли, webhooks, realtime) — из официального стека
    functions/            edge-функции: main/ (роутер edge-runtime), oauth/, send-email/, send-push/
  migrate/
    dump.sh               дамп из облачного Supabase
    restore.sh            восстановление на сервере (+ post-restore.sql)
    post-restore.sql      realtime publication + перезапись вебхуков на свой runtime
  worker/
    arendora-worker.service  systemd-юнит воркера
    install-worker.sh        установка воркера на сервере
```

## Домен ещё не оплачен

Пока DNS на `arendora.ru` не переключён, стек можно проверить на временном
имени, которое само резолвится в ваш IP:

```
APP_DOMAIN=arendora.203.0.113.10.nip.io
API_DOMAIN=api.arendora.203.0.113.10.nip.io
SITE_URL=https://arendora.203.0.113.10.nip.io
API_EXTERNAL_URL=https://api.arendora.203.0.113.10.nip.io
```

`nip.io` отдаёт А-запись на IP из имени, Caddy получает нормальный сертификат
Let's Encrypt, код менять не нужно. Когда домен оплатите — правите четыре
строки в `stack/.env`, перезапускаете `caddy` и пересобираете фронтенд:

```bash
API_EXTERNAL_URL=https://api.arendora.ru ANON_KEY=... ./deploy/build-frontend.sh root@IP
```

Только после этого имеет смысл чек-лист из раздела «Проверки».

## Порядок развертывания

### 0. Предварительно (вручную, вне сервера)

- [ ] **Оплатить и настроить домен** (сейчас не оплачен — до этого шага стек
      работает только на nip.io-имени, см. раздел выше)
- [ ] DNS у регистратора: A `arendora.ru` → IP, A `api.arendora.ru` → IP
- [ ] Из старого облачного проекта нужен ТОЛЬКО пароль БД (Dashboard →
      Project Settings → Database → connection string) — для дампа данных.
      Больше ничего: ключи API, VAPID и секреты вебхуков генерирует
      `generate-keys.mjs`, письма идут через ваш SMTP.
- [ ] Соцвход (Яндекс/ВК/Mail.ru) пока отключён — приложений нет.
      Когда создадите: вписать `*_CLIENT_ID`/`*_CLIENT_SECRET` в
      `/opt/arendora/stack/.env`, `docker compose up -d functions`, и
      добавить redirect `https://api.arendora.ru/functions/v1/oauth/callback`
      в кабинках провайдеров. Кнопки соцвхода до этого просто не проходят.
- [ ] SMTP-данные почтового хостинга: хост, порт, логин, пароль ящика
      (например `noreply@arendora.ru`)

### 1. Подготовка сервера

```bash
./deploy/upload.sh root@SERVER_IP              # заливает всё в /opt/arendora
ssh root@SERVER_IP 'bash /opt/arendora/init-server.sh'
```

### 2. Секреты и запуск стека

```bash
node deploy/generate-keys.mjs                  # локально, ОДИН раз
# вывод вставить в /opt/arendora/stack/.env (скопировать из .env.example),
# дописать SMTP; ключи соцвхода — когда появятся приложения у провайдеров
ssh root@SERVER_IP 'cd /opt/arendora/stack && docker compose up -d'
ssh root@SERVER_IP 'docker compose -f /opt/arendora/stack/docker-compose.yml ps'
```

Все сервисы должны быть healthy. Realtime поднимается 20–60 секунд.

### 3. Перенос данных

Локально (или на любой машине с postgresql-client 16+):

```bash
apt install -y postgresql-client-16
./deploy/migrate/dump.sh "postgresql://postgres:ПАРОЛЬ@db.СТАРЫЙ-ПРОЕКТ.supabase.co:5432/postgres"
# если прямой хост закрыт — connection string из Session pooler
scp deploy/dump/*.sql root@SERVER_IP:/opt/migration/
```

На сервере:

```bash
bash /opt/arendora/migration/restore.sh /opt/migration
```

restore.sh восстанавливает public + auth.users (отключая триггер
`handle_new_user`, иначе профили задвоятся), собирает publication
`supabase_realtime` (pg_dump её не переносит!) и переписывает вебхуки
pg_net/pg_cron с облачного проекта на свой edge-runtime.

### 4. Фронтенд

```bash
ANON_KEY=<из stack/.env> ./deploy/build-frontend.sh root@SERVER_IP
```

### 5. Воркер Профи.ру

Профиль браузера (`automation/state/profi-profile`) — скопировать с
Windows-машины на сервер: `scp -r automation/state/profi-profile root@SERVER_IP:/opt/arendora/worker/`
(секретная папка сессии Профи.ру — не публиковать).

```bash
ssh root@SERVER_IP 'bash /opt/arendora/worker/install-worker.sh'
# вписать SERVICE_ROLE_KEY в /opt/arendora/worker.env
ssh root@SERVER_IP 'systemctl start arendora-worker'
ssh root@SERVER_IP 'journalctl -u arendora-worker -f'
```

Если Профи.ру требует SMS-подтверждение — `NeedsLoginError`, тогда
однократно интерактивно: `cd /opt/arendora/automation && HEADLESS=0 npm run login`.

### 6. Виджет iPhone (Scriptable)

`widget/ArendoraWidget.js`: вписать новый anon-ключ (EMAIL/PASSWORD
уже заполнены).

## Проверки

- [ ] `https://<APP_DOMAIN>` открывается, сертификат валиден
- [ ] регистрация/вход по email, данные (объекты/платежи) на месте
- [ ] realtime: два окна — изменение в одном мгновенно в другом
- [ ] соцвход Яндекс/ВК/Mail.ru
- [ ] приглашение жильцу приходит письмом (через ваш SMTP)
- [ ] push-уведомления (тест из приложения)
- [ ] напоминания pg_cron: `cron.job` содержит `arendora-reminders` и `arendora-digest`
- [ ] воркер: тестовая заявка проходит в DRY_RUN, затем боевой прогон

## После переключения

- [ ] Старый облачный проект Supabase: Settings → Pause (не удалять 3 дня)
- [ ] Раздел 6/8 Privacy.jsx уже описывает размещение в РФ (правки внесены)
- [ ] Уведомление РКН об обработке ПДн (rkn.gov.ru)

## Эксплуатация

- Логи: `docker compose logs -f <сервис>`, воркер: `journalctl -u arendora-worker`
- Бэкапы: `/var/backups/arendora/` (14 дней), проверка восстановления — раз в месяц
- Обновление стека: `docker compose pull && docker compose up -d`
- RAM: стек ~700–900 МБ + Chromium ~300–500 МБ; swap 2 ГБ обязателен
