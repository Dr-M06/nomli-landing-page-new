import type { Post } from './communityUtils';

const UPLOAD_ACTIVE = new Set(['queued', 'uploading', 'processing', 'failed']);

/** ~30h: “new” lane mixed into top of feed so opens aren’t only old viral posts. */
const FRESH_LANE_MAX_MS = 30 * 60 * 60 * 1000;
const FRESH_LANE_MAX_POSTS = 8;

/** Older “evergreen” posts mixed mid-feed (IG/TikTok-style rediscovery), not only chronology. */
const REDISCOVER_MIN_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const REDISCOVER_MAX_POSTS = 6;
/** First N slots stay algorithm-only; then inject one rediscover every REDISCOVER_EVERY. */
const REDISCOVER_PREFIX_SLOTS = 4;
const REDISCOVER_EVERY = 6;

export type HomeFeedRankOptions = {
  /**
   * Post IDs the user has already viewed recently — penalized so the same posts
   * don’t sit on top after every refresh (common FYP pattern).
   */
  deboostRecentIds?: Set<string>;
  /**
   * Per app session (e.g. Date.now() at mount). Adds small deterministic jitter so
   * tie-breaks and ordering aren’t identical every cold start.
   */
  sessionSalt?: number;
};

function byCreatedDesc(a: Post, b: Post): number {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

function hashPostId(id: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic [0, 1) from salt + post id (stable for the session). */
function sessionNoise(sessionSalt: number, postId: string): number {
  let a = (sessionSalt ^ hashPostId(postId)) >>> 0;
  a = (a + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61) >>> 0;
  return (t >>> 0) / 0xffffffff;
}

/** Recency + engagement; “seen” and session jitter applied in scored step. */
function baseScore(post: Post, now: number): number {
  const t = new Date(post.created_at).getTime();
  const ageHours = Math.max(0, (now - t) / 3_600_000);
  const recency = 100 / (1 + ageHours / 16);

  const likes = Math.max(0, post.likes_count ?? 0);
  const comments = Math.max(0, post.comments_count ?? 0);
  const engagement = 14 * Math.log1p(likes) + 20 * Math.log1p(comments);
  const engagementClamped = Math.min(engagement, 60);

  // As content ages, weight engagement more so strong older text/video can still compete (feed algo pattern).
  const ageBlend = Math.min(1, ageHours / (24 * 7));
  const wRec = 0.7 * (1 - 0.45 * ageBlend);
  const wEng = 1 - wRec;

  return wRec * recency + wEng * engagementClamped;
}

type Scored = { post: Post; score: number };

function interleaveTwoPosts(fresh: Post[], rest: Post[]): Post[] {
  const out: Post[] = [];
  let i = 0;
  let j = 0;
  while (i < fresh.length || j < rest.length) {
    if (i < fresh.length) out.push(fresh[i++]);
    if (j < rest.length) out.push(rest[j++]);
  }
  return out;
}

/** After `prefix` items from `base`, insert one post from `inject` every `every` base items. */
function injectRediscoverMidFeed(base: Post[], inject: Post[], prefix: number, every: number): Post[] {
  if (!inject.length) return base;
  const injectSet = new Set(inject.map((p) => p.id));
  const deduped = base.filter((p) => !injectSet.has(p.id));
  const head = deduped.slice(0, prefix);
  const tail = deduped.slice(prefix);
  const out: Post[] = [...head];
  let since = 0;
  let ii = 0;
  for (const p of tail) {
    out.push(p);
    since += 1;
    if (since >= every && ii < inject.length) {
      out.push(inject[ii]);
      ii += 1;
      since = 0;
    }
  }
  while (ii < inject.length) {
    out.push(inject[ii]);
    ii += 1;
  }
  return out;
}

/**
 * Greedy ordering: pick highest adjusted score while penalizing same author as last 1–2 slots.
 * O(n²); falls back to score-only sort when the list is large.
 */
function diversifyByAuthor(scored: Scored[]): Post[] {
  if (scored.length <= 1) return scored.map((s) => s.post);
  if (scored.length > 160) {
    return [...scored].sort((a, b) => b.score - a.score).map((s) => s.post);
  }

  const pool = [...scored];
  const out: Post[] = [];
  const lastAuthors: string[] = [];

  while (pool.length) {
    let bestI = 0;
    let bestAdj = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const { post, score } = pool[i];
      const uid = post.user_id || '';
      let adj = score;
      const L = lastAuthors.length;
      if (L >= 1 && lastAuthors[L - 1] === uid) adj -= 44;
      if (L >= 2 && lastAuthors[L - 2] === uid) adj -= 24;
      if (adj > bestAdj) {
        bestAdj = adj;
        bestI = i;
      }
    }
    const [chosen] = pool.splice(bestI, 1);
    out.push(chosen.post);
    lastAuthors.push(chosen.post.user_id || '');
    if (lastAuthors.length > 2) lastAuthors.shift();
  }
  return out;
}

/**
 * Home “For You” ordering (social-style):
 * - Uploading + pinned unchanged
 * - Core: score with recency + engagement, deboost recently seen, session jitter
 * - Author diversification
 * - **Fresh lane**: newest ~30h posts interleaved at top so the feed doesn’t feel stuck
 */
export function rankHomeFeedPosts(posts: Post[], options?: HomeFeedRankOptions): Post[] {
  if (!posts.length) return posts;

  const now = Date.now();
  const deboost = options?.deboostRecentIds;
  const salt = options?.sessionSalt;

  const uploading = posts.filter((p) => p.client_upload_status && UPLOAD_ACTIVE.has(p.client_upload_status));
  const uploadIds = new Set(uploading.map((p) => p.id));
  const rest = posts.filter((p) => !uploadIds.has(p.id));

  const pinned = rest.filter((p) => p.is_pinned);
  const pinnedIds = new Set(pinned.map((p) => p.id));
  const core = rest.filter((p) => !pinnedIds.has(p.id));

  const scored: Scored[] = core.map((post) => {
    let score = baseScore(post, now);
    if (deboost?.has(post.id)) {
      score -= 34;
    }
    if (salt != null) {
      score += sessionNoise(salt, post.id) * 9;
    }
    return { post, score };
  });

  const rankedCore = diversifyByAuthor(scored);

  const freshCutoff = now - FRESH_LANE_MAX_MS;
  const freshLanePosts = [...core]
    .filter((p) => {
      const t = new Date(p.created_at).getTime();
      return Number.isFinite(t) && t >= freshCutoff;
    })
    .sort(byCreatedDesc)
    .slice(0, FRESH_LANE_MAX_POSTS);

  const freshLaneIds = new Set(freshLanePosts.map((p) => p.id));
  const restAfterFresh = rankedCore.filter((p) => !freshLaneIds.has(p.id));

  let mergedCore =
    freshLanePosts.length > 0
      ? interleaveTwoPosts(freshLanePosts, restAfterFresh)
      : rankedCore;

  const rediscoverCutoff = now - REDISCOVER_MIN_AGE_MS;
  const rediscoverPool = [...core]
    .filter((p) => {
      const t = new Date(p.created_at).getTime();
      return Number.isFinite(t) && t < rediscoverCutoff;
    })
    .sort((a, b) => {
      const sa = (a.likes_count ?? 0) + 2 * (a.comments_count ?? 0);
      const sb = (b.likes_count ?? 0) + 2 * (b.comments_count ?? 0);
      return sb - sa;
    })
    .slice(0, REDISCOVER_MAX_POSTS);

  mergedCore = injectRediscoverMidFeed(
    mergedCore,
    rediscoverPool,
    REDISCOVER_PREFIX_SLOTS,
    REDISCOVER_EVERY
  );

  return [
    ...[...uploading].sort(byCreatedDesc),
    ...[...pinned].sort(byCreatedDesc),
    ...mergedCore,
  ];
}
