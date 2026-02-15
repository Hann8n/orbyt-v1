import { create } from 'zustand';

interface PendingTrim {
  videoPath: string;
  duration: number;
}

interface TrimState {
  pendingTrim: PendingTrim | null;
  setPendingTrim: (trim: PendingTrim) => void;
}

export const useVideoTrimStore = create<TrimState>(set => ({
  pendingTrim: null,
  setPendingTrim: (trim: PendingTrim) => set({ pendingTrim: trim }),
}));
