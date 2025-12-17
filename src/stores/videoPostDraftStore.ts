import { create } from 'zustand';

interface VideoPostDraft {
  videoPath: string | null;
  segments: string | null;
  thumbnailPath: string | null;
  textOverlays: any[];
  description: string;
  selectedContentWarnings: string[];
  otherWarning: string;
  commentFilter: string | null;
  selectedChannel: any | null;
}

interface VideoPostDraftState {
  draft: VideoPostDraft | null;
  setDraft: (draft: Partial<VideoPostDraft>) => void;
  clearDraft: () => void;
  getDraft: () => VideoPostDraft | null;
}

export const useVideoPostDraftStore = create<VideoPostDraftState>((set, get) => ({
  draft: null,
  setDraft: (draftData) => {
    const currentDraft = get().draft || {
      videoPath: null,
      segments: null,
      thumbnailPath: null,
      textOverlays: [],
      description: '',
      selectedContentWarnings: [],
      otherWarning: '',
      commentFilter: null,
      selectedChannel: null,
    };
    set({
      draft: {
        ...currentDraft,
        ...draftData,
      },
    });
  },
  clearDraft: () => set({ draft: null }),
  getDraft: () => get().draft,
}));


