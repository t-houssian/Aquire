-- Larger custom maps may seat 8, 10, or 12; the printed-size maps stay capped at six.
-- The Edge Function still validates every command and selects the authoritative map.
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
  if jsonb_array_length(r.players) >= 12 then raise exception 'ROOM_FULL'; end if;
  update private.acquire_rooms set
    players = players || jsonb_build_array(jsonb_build_object(
      'id', p_user_id::text, 'name', trim(p_name), 'isBot', false)),
    version = version + 1, updated_at = now()
  where id = r.id returning * into r;
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
declare r private.acquire_rooms; v_max integer; v_count integer;
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
  v_max := case coalesce(p_game->>'mapId', 'classic')
    when 'big-rectangle' then 8 when 'big-crater' then 8 when 'big-harbors' then 8
    when 'mega-diamond' then 10 when 'mega-rivers' then 10 when 'mega-divide' then 10
    when 'max-metropolis' then 12 when 'max-archipelago' then 12 when 'max-cross' then 12
    when 'classic' then 6 when 'corner-plazas' then 6 when 'riverwalk' then 6
    when 'grand-avenue' then 6 when 'courtyard' then 6 when 'peninsulas' then 6
    when 'hourglass' then 6 when 'crossroads' then 6 when 'switchback' then 6
    when 'atoll' then 6 when 'four-spires' then 6 else null end;
  if v_max is null then raise exception 'INVALID_MAP'; end if;
  v_count := jsonb_array_length(p_players);
  if v_count < 3 or v_count > v_max then raise exception 'PLAYER_COUNT'; end if;
  if r.status = 'playing' and r.players <> p_players then raise exception 'INVALID_PLAYERS'; end if;
  update private.acquire_rooms set
    game = p_game, players = p_players, status = p_status,
    version = version + 1, updated_at = now()
  where id = r.id returning * into r;
  return to_jsonb(r);
end;
$$;

revoke all on function public.acquire_join_room(uuid, text, text) from public, anon, authenticated;
revoke all on function public.acquire_commit_room(uuid, text, integer, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.acquire_join_room(uuid, text, text) to service_role;
grant execute on function public.acquire_commit_room(uuid, text, integer, jsonb, jsonb, text) to service_role;
