-- Personal-project distribution. Apply after the two previous migrations.
-- No first-login promotion: owner is entered manually through Supabase SQL Editor.
begin;
create or replace function public.app_is_teacher() returns boolean language sql stable security definer set search_path='' as $$
 select public.app_is_admin() and exists(select 1 from public.app_teachers where user_id=auth.uid() and active);
$$;
create or replace function public.app_enroll_teacher() returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not public.app_is_admin() then raise exception '개인 프로젝트의 SQL Editor에서 본인 UUID를 소유자로 먼저 지정하세요.'; end if;
 insert into public.app_teachers(user_id) values(auth.uid()) on conflict do nothing;
 if not public.app_is_teacher() then raise exception '이용이 중지된 계정입니다. 본인 프로젝트 설정을 확인하세요.'; end if;
 return true;
end $$;
revoke all on function public.app_is_teacher(),public.app_enroll_teacher() from public,anon;
grant execute on function public.app_is_teacher(),public.app_enroll_teacher() to authenticated;
commit;
