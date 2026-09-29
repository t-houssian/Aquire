-- Keep older-edition rooms intact when a current client requests closure.
create or replace function public.acquire_end_room(p_user_id uuid, p_code text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare r private.acquire_rooms;
begin
  select * into r from private.acquire_rooms where code = p_code for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if r.host_id <> p_user_id then raise exception 'HOST_ONLY'; end if;
  if r.ruleset <> '2008' then raise exception 'OLD_RULESET'; end if;
  if r.status = 'finished' then raise exception 'ROOM_FINISHED'; end if;
  delete from private.acquire_rooms where id = r.id;
end;
$$;
