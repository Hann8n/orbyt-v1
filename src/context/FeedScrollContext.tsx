import React, { createContext, useContext } from 'react';
import type { SharedValue } from 'react-native-reanimated';

/**
 * Scroll-linked layout for list feeds (`ListFeedView`) and grid surfaces (`FeedScrollProvider`).
 *
 * - scrollOffsetYSV: contentOffset.y (scroll handler → VideoCard worklets).
 * - contentScrollProgressSV: 0..1 for header/overlay fade (useDerivedValue).
 * - contentScrollProgressOutput: optional; screen-owned SharedValue the list writes in the same scroll handler.
 * - headerHeight, viewportHeight, itemSpacing: VideoCard percent-visible.
 * - homePagerChromeUserHoldSV / setHomePagerChromeUserHold: pause hold for home tab chrome (VideoItem).
 */
export interface FeedScrollContextValue {
  scrollOffsetYSV: SharedValue<number>;
  headerHeight: number;
  viewportHeight: number;
  itemSpacing: number;
  contentScrollProgressSV?: SharedValue<number>;
  homePagerChromeUserHoldSV: SharedValue<number>;
  setHomePagerChromeUserHold: (held: boolean) => void;
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
