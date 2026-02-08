import { create } from 'zustand';

/**
 * Visibility store: both feeds render side-by-side in the pager, fully independent.
 * - activeFeedKey: which pager page is in view (only that feed's videos play).
 * - lastViewableIndexByFeed: per-feed viewable index (each feed keeps its own scroll/cursor).
 * App foreground/background is read via React Native's AppState in useFeedVisibility (no store sync).
 */
interface VisibilityState {
  activeRoute: string | null;
  activeFeedKey: string | null;
  lastViewableIndexByFeed: Record<string, number>;
  setActiveRoute: (route: string | null) => void;
  setActiveFeedKey: (feedKey: string) => void;
  setLastViewableIndex: (feedKey: string, index: number) => void;
}

export const useVisibilityCoreStore = create<VisibilityState>()(set => ({
  activeRoute: null,
  activeFeedKey: null,
  lastViewableIndexByFeed: {},
  setActiveRoute: route => set({ activeRoute: route }),
  setActiveFeedKey: feedKey => set({ activeFeedKey: feedKey }),
  setLastViewableIndex: (feedKey, index) =>
    set(s => ({
      lastViewableIndexByFeed: { ...s.lastViewableIndexByFeed, [feedKey]: index },
    })),
}));
