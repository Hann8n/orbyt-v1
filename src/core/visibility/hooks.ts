import { useCallback, useMemo, useEffect } from 'react';
import type { ViewabilityConfig, ViewToken } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

import { useVisibilityCoreStore } from './visibilityStore';
import { useSetOverlayVisibility } from '../../context/FeedIndicatorContext';
import { seenVideoService } from '../../services/SeenVideoService';
import type { FeedListItem } from '../../types';

/**
 * Optimized viewability config for FlashList 2.0
 * Leverages FlashList's native viewability tracking (runs on native thread)
 * Lower threshold for faster detection on older devices
 */
const DEFAULT_VIEWABILITY_CONFIG: ViewabilityConfig = {
  itemVisiblePercentThreshold: 35, // Slightly lower for earlier engagement; 30 may flicker near 50/50
  minimumViewTime: 0, // No delay - detect immediately
  waitForInteraction: false,
};

interface FeedVisibilityOptions {
  feedKey: string;
  isActive: boolean;
  viewabilityConfig?: ViewabilityConfig;
}

interface FeedVisibilityResult {
  onViewableItemsChanged: ({ viewableItems }: { viewableItems: ViewToken[] }) => void;
  viewabilityConfig: ViewabilityConfig;
  canPlay: boolean;
}

/**
 * Visibility hook: both feeds render side-by-side; each feed is independent (own scroll, own cursor).
 * - setActiveFeedKey: which pager page is in view (only that feed's videos play).
 * - setLastViewableIndex(feedKey): per-feed viewable index.
 */
export function useFeedVisibility({
  feedKey,
  isActive,
  viewabilityConfig,
}: FeedVisibilityOptions): FeedVisibilityResult {
  const appState = useVisibilityCoreStore(state => state.appState);
  const activeRoute = useVisibilityCoreStore(state => state.activeRoute);
  const setActiveFeedKey = useVisibilityCoreStore(state => state.setActiveFeedKey);
  const setLastViewableIndex = useVisibilityCoreStore(state => state.setLastViewableIndex);
  const isForeground = appState === 'active';
  // Video can play if: feed is active AND app is foreground AND route is active
  const canPlay = isActive && isForeground && activeRoute !== null;

  const setOverlayVisibility = useSetOverlayVisibility();

  useEffect(() => {
    if (!isActive) return;
    setActiveFeedKey(feedKey);
  }, [isActive, feedKey, setActiveFeedKey]);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      // First viewable, non–end-card item (FlashList ViewToken has no viewablePercent)
      let firstViewable: ViewToken | null = null;
      for (const token of viewableItems) {
        if (!token.isViewable) continue;
        const item = token.item as FeedListItem;
        if ('endCard' in item && item.endCard) continue;
        firstViewable = token;
        break;
      }

      const nextIndex = firstViewable?.index ?? -1;

      setLastViewableIndex(feedKey, nextIndex);

      if (isActive) {
        setOverlayVisibility(nextIndex >= 0 ? 1 : 0);
        const visibleUris = viewableItems
          .map(token => token.item as FeedListItem | null)
          .filter((item): item is FeedListItem => {
            if (!item) return false;
            if ('endCard' in item && item.endCard) return false;
            return true;
          })
          .map(item => {
            if ('endCard' in item) return null;
            return item.post?.uri;
          })
          .filter((uri): uri is string => typeof uri === 'string' && uri.length > 0);
        visibleUris.forEach(uri => {
          if (uri) seenVideoService.markAsSeen(uri);
        });
      }
    },
    [feedKey, isActive, setLastViewableIndex, setOverlayVisibility]
  );

  const memoizedConfig = useMemo(
    () => viewabilityConfig ?? DEFAULT_VIEWABILITY_CONFIG,
    [viewabilityConfig]
  );

  return {
    onViewableItemsChanged,
    viewabilityConfig: memoizedConfig,
    canPlay,
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
