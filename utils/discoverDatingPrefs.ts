import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const DISCOVER_DATING_OPTED_IN_KEY = 'discover_dating_opted_in';
const DISCOVER_DATING_SINGLE_DECLINED_KEY = 'discover_dating_single_declined';

/**
 * Whether the user opted in to sync their Nomli profile to the Nomli Vibe app (`profiles.discover_dating_opted_in`).
 * Try server first, fallback to local AsyncStorage.
 */
export async function getDiscoverDatingOptedIn(): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) {
      const { data } = await supabase
        .from('profiles')
        .select('discover_dating_opted_in')
        .eq('id', user.id)
        .single();
      if (data?.discover_dating_opted_in === true) {
        await AsyncStorage.setItem(DISCOVER_DATING_OPTED_IN_KEY, 'true');
        return true;
      }
      if (data?.discover_dating_opted_in === false) {
        await AsyncStorage.setItem(DISCOVER_DATING_OPTED_IN_KEY, 'false');
        return false;
      }
    }
    const v = await AsyncStorage.getItem(DISCOVER_DATING_OPTED_IN_KEY);
    const enabled = v === 'true';
    // Sync to server if we have a value from local (e.g. existing user before server column)
    if (user?.id && v !== null) {
      supabase.from('profiles').update({ discover_dating_opted_in: enabled }).eq('id', user.id).then(() => {});
    }
    return enabled;
  } catch {
    try {
      const v = await AsyncStorage.getItem(DISCOVER_DATING_OPTED_IN_KEY);
      return v === 'true';
    } catch {
      return false;
    }
  }
}

/** Persist opt-in: local + `profiles.discover_dating_opted_in` so Vibe can pick up / auto-ship the profile. */
export async function setDiscoverDatingOptedIn(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(DISCOVER_DATING_OPTED_IN_KEY, enabled ? 'true' : 'false');
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) {
      await supabase
        .from('profiles')
        .update({ discover_dating_opted_in: enabled })
        .eq('id', user.id);
    }
  } catch {
    // ignore
  }
}

/** User said "not single / not now" — don't show the dating prompt again (lightweight, local only). */
export async function getDiscoverDatingSingleDeclined(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(DISCOVER_DATING_SINGLE_DECLINED_KEY);
    return v === 'true';
  } catch {
    return false;
  }
}

export async function setDiscoverDatingSingleDeclined(declined: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(DISCOVER_DATING_SINGLE_DECLINED_KEY, declined ? 'true' : 'false');
  } catch {
    // ignore
  }
}

/** Relationship statuses that should not see dating features. */
export const DATING_HIDDEN_RELATIONSHIP_STATUSES = ['married', 'in_relationship'] as const;

export function isDatingHiddenByRelationshipStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const lower = status.toLowerCase().trim();
  return DATING_HIDDEN_RELATIONSHIP_STATUSES.some((s) => lower === s || lower.includes(s));
}
