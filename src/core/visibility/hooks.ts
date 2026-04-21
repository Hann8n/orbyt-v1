import { useCallback, useEffect, useRef, useState } from 'react';
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

const getTokenVisibilityScore = (token: ViewToken): number => {
  const asRecord = token as ViewToken & {
    percentVisible?: number;
    visiblePercent?: number;
    itemVisiblePercent?: number;
    viewablePercent?: number;
    coverage?: number;
  };

  return (
    asRecord.percentVisible ??
    asRecord.visiblePercent ??
    asRecord.itemVisiblePercent ??
    asRecord.viewablePercent ??
    asRecord.coverage ??
    (token.isViewable ? 0 : -1)
  );
};

const selectMostVisibleToken = (viewableItems: ViewToken[]): ViewToken | undefined => {
  let bestToken: (ViewToken & { index: number }) | undefined;
  let bestScore = -1;

  for (const token of viewableItems) {
    if (typeof token.index !== 'number') continue;
    const candidate = token as ViewToken & { index: number };
    const score = getTokenVisibilityScore(candidate);
    if (score < 0) continue;
    if (
      !bestToken ||
      score > bestScore ||
      (score === bestScore && candidate.index < bestToken.index)
    ) {
      bestToken = candidate;
      bestScore = score;
    }
  }

  return bestToken;
};

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
  const canPlayRef = useRef(canPlay);
  const onActiveVisibleIndexChangeRef = useRef(onActiveVisibleIndexChange);
  const lastEmittedIndexRef = useRef(-1);

  useEffect(() => {
    canPlayRef.current = canPlay;
  }, [canPlay]);

  useEffect(() => {
    onActiveVisibleIndexChangeRef.current = onActiveVisibleIndexChange;
  }, [onActiveVisibleIndexChange]);

  useEffect(() => {
    if (!canPlay) {
      lastEmittedIndexRef.current = -1;
    }
  }, [canPlay]);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (!canPlayRef.current) return;
      const token = selectMostVisibleToken(viewableItems);
      const nextIndex = typeof token?.index === 'number' ? token.index : -1;

      if (nextIndex < 0) {
        lastEmittedIndexRef.current = -1;
        return;
      }

      if (nextIndex >= 0 && nextIndex !== lastEmittedIndexRef.current) {
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
