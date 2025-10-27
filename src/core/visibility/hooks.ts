import { useCallback, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import type { ViewabilityConfig, ViewToken } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { usePathname, useSegments } from 'expo-router';

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
  reset: () => void;
}

export function useFeedVisibility({
  scopeKey,
  isActive,
  resetOnActivate = false,
  resetOnDeactivate = false,
  viewabilityConfig,
}: FeedVisibilityOptions): FeedVisibilityResult {
  const registerFeedScope = useVisibilityCoreStore((state) => state.registerFeedScope);
  const activateFeedScope = useVisibilityCoreStore((state) => state.activateFeedScope);
  const deactivateFeedScope = useVisibilityCoreStore((state) => state.deactivateFeedScope);
  const setFeedVisibleItem = useVisibilityCoreStore((state) => state.setFeedVisibleItem);
  const resetFeedScope = useVisibilityCoreStore((state) => state.resetFeedScope);

  const feedEntry = useVisibilityCoreStore(useCallback((state) => state.feeds[scopeKey], [scopeKey]));
  const appState = useVisibilityCoreStore((state) => state.appState);
  const isForeground = useVisibilityCoreStore((state) => state.isForeground);
  const pauseOnOverlay = useVisibilityCoreStore((state) => state.pauseOnOverlay);
  const modalDepth = useVisibilityCoreStore((state) => state.modalDepth);

  const activeItemUri = feedEntry?.activeItemUri ?? null;
  const activeItemIndex = feedEntry?.activeItemIndex ?? -1;
  const isFeedActive = Boolean(feedEntry?.isActive);
  const headerVisiblePercent = feedEntry?.headerVisiblePercent ?? 0;
  const overlayBlocked = pauseOnOverlay && modalDepth > 0;
  const headerBlocked = headerVisiblePercent >= 0.5;
  const canPlay = isFeedActive && appState === 'active' && isForeground && !overlayBlocked && !headerBlocked;

  const lastVisibleUriRef = useRef<string | null>(null);
  const lastVisibleIndexRef = useRef<number>(-1);
  const hasActivatedOnceRef = useRef(false);

  const getViewablePercent = useCallback((token: ViewToken) => {
    const percent = (token as any)?.viewablePercent;
    return typeof percent === 'number' ? percent : 0;
  }, []);

  useEffect(() => {
    registerFeedScope(scopeKey);
    return () => {
      resetFeedScope(scopeKey);
      deactivateFeedScope(scopeKey);
      lastVisibleUriRef.current = null;
      lastVisibleIndexRef.current = -1;
      hasActivatedOnceRef.current = false;
    };
  }, [scopeKey, registerFeedScope, resetFeedScope, deactivateFeedScope]);

  useEffect(() => {
    if (isActive) {
      activateFeedScope(scopeKey);
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
      deactivateFeedScope(scopeKey);
    }
  }, [isActive, scopeKey, resetOnActivate, resetOnDeactivate, activateFeedScope, deactivateFeedScope, resetFeedScope, setFeedVisibleItem]);

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

  return {
    onViewableItemsChanged,
    viewabilityConfig: memoizedConfig,
    activeItemUri,
    activeItemIndex,
    isFeedActive,
    canPlay,
    headerVisiblePercent,
    isHeaderBlockingPlayback: headerBlocked,
    reset: () => resetFeedScope(scopeKey),
  };
}

export function useVideoVisibility(scopeKey: FeedScopeKey, uri: string | null | undefined) {
  return useVisibilityCoreStore((state) => {
    const feed = state.feeds[scopeKey];
    const overlayBlocked = state.pauseOnOverlay && state.modalDepth > 0;
    const isAppActive = state.appState === 'active';
    const isForeground = state.isForeground;
    const isCurrent = Boolean(uri) && feed?.activeItemUri === uri;
    const isFeedActive = Boolean(feed?.isActive);
    const shouldPlay = Boolean(uri) && isCurrent && isFeedActive && isAppActive && isForeground && !overlayBlocked;
    return {
      shouldPlay,
      isCurrent,
      isFeedActive,
      overlayBlocked,
      isAppActive,
      isForeground,
    };
  });
}

export function useVisibilityPreferences() {
  return useVisibilityCoreStore((state) => ({
    pauseOnOverlay: state.pauseOnOverlay,
    modalDepth: state.modalDepth,
    setPauseOnOverlay: state.setPauseOnOverlay,
  }));
}

export function useVisibilityOverlay(isBlocking: boolean) {
  const pushOverlay = useVisibilityCoreStore((state) => state.pushOverlay);
  const popOverlay = useVisibilityCoreStore((state) => state.popOverlay);
  const isBlockingRef = useRef(false);

  useEffect(() => {
    if (isBlocking && !isBlockingRef.current) {
      pushOverlay();
      isBlockingRef.current = true;
    }

    if (!isBlocking && isBlockingRef.current) {
      popOverlay();
      isBlockingRef.current = false;
    }
  }, [isBlocking, popOverlay, pushOverlay]);

  useEffect(() => () => {
    if (isBlockingRef.current) {
      popOverlay();
      isBlockingRef.current = false;
    }
  }, [popOverlay]);
}

export function useVisibilityRouteTracker(routeKey: string, tabKey?: string) {
  const setActiveRouteKey = useVisibilityCoreStore((state) => state.setActiveRouteKey);
  const setActiveTabKey = useVisibilityCoreStore((state) => state.setActiveTabKey);
  const setActiveRoutePath = useVisibilityCoreStore((state) => state.setActiveRoutePath);
  const setActiveTabSegment = useVisibilityCoreStore((state) => state.setActiveTabSegment);
  const isFocused = useIsFocused();
  const pathname = usePathname();
  const segments = useSegments();

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

  useEffect(() => {
    if (typeof pathname === 'string') {
      setActiveRoutePath(pathname);
    }
  }, [pathname, setActiveRoutePath]);

  useEffect(() => {
    if (!segments) {
      return;
    }

    const tabsIndex = segments.indexOf('(tabs)');
    const nextSegment = tabsIndex >= 0 && segments.length > tabsIndex + 1
      ? segments[tabsIndex + 1]
      : segments[segments.length - 1];

    setActiveTabSegment(typeof nextSegment === 'string' ? nextSegment : null);
  }, [segments, setActiveTabSegment]);
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
