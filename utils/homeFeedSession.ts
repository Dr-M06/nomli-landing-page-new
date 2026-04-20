import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'home_feed_seen_post_ids_v1';
const MAX_SEEN = 140;

/**
 * IDs of posts the viewer has already scrolled to on the home feed.
 * Used to lightly de-rank them on the next open/refresh (TikTok/IG-style anti-fatigue).
 */
export async function loadHomeFeedSeenPostIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === 'string' && x.length > 0));
  } catch {
    return new Set();
  }
}

/** Append newly viewed post IDs (FIFO cap, order preserved for eviction). */
export async function appendHomeFeedSeenPostIds(ids: string[]): Promise<void> {
  if (!ids.length) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    let ordered: string[] = [];
    if (raw) {
      try {
        const p = JSON.parse(raw);
        if (Array.isArray(p)) ordered = p.filter((x): x is string => typeof x === 'string' && x.length > 0);
      } catch {
        ordered = [];
      }
    }
    const set = new Set(ordered);
    for (const id of ids) {
      if (!id || set.has(id)) continue;
      ordered.push(id);
      set.add(id);
    }
    if (ordered.length > MAX_SEEN) {
      ordered = ordered.slice(ordered.length - MAX_SEEN);
    }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(ordered));
  } catch {
    // ignore
  }
}

export async function clearHomeFeedSeenPostIds(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
