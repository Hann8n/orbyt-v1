import { create } from 'zustand';
import type * as ImagePicker from 'expo-image-picker';

export interface Segment {
  duration: number;
  video: { uri: string } | ImagePicker.ImagePickerAsset;
  sourceType?: 'camera' | 'gallery';
}

export interface VideoSegmentOut {
  startTime: number;
  duration: number;
  video: Segment['video'];
  sourceType?: Segment['sourceType'];
}

interface CreateSegmentsState {
  segments: Segment[];
  maxDuration: number;
  setMaxDuration: (sec: number) => void;
  addSegment: (segment: Segment) => boolean;
  removeLastSegment: () => Segment | null;
  clear: () => void;
  totalDuration: () => number;
  availableTime: () => number;
  hasSegments: () => boolean;
  toVideoSegments: () => VideoSegmentOut[];
}

const sumDuration = (segments: Segment[]) => segments.reduce((sum, s) => sum + s.duration, 0);

export const useCreateSegmentsStore = create<CreateSegmentsState>((set, get) => ({
  segments: [],
  maxDuration: 16,

  setMaxDuration: sec => set({ maxDuration: sec }),

  addSegment: segment => {
    const { segments, maxDuration } = get();
    if (segment.duration <= 0) return false;
    if (sumDuration(segments) + segment.duration > maxDuration) return false;
    set({ segments: [...segments, segment] });
    return true;
  },

  removeLastSegment: () => {
    const { segments } = get();
    if (segments.length === 0) return null;
    const next = segments.slice(0, -1);
    set({ segments: next });
    return segments[segments.length - 1];
  },

  clear: () => set({ segments: [] }),

  totalDuration: () => sumDuration(get().segments),

  availableTime: () => {
    const { segments, maxDuration } = get();
    return Math.max(0, maxDuration - sumDuration(segments));
  },

  hasSegments: () => get().segments.length > 0,

  toVideoSegments: () => {
    let cumulative = 0;
    return get().segments.map(seg => {
      const out: VideoSegmentOut = {
        startTime: cumulative,
        duration: seg.duration,
        video: seg.video,
        sourceType: seg.sourceType,
      };
      cumulative += seg.duration;
      return out;
    });
  },
}));
