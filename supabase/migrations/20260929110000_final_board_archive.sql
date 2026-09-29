-- Persist one compact character per board square in finished match summaries.
-- A 12x9 match adds 108 bytes before JSON overhead; no turn history is archived.
create or replace function private.acquire_archive_room(p_room private.acquire_rooms)
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
    'endReason', coalesce(p_room.game->>'endReason','The game ended.'),
    'boardSnapshot', coalesce(p_room.game->>'boardSnapshot','')
  )) on conflict (id) do nothing;
end;
$$;
revoke all on function private.acquire_archive_room(private.acquire_rooms) from public, anon, authenticated;
