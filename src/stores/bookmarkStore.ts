/**
 * Bookmark Store
 * Provides O(1) lookup for bookmarked post URIs.
 * Loading is handled by useBookmarksQuery (React Query) which calls populate().
 * Optimistic add/remove stay synchronous for instant UI feedback.
 */
import { create } from 'zustand';

interface BookmarkState {
  bookmarkedPostUris: Set<string>;
  bookmarkSubjects: Map<string, { uri: string; cid: string }>;

  populate: (
    uris: Array<{ uri: string; subject?: { uri: string; cid: string } }>
  ) => void;
  isBookmarked: (postUri: string) => boolean;
  addBookmark: (postUri: string, bookmarkSubject?: { uri: string; cid: string }) => void;
  removeBookmark: (postUri: string) => void;
  clearBookmarks: () => void;
}

export const useBookmarkStore = create<BookmarkState>((set, get) => ({
  bookmarkedPostUris: new Set(),
  bookmarkSubjects: new Map(),

  /**
   * Bulk-populate from React Query fetch results. Replaces the store with the
   * authoritative server state so server-side removals are reflected correctly.
   */
  populate: (entries) => {
    set(() => {
      const uris = new Set<string>();
      const subjects = new Map<string, { uri: string; cid: string }>();
      for (const { uri, subject } of entries) {
        uris.add(uri);
        if (subject) subjects.set(uri, subject);
      }
      return { bookmarkedPostUris: uris, bookmarkSubjects: subjects };
    });
  },

  isBookmarked: (postUri: string) => get().bookmarkedPostUris.has(postUri),

  addBookmark: (postUri: string, bookmarkSubject?: { uri: string; cid: string }) => {
    set(state => {
      const newUris = new Set(state.bookmarkedPostUris);
      newUris.add(postUri);
      const newSubjects = new Map(state.bookmarkSubjects);
      if (bookmarkSubject) newSubjects.set(postUri, bookmarkSubject);
      return { bookmarkedPostUris: newUris, bookmarkSubjects: newSubjects };
    });
  },

  removeBookmark: (postUri: string) => {
    set(state => {
      const newUris = new Set(state.bookmarkedPostUris);
      newUris.delete(postUri);
      const newSubjects = new Map(state.bookmarkSubjects);
      newSubjects.delete(postUri);
      return { bookmarkedPostUris: newUris, bookmarkSubjects: newSubjects };
    });
  },

  clearBookmarks: () => {
    set({ bookmarkedPostUris: new Set(), bookmarkSubjects: new Map() });
  },
}));
