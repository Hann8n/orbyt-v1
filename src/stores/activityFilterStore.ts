import { create } from 'zustand';
import type { NotificationReason } from '../services/api/types';

interface ActivityFilterState {
  filterReasons: NotificationReason[] | undefined;
  setFilterReasons: (reasons: NotificationReason[] | undefined) => void;
}

export const useActivityFilterStore = create<ActivityFilterState>(set => ({
  filterReasons: undefined,
  setFilterReasons: filterReasons => set({ filterReasons }),
}));
