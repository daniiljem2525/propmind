-- Чат поддержки (v0) — идемпотентная миграция.
-- Анонимные и залогиненные пользователи пишут → CEO отвечает из админ-панели.

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  name text not null default '',
  email text not null default '',
  message text not null,
  response text,
  status text not null default 'new',
  is_demo boolean not null default false,
  session_id text,
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

-- Переписка чата группируется по session_id (idempotent)
alter table public.support_messages add column if not exists session_id text;
create index if not exists support_messages_session_idx on public.support_messages (session_id);

alter table public.support_messages enable row level security;

-- Пользователь видит свои сообщения
create policy support_messages_select_own on public.support_messages
  for select to authenticated
  using (auth.uid() = user_id);

-- Запись — только через сервисную роль (edge-функция)
revoke all on public.support_messages from authenticated, anon;
grant select on public.support_messages to authenticated;
grant all on public.support_messages to service_role;
grant all on public.support_messages to postgres;
