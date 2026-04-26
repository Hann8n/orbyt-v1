import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
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

const selectViewableToken = (
  viewableItems: ViewToken[]
): (ViewToken & { index: number }) | undefined => {
  let best: (ViewToken & { index: number }) | undefined;
  for (const token of viewableItems) {
    if (typeof token.index !== 'number' || !token.isViewable) continue;
    if (!best || token.index < best.index) best = token as ViewToken & { index: number };
  }
  return best;
};

/**
 * Visibility hook keeps only environment gates (route/app state) and native viewability wiring.
 * Per-list visible index ownership is handled by the list component itself.
 */
export function useFeedVisibility({
  isActive,
  onActiveVisibleIndexChange,
}: FeedVisibilityOptions): FeedVisibilityResult {
  const isForeground = useSyncExternalStore(
    notify => {
      const sub = AppState.addEventListener('change', () => notify());
      return () => sub.remove();
    },
    () => AppState.currentState === 'active',
    () => true
  );
  const canPlay = isActive && isForeground;

  const onActiveVisibleIndexChangeRef = useRef(onActiveVisibleIndexChange);
  useEffect(() => {
    onActiveVisibleIndexChangeRef.current = onActiveVisibleIndexChange;
  }, [onActiveVisibleIndexChange]);

  const lastEmittedIndexRef = useRef(-1);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const token = selectViewableToken(viewableItems);
      const nextIndex = typeof token?.index === 'number' ? token.index : -1;

      if (nextIndex < 0) {
        lastEmittedIndexRef.current = -1;
        return;
      }

      if (nextIndex !== lastEmittedIndexRef.current) {
        lastEmittedIndexRef.current = nextIndex;
        onActiveVisibleIndexChangeRef.current?.(nextIndex);
      }
    },
    []
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
