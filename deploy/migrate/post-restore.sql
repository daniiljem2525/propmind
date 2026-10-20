-- ============================================================
-- post-restore.sql — выполняется ПОСЛЕ восстановления дампов.
-- 1) Realtime: pg_dump схемы public не переносит publications
--    (это не объекты схемы), без неё подписки postgres_changes
--    молча не получают события. Собираем publication заново.
-- 2) Вебхуки pg_net/pg_cron в дампе указывают на облачный проект
--    (хардкод в schema.sql) — переписываем на свой edge-runtime.
-- Плейсхолдеры __...__ подставляет restore.sh из .env.
-- ============================================================

-- --- 1. Publication для Realtime ---
DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles','properties','payments','invites',
    'maintenance_requests','request_comments','request_events',
    'documents','notifications','push_subscriptions',
    'automation_orders','profi_offers'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- --- 2. Пуш-вебхук: notifications INSERT → send-push ---
CREATE OR REPLACE FUNCTION public.notify_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  BEGIN
    PERFORM net.http_post(
      url := 'http://functions:9000/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-push-secret', '__PUSH_WEBHOOK_SECRET__'
      ),
      body := jsonb_build_object(
        'notification', jsonb_build_object(
          'user_id', new.user_id,
          'title', new.title,
          'message', new.message,
          'link', new.link
        )
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- пуш не должен ломать основную транзакцию
    RAISE WARNING 'notify_push failed: %', SQLERRM;
  END;
  RETURN new;
END $$;

-- --- 3. Еженедельный дайджест: cron → send-email ---
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'arendora-digest') THEN
    PERFORM cron.unschedule('arendora-digest');
  END IF;
  PERFORM cron.schedule(
    'arendora-digest',
    '0 9 * * 1',
    $cmd$
    SELECT net.http_post(
      url := 'http://functions:9000/send-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer __ANON_KEY__',
        'x-email-secret', '__EMAIL_WEBHOOK_SECRET__'
      ),
      body := jsonb_build_object('kind', 'digest')
    );
    $cmd$
  );
END $$;

NOTIFY pgrst, 'reload schema';
