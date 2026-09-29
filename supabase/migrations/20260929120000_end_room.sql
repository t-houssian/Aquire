-- An unfinished online table can be abandoned by its host without creating a match result.
create function public.acquire_end_room(p_user_id uuid, p_code text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare r private.acquire_rooms;
begin
  select * into r from private.acquire_rooms where code = p_code for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if r.host_id <> p_user_id then raise exception 'HOST_ONLY'; end if;
  if r.status = 'finished' then raise exception 'ROOM_FINISHED'; end if;
  delete from private.acquire_rooms where id = r.id;
end;
$$;

revoke all on function public.acquire_end_room(uuid, text) from public, anon, authenticated;
grant execute on function public.acquire_end_room(uuid, text) to service_role;
