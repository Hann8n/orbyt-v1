import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import type { ViewabilityConfig, ViewToken } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

import { useVisibilityCoreStore } from './visibilityStore';
import { useSetOverlayVisibility } from '../../context/FeedIndicatorContext';
import { seenVideoService } from '../../services/SeenVideoService';
import type { UIFeedItem } from '../../types';

/**
 * Extended ViewToken type that includes viewablePercent (available at runtime but not in types)
 */
interface ExtendedViewToken extends ViewToken {
  viewablePercent?: number;
}

/**
 * Optimized viewability config for FlashList 2.0
 * Leverages FlashList's native viewability tracking (runs on native thread)
 * Lower threshold for faster detection on older devices
 */
const DEFAULT_VIEWABILITY_CONFIG: ViewabilityConfig = {
  itemVisiblePercentThreshold: 40, // Reduced from 50% for faster detection
  minimumViewTime: 0, // No delay - detect immediately
  waitForInteraction: false,
};

interface FeedVisibilityOptions {
  isActive: boolean;
  viewabilityConfig?: ViewabilityConfig;
}

interface FeedVisibilityResult {
  onViewableItemsChanged: ({ viewableItems }: { viewableItems: ViewToken[] }) => void;
  viewabilityConfig: ViewabilityConfig;
  activeItemIndexRef: React.MutableRefObject<number>; // Ref for direct access to active index
  extraData: number; // Counter that increments when active item changes (for FlashList extraData prop)
  canPlay: boolean;
  isVideoVisible: (index: number) => boolean;
}

/**
 * Simplified visibility hook leveraging FlashList 2.0's native viewability
 *
 * Key optimizations:
 * - FlashList's onViewableItemsChanged runs on native thread (already optimized)
 * - Uses ref for immediate synchronous access
 * - Uses extraData counter to trigger FlashList re-renders when active item changes (needed for video playback)
 */
export function useFeedVisibility({
  isActive,
  viewabilityConfig,
}: FeedVisibilityOptions): FeedVisibilityResult {
  const appState = useVisibilityCoreStore(state => state.appState);
  const activeRoute = useVisibilityCoreStore(state => state.activeRoute);
  const isForeground = appState === 'active';
  // Video can play if: feed is active AND app is foreground AND route is active
  // With freezeOnBlur: true, route tracking via useIsFocused() correctly handles frozen tabs
  const canPlay = isActive && isForeground && activeRoute !== null;

  // Ref for immediate synchronous access (no React state delay)
  const activeItemIndexRef = useRef<number>(-1);
  // Counter that increments when active item changes - used for FlashList's extraData prop
  // This is needed to trigger re-renders so videos start playing when active item changes
  const [extraDataCounter, setExtraDataCounter] = useState(0);
  const setOverlayVisibility = useSetOverlayVisibility();

  // FlashList's onViewableItemsChanged runs on native thread - already optimized
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      // Find the most visible item (highest viewable percent)
      let bestItem: ViewToken | null = null;
      let bestPercent = -1;
      let firstViewable: ViewToken | null = null;

      for (const token of viewableItems) {
        if (!token.isViewable) continue;

        const item = token.item as UIFeedItem;
        if (item?.endCard) continue;

        if (!firstViewable) {
          firstViewable = token;
        }

        // viewablePercent is available at runtime on most platforms for better item selection
        const extendedToken = token as ExtendedViewToken;
        const percent = extendedToken.viewablePercent;
        if (typeof percent === 'number' && percent > bestPercent) {
          bestPercent = percent;
          bestItem = token;
        }
      }

      const selectedItem = bestItem || firstViewable;
      const nextIndex = selectedItem?.index ?? -1;

      // Update overlay visibility: 1 if item is visible, 0 if not
      // onViewableItemsChanged runs on native thread, but setOverlayVisibility safely updates shared value from JS thread
      const isVisible = nextIndex >= 0;
      setOverlayVisibility(isVisible ? 1 : 0);

      // Track visible video URIs for seen video tracking
      const visibleUris = viewableItems
        .map(token => token.item as UIFeedItem | null)
        .filter((item): item is UIFeedItem => item != null && !item.endCard)
        .map(item => item.post?.uri)
        .filter((uri): uri is string => typeof uri === 'string' && uri.length > 0);

      // Write immediately and synchronously - MMKV handles efficiency
      // No batching needed - MMKV writes are fast enough (microseconds)
      // markAsSeen now handles errors internally, so we don't need try-catch here
      visibleUris.forEach(uri => {
        if (uri) {
          seenVideoService.markAsSeen(uri);
        }
      });

      // Only process if index changed
      if (nextIndex !== activeItemIndexRef.current) {
        // Update ref immediately (source of truth - no delay)
        activeItemIndexRef.current = nextIndex;
        // Increment counter to trigger FlashList re-render via extraData
        // This is essential for video playback - items need to re-render when active item changes
        setExtraDataCounter(prev => prev + 1);
      }
    },
    [setOverlayVisibility] // Stable callback - FlashList handles optimization
  );

  const memoizedConfig = useMemo(
    () => viewabilityConfig ?? DEFAULT_VIEWABILITY_CONFIG,
    [viewabilityConfig]
  );

  // Use ref for immediate synchronous checks
  const isVideoVisible = useCallback((index: number) => {
    return index === activeItemIndexRef.current;
  }, []);

  return {
    onViewableItemsChanged,
    viewabilityConfig: memoizedConfig,
    activeItemIndexRef,
    extraData: extraDataCounter,
    canPlay,
    isVideoVisible,
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
