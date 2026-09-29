-- Preserve historical 2023 rooms exactly; only newly created rooms use 2008.
-- Apply after 20260917000000_acquire_rooms.sql, then deploy the updated Edge Function.
alter table private.acquire_rooms add column ruleset text not null default '2023';
alter table private.acquire_rooms alter column ruleset set default '2008';
alter table private.acquire_rooms add constraint acquire_rooms_ruleset_check
  check (ruleset in ('2008', '2023') and (ruleset <> '2008' or mode = 'classic'));

create or replace function public.acquire_create_room(p_user_id uuid, p_name text, p_code text, p_mode text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare r private.acquire_rooms;
begin
  if p_user_id is null or p_name is null or char_length(trim(p_name)) not between 1 and 24 then
    raise exception 'INVALID_NAME';
  end if;
  if p_mode is distinct from 'classic' then raise exception 'INVALID_MODE'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  if (select count(*) from private.acquire_rooms where host_id = p_user_id
      and ruleset = '2008' and status <> 'finished' and created_at > now() - interval '24 hours') >= 8 then
    raise exception 'ROOM_LIMIT';
  end if;
  insert into private.acquire_rooms (code, host_id, players, mode, ruleset)
  values (p_code, p_user_id, jsonb_build_array(jsonb_build_object(
    'id', p_user_id::text, 'name', trim(p_name), 'isBot', false)), 'classic', '2008')
  returning * into r;
  return to_jsonb(r);
end;
$$;

create or replace function public.acquire_join_room(p_user_id uuid, p_name text, p_code text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare r private.acquire_rooms;
begin
  if p_user_id is null or p_name is null or char_length(trim(p_name)) not between 1 and 24 then
    raise exception 'INVALID_NAME';
  end if;
  select * into r from private.acquire_rooms where code = p_code for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if r.ruleset <> '2008' or r.mode <> 'classic' or (r.game is not null and
      (r.game->>'version' is distinct from '2' or r.game->>'ruleset' is distinct from '2008' or r.game->>'mode' is distinct from 'classic')) then
    raise exception 'OLD_RULESET';
  end if;
  if r.players @> jsonb_build_array(jsonb_build_object('id', p_user_id::text)) then return to_jsonb(r); end if;
  if r.status <> 'lobby' then raise exception 'ROOM_STARTED'; end if;
  if jsonb_array_length(r.players) >= 6 then raise exception 'ROOM_FULL'; end if;
  update private.acquire_rooms set
    players = players || jsonb_build_array(jsonb_build_object(
      'id', p_user_id::text, 'name', trim(p_name), 'isBot', false)),
    version = version + 1, updated_at = now()
  where id = r.id returning * into r;
  return to_jsonb(r);
end;
$$;

create or replace function public.acquire_get_room(p_user_id uuid, p_code text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare r private.acquire_rooms;
begin
  select * into r from private.acquire_rooms where code = p_code;
  if not found or not (r.players @> jsonb_build_array(jsonb_build_object('id', p_user_id::text))) then
    raise exception 'ROOM_NOT_FOUND';
  end if;
  if r.ruleset <> '2008' or r.mode <> 'classic' or (r.game is not null and
      (r.game->>'version' is distinct from '2' or r.game->>'ruleset' is distinct from '2008' or r.game->>'mode' is distinct from 'classic')) then
    raise exception 'OLD_RULESET';
  end if;
  return to_jsonb(r);
end;
$$;

create or replace function public.acquire_commit_room(
  p_user_id uuid, p_code text, p_expected_version integer,
  p_game jsonb, p_players jsonb, p_status text
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare r private.acquire_rooms;
begin
  select * into r from private.acquire_rooms where code = p_code for update;
  if not found or not (r.players @> jsonb_build_array(jsonb_build_object('id', p_user_id::text))) then
    raise exception 'ROOM_NOT_FOUND';
  end if;
  if r.ruleset <> '2008' or r.mode <> 'classic' or (r.game is not null and
      (r.game->>'version' is distinct from '2' or r.game->>'ruleset' is distinct from '2008' or r.game->>'mode' is distinct from 'classic')) then
    raise exception 'OLD_RULESET';
  end if;
  if r.version is distinct from p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if r.status = 'finished' then raise exception 'ROOM_FINISHED'; end if;
  if r.status = 'lobby' and r.host_id <> p_user_id then raise exception 'HOST_ONLY'; end if;
  if p_game is null or jsonb_typeof(p_game) <> 'object'
     or p_status is null or p_status not in ('playing', 'finished')
     or p_players is null or jsonb_typeof(p_players) <> 'array' then
    raise exception 'INVALID_STATE';
  end if;
  if p_game->>'version' is distinct from '2' or p_game->>'ruleset' is distinct from '2008' or p_game->>'mode' is distinct from 'classic' then
    raise exception 'OLD_RULESET';
  end if;
  if jsonb_array_length(p_players) not between 3 and 6 then raise exception 'PLAYER_COUNT'; end if;
  if r.status = 'playing' and r.players <> p_players then raise exception 'INVALID_PLAYERS'; end if;
  update private.acquire_rooms set
    game = p_game, players = p_players, status = p_status,
    version = version + 1, updated_at = now()
  where id = r.id returning * into r;
  return to_jsonb(r);
end;
$$;

-- CREATE OR REPLACE retains existing privileges. Restate them to make the new
-- ruleset migration's security boundary explicit and auditable.
revoke all on function public.acquire_create_room(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.acquire_join_room(uuid, text, text) from public, anon, authenticated;
revoke all on function public.acquire_get_room(uuid, text) from public, anon, authenticated;
revoke all on function public.acquire_commit_room(uuid, text, integer, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.acquire_create_room(uuid, text, text, text) to service_role;
grant execute on function public.acquire_join_room(uuid, text, text) to service_role;
grant execute on function public.acquire_get_room(uuid, text) to service_role;
grant execute on function public.acquire_commit_room(uuid, text, integer, jsonb, jsonb, text) to service_role;
