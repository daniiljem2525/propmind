-- ============================================================
-- Патч 2026-11-11: роли команды (управляющий/бухгалтер) + инспекции
--
-- Источник: фидбэк экспертизы — «клиентам с 10+ объектами нужны роли:
-- собственник / управляющий / бухгалтер / подрядчик; права доступа —
-- не фича, а условие покупки для Business» и «оффлайн-инспекции».
--
-- Состав:
--   1. team_members — члены команды владельца (manager/accountant)
--   2. is_team_member() — хелпер для RLS-политик команды
--   3. Политики доступа команды: manager — операционные таблицы,
--      accountant — платежи (чтение+правка) и документы/объекты на чтение
--   4. is_request_participant() — участник заявки: + члены команды
--   5. set_user_role — белый список ролей расширен (manager/accountant)
--   6. claim_invite — claim приглашения менеджера/бухгалтера добавляет
--      участника в team_members
--   7. invites.role — check-констрейнт расширен на роли команды
--   8. request_comments.author_role — check-констрейнт расширен
--   9. inspections — таблица осмотров (чек-листы) + RLS + realtime
--
-- Патч идемпотентный (порядок патчей схемы): все операции с if not exists /
-- drop policy if exists / create or replace. Только аддитивный DDL —
-- поведение прода для существующих ролей (owner/tenant/contractor) не
-- меняется. Применение: docker exec -i supabase-db psql -U supabase_admin \
--   -d postgres -v ON_ERROR_STOP=1 -f этот-файл
-- ============================================================

-- ------------------------------------------------------------
-- 1. Члены команды владельца
-- ------------------------------------------------------------
create table if not exists public.team_members (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  role         text not null check (role in ('manager', 'accountant')),
  created_date timestamptz not null default now(),
  unique (owner_id, user_id)
);
alter table public.team_members enable row level security;

drop policy if exists "team: владелец управляет своей командой" on public.team_members;
create policy "team: владелец управляет своей командой"
  on public.team_members for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "team: участник видит своё членство" on public.team_members;
create policy "team: участник видит своё членство"
  on public.team_members for select
  using (user_id = auth.uid());

-- ------------------------------------------------------------
-- 2. Хелпер RLS: uid — участник команды владельца (с фильтром по роли)
--    security definer: функция вызывается из политик других таблиц,
--    чтение team_members не должно зависеть от RLS самой team_members.
-- ------------------------------------------------------------
create or replace function public.is_team_member(p_owner uuid, p_role text default null)
returns boolean
language sql
security definer set search_path = public
stable as $$
  select exists (
    select 1 from public.team_members tm
    where tm.owner_id = p_owner
      and tm.user_id = auth.uid()
      and (p_role is null or tm.role = p_role)
  );
$$;

-- ------------------------------------------------------------
-- 3. Политики доступа команды.
--    Владелец уже имеет "for all" на каждой таблице (schema.sql) —
--    политики ниже добавляют команде доступ поверх (permissive OR).
--    manager — операционка: CRUD, кроме удаления объектов (актив
--    удаляет владелец); accountant — платежи (чтение/создание/правка,
--    т.е. реестр оплат) + документы и объекты на чтение для контекста.
-- ------------------------------------------------------------

-- Объекты: manager — без удаления; accountant — только чтение
drop policy if exists "properties: команда — управляющий (без удаления)" on public.properties;
create policy "properties: команда — управляющий (без удаления)"
  on public.properties for select
  using (public.is_team_member(owner_id, 'manager'));
drop policy if exists "properties: команда — управляющий вставка" on public.properties;
create policy "properties: команда — управляющий вставка"
  on public.properties for insert
  with check (public.is_team_member(owner_id, 'manager'));
drop policy if exists "properties: команда — управляющий правка" on public.properties;
create policy "properties: команда — управляющий правка"
  on public.properties for update
  using (public.is_team_member(owner_id, 'manager'))
  with check (public.is_team_member(owner_id, 'manager'));
drop policy if exists "properties: команда — бухгалтер на чтение" on public.properties;
create policy "properties: команда — бухгалтер на чтение"
  on public.properties for select
  using (public.is_team_member(owner_id, 'accountant'));

-- Жильцы: manager — полные права
drop policy if exists "tenants: команда — управляющий" on public.tenants;
create policy "tenants: команда — управляющий"
  on public.tenants for all
  using (public.is_team_member(owner_id, 'manager'))
  with check (public.is_team_member(owner_id, 'manager'));

-- Платежи: manager — полные права; accountant — реестр оплат
drop policy if exists "payments: команда — управляющий" on public.payments;
create policy "payments: команда — управляющий"
  on public.payments for all
  using (public.is_team_member(owner_id, 'manager'))
  with check (public.is_team_member(owner_id, 'manager'));
drop policy if exists "payments: команда — бухгалтер" on public.payments;
create policy "payments: команда — бухгалтер"
  on public.payments for select
  using (public.is_team_member(owner_id, 'accountant'));
drop policy if exists "payments: команда — бухгалтер вставка" on public.payments;
create policy "payments: команда — бухгалтер вставка"
  on public.payments for insert
  with check (public.is_team_member(owner_id, 'accountant'));
drop policy if exists "payments: команда — бухгалтер правка" on public.payments;
create policy "payments: команда — бухгалтер правка"
  on public.payments for update
  using (public.is_team_member(owner_id, 'accountant'))
  with check (public.is_team_member(owner_id, 'accountant'));

-- Заявки: manager — полные права (смена статусов всё равно через RPC)
drop policy if exists "requests: команда — управляющий" on public.maintenance_requests;
create policy "requests: команда — управляющий"
  on public.maintenance_requests for all
  using (public.is_team_member(owner_id, 'manager'))
  with check (public.is_team_member(owner_id, 'manager'));

