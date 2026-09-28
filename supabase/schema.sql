-- ============================================================
-- PropMind: схема Supabase (версия 3)
-- Порядок важен: сначала все таблицы, потом функции,
-- которые на них ссылаются. Идемпотентна — можно перезапускать.
-- Вставить целиком в SQL Editor → Run.
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- 1. Профили пользователей
-- ============================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  email       text,
  phone       text,
  role        text not null default 'tenant'
              check (role in ('owner', 'tenant', 'contractor')),
  created_date timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists "profiles: читаю свой" on public.profiles;
create policy "profiles: читаю свой"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles: обновляю свой" on public.profiles;
create policy "profiles: обновляю свой"
  on public.profiles for update
  using (auth.uid() = id);

drop policy if exists "profiles: владелец видит всех" on public.profiles;
create policy "profiles: владелец видит всех"
  on public.profiles for select
  using (public.is_platform_owner());

drop policy if exists "profiles: владелец управляет ролями" on public.profiles;
create policy "profiles: владелец управляет ролями"
  on public.profiles for update
  using (public.is_platform_owner());

-- ============================================================
-- 2. Объекты недвижимости
-- ============================================================
create table if not exists public.properties (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name        text not null,
  address     text not null default '',
  type        text not null default 'apartment',
  rent_amount numeric not null default 0,
  currency    text not null default 'RUB',
  status      text not null default 'vacant'
              check (status in ('vacant', 'rented', 'maintenance', 'inactive')),
  area_sqm    numeric,
  rooms       numeric,
  floor       numeric,
  photo_url   text,
  description text,
  tenant_id   uuid references public.profiles(id) on delete set null,
  tenant_name text,
  lease_start date,
  lease_end   date,
  created_date timestamptz not null default now()
);
alter table public.properties enable row level security;

drop policy if exists "properties: владелец — полные права" on public.properties;
create policy "properties: владелец — полные права"
  on public.properties for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "properties: жилец видит свою" on public.properties;
create policy "properties: жилец видит свою"
  on public.properties for select
  using (tenant_id = auth.uid());

-- ============================================================
-- 3. Платежи
-- ============================================================
create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  property_id   uuid references public.properties(id) on delete cascade,
  property_name text,
  tenant_id     uuid references public.profiles(id) on delete set null,
  tenant_name   text,
  amount        numeric not null default 0,
  currency      text not null default 'RUB',
  due_date      date,
  paid_date     date,
  status        text not null default 'pending'
                check (status in ('pending', 'paid', 'overdue', 'partial', 'cancelled')),
  period_month  numeric,
  period_year   numeric,
  payment_method text,
  notes         text,
  created_date  timestamptz not null default now()
);
alter table public.payments enable row level security;

drop policy if exists "payments: владелец — полные права" on public.payments;
create policy "payments: владелец — полные права"
  on public.payments for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "payments: жилец видит свои" on public.payments;
create policy "payments: жилец видит свои"
  on public.payments for select
  using (tenant_id = auth.uid());

-- ============================================================
-- 4. Приглашения (коды для жильцов и исполнителей)
-- ============================================================
create table if not exists public.invites (
  code        text primary key default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  role        text not null check (role in ('tenant', 'contractor')),
  property_id uuid references public.properties(id) on delete set null,
  used_by     uuid references public.profiles(id),
  created_date timestamptz not null default now()
);
alter table public.invites enable row level security;

drop policy if exists "invites: владелец управляет своими" on public.invites;
create policy "invites: владелец управляет своими"
  on public.invites for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ============================================================
-- 5. Заявки на обслуживание (двусторонние)
-- ============================================================
create table if not exists public.maintenance_requests (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  property_id    uuid references public.properties(id) on delete cascade,
  property_name  text,
  created_by     uuid references public.profiles(id),
  created_by_name text,
  title          text not null default '',
  description    text not null default '',
  urgency        text not null default 'medium'
                 check (urgency in ('low', 'medium', 'high', 'emergency')),
  status         text not null default 'new'
                 check (status in ('new', 'assigned', 'in_progress', 'done', 'closed', 'cancelled')),
  photo_url      text,
  source         text not null default 'manual'
                 check (source in ('manual', 'ai_bot', 'tenant_portal')),
  created_date   timestamptz not null default now(),

  -- блок исполнителя
  contractor_id     uuid references public.profiles(id) on delete set null,
  contractor_name   text,
  contractor_status text check (contractor_status in ('accepted', 'in_progress', 'done')),
  work_cost         numeric,
  work_photo_url    text,
  work_notes        text,
  started_at        timestamptz,
  completed_at      timestamptz
);
alter table public.maintenance_requests enable row level security;

drop policy if exists "requests: владелец — полные права" on public.maintenance_requests;
create policy "requests: владелец — полные права"
  on public.maintenance_requests for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "requests: жилец видит свои" on public.maintenance_requests;
