-- One small lifetime record per guest. No avatar images, per-turn events,
-- presence rows, or copies of story games are stored.
create table private.acquire_profiles (
  id uuid primary key, name text not null, avatar text, country text not null default '',
  story_wins smallint not null default 0 check (story_wins between 0 and 81),
  games integer not null default 0, wins integer not null default 0, ties integer not null default 0,
  placement_sum integer not null default 0, podiums integer not null default 0,
  best_finish smallint, best_score integer not null default 0,
  updated_at timestamptz not null default now(),
  check (char_length(name) between 1 and 24), check (country = '' or country ~ '^[A-Z]{2}$'),
  check (games >= wins + ties and wins >= 0 and ties >= 0 and placement_sum >= games)
);
alter table private.acquire_profiles enable row level security;
revoke all on private.acquire_profiles from public, anon, authenticated;
do $$ begin
  if pg_catalog.to_regclass('auth.users') is not null then
    alter table private.acquire_profiles add constraint acquire_profiles_user_fk
      foreign key (id) references auth.users(id) on delete cascade;
  end if;
end $$;

create function private.acquire_validate_avatar(p_avatar text, p_story integer, p_online integer)
returns void language plpgsql set search_path = '' as $$
declare a text; o text; b text; d text;
begin
  if p_avatar is null then return; end if;
  if p_avatar ~ '^a1[0-6][0-7][0-3][0-2][0-2][0-8][0-9a-n]$' then return; end if;
  if p_avatar !~ '^a2[0-8][0-9a-f][0-9ab][0-6][0-6][0-9a-m][0-9a-n][0-4][0-4][0-7][0-9][0-9][0-5][0-7]$' then raise exception 'INVALID_AVATAR'; end if;
  a := substr(p_avatar,8,1); o := substr(p_avatar,13,1);
  b := substr(p_avatar,14,1); d := substr(p_avatar,16,1);
  if (a = 'g' and p_story < 5) or (a = 'h' and p_story < 12) or (a = 'i' and p_story < 81)
    or (o = '6' and p_story < 10) or (o = '7' and p_story < 81) or (b = '8' and p_story < 5)
    or (d = '1' and p_story < 1) or (d = '2' and p_story < 12)
    or (d = '3' and p_story < 25) or (d = '4' and p_story < 81)
    or (a = 'j' and p_online < 1) or (a = 'k' and p_online < 5)
    or (a = 'l' and p_online < 10) or (a = 'm' and p_online < 25)
    or (o = '8' and p_online < 10) or (o = '9' and p_online < 25) or (b = '9' and p_online < 5)
    or (d = '5' and p_online < 1) or (d = '6' and p_online < 10) or (d = '7' and p_online < 25)
  then raise exception 'REWARD_LOCKED'; end if;
end $$;

