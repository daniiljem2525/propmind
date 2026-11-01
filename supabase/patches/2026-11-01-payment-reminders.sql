-- ============================================================
-- 2026-11-01: напоминания о платежах + починка push-канала (NT-013)
-- Что делает:
--   1) scan_reminders(): добавлен блок «в день оплаты» (владельцу и жильцу),
--      tenant-вставки защищены exists по profiles (виртуальные жильцы
--      из таблицы tenants роняли INSERT по FK notifications.user_id).
--   2) notify_push(): вебхук переведён с мёртвого облачного URL на
--      локальный edge-runtime (http://functions:9000/send-push) —
--      до патча push не доставлялся (pg_net получал 403 forbidden).
-- Плейсхолдер __PUSH_WEBHOOK_SECRET__ подставляется из stack/.env.
-- Повторный запуск безопасен (create or replace).
-- ============================================================

create or replace function public.scan_reminders() returns void
language plpgsql security definer set search_path = public
as $$
begin
  -- Просроченные платежи (только долгосрок; посуточные объекты — без напоминаний)
  insert into public.notifications(user_id, type, title, message, link, related_id, is_demo)
  select p.owner_id, 'payment_overdue', 'Платёж просрочен',
         coalesce(p.tenant_name, p.property_name, 'Платёж') || ' — ' ||
           to_char(p.due_date, 'DD.MM.YYYY') || ', ' ||
           to_char(p.amount, 'FM999999990') || ' ' || coalesce(p.currency, 'RUB'),
         '/app/payments', p.id, p.is_demo
  from public.payments p
  left join public.properties pr on pr.id = p.property_id
  where p.status = 'pending' and p.due_date < current_date
    and coalesce(pr.rental_type, 'longterm') = 'longterm'
    and not exists (
      select 1 from public.notifications n
      where n.type = 'payment_overdue' and n.related_id = p.id
    );

  -- Ближайшие платежи: за 3 дня, только долгосрок — владельцу
  insert into public.notifications(user_id, type, title, message, link, related_id, is_demo)
  select p.owner_id, 'payment_upcoming', 'Скоро платёж',
         coalesce(p.tenant_name, p.property_name, 'Платёж') || ' — ' ||
           to_char(p.due_date, 'DD.MM.YYYY') || ', ' ||
           to_char(p.amount, 'FM999999990') || ' ' || coalesce(p.currency, 'RUB'),
         '/app/payments', p.id, p.is_demo
  from public.payments p
  left join public.properties pr on pr.id = p.property_id
  where p.status in ('pending', 'partial') and p.due_date = current_date + 3
    and coalesce(pr.rental_type, 'longterm') = 'longterm'
    and not exists (
      select 1 from public.notifications n
      where n.type = 'payment_upcoming' and n.related_id = p.id and n.user_id = p.owner_id
    );


  -- Ближайшие платежи: за 3 дня — жильцу (тоже только долгосрок;
  -- exists по profiles отсекает виртуальных жильцов без аккаунта —
  -- иначе FK-нарушение роняет весь INSERT)
  insert into public.notifications(user_id, type, title, message, link, related_id, is_demo)
  select p.tenant_id, 'payment_upcoming', 'Скоро платёж',
         'Аренда ' || coalesce(p.property_name, '') || ' — ' ||
           to_char(p.due_date, 'DD.MM.YYYY') || ', ' ||
           to_char(p.amount, 'FM999999990') || ' ' || coalesce(p.currency, 'RUB'),
         '/app/payments', p.id, p.is_demo
  from public.payments p
  left join public.properties pr on pr.id = p.property_id
  where p.tenant_id is not null
    and exists (select 1 from public.profiles pf where pf.id = p.tenant_id)
    and p.status in ('pending', 'partial') and p.due_date = current_date + 3
    and coalesce(pr.rental_type, 'longterm') = 'longterm'
    and not exists (
      select 1 from public.notifications n
      where n.type = 'payment_upcoming' and n.related_id = p.id and n.user_id = p.tenant_id
    );

  -- День оплаты: уведомление владельцу (только долгосрок)
  insert into public.notifications(user_id, type, title, message, link, related_id, is_demo)
  select p.owner_id, 'payment_due_today', 'Платёж сегодня',
         coalesce(p.tenant_name, p.property_name, 'Платёж') || ' — ' ||
           to_char(p.due_date, 'DD.MM.YYYY') || ', ' ||
           to_char(p.amount, 'FM999999990') || ' ' || coalesce(p.currency, 'RUB'),
         '/app/payments', p.id, p.is_demo
  from public.payments p
  left join public.properties pr on pr.id = p.property_id
  where p.status in ('pending', 'partial') and p.due_date = current_date
    and coalesce(pr.rental_type, 'longterm') = 'longterm'
    and not exists (
      select 1 from public.notifications n
      where n.type = 'payment_due_today' and n.related_id = p.id and n.user_id = p.owner_id
    );

  -- День оплаты: и жильцу с аккаунтом (виртуальные отсечены exists по profiles)
  insert into public.notifications(user_id, type, title, message, link, related_id, is_demo)
  select p.tenant_id, 'payment_due_today', 'Платёж сегодня',
         'Аренда ' || coalesce(p.property_name, '') || ' — ' ||
           to_char(p.due_date, 'DD.MM.YYYY') || ', ' ||
           to_char(p.amount, 'FM999999990') || ' ' || coalesce(p.currency, 'RUB'),
         '/app/payments', p.id, p.is_demo
  from public.payments p
  left join public.properties pr on pr.id = p.property_id
  where p.tenant_id is not null
    and exists (select 1 from public.profiles pf where pf.id = p.tenant_id)
    and p.status in ('pending', 'partial') and p.due_date = current_date
    and coalesce(pr.rental_type, 'longterm') = 'longterm'
    and not exists (
      select 1 from public.notifications n
      where n.type = 'payment_due_today' and n.related_id = p.id and n.user_id = p.tenant_id
    );

  -- Договоры, истекающие в ближайшие 30 дней (не про посуточных)
  insert into public.notifications(user_id, type, title, message, link, related_id, is_demo)
  select pr.owner_id, 'lease_expiring', 'Договор истекает',
         coalesce(pr.name, 'Объект') || ' — до ' || to_char(pr.lease_end, 'DD.MM.YYYY'),
         '/app/properties', pr.id, pr.is_demo
  from public.properties pr
  where pr.rental_type = 'longterm'
    and pr.lease_end is not null
    and pr.lease_end >= current_date
    and pr.lease_end <= current_date + 30
    and not exists (
      select 1 from public.notifications n
      where n.type = 'lease_expiring' and n.related_id = pr.id
        and n.created_date > now() - interval '20 days'
    );
end;
$$;

create or replace function public.notify_push()
returns trigger
language plpgsql
security definer set search_path = public, extensions
as $$
begin
  if new.is_demo then
    return new;
  end if;
  begin
    perform net.http_post(
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
  exception when others then
    -- сбой доставки push не должен откатывать действие пользователя
    raise warning 'push dispatch failed: %', sqlerrm;
  end;
  return new;
end;
$$;
