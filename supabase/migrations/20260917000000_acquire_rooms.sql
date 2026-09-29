-- Complete game state, including the draw bag and all hands, is server-only.
-- Do not add the private schema to the project's exposed API schemas.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.acquire_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  host_id uuid not null,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  mode text not null default 'classic' check (mode in ('classic', 'tycoon')),
  version integer not null default 0 check (version >= 0),
  players jsonb not null check (jsonb_typeof(players) = 'array'),
  game jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table private.acquire_rooms enable row level security;
revoke all on private.acquire_rooms from public, anon, authenticated;
create index acquire_rooms_host_recent on private.acquire_rooms (host_id, created_at)
  where status <> 'finished';

-- Functions are exposed only so the Edge Function can invoke them with its
-- service-role client. No browser role may execute any of these functions.
create function public.acquire_create_room(p_user_id uuid, p_name text, p_code text, p_mode text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare r private.acquire_rooms;
begin
  if p_user_id is null or char_length(trim(p_name)) not between 1 and 24 then
    raise exception 'INVALID_NAME';
  end if;
  -- Serialize the per-account room quota, including simultaneous requests.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  if (select count(*) from private.acquire_rooms where host_id = p_user_id
      and status <> 'finished' and created_at > now() - interval '24 hours') >= 8 then
    raise exception 'ROOM_LIMIT';
  end if;
  insert into private.acquire_rooms (code, host_id, players, mode)
  values (p_code, p_user_id, jsonb_build_array(jsonb_build_object(
    'id', p_user_id::text, 'name', trim(p_name), 'isBot', false)), p_mode)
  returning * into r;
  return to_jsonb(r);
end;
$$;

create function public.acquire_join_room(p_user_id uuid, p_name text, p_code text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare r private.acquire_rooms;
begin
  if p_user_id is null or char_length(trim(p_name)) not between 1 and 24 then
    raise exception 'INVALID_NAME';
  end if;
  select * into r from private.acquire_rooms where code = p_code for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if r.players @> jsonb_build_array(jsonb_build_object('id', p_user_id::text)) then
    return to_jsonb(r);
  end if;
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

create function public.acquire_get_room(p_user_id uuid, p_code text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare r private.acquire_rooms;
begin
  select * into r from private.acquire_rooms where code = p_code;
  if not found or not (r.players @> jsonb_build_array(jsonb_build_object('id', p_user_id::text))) then
    raise exception 'ROOM_NOT_FOUND';
  end if;
  return to_jsonb(r);
end;
$$;

create function public.acquire_commit_room(
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
  if r.version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if r.status = 'finished' then raise exception 'ROOM_FINISHED'; end if;
  if p_game is null or jsonb_typeof(p_game) <> 'object'
     or p_status not in ('playing', 'finished')
     or jsonb_typeof(p_players) <> 'array'
     or jsonb_array_length(p_players) not between 2 and 6 then
    raise exception 'INVALID_STATE';
  end if;
  if r.status = 'lobby' and r.host_id <> p_user_id then raise exception 'HOST_ONLY'; end if;
  if r.status = 'playing' and r.players <> p_players then raise exception 'INVALID_PLAYERS'; end if;
  update private.acquire_rooms set
    game = p_game, players = p_players, status = p_status,
    version = version + 1, updated_at = now()
  where id = r.id returning * into r;
  return to_jsonb(r);
end;
$$;

create function public.acquire_leave_room(p_user_id uuid, p_code text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare r private.acquire_rooms;
begin
  select * into r from private.acquire_rooms where code = p_code for update;
  if not found or not (r.players @> jsonb_build_array(jsonb_build_object('id', p_user_id::text))) then
    return;
  end if;
  -- A seated player can return to an ongoing match with their stored session.
  if r.status <> 'lobby' then return; end if;
  if r.host_id = p_user_id then
    delete from private.acquire_rooms where id = r.id;
  else
    update private.acquire_rooms set
      players = (select jsonb_agg(p) from jsonb_array_elements(r.players) p
        where p->>'id' <> p_user_id::text),
      version = version + 1, updated_at = now()
    where id = r.id;
  end if;
end;
$$;

revoke all on function public.acquire_create_room(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.acquire_join_room(uuid, text, text) from public, anon, authenticated;
revoke all on function public.acquire_get_room(uuid, text) from public, anon, authenticated;
revoke all on function public.acquire_commit_room(uuid, text, integer, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.acquire_leave_room(uuid, text) from public, anon, authenticated;

grant execute on function public.acquire_create_room(uuid, text, text, text) to service_role;
grant execute on function public.acquire_join_room(uuid, text, text) to service_role;
grant execute on function public.acquire_get_room(uuid, text) to service_role;
grant execute on function public.acquire_commit_room(uuid, text, integer, jsonb, jsonb, text) to service_role;
grant execute on function public.acquire_leave_room(uuid, text) to service_role;
