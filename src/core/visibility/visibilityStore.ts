import { AppStateStatus } from 'react-native';
import { create } from 'zustand';

/**
 * Minimal visibility store - tracks app state, active tab, and active route
 * FlashList handles viewability natively, no need for complex feed tracking
 */
interface VisibilityState {
  appState: AppStateStatus;
  activeTab: string | null;
  activeRoute: string | null;
  setAppState: (appState: AppStateStatus) => void;
  setActiveTab: (tab: string | null) => void;
  setActiveRoute: (route: string | null) => void;
}

export const useVisibilityCoreStore = create<VisibilityState>()((set) => ({
  appState: 'active',
  activeTab: null,
  activeRoute: null,
  setAppState: (appState) => set({ appState }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setActiveRoute: (route) => set({ activeRoute: route }),
}));
