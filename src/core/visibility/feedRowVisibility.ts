import type { ViewabilityConfig } from 'react-native';

/**
 * Viewability config for feed row playback gating.
 * Items are considered viewable when ~70% of their area is on-screen for at least 120ms.
 */
export const FEED_ROW_VIEWABILITY_CONFIG: ViewabilityConfig = {
  itemVisiblePercentThreshold: 70,
  minimumViewTime: 120,
};
