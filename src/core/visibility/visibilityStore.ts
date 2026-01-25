import { AppStateStatus } from 'react-native';
import { create } from 'zustand';

/**
 * Visibility store: both feeds render side-by-side in the pager, fully independent.
 * - activeFeedKey: which pager page is in view (only that feed's videos play).
 * - lastViewableIndexByFeed: per-feed viewable index (each feed keeps its own scroll/cursor).
 */
interface VisibilityState {
  appState: AppStateStatus;
  activeRoute: string | null;
  activeFeedKey: string | null;
  lastViewableIndexByFeed: Record<string, number>;
  setAppState: (appState: AppStateStatus) => void;
  setActiveRoute: (route: string | null) => void;
  setActiveFeedKey: (feedKey: string) => void;
  setLastViewableIndex: (feedKey: string, index: number) => void;
}

export const useVisibilityCoreStore = create<VisibilityState>()(set => ({
  appState: 'active',
  activeRoute: null,
  activeFeedKey: null,
  lastViewableIndexByFeed: {},
  setAppState: appState => set({ appState }),
  setActiveRoute: route => set({ activeRoute: route }),
  setActiveFeedKey: feedKey => set({ activeFeedKey: feedKey }),
  setLastViewableIndex: (feedKey, index) =>
    set(s => ({
      lastViewableIndexByFeed: { ...s.lastViewableIndexByFeed, [feedKey]: index },
    })),
}));
