-- Add artist profile/social metadata for music cards.

begin;

alter table if exists public.app_song_submissions
  add column if not exists artist_username text,
  add column if not exists artist_avatar_url text,
  add column if not exists artist_youtube_url text,
  add column if not exists artist_spotify_url text;

alter table if exists public.app_songs
  add column if not exists artist_username text,
  add column if not exists artist_avatar_url text,
  add column if not exists artist_youtube_url text,
  add column if not exists artist_spotify_url text;

commit;
