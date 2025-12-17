import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import type { ViewabilityConfig, ViewToken } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

import { useVisibilityCoreStore } from './visibilityStore';

/**
 * Optimized viewability config for FlashList
 * Uses native FlashList viewability tracking for best performance
 * Lower threshold for faster detection
 */
const DEFAULT_VIEWABILITY_CONFIG: ViewabilityConfig = {
  itemVisiblePercentThreshold: 50,
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
  activeItemIndex: number;
  canPlay: boolean;
  isVideoVisible: (index: number) => boolean;
}

/**
 * Lean visibility hook using FlashList's native viewability
 * Tracks only the centered item index - minimal state updates
 */
export function useFeedVisibility({
  isActive,
  viewabilityConfig,
}: FeedVisibilityOptions): FeedVisibilityResult {
  const appState = useVisibilityCoreStore((state) => state.appState);
  const activeTab = useVisibilityCoreStore((state) => state.activeTab);
  const activeRoute = useVisibilityCoreStore((state) => state.activeRoute);
  const isForeground = appState === 'active';
  // Video can play if: feed is active AND app is foreground AND (tab is active OR route is active)
  // Tab/route tracking persists even when inactive, so videos resume immediately when they become active again
  // For tab screens: activeTab !== null (e.g., 'index', 'explore')
  // For stacked screens (modals, profiles, channels): activeRoute !== null (e.g., 'feed-modal', 'profile:self')
  const canPlay = isActive && isForeground && (activeTab !== null || activeRoute !== null);

  // Track only the centered item index - minimal state
  // Keep tracking even when feed is inactive so we can resume playback immediately
  const [activeItemIndex, setActiveItemIndex] = useState<number>(-1);
  const activeItemIndexRef = useRef<number>(-1);
  
  // Update ref when state changes
  activeItemIndexRef.current = activeItemIndex;

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      // Always track viewable items, even when feed is inactive
      // This allows us to resume playback immediately when feed becomes active again

      // Find the most visible item (highest viewable percent)
      // If no percent available, use the first viewable item
      let bestItem: ViewToken | null = null;
      let bestPercent = -1;
      let firstViewable: ViewToken | null = null;

      for (const token of viewableItems) {
        if (!token.isViewable) continue;
        
        const item = token.item as any;
        if (item?.endCard) continue;

        // Track first viewable item as fallback
        if (!firstViewable) {
          firstViewable = token;
        }

        // Try to get viewablePercent (may not be available on all platforms)
        const percent = (token as any)?.viewablePercent;
        if (typeof percent === 'number' && percent > bestPercent) {
          bestPercent = percent;
          bestItem = token;
        }
      }

      // Use best item if we found one with percent, otherwise use first viewable
      const selectedItem = bestItem || firstViewable;
      const nextIndex = typeof selectedItem?.index === 'number' ? selectedItem.index : -1;
      
      // Only update state if index changed (use ref to avoid callback recreation)
      // Update even when feed is inactive to maintain tracking
      if (nextIndex !== activeItemIndexRef.current) {
        setActiveItemIndex(nextIndex);
      }
    },
    [] // No dependencies - callback is stable and always tracks viewability
  );

  const memoizedConfig = useMemo(() => viewabilityConfig ?? DEFAULT_VIEWABILITY_CONFIG, [viewabilityConfig]);

  const isVideoVisible = useCallback((index: number) => {
    return index === activeItemIndex;
  }, [activeItemIndex]);

  return {
    onViewableItemsChanged,
    viewabilityConfig: memoizedConfig,
    activeItemIndex,
    canPlay,
    isVideoVisible,
  };
}

/**
 * Simplified overlay hook - removed (no longer needed with native controls)
 */
export function useVisibilityOverlay(_isBlocking: boolean) {
  // No-op - overlays handled by VideoCard directly
}

/**
 * Track when a route becomes active/inactive
 * Updates visibility store so videos can pause/resume based on route focus
 */
export function useVisibilityRouteTracker(routeKey: string, tabKey?: string) {
  const setActiveRoute = useVisibilityCoreStore((state) => state.setActiveRoute);
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
    }
  }, [isFocused, routeKey, setActiveRoute]);
}

/**
 * Check if a specific route is currently active
 * Tracks route state from visibility store
 */
export function useVisibilityRouteIsActive(routeKey: string | null | undefined) {
  const activeRoute = useVisibilityCoreStore((state) => state.activeRoute);
  return Boolean(routeKey) && activeRoute === routeKey;
}

/**
 * Check if a specific tab is currently active
 * Tracks tab state from visibility store
 */
export function useVisibilityTabIsActive(tabKey: string | null | undefined) {
  const activeTab = useVisibilityCoreStore((state) => state.activeTab);
  return Boolean(tabKey) && activeTab === tabKey;
}
