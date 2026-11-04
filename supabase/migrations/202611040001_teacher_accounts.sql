-- Apply AFTER 202610220001_monitoring.sql. Teacher signup is explicit, never superadmin signup.
begin;
create table if not exists public.app_teachers (
 user_id uuid primary key references auth.users(id) on delete cascade,
 active boolean not null default true, created_at timestamptz not null default now()
);
alter table public.app_teachers enable row level security;
revoke all on public.app_teachers from public,anon,authenticated;
grant select on public.app_teachers to authenticated;
grant all on public.app_teachers to service_role;
drop policy if exists teacher_self on public.app_teachers;
create policy teacher_self on public.app_teachers for select to authenticated using(user_id=auth.uid());
-- Existing manually assigned operator keeps ownership of the old single-user workspace.
insert into public.app_teachers(user_id) select user_id from public.app_admins on conflict do nothing;
alter table public.app_classes add column if not exists owner_id uuid references public.app_teachers(user_id);
update public.app_classes set owner_id=(select user_id from public.app_admins limit 1) where owner_id is null;
create index if not exists app_class_owner on public.app_classes(owner_id);
create or replace function public.app_is_teacher() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.app_teachers where user_id=auth.uid() and active);
$$;
create or replace function public.app_owns_class(_class uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.app_is_teacher() and exists(select 1 from public.app_classes where id=_class and owner_id=auth.uid());
$$;
create or replace function public.app_enroll_teacher() returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
 insert into public.app_teachers(user_id) values(auth.uid()) on conflict do nothing;
 if not public.app_is_teacher() then raise exception '이용이 중지된 계정입니다. 운영자에게 문의하세요.'; end if;
 return true;
end $$;
revoke all on function public.app_is_teacher(),public.app_owns_class(uuid),public.app_enroll_teacher() from public,anon;
grant execute on function public.app_is_teacher(),public.app_owns_class(uuid),public.app_enroll_teacher() to authenticated;
-- Remove the original global admin read policies. Even the operator only sees owned classes.
drop policy if exists admin_read on public.app_classes;
drop policy if exists teacher_read on public.app_classes;
create policy teacher_read on public.app_classes for select to authenticated using(public.app_is_teacher() and owner_id=auth.uid());
do $$ declare t text; begin
 foreach t in array array['app_students','app_commands','app_visits','app_events','app_captures'] loop
 execute format('drop policy if exists admin_read on public.%I',t);
 execute format('drop policy if exists teacher_read on public.%I',t);
 execute format('create policy teacher_read on public.%I for select to authenticated using(public.app_owns_class(class_id))',t);
 end loop;
end $$;
drop policy if exists app_capture_admin_read on storage.objects;
drop policy if exists app_capture_teacher_read on storage.objects;
create policy app_capture_teacher_read on storage.objects for select to authenticated using(
 bucket_id='student-captures' and exists(select 1 from public.app_captures c where c.path=storage.objects.name and c.expires_at>now() and public.app_owns_class(c.class_id))
);


create or replace function public.app_save_class(_id uuid,_name text,_kind text,_monitoring boolean,_days int default 7,_capture_days int default 1)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; begin
 if not public.app_is_teacher() then raise exception '교사 회원가입이 필요합니다.'; end if;
 if _id is not null and not public.app_owns_class(_id) then raise exception '본인 학급만 변경할 수 있습니다.'; end if;
 if _id is null then
 insert into public.app_classes(owner_id,name,kind,monitoring,retention_days,capture_retention_days) values(auth.uid(),trim(_name),_kind,_monitoring,_days,_capture_days) returning id into result;
 else
 update public.app_classes set name=trim(_name),kind=_kind,monitoring=_monitoring,retention_days=_days,capture_retention_days=_capture_days where id=_id returning id into result;
 if result is null then raise exception '학급을 찾지 못했습니다.'; end if;
 update public.app_captures set expires_at=least(expires_at,created_at+make_interval(days=>_capture_days)) where class_id=result;
 end if; return result;
end $$;

create or replace function public.app_manage_student(_id uuid,_action text)
returns void language plpgsql security definer set search_path='' as $$
declare s public.app_students; begin
 if not public.app_is_teacher() then raise exception '교사 회원가입이 필요합니다.'; end if;
 select * into s from public.app_students where id=_id and public.app_owns_class(class_id) for update;
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
 if not public.app_owns_class(_class) then raise exception '본인 학급에만 명령을 보낼 수 있습니다.'; end if;
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

create or replace function public.app_edit_student(_id uuid,_name text,_number int)
returns void language plpgsql security definer set search_path='' as $$
declare s public.app_students; begin
 if not public.app_is_teacher() then raise exception '교사 회원가입이 필요합니다.'; end if;
 update public.app_students set name=trim(_name),student_number=_number where id=_id and public.app_owns_class(class_id) returning * into s;
 if s.id is null then raise exception '학생을 찾지 못했습니다.'; end if;
 insert into public.app_events(class_id,student_id,kind) values(s.class_id,s.id,'student_updated');
end $$;

create or replace function public.app_register(_code text,_token text,_name text,_number int)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.app_join_codes; s public.app_students; d public.app_devices; owner uuid; begin
 select * into d from public.app_devices where token_hash=_token and not revoked;
 if d.id is not null then select * into s from public.app_students where id=d.student_id; return jsonb_build_object('studentId',s.id,'state',s.approval,'studentName',s.name); end if;
 select * into c from public.app_join_codes where code_hash=_code for update;
 if c.code_hash is null or c.expires_at<now() or c.uses>=c.max_uses then raise exception '참여 코드가 만료되었거나 유효하지 않습니다.'; end if;
 -- Bound enrollment per teacher rather than globally across the public service.
 select owner_id into owner from public.app_classes where id=c.class_id;
 if owner is null or not exists(select 1 from public.app_teachers where user_id=owner and active) then raise exception '이 학급은 등록을 받을 수 없습니다.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text,0));
 if (select count(*) from public.app_students enrolled join public.app_classes g on g.id=enrolled.class_id where g.owner_id=owner and enrolled.approval<>'revoked')>=99 then raise exception '교사별 전체 등록 한도는 99명입니다.'; end if;
 insert into public.app_students(class_id,name,student_number) values(c.class_id,trim(_name),_number) returning * into s;
 insert into public.app_devices(student_id,token_hash) values(s.id,_token);
 update public.app_join_codes set uses=uses+1 where code_hash=_code;
 insert into public.app_events(class_id,student_id,kind) values(s.class_id,s.id,'registration_requested');
 return jsonb_build_object('studentId',s.id,'state','pending');
end $$;

commit;
