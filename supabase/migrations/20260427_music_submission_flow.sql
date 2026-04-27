-- Nomli music submission + moderation + in-app messaging
-- Run in Supabase SQL editor (or as a migration).

begin;

-- 1) Ensure upload bucket exists for tracks.
insert into storage.buckets (id, name, public)
values ('app-music', 'app-music', true)
on conflict (id) do nothing;

-- 2) Admin helper based on profiles table.
create or replace function public.is_music_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        coalesce(p.is_admin, false) = true
        or lower(coalesce(p.role::text, '')) = 'admin'
      )
  );
$$;

revoke all on function public.is_music_admin() from public;
grant execute on function public.is_music_admin() to authenticated;

-- 3) Submission table used by web /music submit flow.
create table if not exists public.app_song_submissions (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null references auth.users(id) on delete cascade,
  title text not null,
  artist text not null,
  genre text,
  url text not null,
  cover_url text,
  duration_sec integer not null default 15 check (duration_sec > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_app_song_submissions_submitted_by
  on public.app_song_submissions(submitted_by);

create index if not exists idx_app_song_submissions_status_created
  on public.app_song_submissions(status, created_at desc);

-- 4) Generic updated_at trigger helper.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_app_song_submissions_updated_at on public.app_song_submissions;
create trigger trg_app_song_submissions_updated_at
before update on public.app_song_submissions
for each row execute function public.set_updated_at();

-- 5) In-app message table for moderation updates.
create table if not exists public.in_app_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'music_submission_update',
  title text not null,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_in_app_messages_user_created
  on public.in_app_messages(user_id, created_at desc);

-- 6) Notify uploader when admin approves/rejects.
create or replace function public.notify_music_submission_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  msg_title text;
  msg_body text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if old.status is distinct from new.status
     and new.status in ('approved', 'rejected') then
    if new.status = 'approved' then
      msg_title := 'Track approved';
      msg_body := format('"%s" has been approved and is now live in Nomli Music.', new.title);
    else
      msg_title := 'Track not approved';
      msg_body := format('"%s" was not approved. Please update and submit again.', new.title);
    end if;

    insert into public.in_app_messages (user_id, kind, title, body, metadata)
    values (
      new.submitted_by,
      'music_submission_update',
      msg_title,
      msg_body,
      jsonb_build_object(
        'submission_id', new.id,
        'status', new.status,
        'title', new.title,
        'artist', new.artist
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_music_submission_status_notify on public.app_song_submissions;
create trigger trg_music_submission_status_notify
after update on public.app_song_submissions
for each row execute function public.notify_music_submission_status_change();

-- 7) Row-level security
alter table public.app_song_submissions enable row level security;
alter table public.in_app_messages enable row level security;

drop policy if exists "submission_select_own_or_admin" on public.app_song_submissions;
create policy "submission_select_own_or_admin"
on public.app_song_submissions
for select
to authenticated
using (submitted_by = auth.uid() or public.is_music_admin());

drop policy if exists "submission_insert_own" on public.app_song_submissions;
create policy "submission_insert_own"
on public.app_song_submissions
for insert
to authenticated
with check (
  submitted_by = auth.uid()
  and status = 'pending'
);

drop policy if exists "submission_admin_update" on public.app_song_submissions;
create policy "submission_admin_update"
on public.app_song_submissions
for update
to authenticated
using (public.is_music_admin())
with check (public.is_music_admin());

drop policy if exists "submission_admin_delete" on public.app_song_submissions;
create policy "submission_admin_delete"
on public.app_song_submissions
for delete
to authenticated
using (public.is_music_admin());

drop policy if exists "message_select_own" on public.in_app_messages;
create policy "message_select_own"
on public.in_app_messages
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "message_update_own" on public.in_app_messages;
create policy "message_update_own"
on public.in_app_messages
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "message_admin_manage" on public.in_app_messages;
create policy "message_admin_manage"
on public.in_app_messages
for all
to authenticated
using (public.is_music_admin())
with check (public.is_music_admin());

-- 8) Storage policies for app-music.
drop policy if exists "app_music_public_read" on storage.objects;
create policy "app_music_public_read"
on storage.objects
for select
to public
using (bucket_id = 'app-music');

drop policy if exists "app_music_user_submit_insert" on storage.objects;
create policy "app_music_user_submit_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'app-music'
  and (storage.foldername(name))[1] = 'submissions'
);

drop policy if exists "app_music_user_manage_own_submit" on storage.objects;
create policy "app_music_user_manage_own_submit"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'app-music'
  and (storage.foldername(name))[1] = 'submissions'
  and owner = auth.uid()
)
with check (
  bucket_id = 'app-music'
  and (storage.foldername(name))[1] = 'submissions'
  and owner = auth.uid()
);

drop policy if exists "app_music_user_delete_own_submit" on storage.objects;
create policy "app_music_user_delete_own_submit"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'app-music'
  and (storage.foldername(name))[1] = 'submissions'
  and owner = auth.uid()
);

drop policy if exists "app_music_admin_manage_all" on storage.objects;
create policy "app_music_admin_manage_all"
on storage.objects
for all
to authenticated
using (bucket_id = 'app-music' and public.is_music_admin())
with check (bucket_id = 'app-music' and public.is_music_admin());

commit;
