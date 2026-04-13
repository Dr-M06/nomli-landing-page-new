# Award Daily Contributor Tokens

Awards tokens to the top 5 daily contributors at midnight UTC. Replaces the manual claim button so the "real" daily leaderboard is determined at day end.

## Cron Schedule

Runs daily at **00:00 UTC** (midnight). Configure in Supabase Dashboard → Edge Functions → award-daily-contributor-tokens → Cron, or use the `cron.json` schedule.

## Manual Invocation (Testing)

To test or backfill a specific date:

```
POST https://<project>.supabase.co/functions/v1/award-daily-contributor-tokens?date=2025-02-23
Authorization: Bearer <SERVICE_ROLE_KEY>
```

## Behavior

1. Gets top 5 from `get_daily_leaderboard` for the target date
2. For each user not already awarded: credits wallet, inserts `daily_token_claims`, records `contributor_reward` transaction
3. `sync_earned_tokens_on_claim` trigger updates `earned_tokens_balance`
