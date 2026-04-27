import AsyncStorage from '@react-native-async-storage/async-storage';

const SUBSCRIPTION_CACHE_KEY_PREFIX = 'subscription_windows_v1:';

export type SubscriptionWindowsCache = {
  discoverPremiumUntil: string | null;
  creatorProUntil: string | null;
  syncedAt: string;
};

function cacheKey(userId: string): string {
  return `${SUBSCRIPTION_CACHE_KEY_PREFIX}${userId}`;
}

export function hasActiveWindow(until?: string | null): boolean {
  if (!until) return false;
  return new Date(until).getTime() > Date.now();
}

export async function writeSubscriptionWindowsCache(
  userId: string,
  data: { discoverPremiumUntil?: string | null; creatorProUntil?: string | null }
): Promise<void> {
  if (!userId) return;
  const payload: SubscriptionWindowsCache = {
    discoverPremiumUntil: data.discoverPremiumUntil ?? null,
    creatorProUntil: data.creatorProUntil ?? null,
    syncedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(payload));
}

export async function readSubscriptionWindowsCache(userId: string): Promise<SubscriptionWindowsCache | null> {
  if (!userId) return null;
  try {
    const raw = await AsyncStorage.getItem(cacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      discoverPremiumUntil: typeof parsed?.discoverPremiumUntil === 'string' ? parsed.discoverPremiumUntil : null,
      creatorProUntil: typeof parsed?.creatorProUntil === 'string' ? parsed.creatorProUntil : null,
      syncedAt: typeof parsed?.syncedAt === 'string' ? parsed.syncedAt : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}
