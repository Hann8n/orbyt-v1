import { create } from 'zustand';
import type { TextOverlay } from '../types';
import type { VideoSegment } from '../services/video/VideoProcessingService';

export type PendingVideoSegment = VideoSegment;

export interface PendingVideoPostPayload {
  videoPath?: string | null;
  segments?: PendingVideoSegment[] | null;
  thumbnailPath?: string | null;
  textOverlays?: TextOverlay[];
}

interface PendingVideoPostState {
  payload: PendingVideoPostPayload | null;
  setPayload: (payload: PendingVideoPostPayload) => void;
  consumePayload: () => PendingVideoPostPayload | null;
}

export const usePendingVideoPostStore = create<PendingVideoPostState>((set, get) => ({
  payload: null,
  setPayload: payload => set({ payload }),
  consumePayload: () => {
    const { payload } = get();
    set({ payload: null });
    return payload;
  },
}));
