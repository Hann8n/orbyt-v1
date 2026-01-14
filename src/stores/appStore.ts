/**
 * App State Management
 * Manages core app states like initialization and loading
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { storageAdapter } from '../utils/storage/storage';

interface AppState {
  // App state
  appState: string;

  // Actions
  setAppState: (state: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, _get) => ({
      // Initial state
      appState: 'active',

      // Actions
      setAppState: (appState: string) => set({ appState }),
    }),
    {
      name: 'app-store',
      storage: createJSONStorage(() => storageAdapter),
      partialize: state => ({
        // Only persist app state, not loading states
        appState: state.appState,
      }),
    }
  )
);

// Convenience hooks - optimized with individual selectors
export const useAppInitialization = () => {
  const appState = useAppStore(state => state.appState);
  const setAppState = useAppStore(state => state.setAppState);

  return {
    appState,
    setAppState,
  };
};
