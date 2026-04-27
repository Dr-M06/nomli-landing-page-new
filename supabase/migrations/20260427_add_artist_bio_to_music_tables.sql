-- Add artist bio fields for Spotify/YouTube-style artist context.

begin;

alter table if exists public.app_song_submissions
  add column if not exists artist_bio text;

alter table if exists public.app_songs
  add column if not exists artist_bio text;

commit;
