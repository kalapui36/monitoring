begin;
create table if not exists public.app_admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 singleton boolean not null default true unique check(singleton), created_at timestamptz not null default now()
);
create or replace function public.app_is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.app_admins where user_id=auth.uid());
$$;
revoke all on function public.app_is_admin() from public;
grant execute on function public.app_is_admin() to authenticated;
create table if not exists public.app_classes (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 80),
 kind text not null default 'regular' check(kind in ('regular','club','external')),
 monitoring boolean not null default false, retention_days int not null default 7 check(retention_days between 1 and 30),
 capture_retention_days int not null default 1 check(capture_retention_days between 1 and 7),
 recovery_hash text, created_at timestamptz not null default now()
);
create table if not exists public.app_students (
 id uuid primary key default gen_random_uuid(), class_id uuid not null references public.app_classes(id) on delete cascade,
 student_number int not null check(student_number between 1 and 999), name text not null check(length(trim(name)) between 1 and 40),
 approval text not null default 'pending' check(approval in('pending','active','revoked')),
 last_seen timestamptz, active_url text not null default '', active_title text not null default '',
 duration_seconds int not null default 0, help_requested boolean not null default false,
 last_error text, created_at timestamptz not null default now()
);
create unique index if not exists app_student_number on public.app_students(class_id,student_number) where approval <> 'revoked';
create table if not exists public.app_devices (
 id uuid primary key default gen_random_uuid(), student_id uuid not null unique references public.app_students(id) on delete cascade,
 token_hash text not null unique check(length(token_hash)=64), revoked boolean not null default false,
 last_telemetry_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.app_join_codes (
 code_hash text primary key check(length(code_hash)=64), class_id uuid not null references public.app_classes(id) on delete cascade,
 expires_at timestamptz not null, uses int not null default 0, max_uses int not null check(max_uses between 1 and 99)
);
create table if not exists public.app_commands (
 id uuid primary key default gen_random_uuid(), revision bigint generated always as identity unique,
 class_id uuid not null references public.app_classes(id) on delete cascade,
 student_id uuid not null references public.app_students(id) on delete cascade,
 request_id uuid not null, kind text not null check(kind in('lock','unlock','notice','capture')),
 message text not null default '' check(length(message)<=500), duration_seconds int not null default 5 check(duration_seconds between 1 and 600),
 status text not null default 'queued' check(status in('queued','delivered','applied','failed','expired','superseded')),
 error text, created_at timestamptz not null default now(), delivered_at timestamptz, acknowledged_at timestamptz,
 expires_at timestamptz not null, unique(student_id,request_id)
);
create table if not exists public.app_visits (
 id uuid primary key, student_id uuid not null references public.app_students(id) on delete cascade,
 class_id uuid not null references public.app_classes(id) on delete cascade,
 url text not null check(length(url)<=2048), title text not null check(length(title)<=200), duration_seconds int not null check(duration_seconds between 0 and 86400),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.app_events (
 id bigint generated always as identity primary key, class_id uuid not null references public.app_classes(id) on delete cascade,
 student_id uuid references public.app_students(id) on delete cascade, kind text not null,
 detail text not null default '' check(length(detail)<=300), created_at timestamptz not null default now()
);
create table if not exists public.app_captures (
 command_id uuid primary key references public.app_commands(id) on delete cascade,
 class_id uuid not null references public.app_classes(id) on delete cascade,
 student_id uuid not null references public.app_students(id) on delete cascade,
 path text not null unique, created_at timestamptz not null default now(), expires_at timestamptz not null
);
create table if not exists public.app_rate_limits (key text primary key, bucket timestamptz not null, hits int not null);
create index if not exists app_students_class on public.app_students(class_id,last_seen desc);
create index if not exists app_command_device on public.app_commands(student_id,revision desc);
create index if not exists app_visit_history on public.app_visits(student_id,created_at desc);
create index if not exists app_event_history on public.app_events(class_id,created_at desc);

alter table public.app_admins enable row level security;
drop policy if exists admin_self on public.app_admins;
create policy admin_self on public.app_admins for select to authenticated using(user_id=auth.uid());
revoke all on public.app_admins from anon,authenticated;
grant select on public.app_admins to authenticated;
do $$ declare t text; begin
 foreach t in array array['app_classes','app_students','app_commands','app_visits','app_events','app_captures','app_devices','app_join_codes','app_rate_limits'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 if t not in ('app_devices','app_join_codes','app_rate_limits') then
 execute format('grant select on public.%I to authenticated',t);
 execute format('drop policy if exists admin_read on public.%I',t);
 execute format('create policy admin_read on public.%I for select to authenticated using(public.app_is_admin())',t);
 end if;
 end loop;
end $$;
-- Class/student writes go through constrained RPCs, never direct client updates.
create or replace function public.app_save_class(_id uuid,_name text,_kind text,_monitoring boolean,_days int default 7,_capture_days int default 1)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; begin
 if not public.app_is_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
 if _id is null then
 insert into public.app_classes(name,kind,monitoring,retention_days,capture_retention_days) values(trim(_name),_kind,_monitoring,_days,_capture_days) returning id into result;
 else
 update public.app_classes set name=trim(_name),kind=_kind,monitoring=_monitoring,retention_days=_days,capture_retention_days=_capture_days where id=_id returning id into result;
 if result is null then raise exception '학급을 찾지 못했습니다.'; end if;
 update public.app_captures set expires_at=least(expires_at,created_at+make_interval(days=>_capture_days)) where class_id=result;
 end if; return result;
end $$;
create or replace function public.app_manage_student(_id uuid,_action text)
returns void language plpgsql security definer set search_path='' as $$
declare s public.app_students; begin
 if not public.app_is_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
 select * into s from public.app_students where id=_id for update;
 if s.id is null then raise exception '학생을 찾지 못했습니다.'; end if;
 if _action='approve' then update public.app_students set approval='active' where id=_id and approval='pending';
 elsif _action='revoke' then
 update public.app_students set approval='revoked' where id=_id;
 update public.app_devices set revoked=true where student_id=_id;
 update public.app_commands set status='superseded' where student_id=_id and status in('queued','delivered');
 elsif _action='help_ack' then update public.app_students set help_requested=false where id=_id;
 else raise exception '지원하지 않는 작업입니다.'; end if;
 insert into public.app_events(class_id,student_id,kind) values(s.class_id,s.id,_action);
end $$;
create or replace function public.app_issue_commands(_class uuid,_students uuid[],_kind text,_message text,_duration int,_request uuid)
returns setof public.app_commands language plpgsql security definer set search_path='' as $$
declare s public.app_students; existing public.app_commands; ttl int; begin
 if not public.app_is_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
 if _kind not in('lock','unlock','notice','capture') or _duration<1 or _duration>600 or length(_message)>500 or (_kind in('lock','notice') and length(trim(_message))=0) then raise exception '명령 입력을 확인하세요.'; end if;
 if _kind='notice' and _duration>60 then raise exception '공지 표시는 60초 이하입니다.'; end if;
 if cardinality(_students)>99 then raise exception '학생 수를 확인하세요.'; end if;
 -- Unlock/lock take the same device row lock, serializing revisions per device.
 for s in select * from public.app_students where class_id=_class and approval='active' and id=any(_students) order by id for update loop
 select * into existing from public.app_commands where student_id=s.id and request_id=_request;
 if existing.id is not null then if existing.kind<>_kind or existing.message<>_message then raise exception '동일 요청 ID의 내용이 변경되었습니다. 새 요청을 만드세요.'; end if; return next existing; continue; end if;
 if _kind in('lock','unlock') then update public.app_commands set status='superseded' where student_id=s.id and kind in('lock','unlock') and status in('queued','delivered'); end if;
 ttl:=case when _kind='lock' then _duration else 90 end;
 insert into public.app_commands(class_id,student_id,request_id,kind,message,duration_seconds,expires_at)
 values(_class,s.id,_request,_kind,_message,_duration,now()+make_interval(secs=>ttl)) returning * into existing;
 return next existing;
 end loop;
end $$;
create or replace function public.app_consume_rate(_key text,_limit int) returns boolean language plpgsql security definer set search_path='' as $$
declare n int; b timestamptz:=date_trunc('minute',now()); begin
 insert into public.app_rate_limits as r values(_key,b,1) on conflict(key) do update set bucket=b,hits=case when r.bucket=b then r.hits+1 else 1 end returning hits into n;
 delete from public.app_rate_limits where bucket<now()-interval '1 day'; return n<=_limit;
end $$;
create or replace function public.app_register(_code text,_token text,_name text,_number int)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.app_join_codes; s public.app_students; d public.app_devices; begin
 select * into d from public.app_devices where token_hash=_token and not revoked;
 if d.id is not null then select * into s from public.app_students where id=d.student_id; return jsonb_build_object('studentId',s.id,'state',s.approval,'studentName',s.name); end if;
 select * into c from public.app_join_codes where code_hash=_code for update;
 if c.code_hash is null or c.expires_at<now() or c.uses>=c.max_uses then raise exception '참여 코드가 만료되었거나 유효하지 않습니다.'; end if;
 -- A global advisory lock bounds pending + active registrations across classes.
 perform pg_advisory_xact_lock(20261022);
 if (select count(*) from public.app_students where approval<>'revoked')>=99 then raise exception '전체 등록 한도는 99명입니다.'; end if;
 insert into public.app_students(class_id,name,student_number) values(c.class_id,trim(_name),_number) returning * into s;
 insert into public.app_devices(student_id,token_hash) values(s.id,_token);
 update public.app_join_codes set uses=uses+1 where code_hash=_code;
 insert into public.app_events(class_id,student_id,kind) values(s.class_id,s.id,'registration_requested');
 return jsonb_build_object('studentId',s.id,'state','pending');
end $$;
create or replace function public.app_device_exchange(_token text,_action text,_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.app_devices; s public.app_students; c public.app_classes; ack jsonb; latest public.app_commands; commands jsonb; v uuid; seconds int; begin
 select * into d from public.app_devices where token_hash=_token and not revoked;
 if d.id is null then raise exception 'DEVICE_UNAUTHORIZED'; end if;
 select * into s from public.app_students where id=d.student_id for update;
 select * into d from public.app_devices where id=d.id and not revoked for update;
 if d.id is null then raise exception 'DEVICE_REVOKED'; end if;
 if s.approval='revoked' then raise exception 'DEVICE_REVOKED'; end if;
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
 where id=(ack->>'id')::uuid and student_id=s.id and status in('queued','delivered') and expires_at>now();
 end loop;
 update public.app_commands set status='expired',error='기기 적용 확인 전 명령이 만료되었습니다.' where student_id=s.id and status in('queued','delivered') and expires_at<=now();
 select * into latest from public.app_commands where student_id=s.id and kind in('lock','unlock') order by revision desc limit 1;
 update public.app_commands set status='delivered',delivered_at=coalesce(delivered_at,now()) where student_id=s.id and status='queued' and expires_at>now();
 select coalesce(jsonb_agg(to_jsonb(x) order by x.revision),'[]'::jsonb) into commands from
 (select id,revision,kind,message,duration_seconds,expires_at from public.app_commands where student_id=s.id and status='delivered' and expires_at>now() order by revision limit 20) x;
 return jsonb_build_object('state','active','studentId',s.id,'studentName',s.name,'className',c.name,'monitoring',c.monitoring,'serverTime',now(),
 'recoveryHash',c.recovery_hash,'commands',commands,'lock',jsonb_build_object('revision',coalesce(latest.revision,0),'enabled',coalesce(latest.kind='lock' and latest.status not in('failed','expired','superseded') and latest.expires_at>now(),false),'message',coalesce(latest.message,''),'expiresAt',latest.expires_at));
end $$;
-- No student credential is a Supabase Auth JWT. These service-only RPCs are inaccessible through anon/authenticated REST.
revoke all on function public.app_consume_rate(text,int),public.app_register(text,text,text,int),public.app_device_exchange(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.app_consume_rate(text,int),public.app_register(text,text,text,int),public.app_device_exchange(text,text,jsonb) to service_role;
revoke all on function public.app_save_class(uuid,text,text,boolean,int,int),public.app_manage_student(uuid,text),public.app_issue_commands(uuid,uuid[],text,text,int,uuid) from public,anon;
grant execute on function public.app_save_class(uuid,text,text,boolean,int,int),public.app_manage_student(uuid,text),public.app_issue_commands(uuid,uuid[],text,text,int,uuid) to authenticated;
grant all on public.app_admins,public.app_classes,public.app_students,public.app_devices,public.app_join_codes,public.app_commands,public.app_visits,public.app_events,public.app_captures,public.app_rate_limits to service_role;

-- Private capture storage; students never receive a bucket credential or a public URL.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('student-captures','student-captures',false,3000000,array['image/jpeg','image/png']) on conflict(id) do update set public=false,file_size_limit=3000000,allowed_mime_types=array['image/jpeg','image/png'];
drop policy if exists app_capture_admin_read on storage.objects;
create policy app_capture_admin_read on storage.objects for select to authenticated using(bucket_id='student-captures' and public.app_is_admin() and exists(select 1 from public.app_captures c where c.path=storage.objects.name and c.expires_at>now()));
-- Minimal readable tables only; device secrets and invitation codes are never published.
do $$ declare t text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
 foreach t in array array['app_classes','app_students','app_commands','app_events','app_captures'] loop
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t); end if;
 end loop; end if;
end $$;
commit;
create or replace view public.app_latest_commands with (security_invoker=true) as select distinct on(student_id,kind) * from public.app_commands order by student_id,kind,revision desc;
grant select on public.app_latest_commands to authenticated;
create or replace function public.app_edit_student(_id uuid,_name text,_number int)
returns void language plpgsql security definer set search_path='' as $$
declare s public.app_students; begin
 if not public.app_is_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
 update public.app_students set name=trim(_name),student_number=_number where id=_id returning * into s;
 if s.id is null then raise exception '학생을 찾지 못했습니다.'; end if;
 insert into public.app_events(class_id,student_id,kind) values(s.class_id,s.id,'student_updated');
end $$;
revoke all on function public.app_edit_student(uuid,text,int) from public,anon;
grant execute on function public.app_edit_student(uuid,text,int) to authenticated;
