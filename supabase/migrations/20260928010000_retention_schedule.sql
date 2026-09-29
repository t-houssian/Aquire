-- Aquire-only guest accounts are tagged at sign-in. Do not touch other Auth users.
create or replace function public.acquire_prune_data()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_rooms integer := 0; v_matches integer := 0; v_users integer := 0; v_job_runs integer := 0;
begin
  delete from private.acquire_rooms
    where (status = 'lobby' and updated_at < now() - interval '48 hours')
       or (status = 'playing' and updated_at < now() - interval '30 days')
       or (status = 'finished' and updated_at < now() - interval '7 days');
  get diagnostics v_rooms = row_count;
  delete from private.acquire_match_history where created_at < now() - interval '365 days';
  get diagnostics v_matches = row_count;
  if pg_catalog.to_regclass('auth.users') is not null then
    execute $cleanup$
      delete from auth.users u
      where u.is_anonymous is true
        and u.raw_user_meta_data->>'app' = 'aquire'
        and u.created_at < now() - interval '365 days'
        and coalesce(u.last_sign_in_at, u.created_at) < now() - interval '365 days'
        and not exists (select 1 from private.acquire_rooms r where
          r.players @> jsonb_build_array(jsonb_build_object('id', u.id::text)))
        and not exists (select 1 from private.acquire_match_history m where
          m.participants @> array[u.id])
    $cleanup$;
    get diagnostics v_users = row_count;
  end if;
  if pg_catalog.to_regclass('cron.job_run_details') is not null then
    execute 'delete from cron.job_run_details where end_time < now() - interval ''30 days''';
    get diagnostics v_job_runs = row_count;
  end if;
  return pg_catalog.jsonb_build_object('rooms', v_rooms, 'matches', v_matches,
    'guests', v_users, 'cronRuns', v_job_runs);
end;
$$;
revoke all on function public.acquire_prune_data() from public, anon, authenticated;
grant execute on function public.acquire_prune_data() to service_role;

-- Supabase hosts pg_cron; PGlite and plain PostgreSQL can still use the
-- opportunistic cleanup run by room creation when the extension is unavailable.
do $schedule$
begin
  if exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
    execute $job$select cron.schedule('aquire-retention-daily', '35 3 * * *', 'select public.acquire_prune_data()')$job$;
  end if;
end;
$schedule$;
