import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { AppState, type ViewabilityConfig, type ViewToken } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useVisibilityCoreStore } from './visibilityStore';

/** FlashList/RN viewability — minimumViewTime 0 so the first native callback isn’t delayed ~150ms at cold start. */
const VIEWABILITY_CONFIG: ViewabilityConfig = {
  itemVisiblePercentThreshold: 50,
  minimumViewTime: 0,
  waitForInteraction: false,
};

interface FeedVisibilityOptions {
  feedOption: string;
  userDid?: string;
  isActive: boolean;
  /**
   * Index FlashList will show first (`initialScrollIndex` or 0). Seeds `lastViewableIndexByFeed` before the
   * first `onViewableItemsChanged` so overlay/playback visibility matches the list SDK on first paint.
   */
  initialViewableIndex?: number;
}

interface FeedVisibilityResult {
  onViewableItemsChanged: ({ viewableItems }: { viewableItems: ViewToken[] }) => void;
  viewabilityConfig: ViewabilityConfig;
  canPlay: boolean;
  feedKey: string;
}

/**
 * Visibility hook: both feeds render side-by-side; each feed is independent (own scroll, own cursor).
 * - setActiveFeedKey: which pager page is in view (only that feed's videos play).
 * - setLastViewableIndex(feedKey): per-feed viewable index.
 * - feedKey: scope profile/likes/reposts by userDid so multiple instances (e.g. two profiles) stay independent.
 */
export function useFeedVisibility({
  feedOption,
  userDid,
  isActive,
  initialViewableIndex,
}: FeedVisibilityOptions): FeedVisibilityResult {
  const feedKey =
    (feedOption === 'profile' || feedOption === 'likes' || feedOption === 'reposts') && userDid
      ? `${feedOption}:${userDid}`
      : feedOption;
  // Use React Native's AppState directly (no store sync) per RN docs
  const [appState, setAppState] = useState(AppState.currentState);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);
  const setActiveFeedKey = useVisibilityCoreStore(state => state.setActiveFeedKey);
  const setLastViewableIndex = useVisibilityCoreStore(state => state.setLastViewableIndex);
  const isForeground = appState === 'active';
  // Video can play if: feed is active and app is foreground.
  // Route focus is already represented by `isActive` at call sites.
  const canPlay = isActive && isForeground;

  useEffect(() => {
    if (!isActive) return;
    setActiveFeedKey(feedKey);
  }, [isActive, feedKey, setActiveFeedKey]);

  // Before paint: align store with FlashList’s initial window so VideoItem `isVisible` isn’t false until JS viewability runs.
  useLayoutEffect(() => {
    if (!isActive || initialViewableIndex === undefined) return;
    const prev = useVisibilityCoreStore.getState().lastViewableIndexByFeed[feedKey];
    if (prev !== undefined) return;
    setLastViewableIndex(feedKey, initialViewableIndex);
  }, [isActive, feedKey, initialViewableIndex, setLastViewableIndex]);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const token = viewableItems.find(t => t.isViewable);
      const nextIndex = typeof token?.index === 'number' ? token.index : -1;

      const lastViewable = useVisibilityCoreStore.getState().lastViewableIndexByFeed[feedKey] ?? -1;
      // Only persist real item indices — never write -1 from viewability so layout glitches don’t
      // clear a seeded/known index (fullscreen cells normally always have one ≥0 from the SDK).
      if (nextIndex >= 0 && nextIndex !== lastViewable) {
        setLastViewableIndex(feedKey, nextIndex);
      }
    },
    [feedKey, setLastViewableIndex]
  );

  return {
    onViewableItemsChanged,
    viewabilityConfig: VIEWABILITY_CONFIG,
    canPlay,
    feedKey,
  };
}

/**
 * Check whether the current screen is focused.
 * routeKey is intentionally ignored to preserve existing API shape.
 */
export function useVisibilityRouteIsActive(_routeKey: string | null | undefined): boolean {
  return useIsFocused();
}
