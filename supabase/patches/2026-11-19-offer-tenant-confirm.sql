-- Жилец подтверждает время встречи с мастером Профи.ру.
-- Бот общается с мастером сам; жилец (тот, к кому приедут) видит отклики
-- своей заявки, принимает/отклоняет время и пишет мастеру через бота.
-- Владелец видит всё как раньше, уведомления приходят обоим.

-- Отклики Профи: жилец заявки читает отклики
drop policy if exists "profi_offers: жилец видит отклики своей заявки" on public.profi_offers;
create policy "profi_offers: жилец видит отклики своей заявки"
  on public.profi_offers for select
  using (
    exists (
      select 1 from public.maintenance_requests r
      where r.id = profi_offers.request_id
        and r.tenant_id = auth.uid()
    )
  );

-- Отклики Профи: жилец подтверждает/отклоняет время и пишет мастеру
-- (worker забирает текст из custom_reply и передаёт в чат Профи)
drop policy if exists "profi_offers: жилец подтверждает время" on public.profi_offers;
create policy "profi_offers: жилец подтверждает время"
  on public.profi_offers for update
  using (
    exists (
      select 1 from public.maintenance_requests r
      where r.id = profi_offers.request_id
        and r.tenant_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.maintenance_requests r
      where r.id = profi_offers.request_id
        and r.tenant_id = auth.uid()
    )
  );

-- Заказы Профи: жилец видит статус заказа своей заявки (только чтение)
drop policy if exists "automation_orders: жилец видит заказы своей заявки" on public.automation_orders;
create policy "automation_orders: жилец видит заказы своей заявки"
  on public.automation_orders for select
  using (
    exists (
      select 1 from public.maintenance_requests r
      where r.id = automation_orders.request_id
        and r.tenant_id = auth.uid()
    )
  );
