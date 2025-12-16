import { create } from 'zustand';

interface PendingTrim {
  videoPath: string;
  duration: number;
}

interface TrimState {
  pendingTrim: PendingTrim | null;
  setPendingTrim: (trim: PendingTrim) => void;
  consumePendingTrim: () => PendingTrim | null;
}

export const useVideoTrimStore = create<TrimState>((set, get) => ({
  pendingTrim: null,
  setPendingTrim: (trim: PendingTrim) => set({ pendingTrim: trim }),
  consumePendingTrim: () => {
    const current = get().pendingTrim;
    if (current) {
      set({ pendingTrim: null });
    }
    return current;
  },
}));


