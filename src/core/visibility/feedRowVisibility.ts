// Paging settles one full page on screen; an 80% threshold flips the active row at the snap
// midpoint with low latency.
export const FEED_ROW_VIEWABILITY_CONFIG = {
  itemVisiblePercentThreshold: 80,
  minimumViewTime: 100,
  waitForInteraction: false,
} as const;
