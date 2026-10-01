-- Small-city house expansion: two players minimum; fifteen two-seat and fifteen four-seat maps.
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
    when 'big-aurora-gate' then 8 when 'big-trident-towers' then 8
    when 'mega-diamond' then 10 when 'mega-rivers' then 10 when 'mega-divide' then 10
    when 'mega-triple-arch' then 10 when 'mega-citadel-grid' then 10
    when 'max-metropolis' then 12 when 'max-archipelago' then 12 when 'max-cross' then 12
    when 'max-celestial-ring' then 12 when 'max-orion-star' then 12
    when 'classic' then 6 when 'corner-plazas' then 6 when 'riverwalk' then 6
    when 'grand-avenue' then 6 when 'courtyard' then 6 when 'peninsulas' then 6
    when 'hourglass' then 6 when 'crossroads' then 6 when 'switchback' then 6
    when 'atoll' then 6 when 'four-spires' then 6
    when 'twin-docks' then 6 when 'obelisk' then 6 when 'coral-crown' then 6
    when 'lightning-run' then 6 when 'compass-rose' then 6 when 'pinwheel' then 6
    when 'starfall-x' then 6 when 'twin-lagoons' then 6
    when 'lunar-moth' then 6 when 'ember-gear' then 6 when 'jade-infinity' then 6 when 'clockwork-keys' then 6 when 'crystal-cascade' then 6 when 'cloud-palace' then 6 when 'comet-arcade' then 6 when 'saffron-labyrinth' then 6 when 'biolume-reef' then 6 when 'lotus-gardens' then 6
    when 'big-dragon-spine' then 8 when 'big-moon-mosaic' then 8
    when 'mega-thunderbird' then 10 when 'mega-mirage-steps' then 10
    when 'max-world-tree' then 12 when 'max-astral-loom' then 12
    when 'duo-pocket-square' then 2 when 'duo-teacup-court' then 2 when 'duo-button-bay' then 2
    when 'duo-sugar-steps' then 2 when 'duo-moon-lock' then 2 when 'duo-matchbox' then 2
    when 'duo-fern-path' then 2 when 'duo-biscuit-ring' then 2 when 'duo-koi-crossing' then 2
    when 'duo-starlight-kite' then 2 when 'duo-coral-comb' then 2 when 'duo-lemon-bow' then 2
    when 'duo-velvet-rail' then 2 when 'duo-pebble-isle' then 2 when 'duo-jellybean' then 2
    when 'four-market-square' then 4 when 'four-amber-court' then 4 when 'four-sailmakers' then 4
    when 'four-paper-lantern' then 4 when 'four-crescent-pier' then 4 when 'four-foxglove' then 4
    when 'four-copper-coil' then 4 when 'four-blue-hour' then 4 when 'four-honey-arcade' then 4
    when 'four-pistachio-park' then 4 when 'four-vinyl-club' then 4 when 'four-tulip-terminal' then 4
    when 'four-kite-festival' then 4 when 'four-snowglobe' then 4 when 'four-rooftop-radio' then 4
    else null end;
  if v_max is null then raise exception 'INVALID_MAP'; end if;
  v_count := jsonb_array_length(p_players);
  if v_count < 2 or v_count > v_max then raise exception 'PLAYER_COUNT'; end if;
  if r.status = 'playing' and r.players <> p_players then raise exception 'INVALID_PLAYERS'; end if;
  update private.acquire_rooms set
    game = p_game, players = p_players, status = p_status,
    version = version + 1, updated_at = now()
  where id = r.id returning * into r;
  return to_jsonb(r);
end;
$$;

revoke all on function public.acquire_commit_room(uuid, text, integer, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.acquire_commit_room(uuid, text, integer, jsonb, jsonb, text) to service_role;
