import { Platform } from 'react-native';

/**
 * Vertical space to reserve above the bottom of the window for the absolute-positioned
 * `CustomTabBar` (icon + label row, center Post FAB that sits above the bar, home-indicator inset, buffer).
 */
export function getFloatingTabBarReservedHeight(insetsBottom: number): number {
  const core = Platform.OS === 'ios' ? 52 : 64;
  const centerPostFabLift = 9;
  return core + insetsBottom + 14 + centerPostFabLift;
}

/** Reserve minus home-indicator inset: use to lift elements that already accounted for `insets.bottom` but not the tab row. */
export function getFloatingTabBarExtraAboveInset(insetsBottom: number): number {
  return getFloatingTabBarReservedHeight(insetsBottom) - insetsBottom;
}

/**
 * Livestream comment column: bottom edge offset so the list clears the floating tab bar + KAV input row.
 * Uses max(legacy, measured) so small screens and Android keep enough lift.
 */
export function getLivestreamCommentsBottomOffset(insetsBottom: number): number {
  const tabReserve = getFloatingTabBarReservedHeight(insetsBottom);
  const inputRowAndGap = 96;
  const tabPlusInput = tabReserve + inputRowAndGap;
  const legacyLift = 120 + getFloatingTabBarExtraAboveInset(insetsBottom);
  return Math.max(tabPlusInput, legacyLift);
}

/** Short overlay column so chat doesn’t cover the camera (broadcaster + viewer). */
export const LIVESTREAM_OVERLAY_COMMENTS_HEIGHT = 96;
/** Right inset so the list clears the reaction / action rail. */
export const LIVESTREAM_OVERLAY_COMMENTS_RIGHT_INSET = 86;
