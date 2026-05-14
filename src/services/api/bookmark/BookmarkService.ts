/**
 * Bookmark Service - app.bsky.bookmark.* namespace operations
 * Handles all bookmark-related API operations
 */

import { AppBskyFeedDefs } from '@atproto/api';
import { logger } from '../../../utils/logger';
import { AtprotoCore } from '../core';
import { deduplicateRequest } from '../inFlightDedup';
import type { BookmarksResponse, ExtendedPostView } from '../types';

export class BookmarkService {
  /**
   * Create a bookmark for a post
   * @param uri - Post URI
   * @param cid - Post CID
   * @returns The post URI (bookmark URI not needed since deleteBookmark uses post URI)
   */
  static async createBookmark(uri: string, cid: string): Promise<string> {
    const cacheKey = `bookmark:create:${uri}:${cid}`;
    return deduplicateRequest(cacheKey, async () => {
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
    return deduplicateRequest(cacheKey, async () => {
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
    const { api } = await AtprotoCore.getApiClient();

    try {
      const response = await api.app.bsky.bookmark.getBookmarks({
        limit,
        cursor,
      });

      // The API returns bookmarks with the post data in bookmark.item
      // bookmark.subject is just a reference (RepoStrongRef with uri and cid)
      const allBookmarks = response.data?.bookmarks || [];

      const bookmarks = allBookmarks.filter(bookmark => {
        const item = bookmark.item;
        const uri = bookmark.subject?.uri;
        return (
          AppBskyFeedDefs.isPostView(item) &&
          typeof uri === 'string' &&
          uri.includes('app.bsky.feed.post')
        );
      });

      const transformedBookmarks = bookmarks
        .map(bookmark => {
          const item = bookmark.item;
          if (!AppBskyFeedDefs.isPostView(item)) return null;
          const post = item;

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
