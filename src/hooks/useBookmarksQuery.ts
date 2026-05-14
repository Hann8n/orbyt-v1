import { useEffect } from 'react';
import { logger } from '../utils/logger';
import { useInfiniteQuery } from '@tanstack/react-query';
import { BookmarkService } from '../services/api/bookmark/BookmarkService';
import { useBookmarkStore } from '../stores/bookmarkStore';
import { useUserStore, selectIsSessionValid } from '../stores/userStore';
import { queryKeys } from '../utils/query/queryKeys';
import { QUERY_CONSTANTS } from '../utils/constants';

/**
 * Loads all bookmark pages via React Query and populates the bookmark store.
 * React Query handles stale-time, deduplication, and background refresh —
 * replacing the hand-rolled lastFetched/CACHE_DURATION/isLoading guards.
 *
 * Mount this once in a top-level authenticated layout (e.g. app/_layout.tsx).
 */
export function useBookmarksQuery(): void {
  const sessionValid = useUserStore(selectIsSessionValid);
  const populate = useBookmarkStore(state => state.populate);

  const { data, error, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: queryKeys.bookmarks.list(),
    queryFn: ({ pageParam }) => BookmarkService.getBookmarks(pageParam as string | undefined, 100),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => lastPage.cursor ?? undefined,
    enabled: sessionValid,
    staleTime: QUERY_CONSTANTS.STALE_TIME_MEDIUM,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    if (error) {
      logger.error('[useBookmarksQuery] Failed to load bookmarks', error);
    }
  }, [error]);

  useEffect(() => {
    if (!data) return;
    const entries = data.pages.flatMap(page =>
      page.bookmarks
        .filter(b => b.uri?.includes('app.bsky.feed.post'))
        .map(b => ({
          uri: b.uri,
          subject:
            b.bookmarkSubject?.uri && b.bookmarkSubject?.cid
              ? { uri: b.bookmarkSubject.uri, cid: b.bookmarkSubject.cid }
              : undefined,
        }))
    );
    populate(entries);
  }, [data, populate]);
}
