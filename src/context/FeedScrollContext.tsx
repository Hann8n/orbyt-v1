import React, { createContext, useContext } from 'react';
import type { SharedValue } from 'react-native-reanimated';

/**
 * Scroll + layout for computing each item's percent visible from geometry.
 * - scrollOffsetYSV: contentOffset.y, updated in onScroll.
 * - headerHeight, viewportHeight, itemSpacing: used in VideoCard to compute
 *   overlap = viewport ∩ item, percentVisible = overlap / itemHeight.
 * - contentScrollProgressSV: 0..1 derived from scrollOffsetYSV over HEADER_FADE_DISTANCE; used by
 *   UniversalHeader and ProfileHeader/ChannelHeader for content fade and dim overlay.
 */
export interface FeedScrollContextValue {
  scrollOffsetYSV: SharedValue<number>;
  headerHeight: number;
  viewportHeight: number;
  itemSpacing: number;
  contentScrollProgressSV?: SharedValue<number>;
}

const FeedScrollContext = createContext<FeedScrollContextValue | null>(null);

export function FeedScrollProvider({
  value,
  children,
}: {
  value: FeedScrollContextValue;
  children: React.ReactNode;
}) {
  return <FeedScrollContext.Provider value={value}>{children}</FeedScrollContext.Provider>;
}

export function useFeedScroll(): FeedScrollContextValue | null {
  return useContext(FeedScrollContext);
}
