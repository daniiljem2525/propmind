-- 2026-11-01 (NT-013): еженедельный email-дайджест (cron.job 2) слал запрос
-- на мёртвый облачный URL. Переносим на локальный edge-runtime.
-- Плейсхолдер __EMAIL_WEBHOOK_SECRET__ подставляется из stack/.env.
-- Запускать отдельно от платежного патча; безопасно к повтору.
select cron.unschedule('arendora-digest')
where exists (select 1 from cron.job where jobname = 'arendora-digest');

select cron.schedule(
  'arendora-digest',
  '0 9 * * 1',
  $cmd$
  select net.http_post(
    url := 'http://functions:9000/send-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-email-secret', '__EMAIL_WEBHOOK_SECRET__'
    ),
    body := jsonb_build_object('kind', 'digest')
  );
  $cmd$
);
