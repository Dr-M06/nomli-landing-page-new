import { supabase } from './supabase';

export type DatingProfileSnapshot = {
  gender: string | null;
  interested_in: string | null;
  age: number | null;
  show_me_to_gender_searchers: boolean;
};

/** Returns whether the profile has required fields for dating: gender + interested_in. Age recommended but not blocking. */
export function isDatingProfileComplete(p: DatingProfileSnapshot | null): boolean {
  if (!p) return false;
  const hasGender = !!p.gender?.trim();
  const hasInterestedIn = !!p.interested_in?.trim();
  return hasGender && hasInterestedIn;
}

/** Fetch current user's dating-relevant profile fields. */
export async function getDatingProfileSnapshot(userId: string): Promise<DatingProfileSnapshot | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('gender, interested_in, age, show_me_to_gender_searchers')
    .eq('id', userId)
    .single();

  if (error || !data) return null;
  return {
    gender: data.gender ?? null,
    interested_in: data.interested_in ?? null,
    age: data.age ?? null,
    show_me_to_gender_searchers: data.show_me_to_gender_searchers ?? true,
  };
}

/** Save dating profile fields (gender, interested_in, show_me_to_gender_searchers). */
export async function saveDatingProfileFields(
  userId: string,
  updates: { gender?: string | null; interested_in?: string | null; show_me_to_gender_searchers?: boolean }
): Promise<{ error: Error | null }> {
  const payload: Record<string, unknown> = {};
  if (updates.gender !== undefined) payload.gender = updates.gender || null;
  if (updates.interested_in !== undefined) payload.interested_in = updates.interested_in || null;
  if (updates.show_me_to_gender_searchers !== undefined) payload.show_me_to_gender_searchers = updates.show_me_to_gender_searchers;
  if (Object.keys(payload).length === 0) return { error: null };
  const { error } = await supabase.from('profiles').update(payload).eq('id', userId);
  return { error: error ?? null };
}
