import type { Post } from './communityUtils';

const UPLOAD_ACTIVE = new Set(['queued', 'uploading', 'processing', 'failed']);

function byCreatedDesc(a: Post, b: Post): number {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

/** Recency (decays over ~2d) + dampened engagement; capped so viral posts don’t erase time. */
function baseScore(post: Post, now: number): number {
  const t = new Date(post.created_at).getTime();
  const ageHours = Math.max(0, (now - t) / 3_600_000);
  const recency = 100 / (1 + ageHours / 40);

  const likes = Math.max(0, post.likes_count ?? 0);
  const comments = Math.max(0, post.comments_count ?? 0);
  const engagement = 14 * Math.log1p(likes) + 20 * Math.log1p(comments);
  const engagementClamped = Math.min(engagement, 72);

  return 0.52 * recency + 0.48 * engagementClamped;
}

type Scored = { post: Post; score: number };

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
 * Home “For You” style ordering: active uploads first, pinned next, then recency + engagement with author diversity.
 * Does not change pagination semantics — call on full lists you replace from fetch/refresh.
 */
export function rankHomeFeedPosts(posts: Post[]): Post[] {
  if (!posts.length) return posts;

  const now = Date.now();

  const uploading = posts.filter((p) => p.client_upload_status && UPLOAD_ACTIVE.has(p.client_upload_status));
  const uploadIds = new Set(uploading.map((p) => p.id));
  const rest = posts.filter((p) => !uploadIds.has(p.id));

  const pinned = rest.filter((p) => p.is_pinned);
  const pinnedIds = new Set(pinned.map((p) => p.id));
  const core = rest.filter((p) => !pinnedIds.has(p.id));

  const scored: Scored[] = core.map((post) => ({
    post,
    score: baseScore(post, now),
  }));

  const rankedCore = diversifyByAuthor(scored);

  return [...[...uploading].sort(byCreatedDesc), ...[...pinned].sort(byCreatedDesc), ...rankedCore];
}
