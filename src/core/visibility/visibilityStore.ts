import { AppStateStatus } from 'react-native';
import { create } from 'zustand';

export type FeedScopeKey = string;

interface FeedScopeState {
  activeItemUri: string | null;
  activeItemIndex: number;
  isActive: boolean;
  headerVisiblePercent: number;
}

function createDefaultFeedScope(): FeedScopeState {
  return {
    activeItemUri: null,
    activeItemIndex: -1,
    isActive: false,
    headerVisiblePercent: 0,
  };
}

interface VisibilityState {
  appState: AppStateStatus;
  activeRouteKey: string | null;
  activeTabSegment: string | null;
  activeTabKey: string | null;
  hasOverlay: boolean;
  pauseOnOverlay: boolean;
  feeds: Record<FeedScopeKey, FeedScopeState>;
  setAppState: (appState: AppStateStatus) => void;
  setActiveRouteKey: (key: string | null) => void;
  setActiveTabSegment: (segment: string | null) => void;
  setActiveTabKey: (key: string | null) => void;
  setPauseOnOverlay: (enabled: boolean) => void;
  setOverlay: (hasOverlay: boolean) => void;
  setFeedActive: (key: FeedScopeKey, isActive: boolean) => void;
  setFeedVisibleItem: (key: FeedScopeKey, uri: string | null, index: number) => void;
  resetFeedScope: (key: FeedScopeKey) => void;
  resetAllFeeds: () => void;
  setFeedHeaderVisibility: (key: FeedScopeKey, visiblePercent: number) => void;
}

export const useVisibilityCoreStore = create<VisibilityState>()((set, get) => ({
  appState: 'active',
  activeRouteKey: null,
  activeTabSegment: null,
  activeTabKey: null,
  hasOverlay: false,
  pauseOnOverlay: true,
  feeds: {},
  setAppState: (appState) => set({ appState }),
  setActiveRouteKey: (key) => set({ activeRouteKey: key }),
  setActiveTabSegment: (segment) => set({ activeTabSegment: segment }),
  setActiveTabKey: (key) => set({ activeTabKey: key }),
  setPauseOnOverlay: (enabled) => set({ pauseOnOverlay: enabled }),
  setOverlay: (hasOverlay) => set({ hasOverlay }),
  setFeedActive: (key, isActive) => {
    if (!key) return;
    const current = get().feeds[key] ?? createDefaultFeedScope();
    if (current.isActive === isActive) return;
    set((state) => ({
      feeds: {
        ...state.feeds,
        [key]: {
          ...current,
          isActive,
        },
      },
    }));
  },
  setFeedVisibleItem: (key, uri, index) => {
    if (!key) return;
    const current = get().feeds[key] ?? createDefaultFeedScope();
    if (current.activeItemUri === uri && current.activeItemIndex === index) return;
    set((state) => ({
      feeds: {
        ...state.feeds,
        [key]: {
          ...current,
          activeItemUri: uri,
          activeItemIndex: index,
        },
      },
    }));
  },
  resetFeedScope: (key) => {
    if (!key) return;
    const current = get().feeds[key];
    if (!current) return;
    set((state) => ({
      feeds: {
        ...state.feeds,
        [key]: {
          ...current,
          activeItemUri: null,
          activeItemIndex: -1,
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
        isActive: false,
        headerVisiblePercent: 0,
      };
    });
    set({ feeds: nextFeeds });
  },
  setFeedHeaderVisibility: (key, visiblePercent) => {
    if (!key) return;
    const clamped = Math.max(0, Math.min(1, visiblePercent));
    const current = get().feeds[key] ?? createDefaultFeedScope();
    if (Math.abs(current.headerVisiblePercent - clamped) < 0.02) return;
    set((state) => ({
      feeds: {
        ...state.feeds,
        [key]: {
          ...current,
          headerVisiblePercent: clamped,
        },
      },
    }));
  },
}));

export type { VisibilityState, FeedScopeState };
