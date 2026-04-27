import { useState, useEffect } from 'react';
import { supabase, Profile } from '../utils/supabase';
import { logError, getUserFriendlyError } from '../utils/errorHandler';
import { createPlaceholderProfile } from '../utils/profilesManager';

export default function useProfile(userId?: string) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    fetchProfile(userId);
  }, [userId]);

  const fetchProfile = async (id: string) => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .maybeSingle(); // Use maybeSingle instead of single to avoid PGRST116 error
        
      if (error) {
        // Only log the error, don't expose to UI
        logError('Profile:Fetch', error);
        
        // For PGRST116 (no rows returned), we'll create a placeholder profile
        if (error.code === 'PGRST116') {
          // This happens when the profile doesn't exist yet
          const placeholderProfile = createPlaceholderProfile(id);
          setProfile(placeholderProfile as Profile);
          setError(null); // No need to show an error
          return;
        }
        
        // For other errors, set a user-friendly error message
        setError(getUserFriendlyError(error));
        return;
      }
      
      if (!data) {
        // No profile exists, create a placeholder
        const placeholderProfile = createPlaceholderProfile(id);
        setProfile(placeholderProfile as Profile);
        setError(null);
        return;
      }
      
      setProfile(data);
      setError(null);
    } catch (error: any) {
      // Log the error but don't expose details to UI
      logError('Profile:Fetch', error);
      setError(getUserFriendlyError(error));
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async (updates: Partial<Profile>) => {
    try {
      setLoading(true);
      
      // Use upsert instead of update to handle cases where the profile doesn't exist
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          ...updates,
          updated_at: new Date().toISOString()
        });
        
      if (error) {
        // Log the error but don't expose details to UI
        logError('Profile:Update', error);
        setError(getUserFriendlyError(error));
        return;
      }
      
      // Refetch the profile to get the updated data
      if (userId) {
        await fetchProfile(userId);
      }
    } catch (error: any) {
      // Log the error but don't expose details to UI
      logError('Profile:Update', error);
      setError(getUserFriendlyError(error));
    } finally {
      setLoading(false);
    }
  };

  return {
    profile,
    loading,
    error,
    updateProfile,
    refreshProfile: () => userId && fetchProfile(userId),
  };
}