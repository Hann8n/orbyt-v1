/**
 * App State Management
 * Manages core app states like initialization and loading
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { storageAdapter } from '../utils/storage/storage';

type HomeFeedTab = 'following' | 'your-mix';

interface AppState {
  appState: string;
  lastHomeFeed: HomeFeedTab;
  setAppState: (state: string) => void;
  setLastHomeFeed: (feed: HomeFeedTab) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, _get) => ({
      appState: 'active',
      lastHomeFeed: 'your-mix',
      setAppState: (appState: string) => set({ appState }),
      setLastHomeFeed: (lastHomeFeed: HomeFeedTab) => set({ lastHomeFeed }),
    }),
    {
      name: 'app-store',
      storage: createJSONStorage(() => storageAdapter),
      partialize: state => ({
        appState: state.appState,
        lastHomeFeed: state.lastHomeFeed,
      }),
    }
  )
);
