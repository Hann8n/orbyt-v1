import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
} from 'react';
import { AppState, type ViewabilityConfig, type ViewToken } from 'react-native';
import { useIsFocused } from 'expo-router/react-navigation';

interface FeedVisibilityOptions {
  isActive: boolean;
  onActiveIndexChange?: (index: number) => void;
}

interface FeedVisibilityResult {
  onViewableItemsChanged: (info: { viewableItems: ViewToken[] }) => void;
  viewabilityConfig: ViewabilityConfig;
  canPlay: boolean;
}

// RN requires a stable viewabilityConfig reference — must live outside the component/hook.
const FEED_VIEWABILITY_CONFIG: ViewabilityConfig = {
  itemVisiblePercentThreshold: 60,
  minimumViewTime: 80,
};

const selectActiveIndex = (viewableItems: ViewToken[]): number => {
  let active = -1;
  for (const token of viewableItems) {
    if (typeof token.index !== 'number' || !token.isViewable) continue;
    if (active === -1 || token.index < active) active = token.index;
  }
  return active;
};

export function useFeedVisibility({
  isActive,
  onActiveIndexChange,
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

  const onActiveIndexChangeRef = useRef(onActiveIndexChange);
  useEffect(() => {
    onActiveIndexChangeRef.current = onActiveIndexChange;
  }, [onActiveIndexChange]);

  const onViewableItemsChanged = useCallback((info: { viewableItems: ViewToken[] }) => {
    const index = selectActiveIndex(info.viewableItems);
    if (index >= 0) onActiveIndexChangeRef.current?.(index);
  }, []);

  return {
    canPlay,
    onViewableItemsChanged,
    viewabilityConfig: FEED_VIEWABILITY_CONFIG,
  };
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
