import { create } from 'zustand';

import type { DetailNavTab } from '@/utils/navigation/detailRoutes';

/**
 * Last tab under `(tabs)` that had navigation focus. Used when presenting root modals (e.g. settings):
 * `useSegments()` no longer includes `(tabs)`, but profile/channel links should still open on the
 * tab the user was on (profile, explore, etc.), not always `home`.
 */
type DetailNavTabState = {
  lastFocusedDetailNavTab: DetailNavTab;
  setLastFocusedDetailNavTab: (tab: DetailNavTab) => void;
};

export const useDetailNavTabStore = create<DetailNavTabState>(set => ({
  lastFocusedDetailNavTab: 'home',
  setLastFocusedDetailNavTab: tab => set({ lastFocusedDetailNavTab: tab }),
}));
