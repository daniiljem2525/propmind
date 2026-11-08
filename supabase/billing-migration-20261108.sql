-- Биллинг ЮKassa (v0, тестовая среда) — идемпотентная миграция 08.11.2026.
-- Применение: psql -f billing-migration-20261108.sql (бэкап схемы перед применением).
-- profiles.plan уже существует (schema.sql, default 'free'); добавляем plan_until
-- и таблицу платежей. Запись в billing_payments и profiles.plan/plan_until —
-- ТОЛЬКО через сервисную роль (edge-функция billing): у authenticated нет
-- grant на запись — план не может выставить себе сам пользователь.

alter table public.profiles add column if not exists plan_until timestamptz;

create table if not exists public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'yookassa',
  provider_payment_id text unique,
  plan text not null,
  period text not null check (period in ('month', 'year')),
  amount numeric not null,
  currency text not null default 'RUB',
  status text not null default 'pending',
  raw jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

alter table public.billing_payments enable row level security;

drop policy if exists billing_payments_select_own on public.billing_payments;
create policy billing_payments_select_own on public.billing_payments
  for select to authenticated
  using (auth.uid() = user_id);

revoke all on public.billing_payments from authenticated, anon;
grant select on public.billing_payments to authenticated;
grant all on public.billing_payments to service_role;
grant all on public.billing_payments to postgres;
