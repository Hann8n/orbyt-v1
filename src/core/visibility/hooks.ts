import { useCallback, useEffect, useRef } from 'react';
import type { ViewabilityConfig, ViewToken } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

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
  }, [isActive, feedKey, setActiveFeedKey]);

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
        if (lastOverlayRef.current !== nextOverlay) {
          lastOverlayRef.current = nextOverlay;
          setOverlayVisibility(nextOverlay);
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
  const isFocused = useIsFocused();

  useEffect(() => {
    if (!routeKey) return;

    if (isFocused) {
      setActiveRoute(routeKey);
      return () => {
        // Clear route when component unmounts or loses focus
        const currentRoute = useVisibilityCoreStore.getState().activeRoute;
        if (currentRoute === routeKey) {
          setActiveRoute(null);
        }
      };
    } else {
      // Route is not focused - clear if it was the active route
      const currentRoute = useVisibilityCoreStore.getState().activeRoute;
      if (currentRoute === routeKey) {
        setActiveRoute(null);
      }
      return undefined;
    }
  }, [isFocused, routeKey, setActiveRoute]);
}

/**
 * Check if a specific route is currently active
 * Tracks route state from visibility store
 */
export function useVisibilityRouteIsActive(routeKey: string | null | undefined): boolean {
  const activeRoute = useVisibilityCoreStore(state => state.activeRoute);
  return Boolean(routeKey && activeRoute === routeKey);
}
