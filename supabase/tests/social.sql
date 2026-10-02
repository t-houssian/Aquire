begin;
do $$
declare host uuid:='00000000-0000-4000-8000-00000000a001'; guest uuid:='00000000-0000-4000-8000-00000000a002'; outsider uuid:='00000000-0000-4000-8000-00000000a003';
  r jsonb; before jsonb; record jsonb; players jsonb; game jsonb; room_id uuid;
begin
  if has_table_privilege('authenticated','private.acquire_profiles','select') or has_function_privilege('anon','public.acquire_profile(uuid)','execute')
    or has_function_privilege('authenticated','public.acquire_save_profile(uuid,text,text,text,integer)','execute')
    or has_function_privilege('authenticated','public.acquire_open_tables()','execute') then raise exception 'Browser can bypass profile/directory gateway'; end if;
  if public.acquire_profile(host) is not null then raise exception 'Reading profile created a record'; end if;
  r:=public.acquire_create_social_room(host,'Profile host','SAC234','a10010017','US',0,'public'); room_id:=(r->>'id')::uuid;
  if public.acquire_open_tables()->0->>'code'<>'SAC234' or public.acquire_open_tables()->0 ? 'game' then raise exception 'Unsafe/missing directory projection'; end if;
  perform public.acquire_create_social_room(outsider,'Private investor','SEC234',null,'',0,'private');
  if jsonb_array_length(public.acquire_open_tables())<>1 then raise exception 'Private table in public directory'; end if;
  begin perform public.acquire_create_social_room(host,'Second table','DUP234',null,'',0,'public');raise exception 'Multiple public tables allowed';
    exception when others then if sqlerrm<>'PUBLIC_ROOM_LIMIT' then raise;end if;end;
  begin perform public.acquire_configure_lobby(guest,'SAC234',0,'private','{"mapId":"classic","seatLimit":6}');raise exception 'Guest configured table';
    exception when others then if sqlerrm<>'HOST_ONLY' then raise;end if;end;
  r:=public.acquire_configure_lobby(host,'SAC234',(r->>'version')::integer,'public','{"mapId":"duo-pocket-square","seatLimit":2,"botDifficulty":"standard"}');
  before:=r;
  r:=public.acquire_join_social_room(guest,'Profile guest','SAC234','a10010017','CA',5);
  if jsonb_array_length(public.acquire_open_tables())<>0 then raise exception 'Full table still listed';end if;
  begin perform public.acquire_configure_lobby(host,'SAC234',(before->>'version')::integer,'public',before->'lobby_options');raise exception 'Stale settings overwrite';
    exception when others then if sqlerrm<>'VERSION_CONFLICT' then raise;end if;end;
  begin perform public.acquire_join_room(outsider,'Old client','SAC234');raise exception 'Legacy join bypassed public seat limit';
    exception when others then if sqlerrm<>'ROOM_FULL' then raise;end if;end;
  before:=public.acquire_profile(guest);
  perform public.acquire_join_social_room(guest,'Changed','SAC234',null,'',0);
  if public.acquire_profile(guest)<>before then raise exception 'Rejoin rewrote profile';end if;
  perform public.acquire_save_profile(guest,'Profile guest','a200100170000000','CA',0);
  if public.acquire_profile(guest)->>'storyWins'<>'5' then raise exception 'Story rewards were lost';end if;
  begin perform public.acquire_save_profile(host,'Locked','a200100j70000000','US',0);raise exception 'Online cosmetic unlocked before win';
    exception when others then if sqlerrm<>'REWARD_LOCKED' then raise;end if;end;
  begin perform public.acquire_save_profile(host,'Invalid','a2zzzzzzzzzzzzzz','US',0);raise exception 'Malformed face accepted';
    exception when others then if sqlerrm<>'INVALID_AVATAR' then raise;end if;end;
  players:=r->'players';
  game:=jsonb_build_object('version',2,'ruleset','2008','mode','classic','mapId','duo-pocket-square','phase','ended','players',players,'board','{}'::jsonb,
    'winnerIds',jsonb_build_array(host),'results',jsonb_build_array(
    jsonb_build_object('playerId',host,'rank',1,'total',12300),jsonb_build_object('playerId',guest,'rank',2,'total',8000)));
  r:=public.acquire_commit_room(host,'SAC234',(r->>'version')::integer,game,players,'finished');
  record:=public.acquire_profile(host);
  if record->>'games'<>'1' or record->>'wins'<>'1' or record->>'placementSum'<>'1' or record->>'bestScore'<>'12300' then raise exception 'Win record incorrect: %',record;end if;
  if public.acquire_profile(guest)->>'games'<>'1' or public.acquire_profile(guest)->>'placementSum'<>'2' then raise exception 'Losing placement incorrect';end if;
  perform private.acquire_archive_room((select t from private.acquire_rooms t where id=room_id));
  if public.acquire_profile(host)<>record then raise exception 'Duplicate archive counted twice';end if;
  perform public.acquire_save_profile(host,'Winner','a200100j70000000','US',0);
  if public.acquire_profile(host)->>'wins'<>'1' then raise exception 'Saving face reset record';end if;
  begin perform public.acquire_save_profile(host,'Unearned','a200100k70000000','US',0);raise exception 'Higher online milestone accepted';
    exception when others then if sqlerrm<>'REWARD_LOCKED' then raise;end if;end;
  insert into private.acquire_match_history(id,participants,summary) values('00000000-0000-4000-8000-00000000b002',array[host,guest],
    jsonb_build_object('players',players,'winnerIds',jsonb_build_array(host,guest),'results',jsonb_build_array(
    jsonb_build_object('playerId',host,'rank',1,'total',10000),jsonb_build_object('playerId',guest,'rank',1,'total',10000))));
  record:=public.acquire_profile(host);
  if record->>'games'<>'2' or record->>'wins'<>'1' or record->>'ties'<>'1' or record->>'bestScore'<>'12300' then raise exception 'Shared win record incorrect';end if;
  if public.acquire_profile(guest)->>'placementSum'<>'3' then raise exception 'Average placement accumulation incorrect';end if;
  insert into private.acquire_match_history(id,participants,summary) values('00000000-0000-4000-8000-00000000b003',array[host],
    jsonb_build_object('players',jsonb_build_array(jsonb_build_object('id',host,'name','Winner','isBot',false),jsonb_build_object('id','bot','name','Bot','isBot',true)),
    'winnerIds',jsonb_build_array(host),'results',jsonb_build_array(jsonb_build_object('playerId',host,'rank',1,'total',50000))));
  if public.acquire_profile(host)<>record then raise exception 'CPU-only match farmed competitive record';end if;
  delete from private.acquire_match_history where id in(room_id,'00000000-0000-4000-8000-00000000b002','00000000-0000-4000-8000-00000000b003');
  if public.acquire_profile(host)<>record then raise exception 'Archive pruning erased lifetime record';end if;
  r:=public.acquire_create_social_room(host,'New table','ELD234',null,'',0,'public');
  update private.acquire_rooms set updated_at=now()-interval '31 minutes' where code='ELD234';
  if jsonb_array_length(public.acquire_open_tables())<>0 then raise exception 'Expired lobby listed';end if;
  begin perform public.acquire_join_social_room(guest,'Guest','ELD234',null,'',0);raise exception 'Expired lobby joined';
    exception when others then if sqlerrm<>'LOBBY_EXPIRED' then raise;end if;end;
  begin perform public.acquire_join_room(guest,'Old guest','ELD234');raise exception 'Old client joined expired lobby';
    exception when others then if sqlerrm<>'LOBBY_EXPIRED' then raise;end if;end;
  players:=(r->'players') || jsonb_build_array(jsonb_build_object('id','bot-qa','name','CPU','isBot',true));
  game:=jsonb_build_object('version',2,'ruleset','2008','mode','classic','mapId','classic','phase','place','players',players);
  perform public.acquire_commit_room(host,'ELD234',(r->>'version')::integer,game,players,'playing');
  if (select status from private.acquire_rooms where code='ELD234')<>'playing' then raise exception 'Existing host could not start expired listing with a CPU';end if;
  perform public.acquire_end_room(host,'ELD234');
  r:=public.acquire_create_social_room(host,'Cleanup table','CUP234',null,'',0,'public');
  update private.acquire_rooms set updated_at=now()-interval '2 hours' where code='CUP234';
  perform public.acquire_prune_data();
  if exists(select 1 from private.acquire_rooms where code='CUP234') then raise exception 'Stale public lobby not pruned';end if;
end $$;
rollback;
