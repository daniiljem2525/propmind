-- ============================================================
-- 2026-11-06: Заезды (посуточная сдача)
-- ============================================================
-- Долгосрок живёт в payments (график, напоминания); посуточно — в
-- bookings: гость, даты заезда/выезда, цена за ночь. Напоминания о
-- платежах на shortterm-объекты не приходят (см. scan_reminders).
-- Патч идемпотентный: create table if not exists + drop/create policy.

create table if not exists public.bookings (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  property_id   uuid references public.properties(id) on delete cascade,
  property_name text,
  guest_name    text not null default '',
  check_in      date,
  check_out     date,
  nightly_price numeric not null default 0,
  currency      text not null default 'RUB',
  notes         text,
  -- Демо-режим: та же маркировка, что у остальных коллекций клиента
  is_demo       boolean not null default false,
  created_date  timestamptz not null default now()
);
alter table public.bookings enable row level security;

drop policy if exists "bookings: владелец — полные права" on public.bookings;
create policy "bookings: владелец — полные права"
  on public.bookings for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create index if not exists bookings_owner_property_idx
  on public.bookings (owner_id, property_id, check_in);
