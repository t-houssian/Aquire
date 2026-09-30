-- Realtime carries only a room version, never racks, cash, shares or board state.
-- The Edge Function sends notifications over HTTP: no per-move notification
-- rows or additional room snapshots are stored in PostgreSQL.
-- Auth's current JWT is exposed via request.jwt.claims on newer PostgREST and
-- Realtime, and via request.jwt.claim.sub on older gateways.
create or replace function public.acquire_can_watch(p_topic text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.acquire_rooms r
    where 'acquire:' || r.id::text = p_topic
      and r.ruleset = '2008'
      and r.players @> jsonb_build_array(jsonb_build_object(
        'id', coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
          nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'),
        'isBot', false
      ))
  );
$$;
revoke all on function public.acquire_can_watch(text) from public, anon;
grant execute on function public.acquire_can_watch(text) to authenticated, service_role;

-- Embedded PostgreSQL tests have no Realtime schema. The membership function
-- is still tested there; hosted Supabase installs the receive-only policy.
do $$ begin
  if to_regclass('realtime.messages') is not null then
    execute $policy$create policy "Aquire members receive room notifications"
      on realtime.messages for select to authenticated
      using (extension = 'broadcast' and public.acquire_can_watch(realtime.topic()))$policy$;
  end if;
end $$;
