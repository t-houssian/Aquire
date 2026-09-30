-- Conditional reads stay inside Postgres when nothing changed. Timed turns
-- and unfinished bot decisions still reach the authoritative game engine.
create or replace function public.acquire_read_room(p_user_id uuid, p_code text, p_known_version integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb; g jsonb; actor integer;
begin
  r := public.acquire_get_room(p_user_id, p_code);
  g := r->'game';
  actor := case when g->>'phase' = 'merger-shares' and jsonb_typeof(g->'merger') = 'object'
    then (g->'merger'->'shareholders'->>((g->'merger'->>'shareholderCursor')::integer))::integer
    else (g->>'currentPlayer')::integer end;
  if (r->>'version')::integer = p_known_version and
    (r->>'status' <> 'playing' or (
      coalesce(g->'players'->actor->>'isBot', 'false') <> 'true' and
      (g->>'turnDeadlineAt' is null or (g->>'turnDeadlineAt')::numeric > extract(epoch from clock_timestamp()) * 1000)
    )) then
    return jsonb_build_object('unchanged', true, 'version', p_known_version);
  end if;
  return r;
end;
$$;

-- Reuse all existing locking, edition, seat validation and archive triggers.
-- The Edge Function already has the committed game; don't send it back again.
create or replace function public.acquire_commit_room_small(
  p_user_id uuid, p_code text, p_expected_version integer, p_game jsonb, p_players jsonb, p_status text
) returns jsonb language sql security definer set search_path = '' as $$
  select public.acquire_commit_room(p_user_id, p_code, p_expected_version, p_game, p_players, p_status) - 'game';
$$;
revoke all on function public.acquire_read_room(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.acquire_commit_room_small(uuid, text, integer, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.acquire_read_room(uuid, text, integer) to service_role;
grant execute on function public.acquire_commit_room_small(uuid, text, integer, jsonb, jsonb, text) to service_role;

-- Shared channels retain version-only hints for older clients. Personalized
-- changes go exclusively to this member's private topic. No insert/send grant.
create or replace function public.acquire_can_watch(p_topic text)
returns boolean language sql stable security definer set search_path = '' as $$
  with identity as (
    select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub') as uid
  )
  select exists (
    select 1 from private.acquire_rooms r, identity i
    where (p_topic = 'acquire:' || r.id::text or p_topic = 'acquire:' || r.id::text || ':' || i.uid)
      and r.ruleset = '2008'
      and r.players @> jsonb_build_array(jsonb_build_object('id', i.uid, 'isBot', false))
  );
$$;
revoke all on function public.acquire_can_watch(text) from public, anon;
grant execute on function public.acquire_can_watch(text) to authenticated, service_role;
