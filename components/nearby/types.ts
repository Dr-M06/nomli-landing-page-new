export interface NearbyProfile {
  id: string;
  username?: string;
  full_name?: string;
  avatar_url?: string;
  bio?: string;
  age?: number;
  gender?: string;
  country?: string;
  distance?: number;
  is_online_now?: boolean;
  interests?: string[];
  is_verified?: boolean;
  is_placeholder?: boolean;
}

