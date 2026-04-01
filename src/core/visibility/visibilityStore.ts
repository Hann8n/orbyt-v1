import { create } from 'zustand';

/**
 * Visibility store: both feeds render side-by-side in the pager, fully independent.
 * - activeFeedKey: which pager page is in view (only that feed's videos play).
 * - lastViewableIndexByFeed: per-feed viewable index (each feed keeps its own scroll/cursor).
 * App foreground/background is read via React Native's AppState in useFeedVisibility (no store sync).
 */
interface VisibilityState {
  activeFeedKey: string | null;
  lastViewableIndexByFeed: Record<string, number>;
  setActiveFeedKey: (feedKey: string) => void;
  setLastViewableIndex: (feedKey: string, index: number) => void;
}

export const useVisibilityCoreStore = create<VisibilityState>()(set => ({
  activeFeedKey: null,
  lastViewableIndexByFeed: {},
  setActiveFeedKey: feedKey => set({ activeFeedKey: feedKey }),
  setLastViewableIndex: (feedKey, index) =>
    set(s => ({
      lastViewableIndexByFeed: { ...s.lastViewableIndexByFeed, [feedKey]: index },
    })),
}));
