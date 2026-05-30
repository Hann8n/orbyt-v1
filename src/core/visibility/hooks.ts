import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
} from 'react';
import { AppState, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useIsFocused } from 'expo-router/react-navigation';

interface FeedVisibilityOptions {
  isActive: boolean;
  /** Emits the snapped page index after each momentum scroll settles. */
  onPageIndexChange?: (index: number) => void;
  /** Height of a single page (card). Used for uniform-interval feeds. */
  cardHeight?: number;
  /**
   * Explicit snap offsets for non-uniform feeds (header feeds). When provided,
   * the index is resolved by finding the closest offset instead of dividing by
   * cardHeight — which would be wrong when the header is a different height.
   */
  snapToOffsets?: number[];
}

interface FeedVisibilityResult {
  onMomentumScrollEnd: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  canPlay: boolean;
}

/**
 * Visibility hook for paged feeds. Replaces the viewability-threshold approach with
 * onMomentumScrollEnd: fires exactly once per snap, gives the page index directly
 * from the content offset — no percentage math, no minimumViewTime, no header-item filtering.
 */
export function useFeedVisibility({
  isActive,
  onPageIndexChange,
  cardHeight,
  snapToOffsets,
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

  const onPageIndexChangeRef = useRef(onPageIndexChange);
  useEffect(() => {
    onPageIndexChangeRef.current = onPageIndexChange;
  }, [onPageIndexChange]);

  const cardHeightRef = useRef(cardHeight);
  useEffect(() => {
    cardHeightRef.current = cardHeight;
  }, [cardHeight]);

  const snapToOffsetsRef = useRef(snapToOffsets);
  useEffect(() => {
    snapToOffsetsRef.current = snapToOffsets;
  }, [snapToOffsets]);

  const onMomentumScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const offsets = snapToOffsetsRef.current;
    if (offsets && offsets.length > 0) {
      // Header feeds use non-uniform snap offsets — find the closest one by distance.
      let closest = 0;
      let minDist = Math.abs(y - offsets[0]);
      for (let i = 1; i < offsets.length; i++) {
        const dist = Math.abs(y - offsets[i]);
        if (dist < minDist) {
          minDist = dist;
          closest = i;
        }
      }
      onPageIndexChangeRef.current?.(closest);
      return;
    }
    const h = cardHeightRef.current;
    if (!h || h <= 0) return;
    onPageIndexChangeRef.current?.(Math.round(y / h));
  }, []);

  return {
    canPlay,
    onMomentumScrollEnd,
  };
}

/**
 * True when a feed page is the active page of its pager. Defaults to `true` so feed surfaces
 * rendered outside a pager (modal feed, channel, full-height video) are treated as active.
 */
const PagerPageActiveContext = createContext(true);
export const PagerPageActiveProvider = PagerPageActiveContext.Provider;

/**
 * Whether a feed surface is currently on screen: focused in the navigation stack and — when inside
 * a pager — the active page. Reads React Navigation's focus context directly, so the value never
 * needs to be drilled down as a prop.
 */
export function useScreenVisible(): boolean {
  const isFocused = useIsFocused();
  const isPageActive = useContext(PagerPageActiveContext);
  return isFocused && isPageActive;
}
