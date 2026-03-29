import React, { createContext, useContext } from 'react';
import type { SharedValue } from 'react-native-reanimated';

/**
 * Single scroll source for list feeds (ListFeedView). All scroll-driven animation stays on the UI thread.
 *
 * Flow:
 * - scrollOffsetYSV: contentOffset.y, written in useAnimatedScrollHandler (UI), read in VideoCard worklets.
 * - contentScrollProgressSV: 0..1 from scrollOffsetYSV / HEADER_FADE_DISTANCE (useDerivedValue, UI).
 *   Consumed via this context by: UniversalHeader (content fade on list feeds). ProfileHeader / ChannelHeader pass the same SharedValue into UniversalHeader for fade + scroll-linked dim.
 * - Overlay (back/actions fade): screen owns one SharedValue, passes as contentScrollProgressOutput to the
 *   visible list only; list writes progress in the same scroll handler (no extra useAnimatedReaction).
 * - headerHeight, viewportHeight, itemSpacing: used in VideoCard for percentVisible.
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
