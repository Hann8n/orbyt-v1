/**
 * Bookmark Store
 * Efficiently manages bookmark state by caching all bookmarks
 * Provides O(1) lookup to check if a post is bookmarked
 */
import { create } from 'zustand';
import { AtprotoService } from '../services/api/AtprotoService';
import { logger } from '../utils/logger';

interface BookmarkState {
  // Set of bookmarked post URIs for O(1) lookup
  bookmarkedPostUris: Set<string>;
  
  // Map of post URI to bookmark subject (for reference)
  bookmarkSubjects: Map<string, { uri: string; cid: string }>;
  
  // Loading state
  isLoading: boolean;
  lastFetched: number | null;
  
  // Actions
  loadBookmarks: () => Promise<void>;
  isBookmarked: (postUri: string) => boolean;
  addBookmark: (postUri: string, bookmarkSubject?: { uri: string; cid: string }) => void;
  removeBookmark: (postUri: string) => void;
  clearBookmarks: () => void;
  refreshBookmarks: () => Promise<void>;
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const useBookmarkStore = create<BookmarkState>((set, get) => ({
  bookmarkedPostUris: new Set(),
  bookmarkSubjects: new Map(),
  isLoading: false,
  lastFetched: null,
  
  /**
   * Load all bookmarks from the API
   * Fetches all pages and caches the post URIs
   */
  loadBookmarks: async () => {
    const state = get();
    
    // Don't reload if recently fetched
    if (state.lastFetched && Date.now() - state.lastFetched < CACHE_DURATION && state.bookmarkedPostUris.size > 0) {
      return;
    }
    
    if (state.isLoading) {
      return;
    }
    
    set({ isLoading: true });
    
    try {
      const bookmarkedUris = new Set<string>();
      const subjects = new Map<string, { uri: string; cid: string }>();
      let cursor: string | null = null;
      let hasMore = true;
      let pageCount = 0;
      const maxPages = 20; // Safety limit
      
      while (hasMore && pageCount < maxPages) {
        const response = await AtprotoService.getBookmarks(cursor || undefined, 100);
        
        // Process bookmarks from this page
        for (const bookmark of response.bookmarks) {
          const postUri = bookmark.uri || bookmark.subject?.uri;
          if (postUri && postUri.includes('app.bsky.feed.post')) {
            bookmarkedUris.add(postUri);
            
            // Store bookmark subject if available
            if (bookmark.subject || bookmark.bookmarkSubject) {
              const subject = bookmark.subject || bookmark.bookmarkSubject;
              if (subject?.uri && subject?.cid) {
                subjects.set(postUri, { uri: subject.uri, cid: subject.cid });
              }
            }
          }
        }
        
        cursor = response.cursor;
        hasMore = !!cursor && response.bookmarks.length > 0;
        pageCount++;
      }
      
      set({
        bookmarkedPostUris: bookmarkedUris,
        bookmarkSubjects: subjects,
        isLoading: false,
        lastFetched: Date.now(),
      });
    } catch (error) {
      logger.error('[BookmarkStore] Error loading bookmarks', error);
      set({ isLoading: false });
    }
  },
  
  /**
   * Check if a post is bookmarked (O(1) lookup)
   */
  isBookmarked: (postUri: string) => {
    return get().bookmarkedPostUris.has(postUri);
  },
  
  /**
   * Add a bookmark to the cache (optimistic update)
   */
  addBookmark: (postUri: string, bookmarkSubject?: { uri: string; cid: string }) => {
    set((state) => {
      const newUris = new Set(state.bookmarkedPostUris);
      newUris.add(postUri);
      
      const newSubjects = new Map(state.bookmarkSubjects);
      if (bookmarkSubject) {
        newSubjects.set(postUri, bookmarkSubject);
      }
      
      return {
        bookmarkedPostUris: newUris,
        bookmarkSubjects: newSubjects,
      };
    });
  },
  
  /**
   * Remove a bookmark from the cache
   */
  removeBookmark: (postUri: string) => {
    set((state) => {
      const newUris = new Set(state.bookmarkedPostUris);
      newUris.delete(postUri);
      
      const newSubjects = new Map(state.bookmarkSubjects);
      newSubjects.delete(postUri);
      
      return {
        bookmarkedPostUris: newUris,
        bookmarkSubjects: newSubjects,
      };
    });
  },
  
  /**
   * Clear all bookmarks (e.g., on logout)
   */
  clearBookmarks: () => {
    set({
      bookmarkedPostUris: new Set(),
      bookmarkSubjects: new Map(),
      lastFetched: null,
    });
  },
  
  /**
   * Force refresh bookmarks from API
   */
  refreshBookmarks: async () => {
    set({ lastFetched: null }); // Clear cache timestamp
    await get().loadBookmarks();
  },
}));




