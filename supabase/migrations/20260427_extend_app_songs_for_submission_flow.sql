-- Extend app_songs to support moderation metadata fields used by web flow.

begin;

alter table if exists public.app_songs
  add column if not exists genre text,
  add column if not exists duration_sec integer,
  add column if not exists cover_url text,
  add column if not exists play_count bigint not null default 0,
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_app_songs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_app_songs_updated_at on public.app_songs;
create trigger trg_app_songs_updated_at
before update on public.app_songs
for each row execute function public.set_app_songs_updated_at();

commit;
