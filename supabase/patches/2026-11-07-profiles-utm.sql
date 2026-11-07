-- ============================================================
-- 2026-11-07: UTM-атрибуция регистраций (задача NT-020, P0 ревью NT-027)
-- ============================================================
-- Метки кампании (utm_* / gclid / yclid и др.) пишутся приложением в
-- raw_user_meta_data.utm при signUp; колонка profiles.utm — для админки
-- и биллинг-отчётов, наполняется триггером handle_new_user (metadata →
-- профиль) и дописывается приложением для соц-входов. Идемпотентно.

alter table public.profiles add column if not exists utm jsonb;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_role text := coalesce(new.raw_user_meta_data->>'role', 'tenant');
  v_invite text := new.raw_user_meta_data->>'invite_code';
  v_name text := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));
  v_utm jsonb := new.raw_user_meta_data->'utm';
begin
  -- Регистрация без приглашения = новый владелец своего воркспейса.
  -- По приглашению роль (tenant/contractor) назначит RPC claim_invite,
  -- вызываемый приложением сразу после регистрации.
  if v_invite is not null or v_role not in ('owner', 'tenant', 'contractor') then
    v_role := 'tenant';
  end if;

  insert into public.profiles (id, full_name, email, role, utm)
  values (new.id, v_name, new.email, v_role, v_utm);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Соц-вход дописывает utm в свой профиль сам (только что созданный аккаунт)
revoke update on public.profiles from authenticated;
grant update (full_name, phone, utm) on public.profiles to authenticated;
