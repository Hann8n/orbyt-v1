import { AppStateStatus } from 'react-native';
import { create } from 'zustand';

export type FeedScopeKey = string;

interface FeedScopeState {
  activeItemUri: string | null;
  activeItemIndex: number;
  isActive: boolean;
  resetCount: number;
  headerVisiblePercent: number;
}

function createDefaultFeedScope(): FeedScopeState {
  return {
    activeItemUri: null,
    activeItemIndex: -1,
    isActive: false,
    resetCount: 0,
    headerVisiblePercent: 0,
  };
}

interface VisibilityState {
  appState: AppStateStatus;
  isForeground: boolean;
  activeRoutePath: string | null;
  activeRouteKey: string | null;
  activeTabSegment: string | null;
  activeTabKey: string | null;
  modalDepth: number;
  pauseOnOverlay: boolean;
  feeds: Record<FeedScopeKey, FeedScopeState>;
  setAppState: (appState: AppStateStatus) => void;
  setIsForeground: (isForeground: boolean) => void;
  setActiveRoutePath: (path: string | null) => void;
  setActiveRouteKey: (key: string | null) => void;
  setActiveTabSegment: (segment: string | null) => void;
  setActiveTabKey: (key: string | null) => void;
  setPauseOnOverlay: (enabled: boolean) => void;
  pushOverlay: () => void;
  popOverlay: () => void;
  registerFeedScope: (key: FeedScopeKey) => void;
  activateFeedScope: (key: FeedScopeKey) => void;
  deactivateFeedScope: (key: FeedScopeKey) => void;
  setFeedVisibleItem: (key: FeedScopeKey, uri: string | null, index: number) => void;
  resetFeedScope: (key: FeedScopeKey) => void;
  resetAllFeeds: () => void;
  setFeedHeaderVisibility: (key: FeedScopeKey, visiblePercent: number) => void;
}

export const useVisibilityCoreStore = create<VisibilityState>()((set, get) => ({
  appState: 'active',
  isForeground: true,
  activeRoutePath: null,
  activeRouteKey: null,
  activeTabSegment: null,
  activeTabKey: null,
  modalDepth: 0,
  pauseOnOverlay: true,
  feeds: {},
  setAppState: (appState) => set({
    appState,
  }),
  setIsForeground: (isForeground) => set({ isForeground }),
  setActiveRoutePath: (path) => set({ activeRoutePath: path }),
  setActiveRouteKey: (key) => set({ activeRouteKey: key }),
  setActiveTabSegment: (segment) => set({ activeTabSegment: segment }),
  setActiveTabKey: (key) => set({ activeTabKey: key }),
  setPauseOnOverlay: (enabled) => set({ pauseOnOverlay: enabled }),
  pushOverlay: () => set((state) => ({ modalDepth: state.modalDepth + 1 })),
  popOverlay: () => set((state) => ({ modalDepth: Math.max(0, state.modalDepth - 1) })),
  registerFeedScope: (key) => {
    if (!key) return;
    const feeds = get().feeds;
    if (feeds[key]) return;
    if (__DEV__) {
      console.log('[visibility] registerFeedScope', key);
    }
    set((state) => ({
      feeds: {
        ...state.feeds,
        [key]: createDefaultFeedScope(),
      },
    }));
  },
  activateFeedScope: (key) => {
    if (!key) return;
    const feeds = get().feeds;
    const current = feeds[key] ?? createDefaultFeedScope();
    if (current.isActive) return;
    if (__DEV__) {
      console.log('[visibility] activateFeedScope', key);
    }
    set((state) => ({
      feeds: {
        ...state.feeds,
        [key]: {
          ...current,
          isActive: true,
        },
      },
    }));
  },
  deactivateFeedScope: (key) => {
    if (!key) return;
    const feeds = get().feeds;
    const current = feeds[key];
    if (!current || !current.isActive) {
      if (current?.activeItemUri === null && current?.activeItemIndex === -1) {
        return;
      }
    }
    if (__DEV__) {
      console.log('[visibility] deactivateFeedScope', key);
    }
    set((state) => ({
      feeds: {
        ...state.feeds,
        [key]: {
          ...(state.feeds[key] ?? createDefaultFeedScope()),
          isActive: false,
        },
      },
    }));
  },
  setFeedVisibleItem: (key, uri, index) => {
    if (!key) return;
    const previous = get().feeds[key] ?? createDefaultFeedScope();
    if (previous.activeItemUri === uri && previous.activeItemIndex === index) return;
    if (__DEV__) {
      console.log('[visibility] setFeedVisibleItem', key, { uri, index });
    }
    set((state) => ({
      feeds: {
        ...state.feeds,
        [key]: {
          ...(state.feeds[key] ?? createDefaultFeedScope()),
          activeItemUri: uri,
          activeItemIndex: index,
        },
      },
    }));
  },
  resetFeedScope: (key) => {
    if (!key) return;
    const previous = get().feeds[key];
    if (!previous) return;
    set((state) => ({
      feeds: {
        ...state.feeds,
        [key]: {
          ...previous,
          activeItemUri: null,
          activeItemIndex: -1,
          resetCount: previous.resetCount + 1,
          headerVisiblePercent: 0,
        },
      },
    }));
  },
  resetAllFeeds: () => {
    const feeds = get().feeds;
    if (!feeds || Object.keys(feeds).length === 0) return;
    const nextFeeds: Record<FeedScopeKey, FeedScopeState> = {};
    Object.entries(feeds).forEach(([key, value]) => {
      nextFeeds[key] = {
        ...value,
        activeItemUri: null,
        activeItemIndex: -1,
        resetCount: value.resetCount + 1,
        isActive: false,
        headerVisiblePercent: 0,
      };
    });
    set({ feeds: nextFeeds });
  },
  setFeedHeaderVisibility: (key, visiblePercent) => {
    if (!key) return;
    const clamped = Math.max(0, Math.min(1, visiblePercent));
    const previous = get().feeds[key] ?? createDefaultFeedScope();
    if (Math.abs(previous.headerVisiblePercent - clamped) < 0.02) {
      return;
    }
    if (__DEV__) {
      console.log('[visibility] setFeedHeaderVisibility', key, clamped);
    }
    set((state) => ({
      feeds: {
        ...state.feeds,
        [key]: {
          ...(state.feeds[key] ?? createDefaultFeedScope()),
          headerVisiblePercent: clamped,
        },
      },
    }));
  },
}));

export type { VisibilityState, FeedScopeState };
