/**
 * Bookmark Service - app.bsky.bookmark.* namespace operations
 * Handles all bookmark-related API operations
 */

import { logger } from '../../../utils/logger';
import { AtprotoCore } from '../core';
import type { BookmarksResponse, ExtendedPostView, PostView } from '../types';

export class BookmarkService {
  /**
   * Create a bookmark for a post
   * @param uri - Post URI
   * @param cid - Post CID
   * @returns The post URI (bookmark URI not needed since deleteBookmark uses post URI)
   */
  static async createBookmark(uri: string, cid: string): Promise<string> {
    const cacheKey = `bookmark:create:${uri}:${cid}`;
    // Use dynamic import to avoid circular dependency
    const { AtprotoService } = await import('../AtprotoService');
    return AtprotoService.deduplicateRequest(cacheKey, async () => {
      await AtprotoCore.ensureSession();
      const { api } = await AtprotoCore.getApiClient();

      await api.app.bsky.bookmark.createBookmark({
        uri,
        cid,
      });

      // The bookmark is successfully created. We don't need the bookmark URI
      // since deleteBookmark uses the post URI. Return the post URI for consistency.
      return uri;
    });
  }

  /**
   * Delete a bookmark
   * @param postUri - The URI of the bookmark to delete
   */
  static async deleteBookmark(postUri: string): Promise<void> {
    const cacheKey = `bookmark:delete:${postUri}`;
    // Use dynamic import to avoid circular dependency
    const { AtprotoService } = await import('../AtprotoService');
    return AtprotoService.deduplicateRequest(cacheKey, async () => {
      await AtprotoCore.ensureSession();
      const { api } = await AtprotoCore.getApiClient();

      // The deleteBookmark API expects the post URI (same as createBookmark)
      await api.app.bsky.bookmark.deleteBookmark({
        uri: postUri,
      });
    });
  }

  /**
   * Get bookmarks for the current user
   * @param cursor - Pagination cursor
   * @param limit - Number of bookmarks to fetch
   * @returns Object with bookmarks array and cursor
   */
  static async getBookmarks(cursor?: string, limit: number = 50): Promise<BookmarksResponse> {
    await AtprotoCore.ensureSession();
    const apiClient = await AtprotoCore.getApiClient();

    if (!apiClient) {
      return { bookmarks: [], cursor: null };
    }

    const { api } = apiClient;

    try {
      const response = await api.app.bsky.bookmark.getBookmarks({
        limit,
        cursor,
      });

      // The API returns bookmarks with the post data in bookmark.item
      // bookmark.subject is just a reference (RepoStrongRef with uri and cid)
      const allBookmarks = response.data?.bookmarks || [];

      const bookmarks = allBookmarks.filter(bookmark => {
        // Check if it's a valid post bookmark
        // bookmark.item should contain the post view
        // bookmark.subject is the reference to the original post
        const item = bookmark.item;
        if (!item || typeof item !== 'object' || !('$type' in item)) {
          return false;
        }

        const subjectUri = bookmark.subject?.uri;
        const itemUri = 'uri' in item ? item.uri : undefined;
        const uri = subjectUri || itemUri;

        // Check if it's a post (not blocked or not found)
        const itemType = item.$type;
        const isBlocked = itemType === 'app.bsky.feed.defs#blockedPost';
        const isNotFound = itemType === 'app.bsky.feed.defs#notFoundPost';
        const isPost = itemType === 'app.bsky.feed.defs#postView';

        const isValid =
          uri &&
          typeof uri === 'string' &&
          uri.includes('app.bsky.feed.post') &&
          isPost &&
          !isBlocked &&
          !isNotFound;

        return isValid;
      });

      // Transform bookmarks: use bookmark.item for the post data
      // bookmark.subject is just the reference, bookmark.item has the full post
      const transformedBookmarks = bookmarks
        .map(bookmark => {
          // bookmark.item contains the full post view
          // bookmark.subject is the reference (uri, cid) to the original post
          const item = bookmark.item;
          if (!item || typeof item !== 'object' || !('$type' in item)) {
            return null;
          }

          // Type guard to ensure it's a PostView
          if (item.$type !== 'app.bsky.feed.defs#postView') {
            return null;
          }

          const post = item as PostView;

          // Return the post data - we don't need bookmarkUri since delete uses post URI
          // But we can include it for reference if needed
          return {
            ...post,
            // Include bookmark reference for potential future use
            bookmarkSubject: bookmark.subject,
          } as ExtendedPostView;
        })
        .filter((b): b is ExtendedPostView => b !== null); // Remove any null entries

      return {
        bookmarks: transformedBookmarks,
        cursor: response.data?.cursor || null,
      };
    } catch (error: unknown) {
      logger.error('Failed to get bookmarks', error, {
        component: 'BookmarkService',
        action: 'getBookmarks',
      });
      throw error;
    }
  }
}
