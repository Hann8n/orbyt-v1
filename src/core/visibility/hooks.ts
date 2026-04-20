import { useCallback, useEffect, useState } from 'react';
import { AppState, type ViewabilityConfig, type ViewToken } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

import { FEED_ROW_VIEWABILITY_CONFIG } from './feedRowVisibility';

interface FeedVisibilityOptions {
  isActive: boolean;
  /** Emits the most visible row index from native list viewability callbacks. */
  onActiveVisibleIndexChange?: (index: number) => void;
}

interface FeedVisibilityResult {
  onViewableItemsChanged: ({ viewableItems }: { viewableItems: ViewToken[] }) => void;
  viewabilityConfig: ViewabilityConfig;
  canPlay: boolean;
}

/**
 * Visibility hook keeps only environment gates (route/app state) and native viewability wiring.
 * Per-list visible index ownership is handled by the list component itself.
 */
export function useFeedVisibility({
  isActive,
  onActiveVisibleIndexChange,
}: FeedVisibilityOptions): FeedVisibilityResult {
  const [appState, setAppState] = useState(AppState.currentState);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);
  const isForeground = appState === 'active';
  const canPlay = isActive && isForeground;

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const token = viewableItems.find(t => t.isViewable);
      const nextIndex = typeof token?.index === 'number' ? token.index : -1;

      if (nextIndex >= 0) {
        onActiveVisibleIndexChange?.(nextIndex);
      }
    },
    [onActiveVisibleIndexChange]
  );

  return {
    onViewableItemsChanged,
    viewabilityConfig: FEED_ROW_VIEWABILITY_CONFIG satisfies ViewabilityConfig,
    canPlay,
  };
}

/**
 * Check whether the current screen is focused.
 * routeKey is intentionally ignored to preserve existing API shape.
 */
export function useVisibilityRouteIsActive(_routeKey: string | null | undefined): boolean {
  return useIsFocused();
}
