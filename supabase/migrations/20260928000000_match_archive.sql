-- Compact, server-owned match history. Full games remain in private rooms only briefly.
create table private.acquire_match_history (
  id uuid primary key,
  participants uuid[] not null,
  summary jsonb not null,
  created_at timestamptz not null default now()
);
alter table private.acquire_match_history enable row level security;
revoke all on private.acquire_match_history from public, anon, authenticated;
create index acquire_match_history_participants on private.acquire_match_history using gin (participants);
create index acquire_match_history_created on private.acquire_match_history (created_at desc);
create index acquire_rooms_updated_status on private.acquire_rooms (status, updated_at);

create function private.acquire_archive_room(p_room private.acquire_rooms)
returns void language plpgsql security definer set search_path = '' as $$
declare v_participants uuid[]; v_placed integer;
begin
  if p_room.status <> 'finished' or p_room.ruleset <> '2008' or p_room.game is null then return; end if;
  select coalesce(array_agg((player->>'id')::uuid), array[]::uuid[]) into v_participants
    from pg_catalog.jsonb_array_elements(p_room.players) as player
    where player->>'isBot' = 'false' and player->>'id' ~ '^[0-9a-fA-F-]{36}$';
  select count(*) into v_placed from pg_catalog.jsonb_object_keys(coalesce(p_room.game->'board', '{}'::jsonb));
  insert into private.acquire_match_history (id, participants, summary)
  values (p_room.id, v_participants, pg_catalog.jsonb_build_object(
    'id', p_room.id, 'endedAt', p_room.updated_at, 'source', 'online',
    'mapId', coalesce(p_room.game->>'mapId','classic'),
    'botDifficulty', coalesce(p_room.game->>'botDifficulty','standard'),
    'turn', coalesce((p_room.game->>'turn')::integer,0),
    'playerCount', pg_catalog.jsonb_array_length(p_room.players), 'placedTiles', v_placed,
    'players', p_room.players, 'results', coalesce(p_room.game->'results','[]'::jsonb),
    'finalSettlements', coalesce(p_room.game->'finalSettlements','[]'::jsonb),
    'awards', coalesce(p_room.game->'awards','[]'::jsonb),
    'metrics', coalesce(p_room.game->'metrics','{}'::jsonb),
    'winnerIds', coalesce(p_room.game->'winnerIds','[]'::jsonb),
    'endReason', coalesce(p_room.game->>'endReason','The game ended.')
  )) on conflict (id) do nothing;
end;
$$;
revoke all on function private.acquire_archive_room(private.acquire_rooms) from public, anon, authenticated;

create function private.acquire_archive_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.acquire_archive_room(new);
  return new;
end;
$$;
revoke all on function private.acquire_archive_trigger() from public, anon, authenticated;
create trigger acquire_archive_finished after update of status on private.acquire_rooms
  for each row when (new.status = 'finished' and old.status is distinct from new.status)
  execute function private.acquire_archive_trigger();

-- Archive any 2008 game completed before this migration was installed.
do $$ declare r private.acquire_rooms; begin
  for r in select * from private.acquire_rooms where status = 'finished' and ruleset = '2008' loop
    perform private.acquire_archive_room(r);
  end loop;
end $$;

create function public.acquire_recent_matches(p_user_id uuid, p_limit integer default 30)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_user_id is null or p_limit not between 1 and 50 then raise exception 'INVALID_REQUEST'; end if;
  return coalesce((select pg_catalog.jsonb_agg(summary order by created_at desc)
    from (select summary, created_at from private.acquire_match_history
      where participants @> array[p_user_id] order by created_at desc limit p_limit) recent), '[]'::jsonb);
end;
$$;

create function public.acquire_leaderboard(p_user_id uuid, p_limit integer default 30)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_user_id is null or p_limit not between 1 and 50 then raise exception 'INVALID_REQUEST'; end if;
  -- A friends table includes only investors from the viewer's own completed matches.
  return coalesce((
    with matches as (
      select summary from private.acquire_match_history where participants @> array[p_user_id]
    ), scores as (
      select player->>'id' as id, player->>'name' as name,
        coalesce((result->>'total')::integer, 0) as total,
        (m.summary->'winnerIds') ? (player->>'id') as won,
        (select count(*) from pg_catalog.jsonb_array_elements(coalesce(m.summary->'awards','[]'::jsonb)) award
          where award->>'playerId' = player->>'id') as trophies
      from matches m cross join lateral pg_catalog.jsonb_array_elements(m.summary->'players') player
      left join lateral pg_catalog.jsonb_array_elements(m.summary->'results') result
        on result->>'playerId' = player->>'id'
      where player->>'isBot' = 'false'
    ), ranked as (
      select id, max(name) as name, count(*) as games, count(*) filter (where won) as wins,
        max(total) as best, sum(total) as total, sum(trophies) as trophies
      from scores group by id order by wins desc, best desc limit p_limit
    ) select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', id, 'name', name, 'games', games, 'wins', wins,
      'best', best, 'total', total, 'trophies', trophies) order by wins desc, best desc)
      from ranked), '[]'::jsonb);
end;
$$;

create function public.acquire_prune_data()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_rooms integer; v_matches integer;
begin
  -- A returning player can recover an unfinished room for 30 days. Completed
  -- games are already in compact history before their full state is removed.
  delete from private.acquire_rooms
    where (status = 'lobby' and updated_at < now() - interval '48 hours')
       or (status = 'playing' and updated_at < now() - interval '30 days')
       or (status = 'finished' and updated_at < now() - interval '7 days');
  get diagnostics v_rooms = row_count;
  delete from private.acquire_match_history where created_at < now() - interval '365 days';
  get diagnostics v_matches = row_count;
  return pg_catalog.jsonb_build_object('rooms', v_rooms, 'matches', v_matches);
end;
$$;

revoke all on function public.acquire_recent_matches(uuid, integer) from public, anon, authenticated;
revoke all on function public.acquire_leaderboard(uuid, integer) from public, anon, authenticated;
revoke all on function public.acquire_prune_data() from public, anon, authenticated;
grant execute on function public.acquire_recent_matches(uuid, integer) to service_role;
grant execute on function public.acquire_leaderboard(uuid, integer) to service_role;
grant execute on function public.acquire_prune_data() to service_role;
