-- Classroom Pulse draft Supabase schema (2026-10)
-- SECURITY: not a complete production migration.
-- Requires teacher account provisioning, secure student enrollment edge function,
-- private Storage policies, and operational audit/review before real student use.
-- Execute only after reviewing with a security-aware developer.

create extension if not exists pgcrypto;

create table if not exists public.classrooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  category text not null default 'regular' check (category in ('regular','club','external')),
  created_at timestamptz not null default now()
);

create table if not exists public.class_members (
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'teacher')),
  primary key (classroom_id, user_id)
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  student_auth_user_id uuid unique not null references auth.users(id),
  student_number int not null check (student_number between 1 and 999),
  display_name text not null check (char_length(display_name) between 1 and 80),
  last_seen timestamptz,
  active_domain text,
  enrolled_at timestamptz not null default now(),
  unique (id, classroom_id),
  unique (classroom_id, student_number)
);

create table if not exists public.device_controls (
  device_id uuid primary key,
  classroom_id uuid not null,
  is_locked boolean not null default false,
  lock_message text not null default '선생님의 안내를 확인하세요.' check (char_length(lock_message) <= 200),
  version bigint not null default 1,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id),
  foreign key (device_id, classroom_id) references public.devices (id, classroom_id) on delete cascade
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 160),
  duration_seconds integer not null check (duration_seconds between 1 and 60),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists public.activity_events (
  id bigint generated always as identity primary key,
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  event_type text not null check(event_type in ('joined','site_changed','help_requested','went_offline','came_online','lock_ack','unlock_ack','capture_ack')),
  domain text,
  created_at timestamptz not null default now(),
  check (domain is null or char_length(domain) <= 255)
);

create table if not exists public.capture_metadata (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  private_storage_path text not null,
  requested_by uuid not null references auth.users(id),
  captured_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists idx_devices_classroom_seen on public.devices(classroom_id, last_seen desc);
create index if not exists idx_events_classroom_time on public.activity_events(classroom_id, created_at desc);
create index if not exists idx_announce_classroom_time on public.announcements(classroom_id, created_at desc);
create index if not exists idx_captures_classroom_time on public.capture_metadata(classroom_id, captured_at desc);

create or replace function public.is_class_teacher(_classroom uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.class_members m
    where m.classroom_id = _classroom and m.user_id = (select auth.uid())
      and m.role in ('owner','teacher')
  );
$$;

create or replace function public.is_class_student(_classroom uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.devices d
    where d.classroom_id = _classroom and d.student_auth_user_id = (select auth.uid())
  );
$$;

create or replace function public.owns_device(_device_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.devices d
    where d.id = _device_id and d.student_auth_user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_class_teacher(uuid) from public;
revoke all on function public.is_class_student(uuid) from public;
revoke all on function public.owns_device(uuid) from public;
grant execute on function public.is_class_teacher(uuid) to authenticated;
grant execute on function public.is_class_student(uuid) to authenticated;
grant execute on function public.owns_device(uuid) to authenticated;

alter table public.classrooms enable row level security;
alter table public.class_members enable row level security;
alter table public.devices enable row level security;
alter table public.device_controls enable row level security;
alter table public.announcements enable row level security;
alter table public.activity_events enable row level security;
alter table public.capture_metadata enable row level security;

create policy "teachers read their classrooms" on public.classrooms for select to authenticated
using (public.is_class_teacher(id));
create policy "teachers read classroom memberships" on public.class_members for select to authenticated
using (public.is_class_teacher(classroom_id));
create policy "teachers read devices; devices read only themselves" on public.devices for select to authenticated
using (public.is_class_teacher(classroom_id) or student_auth_user_id = (select auth.uid()));
create policy "teachers read control, devices read own control" on public.device_controls for select to authenticated
using (public.is_class_teacher(classroom_id) or public.owns_device(device_id));
create policy "teachers issue control" on public.device_controls for insert to authenticated
with check (public.is_class_teacher(classroom_id) and changed_by = (select auth.uid()));
create policy "teachers change control" on public.device_controls for update to authenticated
using (public.is_class_teacher(classroom_id))
with check (public.is_class_teacher(classroom_id) and changed_by = (select auth.uid()));
create policy "classroom members receive announcements" on public.announcements for select to authenticated
using (public.is_class_teacher(classroom_id) or public.is_class_student(classroom_id));
create policy "teachers create announcements" on public.announcements for insert to authenticated
with check (public.is_class_teacher(classroom_id) and created_by = (select auth.uid()) and expires_at > created_at);
create policy "teachers read logs" on public.activity_events for select to authenticated
using (public.is_class_teacher(classroom_id));
create policy "teachers read captures" on public.capture_metadata for select to authenticated
using (public.is_class_teacher(classroom_id));

-- Client devices must NOT insert themselves into public.devices with an arbitrary classroom_id.
-- A secure enrollment Edge Function should validate a short-lived invitation code,
-- rate-limit attempts, verify teacher/school authorization, and provision Auth identities.
-- Captures must be uploaded through a signed, time-limited and authorized workflow.
-- Storage bucket should be PRIVATE and signed URLs should have short expiry.
-- Activity retention, safe screen-capture policy, and deletion are still to implement.
-- Example realtime publication (enable only after reviewing RLS and scale):
-- alter publication supabase_realtime add table public.device_controls;
-- alter publication supabase_realtime add table public.announcements;
-- alter publication supabase_realtime add table public.devices;
