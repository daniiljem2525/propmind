-- ============================================================
-- PropMind: схема Supabase (версия 4)
-- Порядок важен: сначала все таблицы, потом функции,
-- которые на них ссылаются. Идемпотентна — можно перезапускать
-- поверх версии 3 (новые колонки добавляются через add column if not exists).
-- Вставить целиком в SQL Editor → Run.
-- ============================================================

create extension if not exists pgcrypto;

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
-- Тариф аккаунта: free | start | pro | business | individual.
-- Назначается администратором платформы через админ-панель.
alter table public.profiles add column if not exists plan text not null default 'free';

-- Персональный код арендодателя: жилец регистрируется по нему (или по
-- ссылке /register?ref=КОД) и попадает в воркспейс этого арендодателя.
alter table public.profiles add column if not exists invite_code text;
create unique index if not exists profiles_invite_code_idx
  on public.profiles(invite_code) where invite_code is not null;

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

-- Жилец видит контакт арендодателя: по своей квартире ИЛИ по приглашению
drop policy if exists "profiles: жилец видит арендодателя своей квартиры" on public.profiles;
create policy "profiles: жилец видит арендодателя своей квартиры"
  on public.profiles for select
  using (
    exists (
      select 1 from public.properties p
      where p.owner_id = id and p.tenant_id = auth.uid()
    )
    or exists (
      select 1 from public.invites i
      where i.owner_id = id and i.used_by = auth.uid()
    )
  );

-- Приглашённый видит своё приглашение (связь с арендодателем до выдачи квартиры)
drop policy if exists "invites: участник видит своё приглашение" on public.invites;
create policy "invites: участник видит своё приглашение"
  on public.invites for select
  using (used_by = auth.uid());

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
--    Жизненный цикл: new → assigned → in_progress → done → closed,
--    плюс cancelled. Отклонение исполнителя возвращает заявку в new.
--    Все смены статусов — через RPC (см. раздел 5в), не напрямую.
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
  category       text not null default 'other',
  urgency        text not null default 'medium'
                 check (urgency in ('low', 'medium', 'high', 'emergency')),
  status         text not null default 'new'
                 check (status in ('new', 'assigned', 'in_progress', 'done', 'closed', 'cancelled')),
  photo_url      text,
  source         text not null default 'manual'
                 check (source in ('manual', 'ai_bot', 'tenant_portal')),
  tenant_id      uuid references public.profiles(id) on delete set null,
  tenant_name    text,
  scheduled_at   timestamptz,
  estimate_cost  numeric,
  cancel_reason  text,
  created_date   timestamptz not null default now(),

  -- блок исполнителя
  contractor_id     uuid references public.profiles(id) on delete set null,
  contractor_name   text,
  contractor_status text check (contractor_status in ('accepted', 'in_progress', 'done')),
  work_cost         numeric,
  work_photo_url    text,
  work_notes        text,
  assigned_at       timestamptz,
  started_at        timestamptz,
  completed_at      timestamptz,
  closed_at         timestamptz
);

-- Новые колонки для установок поверх версии 3 (create table их уже включает)
alter table public.maintenance_requests add column if not exists category text not null default 'other';
alter table public.maintenance_requests add column if not exists tenant_id uuid references public.profiles(id) on delete set null;
alter table public.maintenance_requests add column if not exists tenant_name text;
alter table public.maintenance_requests add column if not exists scheduled_at timestamptz;
alter table public.maintenance_requests add column if not exists estimate_cost numeric;
alter table public.maintenance_requests add column if not exists cancel_reason text;
alter table public.maintenance_requests add column if not exists assigned_at timestamptz;
alter table public.maintenance_requests add column if not exists closed_at timestamptz;

alter table public.maintenance_requests drop constraint if exists requests_category_check;
alter table public.maintenance_requests add constraint requests_category_check
  check (category in ('plumbing', 'electrical', 'appliances', 'furniture', 'other'));

create index if not exists requests_property_idx on public.maintenance_requests(property_id);
create index if not exists requests_contractor_idx on public.maintenance_requests(contractor_id);

alter table public.maintenance_requests enable row level security;

drop policy if exists "requests: владелец — полные права" on public.maintenance_requests;
create policy "requests: владелец — полные права"
  on public.maintenance_requests for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Жилец видит заявки, которые подал сам, которые заведены на него
