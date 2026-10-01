-- Run after migrations with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/database.sql
-- Everything is rolled back. This intentionally uses no pgTAP extension.
begin;

do $$
declare
  host uuid := '00000000-0000-4000-8000-000000000001';
  guest uuid := '00000000-0000-4000-8000-000000000002';
  outsider uuid := '00000000-0000-4000-8000-000000000003';
  result jsonb;
  members jsonb;
begin
  if has_schema_privilege('anon', 'private', 'USAGE')
    or has_schema_privilege('authenticated', 'private', 'USAGE') then
    raise exception 'Private schema can be read by a browser role';
  end if;
  if has_table_privilege('authenticated', 'private.acquire_rooms', 'SELECT')
    or has_table_privilege('authenticated', 'private.acquire_rooms', 'UPDATE')
    or has_table_privilege('authenticated', 'private.acquire_match_history', 'SELECT') then
    raise exception 'Browser roles have direct game table access';
  end if;
  if has_function_privilege('authenticated', 'public.acquire_get_room(uuid,text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.acquire_create_room(uuid,text,text,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.acquire_commit_room(uuid,text,integer,jsonb,jsonb,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.acquire_recent_matches(uuid,integer)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.acquire_prune_data()', 'EXECUTE') then
    raise exception 'Browser roles can call privileged room functions';
  end if;
  if not has_function_privilege('service_role', 'public.acquire_get_room(uuid,text)', 'EXECUTE') then
    raise exception 'Edge service role cannot load rooms';
  end if;
  result := public.acquire_create_room(host, 'Host', 'TST234', 'classic');
  perform set_config('request.jwt.claims', jsonb_build_object('sub', host::text)::text, true);
  if not public.acquire_can_watch('acquire:' || (result->>'id')) then
    raise exception 'Host cannot subscribe to room notifications';
  end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', outsider::text)::text, true);
  if public.acquire_can_watch('acquire:' || (result->>'id'))
    or public.acquire_can_watch('acquire:not-a-room')
    or has_function_privilege('anon', 'public.acquire_can_watch(text)', 'EXECUTE') then
    raise exception 'Notification membership authorization is too permissive';
  end if;
  if result->>'ruleset' <> '2008' or result->>'mode' <> 'classic' or result->>'version' <> '0' or jsonb_array_length(result->'players') <> 1 then
    raise exception 'Initial room state is incorrect';
  end if;
  result := public.acquire_join_room(guest, 'Guest', 'TST234');
  perform set_config('request.jwt.claims', jsonb_build_object('sub', guest::text)::text, true);
  if not public.acquire_can_watch('acquire:' || (result->>'id')) then
    raise exception 'Seated guest cannot subscribe to room notifications';
  end if;
  if result->>'version' <> '1' or jsonb_array_length(result->'players') <> 2 then
    raise exception 'Joining did not update membership/version';
  end if;
  members := result->'players';
  result := public.acquire_join_room(guest, 'Guest', 'TST234');
  if result->>'version' <> '1' or jsonb_array_length(result->'players') <> 2 then
    raise exception 'Rejoining duplicated a seat';
  end if;
  begin
    perform public.acquire_get_room(outsider, 'TST234');
    raise exception 'Outsider read a room';
  exception when others then if sqlerrm <> 'ROOM_NOT_FOUND' then raise; end if; end;
  begin
    perform public.acquire_commit_room(guest, 'TST234', 1, '{"version":2,"ruleset":"2008","mode":"classic"}'::jsonb, members, 'playing');
    raise exception 'Non-host started a room';
  exception when others then if sqlerrm <> 'HOST_ONLY' then raise; end if; end;
  begin
    perform public.acquire_commit_room(host, 'TST234', 0, '{"version":2,"ruleset":"2008","mode":"classic"}'::jsonb, members, 'playing');
    raise exception 'Stale update succeeded';
  exception when others then if sqlerrm <> 'VERSION_CONFLICT' then raise; end if; end;
  begin
    perform public.acquire_commit_room(host, 'TST234', 1, '{"version":2,"ruleset":"2008","mode":"classic"}'::jsonb, members, 'playing');
    raise exception 'A two-player 2008 game started';
  exception when others then if sqlerrm <> 'PLAYER_COUNT' then raise; end if; end;
  members := members || '[{"id":"computer","name":"Computer","isBot":true}]'::jsonb;
  begin
    perform public.acquire_commit_room(host, 'TST234', 1, '{"version":1,"mode":"classic"}'::jsonb, members, 'playing');
    raise exception 'Earlier game state was accepted';
  exception when others then if sqlerrm <> 'OLD_RULESET' then raise; end if; end;
  result := public.acquire_commit_room(host, 'TST234', 1, '{"version":2,"ruleset":"2008","mode":"classic"}'::jsonb, members, 'playing');
  if result->>'version' <> '2' or result->>'status' <> 'playing' then
    raise exception 'Host start failed';
  end if;
  begin
    perform public.acquire_join_room(outsider, 'Intruder', 'TST234');
    raise exception 'New player joined an ongoing game';
  exception when others then if sqlerrm <> 'ROOM_STARTED' then raise; end if; end;
  begin
    perform public.acquire_commit_room(host, 'TST234', 1, '{"cheat":true}'::jsonb, members, 'playing');
    raise exception 'Concurrent stale command overwrote the state';
  exception when others then if sqlerrm <> 'VERSION_CONFLICT' then raise; end if; end;
  begin
    perform public.acquire_commit_room(host, 'TST234', 2, '{"version":2,"ruleset":"2008","mode":"classic"}'::jsonb, members || '[{"id":"fake","name":"Fake"}]'::jsonb, 'playing');
    raise exception 'Active seats changed';
  exception when others then if sqlerrm <> 'INVALID_PLAYERS' then raise; end if; end;
  perform public.acquire_leave_room(guest, 'TST234');
  result := public.acquire_get_room(guest, 'TST234');
  if jsonb_array_length(result->'players') <> 3 then raise exception 'An active player lost reconnection access'; end if;
  result := public.acquire_commit_room(host, 'TST234', 2,
    '{"version":2,"ruleset":"2008","mode":"classic","id":"test","turn":14,"board":{"1A":"worldwide"},"bag":["private"],"results":[{"playerId":"00000000-0000-4000-8000-000000000001","name":"Host","total":12000,"rank":1},{"playerId":"00000000-0000-4000-8000-000000000002","name":"Guest","total":8000,"rank":2}],"winnerIds":["00000000-0000-4000-8000-000000000001"],"awards":[{"playerId":"00000000-0000-4000-8000-000000000001","title":"Champion"}]}'::jsonb,
    members, 'finished');
  if jsonb_array_length(public.acquire_recent_matches(host, 30)) <> 1
     or jsonb_array_length(public.acquire_recent_matches(guest, 30)) <> 1
     or jsonb_array_length(public.acquire_recent_matches(outsider, 30)) <> 0 then
    raise exception 'Match archive visibility is incorrect';
  end if;
  result := (public.acquire_recent_matches(host, 30))->0;
  if result ? 'bag' or result ? 'board' or result->>'placedTiles' <> '1'
     or result->>'source' <> 'online' then
    raise exception 'Archive leaked private or full game state';
  end if;
  result := (public.acquire_leaderboard(guest, 30))->0;
  if result->>'name' <> 'Host' or result->>'wins' <> '1' then
    raise exception 'Friends leaderboard was not calculated';
  end if;
  update private.acquire_rooms set updated_at = now() - interval '8 days' where code = 'TST234';
  perform public.acquire_prune_data();
  if exists(select 1 from private.acquire_rooms where code = 'TST234')
    or jsonb_array_length(public.acquire_recent_matches(guest, 30)) <> 1 then
    raise exception 'Retention failed to remove full finished room while retaining the summary';
  end if;
  begin
    perform public.acquire_create_room(host, 'Host', 'TST235', 'tycoon');
    raise exception 'A Tycoon room was created';
  exception when others then if sqlerrm <> 'INVALID_MODE' then raise; end if; end;
  perform public.acquire_create_room(host, 'Host', 'TST235', 'classic');
  perform public.acquire_join_room(guest, 'Guest', 'TST235');
  perform public.acquire_leave_room(guest, 'TST235');
  result := public.acquire_get_room(host, 'TST235');
  if public.acquire_can_watch('acquire:' || (result->>'id')) then
    raise exception 'Departed guest can subscribe to lobby notifications';
  end if;
  if jsonb_array_length(result->'players') <> 1 then raise exception 'Guest lobby leave failed'; end if;
  perform public.acquire_leave_room(host, 'TST235');
  begin
    perform public.acquire_get_room(host, 'TST235');
    raise exception 'Host departure did not close lobby';
  exception when others then if sqlerrm <> 'ROOM_NOT_FOUND' then raise; end if; end;
