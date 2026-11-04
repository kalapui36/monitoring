-- Security hardening. Apply after all three previous migrations.
begin;
update storage.buckets set public=false where id='student-captures';
-- Previously completed captures stay readable. New uploads reserve metadata first.
alter table public.app_captures add column if not exists uploaded boolean not null default true;
alter table public.app_captures alter column uploaded set default false;
drop policy if exists app_capture_teacher_read on storage.objects;
create policy app_capture_teacher_read on storage.objects for select to authenticated using(
 bucket_id='student-captures' and exists(select 1 from public.app_captures c where c.path=storage.objects.name and c.uploaded and c.expires_at>now() and public.app_owns_class(c.class_id))
);

create or replace function public.app_device_exchange(_token text,_action text,_payload jsonb default '{"securityVersion":2}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.app_devices; s public.app_students; c public.app_classes; ack jsonb; latest public.app_commands; commands jsonb; v uuid; seconds int; begin
 if _payload->>'securityVersion' is distinct from '2' then raise exception 'DEVICE_SECURITY_UPDATE_REQUIRED'; end if;
 select * into d from public.app_devices where token_hash=_token and not revoked;
 if d.id is null then raise exception 'DEVICE_UNAUTHORIZED'; end if;
 select * into s from public.app_students where id=d.student_id for update;
 select * into d from public.app_devices where id=d.id and not revoked for update;
 if d.id is null then raise exception 'DEVICE_REVOKED'; end if;
 if s.approval='revoked' then raise exception 'DEVICE_REVOKED'; end if;
 select * into c from public.app_classes where id=s.class_id;
 if not exists(select 1 from public.app_admins a join public.app_teachers t on t.user_id=a.user_id where a.user_id=c.owner_id and t.active) then raise exception 'DEVICE_REVOKED'; end if;
 if s.approval='pending' then return jsonb_build_object('state','pending','studentId',s.id,'studentName',s.name); end if;
 select * into c from public.app_classes where id=s.class_id;
 if _payload ? 'deviceError' then update public.app_students set last_error=nullif(left(_payload->>'deviceError',200),'') where id=s.id and last_error is distinct from nullif(left(_payload->>'deviceError',200),''); end if;
 if s.last_seen is null or now()-s.last_seen>interval '120 seconds' then insert into public.app_events(class_id,student_id,kind,detail) values(s.class_id,s.id,case when s.last_seen is null then 'connected' else 'reconnected' end,coalesce('이전 수신: '||s.last_seen::text,'')); end if;
 update public.app_students set last_seen=now() where id=s.id and (last_seen is null or now()-last_seen>=interval '30 seconds');
 if _action='help' then
 if not s.help_requested then insert into public.app_events(class_id,student_id,kind) values(c.id,s.id,'help_requested'); end if;
 update public.app_students set help_requested=true where id=s.id;
 elsif _action='telemetry' and c.monitoring then
 if d.last_telemetry_at is null or now()-d.last_telemetry_at>=interval '3 seconds' or not exists(select 1 from public.app_visits where id=(_payload->>'visitId')::uuid and student_id=s.id) then
 v:=(_payload->>'visitId')::uuid; seconds:=greatest(0,least(86400,coalesce((_payload->>'duration')::int,0)));
 insert into public.app_visits as old(id,student_id,class_id,url,title,duration_seconds)
 values(v,s.id,c.id,left(_payload->>'url',2048),left(coalesce(_payload->>'title',''),200),seconds)
 on conflict(id) do update set duration_seconds=greatest(old.duration_seconds,excluded.duration_seconds),updated_at=now()
 where old.student_id=s.id;
 if not exists(select 1 from public.app_visits where id=v and student_id=s.id) then raise exception 'VISIT_OWNERSHIP'; end if;
 update public.app_students set active_url=left(_payload->>'url',2048),active_title=left(coalesce(_payload->>'title',''),200),duration_seconds=seconds where id=s.id;
 update public.app_devices set last_telemetry_at=now() where id=d.id;
 end if;
 elsif _action='safety_release' then
 update public.app_commands set status='failed',error=left(coalesce(_payload->>'reason','기기 안전 해제'),200),acknowledged_at=now()
 where student_id=s.id and revision=coalesce((_payload->>'revision')::bigint,0) and kind='lock' and status not in('superseded','expired');
 insert into public.app_events(class_id,student_id,kind,detail) values(c.id,s.id,'safety_release',left(coalesce(_payload->>'reason',''),200));
 elsif _action not in('poll','telemetry','auth','ack') then raise exception 'UNKNOWN_ACTION';
 end if;
 for ack in select value from jsonb_array_elements(coalesce(_payload->'acks','[]'::jsonb)) limit 20 loop
 if ack->>'status' not in('applied','failed') then continue; end if;
 update public.app_commands set status=ack->>'status',error=left(ack->>'error',200),acknowledged_at=now()
 where id=(ack->>'id')::uuid and student_id=s.id and status in('queued','delivered') and expires_at>now()
 and (kind<>'capture' or ack->>'status'<>'applied' or exists(
  select 1 from public.app_captures cap where cap.command_id=public.app_commands.id and cap.student_id=s.id and cap.class_id=s.class_id and cap.uploaded and cap.expires_at>now()
 ));
 end loop;
 update public.app_commands set status='expired',error='기기 적용 확인 전 명령이 만료되었습니다.' where student_id=s.id and status in('queued','delivered') and expires_at<=now();
 select * into latest from public.app_commands where student_id=s.id and kind in('lock','unlock') order by revision desc limit 1;
 update public.app_commands set status='delivered',delivered_at=coalesce(delivered_at,now()) where student_id=s.id and status='queued' and expires_at>now();
 select coalesce(jsonb_agg(to_jsonb(x) order by x.revision),'[]'::jsonb) into commands from
 (select id,revision,kind,message,duration_seconds,expires_at from public.app_commands where student_id=s.id and status='delivered' and expires_at>now() order by revision limit 20) x;
 return jsonb_build_object('state','active','studentId',s.id,'studentName',s.name,'className',c.name,'monitoring',c.monitoring,'serverTime',now(),
 'recoveryHash',c.recovery_hash,'commands',commands,'lock',jsonb_build_object('revision',coalesce(latest.revision,0),'enabled',coalesce(latest.kind='lock' and latest.status not in('failed','expired','superseded') and latest.expires_at>now(),false),'message',coalesce(latest.message,''),'expiresAt',latest.expires_at));
end $$;

-- Only the server reaches this after Storage confirms the upload. Browser/device REST cannot invoke it.
create or replace function public.app_complete_capture(_token text,_command uuid)
returns void language plpgsql security definer set search_path='' as $$
declare identity jsonb; cmd public.app_commands;
begin
 identity:=public.app_device_exchange(_token,'auth');
 if identity->>'state'<>'active' then raise exception 'DEVICE_UNAUTHORIZED'; end if;
 select * into cmd from public.app_commands where id=_command and student_id=(identity->>'studentId')::uuid and kind='capture' for update;
 if cmd.id is null or cmd.expires_at<=now() or cmd.status not in('queued','delivered') then raise exception 'CAPTURE_EXPIRED'; end if;
 update public.app_captures set uploaded=true where command_id=cmd.id and student_id=cmd.student_id and class_id=cmd.class_id and expires_at>now();
 if not found then raise exception 'CAPTURE_RESERVATION_REQUIRED'; end if;
 update public.app_commands set status='applied',error=null,acknowledged_at=now() where id=cmd.id;
end $$;
revoke all on function public.app_device_exchange(text,text,jsonb),public.app_complete_capture(text,uuid) from public,anon,authenticated;
grant execute on function public.app_device_exchange(text,text,jsonb),public.app_complete_capture(text,uuid) to service_role;
create or replace function public.app_security_version() returns int language sql stable set search_path='' as $$ select 4; $$;
revoke all on function public.app_security_version() from public,anon;
grant execute on function public.app_security_version() to authenticated;
commit;