-- и любые заявки по своей квартире (в т.ч. созданные владельцем вручную)
drop policy if exists "requests: жилец видит свои" on public.maintenance_requests;
drop policy if exists "requests: жилец видит свои заявки" on public.maintenance_requests;
create policy "requests: жилец видит свои заявки"
  on public.maintenance_requests for select
  using (
    created_by = auth.uid()
    or tenant_id = auth.uid()
    or exists (
      select 1 from public.properties p
      where p.id = property_id and p.tenant_id = auth.uid()
    )
  );

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

-- Исполнитель меняет заявку только через RPC (раздел 5в): прямые
-- обновления ему запрещены — снимаем политику прямой записи.
drop policy if exists "requests: исполнитель меняет свой блок" on public.maintenance_requests;

-- Владелец заявки = владелец объекта, даже если заявку создал жилец.
-- Default auth.uid() проставил бы в owner_id жильца — и владелец
-- объекта не увидел бы заявку. Переназначаем до записи строки.
create or replace function public.set_request_owner()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_tenant uuid;
begin
  if new.property_id is not null and new.created_by is not null and new.created_by = auth.uid() then
    select p.owner_id, p.tenant_id into v_owner, v_tenant
    from public.properties p where p.id = new.property_id;

    if v_tenant = auth.uid() and v_owner is not null then
      new.owner_id := v_owner;
      if new.tenant_id is null then
        new.tenant_id := v_tenant;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_request_insert_owner on public.maintenance_requests;
create trigger on_request_insert_owner
  before insert on public.maintenance_requests
  for each row execute function public.set_request_owner();

-- ВАЖНО: политики на properties НЕ должны ссылаться на maintenance_requests:
-- requests → properties → requests даёт бесконечную рекурсию RLS (42P17).
-- Исполнителю достаточно property_name из самой заявки.
drop policy if exists "properties: исполнитель видит объекты своих заявок" on public.properties;

-- ============================================================
-- 5а. Комментарии и события заявок
--     Видят и пишут только участники заявки
--     (владелец, жилец, исполнитель).
-- ============================================================
create table if not exists public.request_comments (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.maintenance_requests(id) on delete cascade,
  author_id   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  author_name text not null default '',
  author_role text not null default 'owner'
              check (author_role in ('owner', 'tenant', 'contractor', 'system')),
  body        text not null,
  created_date timestamptz not null default now()
);

create table if not exists public.request_events (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.maintenance_requests(id) on delete cascade,
  actor_id    uuid references public.profiles(id) on delete set null,
  actor_name  text not null default '',
  actor_role  text not null default 'system',
  event       text not null,
  details     text not null default '',
  created_date timestamptz not null default now()
);

create index if not exists request_comments_request_idx on public.request_comments(request_id, created_date);
create index if not exists request_events_request_idx on public.request_events(request_id, created_date);

alter table public.request_comments enable row level security;
alter table public.request_events enable row level security;

-- Участник заявки: владелец, автор, жилец объекта или назначенный исполнитель
create or replace function public.is_request_participant(p_request uuid)
returns boolean
language sql
security definer set search_path = public
stable as $$
  select exists (
    select 1 from public.maintenance_requests r
    where r.id = p_request
      and (
        r.owner_id = auth.uid()
        or r.created_by = auth.uid()
        or r.tenant_id = auth.uid()
        or r.contractor_id = auth.uid()
      )
  );
$$;

drop policy if exists "comments: участник заявки" on public.request_comments;
create policy "comments: участник заявки"
  on public.request_comments for all
  using (public.is_request_participant(request_id))
  with check (
    author_id = auth.uid()
    and public.is_request_participant(request_id)
  );

drop policy if exists "events: участник заявки" on public.request_events;
create policy "events: участник заявки"
  on public.request_events for all
  using (public.is_request_participant(request_id))
  with check (public.is_request_participant(request_id));

-- ============================================================
-- 5б. Триггер заявок: журнал событий + уведомления участникам.
--     Пишет события при создании и смене статуса, рассылает
--     уведомления адресатам (кроме автора действия).
-- ============================================================
create or replace function public.on_request_changed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_actor_role text;
  v_event text;
  v_details text := '';
  v_title text;
