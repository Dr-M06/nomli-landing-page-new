import { supabase } from './supabase';
import { log, warn, error } from './productionLogger';


// Define event categories as simple strings (matching the category column in events table)
export const EVENT_CATEGORIES = [
  { id: 'food_drink', name: 'Food & Drink', color: '#FF6B6B', icon: '🍔' },
  { id: 'outdoors', name: 'Outdoors & Adventure', color: '#4ECDC4', icon: '🏔️' },
  { id: 'cultural', name: 'Cultural Experience', color: '#9D65C9', icon: '🎭' },
  { id: 'nightlife', name: 'Nightlife', color: '#5D576B', icon: '🍸' },
  { id: 'sports', name: 'Sports & Fitness', color: '#F79E1B', icon: '⚽' },
  { id: 'music', name: 'Music & Concerts', color: '#F73859', icon: '🎵' },
  { id: 'arts', name: 'Arts & Crafts', color: '#4285F4', icon: '🎨' },
  { id: 'wellness', name: 'Health & Wellness', color: '#4FDA91', icon: '🧘' },
  { id: 'tech', name: 'Tech & Innovation', color: '#0072B5', icon: '💻' },
  { id: 'business', name: 'Business & Networking', color: '#1D3461', icon: '💼' },
  { id: 'education', name: 'Education & Learning', color: '#F8C43A', icon: '📚' },
  { id: 'social', name: 'Social Gathering', color: '#FC7A57', icon: '👋' },
  { id: 'travel', name: 'Travel Meetups', color: '#188FA7', icon: '✈️' },
  { id: 'photography', name: 'Photography', color: '#E94F37', icon: '📷' },
  { id: 'gaming', name: 'Gaming', color: '#1C77C3', icon: '🎮' },
  { id: 'family', name: 'Family Friendly', color: '#39A0ED', icon: '👨‍👩‍👧‍👦' },
  { id: 'pets', name: 'Pets & Animals', color: '#B8B8D1', icon: '🐾' },
  { id: 'volunteering', name: 'Volunteering', color: '#7CB518', icon: '💪' },
  { id: 'language', name: 'Language Exchange', color: '#EF6461', icon: '🗣️' },
  { id: 'ads', name: 'Ads', color: '#FFD700', icon: '📢' },
  { id: 'bonanza', name: 'Bonanza', color: '#FF6B35', icon: '🎉' },
  { id: 'other', name: 'Other', color: '#778DA9', icon: '🔍' }
];

// Event image type
type EventImage = {
  id: string;
  category: string;
  url: string;
  credit: string;
};

// Lazy-loaded event images - only loaded when needed
let EVENT_IMAGES_CACHE: EventImage[] | null = null;

