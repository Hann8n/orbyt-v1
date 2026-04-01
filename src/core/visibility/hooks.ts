import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type ViewabilityConfig, type ViewToken } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useVisibilityCoreStore } from './visibilityStore';
import { useSetOverlayVisibility } from '../../context/FeedIndicatorContext';
const VIEWABILITY_CONFIG: ViewabilityConfig = {
  itemVisiblePercentThreshold: 50,
  minimumViewTime: 150,
  waitForInteraction: false,
};

interface FeedVisibilityOptions {
  feedOption: string;
  userDid?: string;
  isActive: boolean;
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

  const setOverlayVisibility = useSetOverlayVisibility();
  const lastOverlayRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!isActive) return;
    // Set activeFeedKey when this feed is active.
    setActiveFeedKey(feedKey);
    setOverlayVisibility(1); // Show overlay when this list feed becomes active (e.g. modal from profile grid)
  }, [isActive, feedKey, setActiveFeedKey, setOverlayVisibility]);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const token = viewableItems.find(t => t.isViewable);
      const nextIndex = typeof token?.index === 'number' ? token.index : -1;

      const lastViewable = useVisibilityCoreStore.getState().lastViewableIndexByFeed[feedKey] ?? -1;
      if (nextIndex !== lastViewable) setLastViewableIndex(feedKey, nextIndex);

      if (isActive) {
        const nextOverlay = nextIndex >= 0 ? 1 : 0;
        // Only set overlay to 0 when transitioning from 1 (had viewable item) to none.
        // When lastOverlayRef is undefined, viewability hasn't reported a viewable item yet;
        // avoid setOverlayVisibility(0) so the overlay (comment button, etc.) stays visible.
        if (nextOverlay === 1) {
          lastOverlayRef.current = 1;
          setOverlayVisibility(1);
        } else if (lastOverlayRef.current === 1) {
          lastOverlayRef.current = 0;
          setOverlayVisibility(0);
        }
      }
    },
    [feedKey, isActive, setLastViewableIndex, setOverlayVisibility]
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