end $$;

do $$
declare
  host uuid := '00000000-0000-4000-8000-000000000101';
  member uuid;
  result jsonb;
  seats jsonb;
begin
  result := public.acquire_create_room(host, 'Large Host', 'MAX234', 'classic');
  for i in 2..12 loop
    member := ('00000000-0000-4000-8000-' || lpad((100 + i)::text, 12, '0'))::uuid;
    result := public.acquire_join_room(member, 'Seat ' || i, 'MAX234');
  end loop;
  if jsonb_array_length(result->'players') <> 12 then raise exception 'Large lobby did not seat twelve'; end if;
  seats := result->'players';
  begin
    perform public.acquire_join_room('00000000-0000-4000-8000-000000000113', 'Extra', 'MAX234');
    raise exception 'Thirteenth seat joined';
  exception when others then if sqlerrm <> 'ROOM_FULL' then raise; end if; end;
  begin
    perform public.acquire_commit_room(host, 'MAX234', 11,
      '{"version":2,"ruleset":"2008","mode":"classic","mapId":"classic"}'::jsonb, seats, 'playing');
    raise exception 'Twelve seats started on printed board';
  exception when others then if sqlerrm <> 'PLAYER_COUNT' then raise; end if; end;
  result := public.acquire_commit_room(host, 'MAX234', 11,
    '{"version":2,"ruleset":"2008","mode":"classic","mapId":"max-metropolis"}'::jsonb, seats, 'playing');
  if result->>'status' <> 'playing' or jsonb_array_length(result->'players') <> 12 then
    raise exception 'Twelve-seat expansion did not start';
  end if;
