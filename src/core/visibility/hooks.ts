import { useCallback, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import type { ViewabilityConfig, ViewToken } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

import { useVisibilityCoreStore, type FeedScopeKey } from './visibilityStore';

const DEFAULT_VIEWABILITY_CONFIG: ViewabilityConfig = {
  itemVisiblePercentThreshold: 65,
  minimumViewTime: 120,
};

interface FeedVisibilityOptions {
  scopeKey: FeedScopeKey;
  isActive: boolean;
  resetOnActivate?: boolean;
  resetOnDeactivate?: boolean;
  viewabilityConfig?: ViewabilityConfig;
}

interface FeedVisibilityResult {
  onViewableItemsChanged: ({ viewableItems }: { viewableItems: ViewToken[] }) => void;
  viewabilityConfig: ViewabilityConfig;
  activeItemUri: string | null;
  activeItemIndex: number;
  isFeedActive: boolean;
  canPlay: boolean;
  headerVisiblePercent: number;
  isHeaderBlockingPlayback: boolean;
  // Video visibility helpers (merged from useVideoVisibility)
  isVideoVisible: (uri: string | null | undefined) => boolean;
  shouldVideoPlay: (uri: string | null | undefined) => boolean;
  reset: () => void;
}

export function useFeedVisibility({
  scopeKey,
  isActive,
  resetOnActivate = false,
  resetOnDeactivate = false,
  viewabilityConfig,
}: FeedVisibilityOptions): FeedVisibilityResult {
  const setFeedActive = useVisibilityCoreStore((state) => state.setFeedActive);
  const setFeedVisibleItem = useVisibilityCoreStore((state) => state.setFeedVisibleItem);
  const resetFeedScope = useVisibilityCoreStore((state) => state.resetFeedScope);

  const feedEntry = useVisibilityCoreStore(useCallback((state) => state.feeds[scopeKey], [scopeKey]));
  const appState = useVisibilityCoreStore((state) => state.appState);
  const pauseOnOverlay = useVisibilityCoreStore((state) => state.pauseOnOverlay);
  const hasOverlay = useVisibilityCoreStore((state) => state.hasOverlay);

  const activeItemUri = feedEntry?.activeItemUri ?? null;
  const activeItemIndex = feedEntry?.activeItemIndex ?? -1;
  const isFeedActive = Boolean(feedEntry?.isActive);
  const headerVisiblePercent = feedEntry?.headerVisiblePercent ?? 0;
  
  // Derive isForeground from appState
  const isForeground = appState === 'active';
  const overlayBlocked = pauseOnOverlay && hasOverlay;
  const headerBlocked = headerVisiblePercent >= 0.5;
  const canPlay = isFeedActive && isForeground && !overlayBlocked && !headerBlocked;

  const lastVisibleUriRef = useRef<string | null>(null);
  const lastVisibleIndexRef = useRef<number>(-1);
  const hasActivatedOnceRef = useRef(false);

  const getViewablePercent = useCallback((token: ViewToken) => {
    const percent = (token as any)?.viewablePercent;
    return typeof percent === 'number' ? percent : 0;
  }, []);

  // Auto-register feed scope on first use and manage lifecycle
  useEffect(() => {
    // Ensure feed scope exists (auto-register)
    const current = useVisibilityCoreStore.getState().feeds[scopeKey];
    if (!current) {
      // Feed will be created automatically when we set state
    }

    return () => {
      resetFeedScope(scopeKey);
      setFeedActive(scopeKey, false);
      lastVisibleUriRef.current = null;
      lastVisibleIndexRef.current = -1;
      hasActivatedOnceRef.current = false;
    };
  }, [scopeKey, resetFeedScope, setFeedActive]);

  // Handle active state changes
  useEffect(() => {
    setFeedActive(scopeKey, isActive);
    
    if (isActive) {
      if (hasActivatedOnceRef.current && resetOnActivate) {
        resetFeedScope(scopeKey);
        lastVisibleUriRef.current = null;
      }
      hasActivatedOnceRef.current = true;
    } else {
      if (resetOnDeactivate && lastVisibleUriRef.current !== null) {
        setFeedVisibleItem(scopeKey, null, -1);
        lastVisibleUriRef.current = null;
        lastVisibleIndexRef.current = -1;
      }
    }
  }, [isActive, scopeKey, resetOnActivate, resetOnDeactivate, setFeedActive, resetFeedScope, setFeedVisibleItem]);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (!isActive) {
        return;
      }

      const candidates = viewableItems.filter((token) => {
        const item = token.item as any;
        const uri = item?.post?.uri;
        return token.isViewable && typeof uri === 'string' && !item?.endCard;
      });

      if (candidates.length === 0) {
        if (lastVisibleUriRef.current !== null) {
          setFeedVisibleItem(scopeKey, null, -1);
          lastVisibleUriRef.current = null;
        }
        return;
      }

      const nextVisible = candidates.reduce((previous, current) => {
        if (previous === null) return current;

        const previousPercent = getViewablePercent(previous);
        const currentPercent = getViewablePercent(current);

        if (currentPercent !== previousPercent) {
          return currentPercent > previousPercent ? current : previous;
        }

        const previousIndex = typeof previous.index === 'number' ? previous.index : Number.MAX_SAFE_INTEGER;
        const currentIndex = typeof current.index === 'number' ? current.index : Number.MAX_SAFE_INTEGER;
        const lastIndex = lastVisibleIndexRef.current;

        if (lastIndex >= 0) {
          const previousDistance = Math.abs(previousIndex - lastIndex);
          const currentDistance = Math.abs(currentIndex - lastIndex);
          if (currentDistance !== previousDistance) {
            return currentDistance < previousDistance ? current : previous;
          }
        }

        return currentIndex >= previousIndex ? current : previous;
      }, null as ViewToken | null);

      const nextUri = (nextVisible?.item as any)?.post?.uri ?? null;
      const nextIndex = typeof nextVisible?.index === 'number' ? nextVisible.index : -1;

      if (nextUri !== lastVisibleUriRef.current) {
        lastVisibleUriRef.current = nextUri;
        lastVisibleIndexRef.current = nextIndex;
        setFeedVisibleItem(scopeKey, nextUri, nextIndex);
      }
    },
    [getViewablePercent, isActive, scopeKey, setFeedVisibleItem]
  );

  const memoizedConfig = useMemo(() => viewabilityConfig ?? DEFAULT_VIEWABILITY_CONFIG, [viewabilityConfig]);

  // Video visibility helpers (merged from useVideoVisibility)
  const isVideoVisible = useCallback((uri: string | null | undefined) => {
    return Boolean(uri) && activeItemUri === uri;
  }, [activeItemUri]);

  const shouldVideoPlay = useCallback((uri: string | null | undefined) => {
    return Boolean(uri) && isVideoVisible(uri) && canPlay;
  }, [isVideoVisible, canPlay]);

  return {
    onViewableItemsChanged,
    viewabilityConfig: memoizedConfig,
    activeItemUri,
    activeItemIndex,
    isFeedActive,
    canPlay,
    headerVisiblePercent,
    isHeaderBlockingPlayback: headerBlocked,
    isVideoVisible,
    shouldVideoPlay,
    reset: () => resetFeedScope(scopeKey),
  };
}