begin
  select full_name, role into v_actor_name, v_actor_role
  from public.profiles where id = v_actor;

  if tg_op = 'INSERT' then
    insert into public.request_events(request_id, actor_id, actor_name, actor_role, event, details)
    values (new.id, v_actor, coalesce(v_actor_name, ''), coalesce(v_actor_role, 'system'), 'created', '');

    -- Жилец подал заявку → уведомляем владельца
    if new.created_by is not null and new.created_by <> new.owner_id then
      insert into public.notifications(user_id, type, title, message, link, related_id)
      values (
        new.owner_id, 'maintenance_new', 'Новая заявка',
        coalesce(nullif(new.title, ''), left(new.description, 60)) || ' — ' || coalesce(new.property_name, ''),
        '/app/maintenance', new.id
      );
    end if;
    return new;
  end if;

  -- UPDATE: реагируем только на смену статуса
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_title := coalesce(nullif(new.title, ''), left(new.description, 60));
  v_event := case new.status
    when 'assigned'    then 'assigned'
    when 'in_progress' then 'accepted'
    when 'done'        then 'reported'
    when 'closed'      then 'closed'
    when 'cancelled'   then 'cancelled'
    when 'new'         then 'declined'
    else new.status
  end;
  if new.status = 'done' and new.work_cost is not null then
    v_details := 'Стоимость: ' || to_char(new.work_cost, 'FM999999990') || ' ₽';
  elsif new.status = 'cancelled' and new.cancel_reason is not null then
    v_details := 'Причина: ' || new.cancel_reason;
  end if;

  insert into public.request_events(request_id, actor_id, actor_name, actor_role, event, details)
  values (new.id, v_actor, coalesce(v_actor_name, ''), coalesce(v_actor_role, 'system'), v_event, v_details);

  if new.status = 'assigned' then
    if new.contractor_id is not null and new.contractor_id <> v_actor then
      insert into public.notifications(user_id, type, title, message, link, related_id)
      values (new.contractor_id, 'maintenance_assigned', 'Новая работа',
              v_title || ' — ' || coalesce(new.property_name, ''), '/app', new.id);
    end if;

  elsif new.status = 'in_progress' then
    if new.owner_id <> v_actor then
      insert into public.notifications(user_id, type, title, message, link, related_id)
      values (new.owner_id, 'maintenance_updated', 'Исполнитель принял заявку',
              v_title || ' — ' || coalesce(new.property_name, ''), '/app/maintenance', new.id);
    end if;
    if new.created_by is not null and new.created_by <> v_actor then
      insert into public.notifications(user_id, type, title, message, link, related_id)
      values (new.created_by, 'maintenance_updated', 'Заявка в работе',
              v_title || ' — ' || coalesce(new.property_name, ''), '/app', new.id);
    end if;
    if new.tenant_id is not null and new.tenant_id <> v_actor
       and (new.created_by is null or new.tenant_id <> new.created_by) then
      insert into public.notifications(user_id, type, title, message, link, related_id)
      values (new.tenant_id, 'maintenance_updated', 'Заявка в работе',
              v_title || ' — ' || coalesce(new.property_name, ''), '/app', new.id);
    end if;

  elsif new.status = 'done' then
    if new.owner_id <> v_actor then
      insert into public.notifications(user_id, type, title, message, link, related_id)
      values (new.owner_id, 'maintenance_updated', 'Работа выполнена — принять',
              v_title || ' — ' || coalesce(new.property_name, ''), '/app/maintenance', new.id);
    end if;
    if new.created_by is not null and new.created_by <> v_actor then
      insert into public.notifications(user_id, type, title, message, link, related_id)
      values (new.created_by, 'maintenance_updated', 'Работа выполнена',
              v_title || ' — ' || coalesce(new.property_name, ''), '/app', new.id);
    end if;
    if new.tenant_id is not null and new.tenant_id <> v_actor
       and (new.created_by is null or new.tenant_id <> new.created_by) then
      insert into public.notifications(user_id, type, title, message, link, related_id)
      values (new.tenant_id, 'maintenance_updated', 'Работа выполнена',
              v_title || ' — ' || coalesce(new.property_name, ''), '/app', new.id);
    end if;

  elsif new.status = 'closed' then
    if new.created_by is not null and new.created_by <> v_actor then
      insert into public.notifications(user_id, type, title, message, link, related_id)
      values (new.created_by, 'maintenance_updated', 'Заявка закрыта',
              v_title || ' — ' || coalesce(new.property_name, ''), '/app', new.id);
    end if;
    if new.tenant_id is not null and new.tenant_id <> v_actor
       and (new.created_by is null or new.tenant_id <> new.created_by) then
      insert into public.notifications(user_id, type, title, message, link, related_id)
      values (new.tenant_id, 'maintenance_updated', 'Заявка закрыта',
              v_title || ' — ' || coalesce(new.property_name, ''), '/app', new.id);
    end if;
    if new.contractor_id is not null and new.contractor_id <> v_actor then
      insert into public.notifications(user_id, type, title, message, link, related_id)
      values (new.contractor_id, 'maintenance_updated', 'Работа принята владельцем',
              v_title || ' — ' || coalesce(new.property_name, ''), '/app', new.id);
    end if;

  elsif new.status = 'cancelled' then
    if new.created_by is not null and new.created_by <> v_actor then
      insert into public.notifications(user_id, type, title, message, link, related_id)
      values (new.created_by, 'maintenance_updated', 'Заявка отменена',
              v_title || ' — ' || coalesce(new.property_name, ''), '/app', new.id);
    end if;
    if new.tenant_id is not null and new.tenant_id <> v_actor
       and (new.created_by is null or new.tenant_id <> new.created_by) then
      insert into public.notifications(user_id, type, title, message, link, related_id)
      values (new.tenant_id, 'maintenance_updated', 'Заявка отменена',
              v_title || ' — ' || coalesce(new.property_name, ''), '/app', new.id);
    end if;
    if new.contractor_id is not null and new.contractor_id <> v_actor then
      insert into public.notifications(user_id, type, title, message, link, related_id)
      values (new.contractor_id, 'maintenance_updated', 'Заявка отменена',
              v_title || ' — ' || coalesce(new.property_name, ''), '/app', new.id);
    end if;

  elsif new.status = 'new' and old.status = 'assigned' then
    -- Исполнитель отклонил назначение
    if new.owner_id <> v_actor then
      insert into public.notifications(user_id, type, title, message, link, related_id)
      values (new.owner_id, 'maintenance_new', 'Исполнитель отклонил заявку',
              v_title || ' — ' || coalesce(new.property_name, ''), '/app/maintenance', new.id);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_request_changed on public.maintenance_requests;
