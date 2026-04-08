import React, { createContext, useContext } from 'react';
import type { SharedValue } from 'react-native-reanimated';

/**
 * Single scroll source for list feeds (`ListFeedView`) and matching grid surfaces via `FeedScrollProvider`.
 * Scroll-driven reads/writes stay on the UI thread where noted below.
 *
 * Flow:
 * - scrollOffsetYSV: contentOffset.y, written in useAnimatedScrollHandler (UI), read in VideoCard worklets.
 * - contentScrollProgressSV: 0..1 from scrollOffsetYSV / HEADER_FADE_DISTANCE (useDerivedValue, UI).
 *   Consumed via this context by: UniversalHeader (content fade on list feeds). ProfileHeader / ChannelHeader pass the same SharedValue into UniversalHeader for fade + scroll-linked dim.
 * - Overlay (back/actions fade): screen owns one SharedValue, passes as contentScrollProgressOutput to the
 *   visible list only; list writes progress in the same scroll handler (no extra useAnimatedReaction).
 * - headerHeight, viewportHeight, itemSpacing: used in VideoCard for percentVisible.
 * - setHomePagerChromeUserHold: JS API for pause/hold (VideoItem); avoids mutating context-held SharedValue in consumers (React Compiler / lint).
 */
export interface FeedScrollContextValue {
  scrollOffsetYSV: SharedValue<number>;
  headerHeight: number;
  viewportHeight: number;
  itemSpacing: number;
  contentScrollProgressSV?: SharedValue<number>;
  /** Home feed: 1 while the visible video is user-paused (keeps FeedPager chrome shown). */
  homePagerChromeUserHoldSV: SharedValue<number>;
  /** JS-thread: updates `homePagerChromeUserHoldSV` (prefer this over mutating the SharedValue from consumers). */
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
