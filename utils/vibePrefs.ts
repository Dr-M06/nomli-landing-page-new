import { supabase } from './supabase';
import type { VibeMode } from './setupVibeModeField';

/** Default when column is missing or null. */
export const DEFAULT_VIBE_MODE: VibeMode = 'anyone';

/**
 * Get current user's vibe mode (who can message them).
 * 'anyone' = default; 'gift_required' = only after sending a gift (break the ice).
 */
export async function getVibeMode(userId: string): Promise<VibeMode> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('vibe_mode')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) return DEFAULT_VIBE_MODE;
    const v = (data as { vibe_mode?: string | null }).vibe_mode;
    if (v === 'gift_required' || v === 'anyone') return v as VibeMode;
    return DEFAULT_VIBE_MODE;
  } catch {
    return DEFAULT_VIBE_MODE;
  }
}

export interface SetVibeModeResult {
  success: boolean;
  error?: string;
}

/**
 * Set current user's vibe mode. Only the profile owner should call this.
 * If the column doesn't exist yet, run supabase/migrations/20250209000000_add_vibe_mode_to_profiles.sql in Supabase SQL Editor.
 */
export async function setVibeMode(userId: string, mode: VibeMode): Promise<SetVibeModeResult> {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ vibe_mode: mode })
      .eq('id', userId);
    if (error) {
      const msg = error.message || '';
      const hint = (error.code === '42703' || /column.*vibe_mode|vibe_mode.*does not exist/i.test(msg))
        ? ' Run the migration: supabase/migrations/20250209000000_add_vibe_mode_to_profiles.sql in Supabase SQL Editor.'
        : '';
      return { success: false, error: msg + hint };
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Failed to save' };
  }
}