end $$;

do $$
declare
  map_ids text[] := array[
    'twin-docks', 'obelisk', 'coral-crown', 'lightning-run', 'compass-rose', 'pinwheel', 'starfall-x', 'twin-lagoons',
    'big-aurora-gate', 'big-trident-towers', 'mega-triple-arch', 'mega-citadel-grid', 'max-celestial-ring', 'max-orion-star',
    'lunar-moth', 'ember-gear', 'jade-infinity', 'clockwork-keys', 'crystal-cascade', 'cloud-palace', 'comet-arcade', 'saffron-labyrinth', 'biolume-reef', 'lotus-gardens', 'big-dragon-spine', 'big-moon-mosaic', 'mega-thunderbird', 'mega-mirage-steps', 'max-world-tree', 'max-astral-loom'
  ];
  host uuid;
  code text;
  seats jsonb;
  game jsonb;
  result jsonb;
  maximum integer;
begin
  for i in 1..array_length(map_ids, 1) loop
    host := ('00000000-0000-4000-8000-' || lpad((300 + i)::text, 12, '0'))::uuid;
    code := 'MAP' || substr('ABCDEFGHJKLMNPQRSTUVWXYZ', (i - 1) / 23 + 1, 1) || substr('ABCDEFGHJKLMNPQRSTUVWXYZ', (i - 1) % 23 + 1, 1) || 'X';
    maximum := case when map_ids[i] like 'big-%' then 8 when map_ids[i] like 'mega-%' then 10 when map_ids[i] like 'max-%' then 12 else 6 end;
    game := jsonb_build_object('version', 2, 'ruleset', '2008', 'mode', 'classic', 'mapId', map_ids[i]);
    result := public.acquire_create_room(host, 'Host', code, 'classic');
    seats := result->'players';
    for j in 2..maximum loop
      seats := seats || jsonb_build_array(jsonb_build_object('id', 'bot-' || i || '-' || j, 'name', 'Bot ' || j, 'isBot', true));
    end loop;
    begin
      perform public.acquire_commit_room(host, code, 0, game,
        seats || jsonb_build_array(jsonb_build_object('id', 'extra', 'name', 'Extra', 'isBot', true)), 'playing');
      raise exception 'New map exceeded its seat limit: %', map_ids[i];
    exception when others then if sqlerrm <> 'PLAYER_COUNT' then raise; end if; end;
    result := public.acquire_commit_room(host, code, 0, game, seats, 'playing');
    if result->'game'->>'mapId' <> map_ids[i] or jsonb_array_length(result->'players') <> maximum then
      raise exception 'New map rejected a full table: %', map_ids[i];
    end if;
  end loop;
end $$;

do $$
declare
  host uuid := '00000000-0000-4000-8000-000000000501';
  guest uuid := '00000000-0000-4000-8000-000000000502';
  seats jsonb;
  room_id uuid;
begin
  perform public.acquire_create_room(host, 'Host', 'END234', 'classic');
  seats := (public.acquire_join_room(guest, 'Guest', 'END234'))->'players';
  seats := seats || '[{"id":"bot-end","name":"House","isBot":true}]'::jsonb;
  perform public.acquire_commit_room(host, 'END234', 1,
    '{"version":2,"ruleset":"2008","mode":"classic","mapId":"classic"}'::jsonb,
    seats, 'playing');
  select id into room_id from private.acquire_rooms where code = 'END234';
  begin
    perform public.acquire_end_room(guest, 'END234');
    raise exception 'Guest ended the host room';
  exception when others then if sqlerrm <> 'HOST_ONLY' then raise; end if; end;
  if not exists(select 1 from private.acquire_rooms where code = 'END234') then
    raise exception 'Unauthorized end deleted the room';
  end if;
  perform public.acquire_end_room(host, 'END234');
  if exists(select 1 from private.acquire_rooms where code = 'END234')
     or exists(select 1 from private.acquire_match_history where id = room_id) then
    raise exception 'Unfinished room or result remains after host ended it';
  end if;