create function public.acquire_profile(p_user_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object('id',id,'name',name,'avatar',avatar,'country',country,
    'storyWins',story_wins,'games',games,'wins',wins,'ties',ties,'placementSum',placement_sum,
    'podiums',podiums,'bestFinish',best_finish,'bestScore',best_score)
  from private.acquire_profiles where id=p_user_id;
$$;

create function public.acquire_save_profile(p_user_id uuid, p_name text, p_avatar text, p_country text, p_story_wins integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r private.acquire_profiles; v_story integer;
begin
  if p_user_id is null or p_name is null or char_length(trim(p_name)) not between 1 and 24 then raise exception 'INVALID_NAME'; end if;
  if p_country is null or (p_country <> '' and p_country !~ '^[A-Z]{2}$') then raise exception 'INVALID_COUNTRY'; end if;
  if p_story_wins is null or p_story_wins not between 0 and 81 then raise exception 'INVALID_PROGRESS'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  select * into r from private.acquire_profiles where id=p_user_id;
  v_story := greatest(coalesce(r.story_wins,0), p_story_wins);
  perform private.acquire_validate_avatar(p_avatar, v_story, coalesce(r.wins,0));
  insert into private.acquire_profiles(id,name,avatar,country,story_wins)
    values(p_user_id,trim(p_name),p_avatar,p_country,v_story)
  on conflict(id) do update set name=excluded.name, avatar=excluded.avatar,
    country=excluded.country, story_wins=excluded.story_wins, updated_at=now()
  where (acquire_profiles.name,acquire_profiles.avatar,acquire_profiles.country,acquire_profiles.story_wins)
    is distinct from (excluded.name,excluded.avatar,excluded.country,excluded.story_wins);
  return public.acquire_profile(p_user_id);
end $$;

-- The archive primary key makes this exactly once, even on retries and reloads.
-- A competitive record requires two human seats. Games with only house CPUs
-- remain in history, but cannot be farmed for online wardrobe rewards.
create function private.acquire_count_match(p_summary jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare p jsonb; result jsonb; uid uuid; place integer; score integer; winner boolean; shared boolean; alive boolean;
begin
  if (select count(*) from jsonb_array_elements(coalesce(p_summary->'players','[]')) as entry where entry->>'isBot'='false') < 2 then return; end if;
  shared := jsonb_array_length(coalesce(p_summary->'winnerIds','[]')) > 1;
  for p in select value from jsonb_array_elements(p_summary->'players') where value->>'isBot'='false' order by value->>'id' loop
    if p->>'id' !~ '^[0-9a-fA-F-]{36}$' then continue; end if;
    uid := (p->>'id')::uuid;
    if pg_catalog.to_regclass('auth.users') is not null then
      execute 'select exists(select 1 from auth.users where id=$1)' into alive using uid;
      if not alive then continue; end if;
    end if;
    select value into result from jsonb_array_elements(coalesce(p_summary->'results','[]')) where value->>'playerId'=uid::text;
    if result is null or not coalesce(result->>'rank' ~ '^[1-9][0-9]?$',false) or not coalesce(result->>'total' ~ '^[0-9]{1,9}$',false) then continue; end if;
    place := (result->>'rank')::integer; score := (result->>'total')::integer;
    if place > jsonb_array_length(p_summary->'players') then continue; end if;
    winner := coalesce(p_summary->'winnerIds' ? uid::text, false);
    insert into private.acquire_profiles(id,name,avatar,country,games,wins,ties,placement_sum,podiums,best_finish,best_score)
      values(uid,left(coalesce(nullif(p->>'name',''),'Investor'),24),p->>'avatar',coalesce(p->>'country',''),
        1,(winner and not shared)::integer,(winner and shared)::integer,place,(place<=3)::integer,place,score)
    on conflict(id) do update set games=acquire_profiles.games+1,
      wins=acquire_profiles.wins+excluded.wins,ties=acquire_profiles.ties+excluded.ties,
      placement_sum=acquire_profiles.placement_sum+excluded.placement_sum,
      podiums=acquire_profiles.podiums+excluded.podiums,
      best_finish=least(acquire_profiles.best_finish,excluded.best_finish),
      best_score=greatest(acquire_profiles.best_score,excluded.best_score),updated_at=now();
  end loop;
end $$;
do $$ declare m record; begin
  for m in select summary from private.acquire_match_history order by created_at loop
    perform private.acquire_count_match(m.summary);
  end loop;
end $$;
create function private.acquire_profile_match_trigger() returns trigger language plpgsql security definer set search_path='' as $$
begin perform private.acquire_count_match(new.summary); return new; end $$;
create trigger acquire_profile_match after insert on private.acquire_match_history
  for each row execute function private.acquire_profile_match_trigger();

alter table private.acquire_rooms add column visibility text not null default 'private' check(visibility in ('private','public'));
alter table private.acquire_rooms add column lobby_options jsonb not null default '{"mapId":"classic","seatLimit":6,"botDifficulty":"standard"}';
create index acquire_open_tables on private.acquire_rooms(updated_at desc) where visibility='public' and status='lobby' and ruleset='2008';

-- Also covers older join RPCs, so they cannot overfill a published table.
create function private.acquire_public_capacity() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if old.visibility='public' and old.status='lobby' and old.updated_at<now()-interval '30 minutes'
      and jsonb_array_length(new.players)>jsonb_array_length(old.players) then raise exception 'LOBBY_EXPIRED'; end if;
  end if;
  if new.visibility='public' and (jsonb_array_length(new.players) > (new.lobby_options->>'seatLimit')::integer
    or (new.lobby_options->>'seatLimit')::integer not between 2 and 12) then raise exception 'ROOM_FULL'; end if;
  return new;
end $$;
create trigger acquire_public_seats before insert or update on private.acquire_rooms
  for each row execute function private.acquire_public_capacity();

create function public.acquire_create_social_room(p_user_id uuid,p_name text,p_code text,p_avatar text,p_country text,p_story_wins integer,p_visibility text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.acquire_rooms; profile jsonb;
begin
  if p_visibility is null or p_visibility not in ('private','public') then raise exception 'INVALID_VISIBILITY'; end if;
  profile := public.acquire_save_profile(p_user_id,p_name,p_avatar,p_country,p_story_wins);
  if (select count(*) from private.acquire_rooms where host_id=p_user_id and ruleset='2008' and status<>'finished' and created_at>now()-interval '24 hours') >= 8 then raise exception 'ROOM_LIMIT'; end if;
  if p_visibility='public' and exists(select 1 from private.acquire_rooms where host_id=p_user_id and visibility='public' and status='lobby' and updated_at>now()-interval '30 minutes') then raise exception 'PUBLIC_ROOM_LIMIT'; end if;
  insert into private.acquire_rooms(code,host_id,players,mode,ruleset,visibility)
    values(p_code,p_user_id,jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('id',p_user_id::text,'name',profile->>'name','isBot',false,'avatar',profile->>'avatar','country',profile->>'country'))),'classic','2008',p_visibility)
    returning * into r;
  return to_jsonb(r);
end $$;

create function public.acquire_join_social_room(p_user_id uuid,p_name text,p_code text,p_avatar text,p_country text,p_story_wins integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.acquire_rooms; profile jsonb;
begin
  -- Profile lock precedes room lock consistently with creation.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  select * into r from private.acquire_rooms where code=p_code for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if r.ruleset<>'2008' or r.mode<>'classic' then raise exception 'OLD_RULESET'; end if;
  if r.players @> jsonb_build_array(jsonb_build_object('id',p_user_id::text)) then return to_jsonb(r); end if;
  if r.status<>'lobby' then raise exception 'ROOM_STARTED'; end if;
  if r.visibility='public' and r.updated_at<now()-interval '30 minutes' then raise exception 'LOBBY_EXPIRED'; end if;
  if jsonb_array_length(r.players)>=(case when r.visibility='public' then (r.lobby_options->>'seatLimit')::integer else 12 end) then raise exception 'ROOM_FULL'; end if;
  profile := public.acquire_save_profile(p_user_id,p_name,p_avatar,p_country,p_story_wins);
  update private.acquire_rooms set players=players || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('id',p_user_id::text,'name',profile->>'name','isBot',false,'avatar',profile->>'avatar','country',profile->>'country'))),version=version+1,updated_at=now() where id=r.id returning * into r;
  return to_jsonb(r);
end $$;

create function public.acquire_configure_lobby(p_user_id uuid,p_code text,p_expected_version integer,p_visibility text,p_options jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.acquire_rooms;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  select * into r from private.acquire_rooms where code=p_code for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if r.host_id<>p_user_id then raise exception 'HOST_ONLY'; end if;
  if r.ruleset<>'2008' or r.mode<>'classic' then raise exception 'OLD_RULESET'; end if;
  if r.status<>'lobby' then raise exception 'ROOM_STARTED'; end if;
  if r.version<>p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if p_visibility is null or p_visibility not in ('public','private') or p_options is null
    or jsonb_typeof(p_options)<>'object' or p_options->>'seatLimit' is null
    or p_options->>'mapId' is null or (p_options->>'seatLimit')::integer not between 2 and 12 then raise exception 'INVALID_LOBBY'; end if;
  if p_visibility='public' and exists(select 1 from private.acquire_rooms where host_id=p_user_id and id<>r.id and visibility='public' and status='lobby' and updated_at>now()-interval '30 minutes') then raise exception 'PUBLIC_ROOM_LIMIT'; end if;
  update private.acquire_rooms set visibility=p_visibility,lobby_options=p_options,version=version+1,updated_at=now() where id=r.id returning * into r;
  return to_jsonb(r);
end $$;

-- Only a bounded directory projection is exposed: never game state, racks,
-- the bag, the RNG, or private tables. Reads do not touch updated_at.
create function public.acquire_open_tables()
returns jsonb language sql security definer set search_path='' as $$
  select coalesce(jsonb_agg(entry),'[]') from (
    select jsonb_build_object('code',code,'host',(select p from jsonb_array_elements(players) p where p->>'id'=host_id::text limit 1),
      'playerCount',jsonb_array_length(players),'options',lobby_options,'updatedAt',updated_at) as entry
    from private.acquire_rooms where visibility='public' and status='lobby' and ruleset='2008' and mode='classic'
      and updated_at>now()-interval '30 minutes' and jsonb_array_length(players)<(lobby_options->>'seatLimit')::integer
    order by updated_at desc limit 24
  ) as directory;
$$;

-- Reuse the daily/opportunistic cleanup; no extra heartbeat jobs.
alter function public.acquire_prune_data() rename to acquire_prune_existing_data;
create function public.acquire_prune_data() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; count integer;
begin
  delete from private.acquire_rooms where visibility='public' and status='lobby' and updated_at<now()-interval '1 hour';
  get diagnostics count=row_count;
  result:=public.acquire_prune_existing_data();
  return result || jsonb_build_object('rooms',coalesce((result->>'rooms')::integer,0)+count);
end $$;

revoke all on all functions in schema private from public,anon,authenticated;
revoke all on function public.acquire_profile(uuid), public.acquire_save_profile(uuid,text,text,text,integer),
  public.acquire_create_social_room(uuid,text,text,text,text,integer,text), public.acquire_join_social_room(uuid,text,text,text,text,integer),
  public.acquire_configure_lobby(uuid,text,integer,text,jsonb), public.acquire_open_tables(), public.acquire_prune_data(), public.acquire_prune_existing_data()
  from public,anon,authenticated;
grant execute on function public.acquire_profile(uuid), public.acquire_save_profile(uuid,text,text,text,integer),
  public.acquire_create_social_room(uuid,text,text,text,text,integer,text), public.acquire_join_social_room(uuid,text,text,text,text,integer),
  public.acquire_configure_lobby(uuid,text,integer,text,jsonb), public.acquire_open_tables(), public.acquire_prune_data() to service_role;
