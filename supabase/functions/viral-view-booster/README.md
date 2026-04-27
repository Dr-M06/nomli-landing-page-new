# Viral View Booster

Boosts the **view count shown in the app** for all video posts. Each run increases `posts.views_count` so the “X views” number goes up across the app.

## Default: direct boost (no placeholder users)

- **directBoost: true** (default) — Adds views directly to `posts.views_count` for every video. No placeholder profiles needed. The cron can call the function with an empty body `{}` or `{"directBoost": true}`.
- **directBoost: false** — Uses `post_video_views` and placeholder user accounts (legacy; requires creating those profiles).

## Cron / pg_net

- The scheduled task that runs `net.http_post( url ... )` every 30 minutes invokes this function.
- **"1 row"** in the cron log is normal (one HTTP response). Check **Edge Functions → viral-view-booster → Logs** for:
  - `Viral view booster: direct mode — boosting views_count for all videos`
  - `✅ Boosted X videos with Y total views`

## Manual test

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/viral-view-booster" \
  -H "Authorization: Bearer <anon-or-service-key>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Or with options: `{"batchSize": 100, "maxBatches": 2}`. Response includes `videosProcessed`, `totalViewsAdded`, `directBoost: true`.

## If views decrease after boost

Run the SQL in `supabase/fix_views_count_never_decrease.sql` so `record_post_video_view` never overwrites with a lower count.