create policy "requests: жилец видит свои"
  on public.maintenance_requests for select
  using (created_by = auth.uid());

drop policy if exists "requests: жилец создаёт по своей квартире" on public.maintenance_requests;
create policy "requests: жилец создаёт по своей квартире"
  on public.maintenance_requests for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.properties p
      where p.id = property_id and p.tenant_id = auth.uid()
    )
  );

drop policy if exists "requests: исполнитель видит свои" on public.maintenance_requests;
create policy "requests: исполнитель видит свои"
  on public.maintenance_requests for select
  using (contractor_id = auth.uid());

drop policy if exists "requests: исполнитель меняет свой блок" on public.maintenance_requests;
create policy "requests: исполнитель меняет свой блок"
  on public.maintenance_requests for update
  using (contractor_id = auth.uid())
  with check (contractor_id = auth.uid());

-- Политика объектов, зависящая от заявок (таблица уже создана)
drop policy if exists "properties: исполнитель видит объекты своих заявок" on public.properties;
create policy "properties: исполнитель видит объекты своих заявок"
  on public.properties for select
  using (
    exists (
      select 1 from public.maintenance_requests r
      where r.contractor_id = auth.uid() and r.property_id = id
    )
  );

-- ============================================================
-- 6. Документы
-- ============================================================
create table if not exists public.documents (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  property_id   uuid references public.properties(id) on delete cascade,
  property_name text,
  name          text not null,
  type          text not null default 'other',
  file_url      text not null default '',
  file_name     text,
  file_size     numeric,
  notes         text,
  created_date  timestamptz not null default now()
);
alter table public.documents enable row level security;

drop policy if exists "documents: владелец — полные права" on public.documents;
create policy "documents: владелец — полные права"
  on public.documents for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "documents: жилец видит документы своей квартиры" on public.documents;
create policy "documents: жилец видит документы своей квартиры"
  on public.documents for select
  using (
    exists (
      select 1 from public.properties p
      where p.id = property_id and p.tenant_id = auth.uid()
    )
  );

-- ============================================================
-- 7. Уведомления
-- ============================================================
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null default 'general',
  title      text not null,
  message    text not null default '',
  link       text,
  related_id uuid,
  is_read    boolean not null default false,
  created_date timestamptz not null default now()
);
alter table public.notifications enable row level security;

drop policy if exists "notifications: только свои" on public.notifications;
create policy "notifications: только свои"
  on public.notifications for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- 8. Триггер профиля — ПОСЛЕ создания всех таблиц, на которые
--    он ссылается (profiles, properties, invites)
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_invite public.invites%ROWTYPE;
  v_role   text := coalesce(new.raw_user_meta_data->>'role', 'tenant');
  v_name   text := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));
  v_code   text := new.raw_user_meta_data->>'invite_code';
begin
  if v_role = 'owner' then
    if not exists (select 1 from public.profiles where role = 'owner') then
      v_role := 'owner';
    else
      v_role := 'tenant';
    end if;
  elsif v_role in ('tenant', 'contractor') and v_code is not null then
    select * into v_invite from public.invites
     where code = v_code and used_by is null and role = v_role;
    if found then
      update public.invites set used_by = new.id where code = v_invite.code;
    else
      v_role := 'tenant';
    end if;
  end if;

  insert into public.profiles (id, full_name, email, role)
  values (new.id, v_name, new.email, v_role);

  if v_invite is not null and v_invite.property_id is not null then
    update public.properties
       set tenant_id = new.id, tenant_name = v_name, status = 'rented'
     where id = v_invite.property_id;
  end if;

  return new;
end;
$$;

-- Проверка владельца без рекурсии RLS (security definer)
create or replace function public.is_platform_owner()
returns boolean
language sql
security definer set search_path = public
stable as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'owner'
  );
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 9. Realtime
-- ============================================================
do $rt1$
begin
  alter publication supabase_realtime add table public.maintenance_requests;
exception when duplicate_object then null;
end $rt1$;
do $rt2$
begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $rt2$;
do $rt3$
begin
  alter publication supabase_realtime add table public.payments;
exception when duplicate_object then null;
end $rt3$;
do $rt4$
begin
  alter publication supabase_realtime add table public.properties;
exception when duplicate_object then null;
end $rt4$;

-- ============================================================
-- 10. Демо-аккаунт владельца: owner@propmind.test / secret123
-- ============================================================
do $seed$
declare
  v_id uuid;
begin
  if not exists (select 1 from auth.users where email = 'owner@propmind.test') then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change, email_change_token_new
    ) values (
      '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
      'owner@propmind.test', crypt('secret123', gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}',
      '{"role":"owner","full_name":"Тестовый Владелец"}',
      now(), now(), '', '', '', ''
    ) returning id into v_id;

    insert into auth.identities (
      id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_id, 'email', 'email',
      jsonb_build_object('sub', v_id::text, 'email', 'owner@propmind.test'),
      now(), now(), now()
    );
  end if;
end $seed$;
