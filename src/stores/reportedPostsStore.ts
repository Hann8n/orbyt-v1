import { create } from 'zustand';

interface ReportedPostsStore {
  reportedPostUris: Set<string>;
  reportPost: (postUri: string) => void;
  isReported: (postUri: string) => boolean;
  clearReported: () => void;
}

export const useReportedPostsStore = create<ReportedPostsStore>((set, get) => ({
  reportedPostUris: new Set<string>(),

  reportPost: (postUri: string) => {
    set(state => {
      const newSet = new Set(state.reportedPostUris);
      newSet.add(postUri);
      return { reportedPostUris: newSet };
    });
  },

  isReported: (postUri: string) => {
    return get().reportedPostUris.has(postUri);
  },

  clearReported: () => {
    set({ reportedPostUris: new Set<string>() });
  },
}));
