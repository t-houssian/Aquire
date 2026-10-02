-- Expired directory listings reject new joiners. Existing members can still
-- start their table (including adding house CPUs), or refresh its listing.
create or replace function private.acquire_public_capacity() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if old.visibility='public' and old.status='lobby' and new.status='lobby'
      and old.updated_at<now()-interval '30 minutes'
      and jsonb_array_length(new.players)>jsonb_array_length(old.players) then raise exception 'LOBBY_EXPIRED'; end if;
  end if;
  if new.visibility='public' and (jsonb_array_length(new.players)>(new.lobby_options->>'seatLimit')::integer
    or (new.lobby_options->>'seatLimit')::integer not between 2 and 12) then raise exception 'ROOM_FULL'; end if;
  return new;
end $$;
revoke all on function private.acquire_public_capacity() from public,anon,authenticated;
