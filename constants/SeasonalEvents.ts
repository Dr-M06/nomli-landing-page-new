/**
 * Seasonal Events Configuration
 * Add festive themes that auto-enable/disable based on date
 */

export interface SeasonalEvent {
  id: string;
  name: string;
  enabled: boolean;
  startDate: string; // YYYY-MM-DD format
  endDate: string;   // YYYY-MM-DD format
  theme: {
    accentColor: string;
    secondaryColor?: string;
    icon: string;
    emoji?: string;
  };
}

// Valentine's Day 2026
export const VALENTINES_2026: SeasonalEvent = {
  id: 'valentines_2026',
  name: "Valentine's Day",
  enabled: true,
  startDate: '2026-02-05',  // Started early for testing
  endDate: '2026-02-15',
  theme: {
    accentColor: '#FF6B81',
    secondaryColor: '#FFB6C1',
    icon: '💕',
    emoji: '❤️',
  },
};

// Christmas 2026 (example for future)
export const CHRISTMAS_2026: SeasonalEvent = {
  id: 'christmas_2026',
  name: 'Christmas',
  enabled: false, // Enable when ready
  startDate: '2026-12-20',
  endDate: '2026-12-26',
  theme: {
    accentColor: '#C41E3A',
    secondaryColor: '#228B22',
    icon: '🎄',
    emoji: '🎅',
  },
};

// All seasonal events
export const SEASONAL_EVENTS: SeasonalEvent[] = [
  VALENTINES_2026,
  CHRISTMAS_2026,
];

/**
 * Check if a seasonal event is currently active
 */
export const isSeasonalEventActive = (event: SeasonalEvent): boolean => {
  if (!event.enabled) return false;
  
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  return todayStr >= event.startDate && todayStr <= event.endDate;
};

/**
 * Get the currently active seasonal event (if any)
 */
export const getActiveSeasonalEvent = (): SeasonalEvent | null => {
  return SEASONAL_EVENTS.find(isSeasonalEventActive) || null;
};

/**
 * Check if Valentine's Day is active
 */
export const isValentinesActive = (): boolean => {
  return isSeasonalEventActive(VALENTINES_2026);
};
