import { supabase } from './supabase';

export interface BusinessGalleryItem {
  id: string;
  business_id: string;
  media_url: string;
  media_type: 'photo' | 'video';
  price?: number;
  caption?: string;
  created_at: string;
}

/**
 * Add a photo or video to business gallery
 */
export const addGalleryItem = async (
  businessId: string,
  mediaUrl: string,
  mediaType: 'photo' | 'video',
  price?: number,
  caption?: string
): Promise<{ success: boolean; error?: string; item?: BusinessGalleryItem }> => {
  try {
    const { data, error } = await supabase
      .from('business_gallery')
      .insert({
        business_id: businessId,
        media_url: mediaUrl,
        media_type: mediaType,
        price,
        caption,
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, item: data };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to add gallery item' };
  }
};

/**
 * Get all gallery items for a business
 */
export const getGalleryItems = async (
  businessId: string
): Promise<{ success: boolean; error?: string; items?: BusinessGalleryItem[] }> => {
  try {
    const { data, error } = await supabase
      .from('business_gallery')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, items: data || [] };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to fetch gallery items' };
  }
};

/**
 * Delete a gallery item
 */
export const deleteGalleryItem = async (
  itemId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase
      .from('business_gallery')
      .delete()
      .eq('id', itemId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to delete gallery item' };
  }
};

/**
 * Update gallery item price or caption
 */
export const updateGalleryItem = async (
  itemId: string,
  updates: { price?: number; caption?: string }
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase
      .from('business_gallery')
      .update(updates)
      .eq('id', itemId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to update gallery item' };
  }
};