end $$;

set local role authenticated;
do $$ begin
  begin
    perform public.acquire_get_room('00000000-0000-4000-8000-000000000001', 'TST234');
    raise exception 'Authenticated browser executed the privileged read';
  exception when insufficient_privilege then null; end;
  begin
    perform game from private.acquire_rooms;
    raise exception 'Authenticated browser read raw game state';
  exception when insufficient_privilege then null; end;
  begin
    perform public.acquire_end_room('00000000-0000-4000-8000-000000000501', 'END234');
    raise exception 'Authenticated browser executed privileged end';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Optimized transport preserves authorization, due timers and bot decisions.
do $$
declare
  host uuid := '00000000-0000-4000-8000-000000000011';
  guest uuid := '00000000-0000-4000-8000-000000000012';
  r jsonb; members jsonb; g jsonb; topic text; before_time timestamptz;
begin
  if has_function_privilege('authenticated', 'public.acquire_read_room(uuid,text,integer)', 'EXECUTE')
    or has_function_privilege('anon', 'public.acquire_commit_room_small(uuid,text,integer,jsonb,jsonb,text)', 'EXECUTE') then
    raise exception 'Optimized RPC is exposed to browsers';
  end if;
  r := public.acquire_create_room(host, 'Host', 'XPT234', 'classic');
  r := public.acquire_join_room(guest, 'Guest', 'XPT234');
  topic := 'acquire:' || (r->>'id');
  perform set_config('request.jwt.claims', jsonb_build_object('sub', host::text)::text, true);
  if not public.acquire_can_watch(topic || ':' || host::text)
    or public.acquire_can_watch(topic || ':' || guest::text)
    or public.acquire_can_watch(topic || ':' || host::text || ':extra') then
    raise exception 'Personalized channel authorization failed';
  end if;
  members := r->'players' || '[{"id":"bot","name":"CPU","isBot":true}]'::jsonb;
  g := jsonb_build_object('version', 2, 'ruleset', '2008', 'mode', 'classic', 'phase', 'place',
    'currentPlayer', 0, 'players', members, 'board', jsonb_build_object('1A', null));
  r := public.acquire_commit_room_small(host, 'XPT234', 1, g, members, 'playing');
  if r ? 'game' or r->>'version' <> '2' then raise exception 'Compact commit returned game or wrong version'; end if;
  if (select game from private.acquire_rooms where code = 'XPT234') <> g then raise exception 'Compact commit lost authoritative state'; end if;
  select updated_at into before_time from private.acquire_rooms where code = 'XPT234';
  r := public.acquire_read_room(guest, 'XPT234', 2);
  if r <> '{"unchanged":true,"version":2}'::jsonb then raise exception 'Idle check returned full room'; end if;
  if (select updated_at from private.acquire_rooms where code = 'XPT234') <> before_time then raise exception 'Read extended retention'; end if;
  if not (public.acquire_read_room(guest, 'XPT234', 1) ? 'game') then raise exception 'Missed version cannot recover'; end if;
  begin
    perform public.acquire_read_room('00000000-0000-4000-8000-000000000099', 'XPT234', 2);
    raise exception 'Nonmember read a room version';
  exception when others then if sqlerrm <> 'ROOM_NOT_FOUND' then raise; end if; end;
  g := g || jsonb_build_object('turnDeadlineAt', extract(epoch from now() - interval '1 minute') * 1000);
  perform public.acquire_commit_room_small(host, 'XPT234', 2, g, members, 'playing');
  if not (public.acquire_read_room(host, 'XPT234', 3) ? 'game') then raise exception 'Due timer was skipped'; end if;
  g := (g - 'turnDeadlineAt') || '{"currentPlayer":2}'::jsonb;
  perform public.acquire_commit_room_small(host, 'XPT234', 3, g, members, 'playing');
  if not (public.acquire_read_room(host, 'XPT234', 4) ? 'game') then raise exception 'Bot turn was skipped'; end if;
  g := g || '{"phase":"merger-shares","merger":{"shareholders":[0],"shareholderCursor":0}}'::jsonb;
  perform public.acquire_commit_room_small(host, 'XPT234', 4, g, members, 'playing');
  if public.acquire_read_room(host, 'XPT234', 5) ? 'game' then raise exception 'Human shareholder caused redundant full read'; end if;
  g := g || '{"currentPlayer":0,"merger":{"shareholders":[2],"shareholderCursor":0}}'::jsonb;
  perform public.acquire_commit_room_small(host, 'XPT234', 5, g, members, 'playing');
  if not (public.acquire_read_room(host, 'XPT234', 6) ? 'game') then raise exception 'Bot shareholder was skipped'; end if;
end $$;

rollback;
