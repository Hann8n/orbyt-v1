import React, { createContext, useContext } from 'react';
import type { SharedValue } from 'react-native-reanimated';

/**
 * Single scroll source for list feeds (ListFeedView). No duplicate tracking.
 *
 * - scrollOffsetYSV: contentOffset.y, written in useAnimatedScrollHandler (ListFeedView, UI thread), read in VideoCard worklets.
 * - contentScrollProgressSV: 0..1 derived from scrollOffsetYSV over HEADER_FADE_DISTANCE (useDerivedValue, UI thread).
 *   Consumed by: UniversalHeader (content fade), ProfileHeader/ChannelHeader (dim overlay + status bar), overlay (back/fade).
 * - headerHeight, viewportHeight, itemSpacing: used in VideoCard to compute percentVisible.
 */
export interface FeedScrollContextValue {
  scrollOffsetYSV: SharedValue<number>;
  headerHeight: number;
  viewportHeight: number;
  itemSpacing: number;
  contentScrollProgressSV?: SharedValue<number>;
}

/** Payload passed to onScrollContextReady so parent can reuse contentScrollProgressSV (e.g. overlay). */
export type FeedScrollContextReadyPayload = Pick<FeedScrollContextValue, 'contentScrollProgressSV'>;

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
