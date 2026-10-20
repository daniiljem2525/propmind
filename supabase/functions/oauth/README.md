# Соц-вход: Яндекс / VK / Mail.ru

Supabase Auth не поддерживает эти провайдеры, поэтому полный OAuth-цикл делает
edge-функция `oauth` (эта папка), а фронт обменивает её одноразовый `token_hash`
на обычную сессию на странице `/auth/social`.

## Как это работает

1. Кнопка на входе/регистрации открывает
   `{SUPABASE_URL}/functions/v1/oauth/start?provider=yandex|vk|mailru&redirect_to={app}/auth/social`.
2. `/start` подписывает state (HMAC, 10 минут) и редиректит на страницу
   согласия провайдера. Redirect URI провайдера —
   `{SUPABASE_URL}/functions/v1/oauth/callback?provider=<имя>`.
3. `/callback` обменивает код на токен, тянет профиль, находит или создаёт
   пользователя Supabase (сервис-роль, email подтверждён, метаданные как при
   обычной регистрации — триггер БД делает профиль-владельца) и через
   `admin.generateLink(magiclink)` выдаёт одноразовый `token_hash`.
4. Редирект на `{app}/auth/social?token_hash=...` → фронт вызывает
   `supabase.auth.verifyOtp({ type: "magiclink", token_hash })` → обычная сессия.

Пользователь, зарегистрированный по email, при соц-входе с тем же адресом
входит в тот же аккаунт (привязка по email).

## Настройка провайдеров

### Яндекс (oauth.yandex.ru)

1. Создайте приложение → «Данные доступа»: отметьте Яндекс Логин
   (доступ к email). Redirect URI:
   `https://<ref>.supabase.co/functions/v1/oauth/callback?provider=yandex`
2. Секреты:
   ```
   supabase secrets set YANDEX_CLIENT_ID=... YANDEX_CLIENT_SECRET=...
   ```

### VK (id.vk.com → VK ID, OAuth 2.1)

1. Создайте приложение VK ID, Redirect URI:
   `https://<ref>.supabase.co/functions/v1/oauth/callback?provider=vk`
2. Scope `vkid.personal_info` доступен сразу; `email` — по запросу доступа
   (одобрен — задайте секрет `VK_SCOPE=vkid.personal_info email`).
   Без email создаётся синтетический адрес `vk<id>@vk.local`.
3. Секреты: `VK_CLIENT_ID` / `VK_CLIENT_SECRET`.

### Mail.ru (o2.mail.ru)

1. Создайте приложение, сайт = ваш домен приложения, Redirect URI:
   `https://<ref>.supabase.co/functions/v1/oauth/callback?provider=mailru`
2. Scope `userinfo`. Секреты: `MAILRU_CLIENT_ID` / `MAILRU_CLIENT_SECRET`.

## Общие секреты

- `OAUTH_ALLOWED_REDIRECTS` — через запятую origins приложений, с которых
  разрешён вход, например:
  ```
  supabase secrets set OAUTH_ALLOWED_REDIRECTS=https://user.github.io/arendora,http://localhost:5173
  ```
  Без этого секрета соц-вход выключен (защита от подмены `redirect_to`:
  иначе одноразовый токен сессии можно было бы увести на чужой сайт).
  Значение `*` открывает всем — только для отладки.
- `OAUTH_STATE_SECRET` — опционально, отдельный секрет подписи state
  (по умолчанию SERVICE_ROLE_KEY).

## Деплой

JWT-проверку отключить обязательно: функцию вызывает браузер до входа.

```
supabase functions deploy oauth --no-verify-jwt
```

## Проверка

1. Откройте /login → кнопки Яндекс/VK/Mail.ru → полный цикл входа.
2. Повторный вход тем же способом — тот же аккаунт.
3. Email-аккаунт с тем же адресом — тот же аккаунт.
4. Повторно используемый `token_hash` отклоняется Supabase (одноразовый).
