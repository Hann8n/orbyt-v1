import { useCallback, useEffect, useRef } from 'react';
import type { ViewabilityConfig, ViewToken } from 'react-native';
import { useVisibilityCoreStore } from './visibilityStore';
import { useSetOverlayVisibility } from '../../context/FeedIndicatorContext';
import type { FeedListItem } from '../../types';

const VIEWABILITY_CONFIG: ViewabilityConfig = {
  itemVisiblePercentThreshold: 50,
  minimumViewTime: 0,
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
  const appState = useVisibilityCoreStore(state => state.appState);
  const activeRoute = useVisibilityCoreStore(state => state.activeRoute);
  const setActiveFeedKey = useVisibilityCoreStore(state => state.setActiveFeedKey);
  const setLastViewableIndex = useVisibilityCoreStore(state => state.setLastViewableIndex);
  const isForeground = appState === 'active';
  // Video can play if: feed is active AND app is foreground AND route is active
  const canPlay = isActive && isForeground && activeRoute !== null;

  const setOverlayVisibility = useSetOverlayVisibility();
  const lastOverlayRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!isActive) return;
    setActiveFeedKey(feedKey);
    setOverlayVisibility(1); // Show overlay when this list feed becomes active (e.g. modal from profile grid)
  }, [isActive, feedKey, setActiveFeedKey, setOverlayVisibility]);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const token = viewableItems.find(t => {
        const it = t.item as FeedListItem & { endCard?: boolean };
        return t.isViewable && !(it && 'endCard' in it && it.endCard);
      });
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
 * Track when a route becomes active/inactive
 * Updates visibility store so videos can pause/resume based on route focus
 * With freezeOnBlur: true, useIsFocused() correctly handles frozen tabs
 */
export function useVisibilityRouteTracker(routeKey: string) {
  const setActiveRoute = useVisibilityCoreStore(state => state.setActiveRoute);

  useEffect(() => {
    if (!routeKey) return;
    setActiveRoute(routeKey);
    return () => {
      const currentRoute = useVisibilityCoreStore.getState().activeRoute;
      if (currentRoute === routeKey) {
        setActiveRoute(null);
      }
    };
  }, [routeKey, setActiveRoute]);
}

/**
 * Check if a specific route is currently active
 * Tracks route state from visibility store
 */
export function useVisibilityRouteIsActive(routeKey: string | null | undefined): boolean {
  const activeRoute = useVisibilityCoreStore(state => state.activeRoute);
  return Boolean(routeKey && activeRoute === routeKey);
}