export function useVisibilityOverlay(isBlocking: boolean) {
  const setOverlay = useVisibilityCoreStore((state) => state.setOverlay);
  const isBlockingRef = useRef(false);

  useEffect(() => {
    if (isBlocking !== isBlockingRef.current) {
      setOverlay(isBlocking);
      isBlockingRef.current = isBlocking;
    }
  }, [isBlocking, setOverlay]);

  useEffect(() => () => {
    if (isBlockingRef.current) {
      setOverlay(false);
      isBlockingRef.current = false;
    }
  }, [setOverlay]);
}

export function useVisibilityRouteTracker(routeKey: string, tabKey?: string) {
  const setActiveRouteKey = useVisibilityCoreStore((state) => state.setActiveRouteKey);
  const setActiveTabKey = useVisibilityCoreStore((state) => state.setActiveTabKey);
  const isFocused = useIsFocused();

  useLayoutEffect(() => {
    if (!routeKey) {
      return;
    }

    if (isFocused) {
      setActiveRouteKey(routeKey);
      if (tabKey) {
        setActiveTabKey(tabKey);
      }
      return () => {
        const store = useVisibilityCoreStore.getState();
        if (store.activeRouteKey === routeKey) {
          store.setActiveRouteKey(null);
        }
        if (tabKey && store.activeTabKey === tabKey) {
          store.setActiveTabKey(null);
        }
      };
    }

    const store = useVisibilityCoreStore.getState();
    if (store.activeRouteKey === routeKey) {
      store.setActiveRouteKey(null);
    }
    if (tabKey && store.activeTabKey === tabKey) {
      store.setActiveTabKey(null);
    }
  }, [isFocused, routeKey, tabKey, setActiveRouteKey, setActiveTabKey]);
}

export function useVisibilityRouteIsActive(routeKey: string | null | undefined) {
  return useVisibilityCoreStore(
    useCallback((state) => Boolean(routeKey) && state.activeRouteKey === routeKey, [routeKey])
  );
}

export function useVisibilityTabIsActive(tabKey: string | null | undefined) {
  return useVisibilityCoreStore(
    useCallback((state) => Boolean(tabKey) && state.activeTabKey === tabKey, [tabKey])
  );
}