const EVENT_IMAGES: EventImage[] = [
  { 
    id: 'food',
    category: 'food_drink', 
    url: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=1000&auto=format&fit=crop',
    credit: 'Unsplash'
  },
  { 
    id: 'restaurant',
    category: 'food_drink', 
    url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=1000&auto=format&fit=crop',
    credit: 'Unsplash'
  },
  { 
    id: 'coffee',
    category: 'food_drink', 
    url: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?q=80&w=1000&auto=format&fit=crop',
    credit: 'Unsplash'
  },
  { 
    id: 'hiking',
    category: 'outdoors', 
    url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?q=80&w=1000&auto=format&fit=crop',
    credit: 'Unsplash'
  },
  { 
    id: 'beach',
    category: 'outdoors', 
    url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1000&auto=format&fit=crop',
    credit: 'Unsplash'
  },
  { 
    id: 'mountain',
    category: 'outdoors', 
    url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=1000&auto=format&fit=crop',
    credit: 'Unsplash'
  },
  { 
    id: 'museum',
    category: 'cultural', 
    url: 'https://images.unsplash.com/photo-1503152394-c571994fd383?q=80&w=1000&auto=format&fit=crop',
    credit: 'Unsplash'
  },
  { 
    id: 'theater',
    category: 'cultural', 
    url: 'https://images.unsplash.com/photo-1503095396549-807759245b35?q=80&w=1000&auto=format&fit=crop',
    credit: 'Unsplash'
  },
  { 
    id: 'night_city',
    category: 'nightlife', 
    url: 'https://images.unsplash.com/photo-1519125323398-675f0ddb6308?q=80&w=1000&auto=format&fit=crop',
    credit: 'Unsplash'
  },
  { 
    id: 'concert',
    category: 'music', 
    url: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?q=80&w=1000&auto=format&fit=crop',
    credit: 'Unsplash'
  },
  { 
    id: 'club',
    category: 'nightlife', 
    url: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=1000&auto=format&fit=crop',
    credit: 'Unsplash'
  },
  { 
    id: 'soccer',
    category: 'sports', 
    url: 'https://images.unsplash.com/photo-1459865264687-595d652de67e?q=80&w=1000&auto=format&fit=crop',
    credit: 'Unsplash'
  },
  { 
    id: 'yoga',
    category: 'wellness', 
    url: 'https://images.unsplash.com/photo-1575052814086-f385e2e2ad1b?q=80&w=1000&auto=format&fit=crop',
    credit: 'Unsplash'
  },
  { 
    id: 'workshop',
    category: 'education', 
    url: 'https://images.unsplash.com/photo-1552664730-d307ca884978?q=80&w=1000&auto=format&fit=crop',
    credit: 'Unsplash'
  },
  { 
    id: 'meeting',
    category: 'business', 
    url: 'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?q=80&w=1000&auto=format&fit=crop',
    credit: 'Unsplash'
  },
  { 
    id: 'party',
    category: 'social', 
    url: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?q=80&w=1000&auto=format&fit=crop',
    credit: 'Unsplash'
  },
  { 
    id: 'gaming',
    category: 'gaming', 
    url: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1000&auto=format&fit=crop',
    credit: 'Unsplash'
  },
  { 
    id: 'ad_banner',
    category: 'ads', 
    url: 'https://images.unsplash.com/photo-1611224923853-80b023f02d71?w=1000&auto=format&fit=crop',
    credit: 'Unsplash'
  },
  { 
    id: 'ad_marketing',
    category: 'ads', 
    url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1000&auto=format&fit=crop',
    credit: 'Unsplash'
  },
  { 
    id: 'ad_promotion',
    category: 'ads', 
    url: 'https://images.unsplash.com/photo-1556761175-5973dc4f8077?w=1000&auto=format&fit=crop',
    credit: 'Unsplash'
  },
  { 
    id: 'ad_billboard',
    category: 'ads', 
    url: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=1000&auto=format&fit=crop',
    credit: 'Unsplash'
  },
  { 
    id: 'ad_digital',
    category: 'ads', 
    url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1000&auto=format&fit=crop',
    credit: 'Unsplash'
  },
  { 
    id: 'ad_social',
    category: 'ads', 
    url: 'https://images.unsplash.com/photo-1551650975-87deedd944c3?w=1000&auto=format&fit=crop',
    credit: 'Unsplash'
  },
  { 
    id: 'bonanza_festival',
    category: 'bonanza', 
    url: 'https://images.unsplash.com/photo-1511578314322-379afb476865?w=1000&auto=format&fit=crop',
    credit: 'Unsplash'
  },
  { 
    id: 'bonanza_celebration',
    category: 'bonanza', 
    url: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=1000&auto=format&fit=crop',
    credit: 'Unsplash'
  },
  { 
    id: 'bonanza_party',
    category: 'bonanza', 
    url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1000&auto=format&fit=crop',
    credit: 'Unsplash'
  },
  { 
    id: 'bonanza_sale',
    category: 'bonanza', 
    url: 'https://images.unsplash.com/photo-1607082349566-187342175e2f?w=1000&auto=format&fit=crop',
    credit: 'Unsplash'
  },
  { 
    id: 'bonanza_carnival',
    category: 'bonanza', 
    url: 'https://images.unsplash.com/photo-1467810563316-b5476525c0f9?w=1000&auto=format&fit=crop',
    credit: 'Unsplash'
  },
  { 
    id: 'bonanza_fireworks',
    category: 'bonanza', 
    url: 'https://images.unsplash.com/photo-1527482797697-8795b05a13fe?w=1000&auto=format&fit=crop',
    credit: 'Unsplash'
  }
];

/**
 * Lazy-load event images - only load when first accessed
 */
const getEventImages = () => {
  if (!EVENT_IMAGES_CACHE) {
    EVENT_IMAGES_CACHE = EVENT_IMAGES;
  }
  return EVENT_IMAGES_CACHE;
};

/**
 * Gets images related to a specific category
 * @param categoryId The category ID to filter by
 * @returns Array of images matching the category
 */
export const getImagesByCategory = (categoryId: string) => {
  return getEventImages().filter(image => image.category === categoryId);
};

/**
 * Gets all event categories
 */
export const getEventCategories = async () => {
  // Just return the local constants since we're not storing in database
  return EVENT_CATEGORIES;
};

/**
 * Initializes the event categories
 */
export const setupEventCategories = async () => {
  try {
    // We're no longer creating a separate event_categories table
    // Just return true since we're using the local constants
    return true;
  } catch (error) {
    error('Error setting up event categories:', error);
    return false;
  }
}; 