create trigger on_request_changed
  after insert or update on public.maintenance_requests
  for each row execute function public.on_request_changed();

-- ============================================================
-- 5в. RPC смены статусов (security definer).
--     Единственный путь менять статус: проверяют права и переходы.
--     События и уведомления пишет триггер on_request_changed.
--     Все возвращают { ok: boolean, error: text? }.
-- ============================================================

-- Владелец назначает исполнителя (только из «new»)
create or replace function public.assign_request(
  p_request uuid, p_contractor uuid,
  p_scheduled timestamptz default null, p_estimate numeric default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_req public.maintenance_requests;
  v_name text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select * into v_req from public.maintenance_requests where id = p_request;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_req.owner_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if v_req.status <> 'new' then
    return jsonb_build_object('ok', false, 'error', 'wrong_status');
  end if;

  select full_name into v_name
  from public.profiles where id = p_contractor and role = 'contractor';
  if v_name is null then
    return jsonb_build_object('ok', false, 'error', 'contractor_not_found');
  end if;

  update public.maintenance_requests set
    status = 'assigned',
    contractor_id = p_contractor,
    contractor_name = v_name,
    contractor_status = null,
    assigned_at = now(),
    scheduled_at = p_scheduled,
    estimate_cost = p_estimate
  where id = p_request;

  return jsonb_build_object('ok', true);
end;
$$;

-- Исполнитель отклоняет назначение — заявка возвращается в «новые»
create or replace function public.decline_request(p_request uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_req public.maintenance_requests;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select * into v_req from public.maintenance_requests where id = p_request;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_req.contractor_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if v_req.status <> 'assigned' then
    return jsonb_build_object('ok', false, 'error', 'wrong_status');
  end if;

  update public.maintenance_requests set
    status = 'new',
    contractor_id = null,
    contractor_name = null,
    contractor_status = null,
    assigned_at = null
  where id = p_request;

  return jsonb_build_object('ok', true);
end;
$$;

-- Исполнитель принимает работу
create or replace function public.accept_request(p_request uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_req public.maintenance_requests;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select * into v_req from public.maintenance_requests where id = p_request;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_req.contractor_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if v_req.status <> 'assigned' then
    return jsonb_build_object('ok', false, 'error', 'wrong_status');
  end if;

  update public.maintenance_requests set
    status = 'in_progress',
    contractor_status = 'accepted',
    started_at = coalesce(started_at, now())
  where id = p_request;

  return jsonb_build_object('ok', true);
end;
$$;

-- Исполнитель сдаёт работу: фото, стоимость, заметки
create or replace function public.report_work(
  p_request uuid,
  p_cost numeric default 0, p_photo text default null, p_notes text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_req public.maintenance_requests;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select * into v_req from public.maintenance_requests where id = p_request;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_req.contractor_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if v_req.status <> 'in_progress' then
    return jsonb_build_object('ok', false, 'error', 'wrong_status');
  end if;

  update public.maintenance_requests set
    status = 'done',
    contractor_status = 'done',
    work_cost = p_cost,
    work_photo_url = nullif(p_photo, ''),
    work_notes = p_notes,
    completed_at = now()
  where id = p_request;

  return jsonb_build_object('ok', true);
end;
$$;

-- Владелец принимает работу (из «done»; из активных — если сделал всё сам)
create or replace function public.close_request(p_request uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_req public.maintenance_requests;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select * into v_req from public.maintenance_requests where id = p_request;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_req.owner_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if v_req.status not in ('new', 'assigned', 'in_progress', 'done') then
    return jsonb_build_object('ok', false, 'error', 'wrong_status');
  end if;

  update public.maintenance_requests set
    status = 'closed',
    closed_at = now()
  where id = p_request;

  return jsonb_build_object('ok', true);
end;
$$;

-- Отмена: владелец — любую активную; жилец — свою, пока она «новая»
create or replace function public.cancel_request(p_request uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_req public.maintenance_requests;
  v_is_owner boolean;
  v_is_tenant boolean;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select * into v_req from public.maintenance_requests where id = p_request;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  v_is_owner := v_req.owner_id = auth.uid();
  v_is_tenant := v_req.created_by = auth.uid() or v_req.tenant_id = auth.uid();

  if v_is_owner then
    if v_req.status in ('closed', 'cancelled') then
      return jsonb_build_object('ok', false, 'error', 'wrong_status');
    end if;
  elsif v_is_tenant then
    if v_req.status <> 'new' then
      return jsonb_build_object('ok', false, 'error', 'wrong_status');
    end if;
  else
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  update public.maintenance_requests set
    status = 'cancelled',
    cancel_reason = p_reason,
    closed_at = now()
  where id = p_request;

  return jsonb_build_object('ok', true);
end;
$$;

-- Применение кода приглашения после регистрации:
-- назначает роль, привязывает жильца к объекту, помечает код использованным
create or replace function public.claim_invite(p_code text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_inv public.invites;
  v_uid uuid := auth.uid();
  v_property uuid;
  v_owner_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  -- Владелец воркспейса не подключается по чужому коду:
  -- иначе claim понизил бы его роль до жильца
  if exists (select 1 from public.profiles where id = v_uid and role = 'owner') then
    return jsonb_build_object('ok', false, 'error', 'owner_claim');
  end if;

  select * into v_inv from public.invites where code = upper(trim(p_code));
  if not found then
    -- Персональный код арендодателя: подключаем жильца к его воркспейсу
    select id into v_owner_id
    from public.profiles
    where invite_code = upper(trim(p_code)) and role = 'owner'
    limit 1;
    if v_owner_id is null then
      return jsonb_build_object('ok', false, 'error', 'invite_not_found');
    end if;

    update public.profiles set role = 'tenant' where id = v_uid;
    if not exists (
      select 1 from public.invites where owner_id = v_owner_id and used_by = v_uid
    ) then
      insert into public.invites (code, owner_id, role, used_by)
      values (
        upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
        v_owner_id, 'tenant', v_uid
      )
      on conflict (code) do nothing;
    end if;

    return jsonb_build_object('ok', true, 'role', 'tenant', 'owner_id', v_owner_id);
  end if;
  if v_inv.used_by is not null and v_inv.used_by <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'invite_used');
  end if;

  update public.profiles set role = v_inv.role where id = v_uid;

  v_property := v_inv.property_id;
  if v_inv.role = 'tenant' and v_property is not null then
    update public.properties set
      tenant_id = v_uid,
      tenant_name = (select full_name from public.profiles where id = v_uid),
      status = 'rented'
    where id = v_property and owner_id = v_inv.owner_id;
  end if;

  update public.invites set used_by = v_uid where code = v_inv.code;

  return jsonb_build_object('ok', true, 'role', v_inv.role, 'property_id', v_property);
end;
$$;

-- ============================================================
-- 5г. Подписки на push-уведомления (Web Push)
-- ============================================================
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_date timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;

drop policy if exists "push: только свои подписки" on public.push_subscriptions;
create policy "push: только свои подписки"
  on public.push_subscriptions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

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
-- 7б. Push-доставка: при вставке уведомления триггер через pg_net
--     вызывает Edge Function send-push. Расширение создаётся здесь:
--     без него любая вставка в notifications падает целиком.
-- ============================================================
create extension if not exists pg_net;

create or replace function public.notify_push()
returns trigger
language plpgsql
security definer set search_path = public, extensions
as $$
begin
  begin
    perform extensions.net.http_post(
      url := 'https://bhxwpkplqjzhfqwckine.supabase.co/functions/v1/bright-processor',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-push-secret', 'pm-webhook-9f2XkLq7Vt'
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

drop trigger if exists push_notify_trigger on public.notifications;
create trigger push_notify_trigger
  after insert on public.notifications
  for each row execute function public.notify_push();

-- Одна подписка (endpoint) = одно устройство, а аккаунтов на телефоне
-- может быть несколько. Прошлая запись могла принадлежать другому юзеру —
-- по RLS клиент не может её тронуть, поэтому security definer: сначала
-- снимаем с устройства чужую запись, затем вставляем текущий аккаунт.
create or replace function public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null or p_endpoint is null then
    raise exception 'unauthorized';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions(user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, p_user_agent)
  on conflict (endpoint) do update
    set user_id = auth.uid(),
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent;
end;
$$;

-- ============================================================
-- 7в. Уведомление жильцу о новом графике платежей.
--     Владелец по RLS может писать уведомления только себе,
--     поэтому вставка для другого аккаунта — через security definer.
--     INSERT в notifications запускает push-триггер (7б).
-- ============================================================
create or replace function public.notify_payment_schedule(
  p_tenant uuid, p_count int, p_until date, p_property text default ''
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  -- себе не шлём и пустой график не шлём
  if p_tenant is null or p_tenant = auth.uid() or coalesce(p_count, 0) = 0 then
    return;
  end if;
  insert into public.notifications(user_id, type, title, message, link)
  values (
    p_tenant,
    'payment_scheduled',
    'Новый график платежей',
    coalesce(nullif(trim(p_property), ''), 'Объект') || ': ' || p_count || ' ' ||
      case
        when p_count % 100 between 11 and 14
          or p_count % 10 = 0 or p_count % 10 between 5 and 9 then 'платежей'
        when p_count % 10 = 1 then 'платёж'
        else 'платежа'
      end || ' до ' || to_char(p_until, 'DD.MM.YYYY'),
    '/app/payments'
  );
end;
$$;

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
  v_role text := coalesce(new.raw_user_meta_data->>'role', 'tenant');
  v_invite text := new.raw_user_meta_data->>'invite_code';
  v_name text := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));
begin
  -- Регистрация без приглашения = новый владелец своего воркспейса.
  -- По приглашению роль (tenant/contractor) назначит RPC claim_invite,
  -- вызываемый приложением сразу после регистрации.
  if v_invite is not null or v_role not in ('owner', 'tenant', 'contractor') then
    v_role := 'tenant';
  end if;

  insert into public.profiles (id, full_name, email, role)
  values (new.id, v_name, new.email, v_role);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 9. Realtime — включается руками (один раз), чтобы не ловить
--    deadlock с realtime-воркером: Database → Publications →
--    supabase_realtime → включить таблицы:
--    maintenance_requests, notifications, payments, properties
--    (опционально для живого чата: request_comments, request_events)
-- ============================================================

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
