import { create } from 'zustand';
import type { TextOverlay } from '../types';
import type { VideoSegment } from '../services/video/VideoProcessingService';

/** Same union as `VideoSegment.video` (camera `{ uri }` or full picker asset). */
export type PendingVideoRef = VideoSegment['video'];

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