-- Документы: manager — полные права; accountant — только чтение
drop policy if exists "documents: команда — управляющий" on public.documents;
create policy "documents: команда — управляющий"
  on public.documents for all
  using (public.is_team_member(owner_id, 'manager'))
  with check (public.is_team_member(owner_id, 'manager'));
drop policy if exists "documents: команда — бухгалтер на чтение" on public.documents;
create policy "documents: команда — бухгалтер на чтение"
  on public.documents for select
  using (public.is_team_member(owner_id, 'accountant'));

-- ------------------------------------------------------------
-- 4. Участник заявки: + члены команды владельца (комментарии/события).
--    Без этого управляющий видит заявку, но не её чат и историю.
-- ------------------------------------------------------------
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
        or public.is_team_member(r.owner_id)
      )
  );
$$;

-- ------------------------------------------------------------
-- 5а. Констрейнт profiles.role: без manager/accountant заявленная роль
--     не пройдёт в БД (set_user_role/claim_invite упадут на check).
--     Заодно добавляем 'admin' — set_user_role его валидирует, а
--     констрейнт его отклонял: латентный баг смены роли на админа.
-- ------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('owner', 'manager', 'accountant', 'tenant', 'contractor', 'admin'));

-- ------------------------------------------------------------
-- 5б. Смена роли: белый список + manager/accountant
-- ------------------------------------------------------------
create or replace function public.set_user_role(p_user uuid, p_role text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_platform_owner() then
    raise exception 'forbidden';
  end if;
  if p_role not in ('owner', 'manager', 'accountant', 'tenant', 'contractor', 'admin') then
    raise exception 'bad_role';
  end if;
  update public.profiles set role = p_role where id = p_user;
end;
$$;

-- ------------------------------------------------------------
-- 6. claim_invite: приглашённый управляющий/бухгалтер попадает в team_members
--    (тело из schema.sql v4 + блок вставки в команду)
-- ------------------------------------------------------------
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

  -- Роли команды: фиксируем членство в команде владельца — по нему
  -- работают RLS-политики доступа (is_team_member). Повторный claim
  -- (другой код той же роли) обновляет роль, конфликтов нет.
  if v_inv.role in ('manager', 'accountant') then
    insert into public.team_members (owner_id, user_id, role)
    values (v_inv.owner_id, v_uid, v_inv.role)
    on conflict (owner_id, user_id) do update set role = excluded.role;
  end if;

  v_property := v_inv.property_id;
  if v_inv.role = 'tenant' and v_property is not null then
    -- Не перезаписываем объект, занятый другим жильцом: один объект —
    -- один жилец. Свободным считаем и объект без id-связи без имени.
    update public.properties set
      tenant_id = v_uid,
      tenant_name = (select full_name from public.profiles where id = v_uid),
      status = 'rented'
    where id = v_property and owner_id = v_inv.owner_id
      and (tenant_id = v_uid or (tenant_id is null and coalesce(tenant_name, '') = ''));
  end if;

  update public.invites set used_by = v_uid where code = v_inv.code;

  return jsonb_build_object('ok', true, 'role', v_inv.role, 'property_id', v_property);
end;
$$;

-- ------------------------------------------------------------
-- 7. invites.role: констрейнт расширен на роли команды
-- ------------------------------------------------------------
alter table public.invites drop constraint if exists invites_role_check;
alter table public.invites add constraint invites_role_check
  check (role in ('tenant', 'contractor', 'manager', 'accountant'));

-- ------------------------------------------------------------
-- 8. request_comments.author_role: управляющий/бухгалтер комментируют
-- ------------------------------------------------------------
alter table public.request_comments drop constraint if exists request_comments_author_role_check;
alter table public.request_comments add constraint request_comments_author_role_check
  check (author_role in ('owner', 'manager', 'accountant', 'tenant', 'contractor', 'system'));

-- ------------------------------------------------------------
-- 9. Инспекции (осмотры объектов): чек-лист [{text, status, note}]
--    Типы: приёмка / плановый / при выезде. Статусы: planned/done/cancelled.
--    Доступ: владелец — всё, управляющий — всё, бухгалтер/жилец — нет
--    (матрица ролей фронтенда: ROLE_ACCESS в src/lib/config/statuses.js).
-- ------------------------------------------------------------
create table if not exists public.inspections (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  property_id    uuid references public.properties(id) on delete set null,
  property_name  text,
  type           text not null default 'routine'
                 check (type in ('acceptance', 'routine', 'move_out')),
  status         text not null default 'planned'
                 check (status in ('planned', 'done', 'cancelled')),
  scheduled_date date,
  checklist      jsonb not null default '[]',
  notes          text,
  completed_date timestamptz,
  is_demo        boolean not null default false,
  created_date   timestamptz not null default now(),
  updated_date   timestamptz
);

create index if not exists inspections_owner_idx on public.inspections(owner_id, created_date);
create index if not exists inspections_property_idx on public.inspections(property_id);

alter table public.inspections enable row level security;

drop policy if exists "inspections: владелец — полные права" on public.inspections;
create policy "inspections: владелец — полные права"
  on public.inspections for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "inspections: команда — управляющий" on public.inspections;
create policy "inspections: команда — управляющий"
  on public.inspections for all
  using (public.is_team_member(owner_id, 'manager'))
  with check (public.is_team_member(owner_id, 'manager'));

-- Realtime: как у tenants — идемпотентное добавление в публикацию
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inspections'
  ) then
    alter publication supabase_realtime add table public.inspections;
  end if;
end $$;
