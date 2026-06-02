import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
} from 'react';
import { AppState } from 'react-native';
import type ViewToken from '@shopify/flash-list/dist/recyclerview/viewability/ViewToken';
import { useIsFocused } from '@react-navigation/native';


interface FeedVisibilityOptions {
  isActive: boolean;
  /** Emits the most visible row index from native list viewability callbacks. */
  onActiveVisibleIndexChange?: (index: number) => void;
}

interface FeedVisibilityResult {
  onViewableItemsChanged: ({ viewableItems }: { viewableItems: ViewToken<unknown>[] }) => void;
  canPlay: boolean;
}

const selectViewableToken = (
  viewableItems: ViewToken<unknown>[]
): (ViewToken<unknown> & { index: number }) | undefined =>
  viewableItems.find(
    (t): t is ViewToken<unknown> & { index: number } =>
      typeof t.index === 'number' && t.isViewable
  );

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
    ({ viewableItems }: { viewableItems: ViewToken<unknown>[] }) => {
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

// Defaults to true so surfaces rendered outside a pager (modal, channel, full-height video) are
// treated as active without needing a provider.
const PagerPageActiveContext = createContext(true);
export const PagerPageActiveProvider = PagerPageActiveContext.Provider;

// Combines navigation focus with pager-page active state so neither has to be prop-drilled.
export function useScreenVisible(): boolean {
  const isFocused = useIsFocused();
  const isPageActive = useContext(PagerPageActiveContext);
  return isFocused && isPageActive;
}
