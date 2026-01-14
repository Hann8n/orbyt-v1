import React, { useMemo, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { View, StyleSheet, Text } from 'react-native';
import { Colors } from '../../src/components/ui/UI';
import ListHeader from '../../src/components/ui/ListHeader';
import Icon, { Loading3FillIcon } from '../../src/components/ui/Icon';
import { useCurrentUser } from '../../src/stores/userStore';
import { seenVideoService } from '../../src/services/SeenVideoService';
import { useInfiniteQuery } from '@tanstack/react-query';
import GridFeedView from '../../src/components/features/feed/GridFeedView';
import type { ExtendedFeedViewPost } from '../../src/services/api/types';
import AtprotoService from '../../src/services/api/AtprotoService';
import { feedService } from '../../src/services/FeedService';

const WatchedScreen: React.FC = () => {
  const router = useRouter();
  const { currentUser } = useCurrentUser();

  // Get all seen video URIs (memoized to prevent unnecessary recalculations)
  const seenVideos = useMemo(() => {
    return seenVideoService.getSeenVideos(currentUser?.did ?? null);
  }, [currentUser?.did]);

  // Fetch posts for seen URIs with proper cursor-based pagination
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isFetching, isError } =
    useInfiniteQuery({
      queryKey: ['watched-videos', currentUser?.did],
      queryFn: async ({ pageParam }) => {
        const pageSize = 25; // Match API batch limit for optimal performance

        // Parse cursor as index (string to number, or null for first page)
        const startIndex = pageParam ? parseInt(pageParam as string, 10) : 0;

        // Validate index
        if (isNaN(startIndex) || startIndex < 0 || startIndex >= seenVideos.length) {
          return { feed: [], cursor: null };
        }

        const urisToFetch = seenVideos.slice(startIndex, startIndex + pageSize).map(v => v.uri);

        if (urisToFetch.length === 0) {
          return { feed: [], cursor: null };
        }

        // Fetch posts in parallel using getPosts (batches up to 25 URIs per request)
        const postsMap = await AtprotoService.getPosts(urisToFetch);
        const validPosts: ExtendedFeedViewPost[] = [];

        // Preserve order from seenVideos array
        for (const uri of urisToFetch) {
          const post = postsMap.get(uri);

          // Only include valid posts (exclude NotFoundPost and BlockedPost)
          if (post && AtprotoService.isValidPost(post)) {
            validPosts.push({ post } as ExtendedFeedViewPost);
          }
        }

        // Calculate next cursor (string representation of index, or null if no more pages)
        const nextIndex = startIndex + pageSize;
        const nextCursor = nextIndex < seenVideos.length ? String(nextIndex) : null;

        return {
          feed: validPosts,
          cursor: nextCursor,
        };
      },
      getNextPageParam: lastPage => lastPage.cursor,
      initialPageParam: null as string | null,
      enabled: !!currentUser?.did, // Always enabled when user is logged in (allows loading state even with 0 videos)
    });

  // Flatten pages into single array
  const feedItems = useMemo(() => {
    if (!data) return [];
    return data.pages.flatMap(page => page.feed);
  }, [data]);

  // Handle grid item press - navigate to feed modal with initial index
  const handleGridItemPress = useCallback(
    (index: number) => {
      if (index >= 0 && index < feedItems.length) {
        // Set the current feed so the modal can use it
        feedService.setCurrentFeed(feedItems);

        // Navigate to feed modal with initial index
        router.push({
          pathname: '/(modals)/feed',
          params: {
            feedOption: 'watched',
            userDid: currentUser?.did ?? '',
            backgroundColor: Colors.black,
            secondaryColor: Colors.white,
            initialIndex: index.toString(),
          },
        });
      }
    },
    [feedItems, currentUser?.did, router]
  );

  // Show loading state on initial load
  const isLoadingInitial = isLoading || (isFetching && !data);

  return (
    <View style={styles.container}>
      <ListHeader
        mode="sheet"
        title="Watched videos"
        showCloseButton
        onClosePress={() => router.back()}
        applySafeAreaTop={false}
        style={styles.headerStyle}
      />
      {isError ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Failed to load watched videos</Text>
        </View>
      ) : isLoadingInitial ? (
        <View style={styles.loadingContainer}>
          <Loading3FillIcon size={48} color={Colors.lightGray} />
        </View>
      ) : feedItems.length > 0 ? (
        <GridFeedView
          feed={feedItems}
          feedOption="watched"
          userDid={currentUser?.did ?? undefined}
          onLoadMore={
            hasNextPage && !isFetchingNextPage
              ? () => {
                  fetchNextPage().catch(() => {
                    // Silently handle errors - user can retry via scroll
                  });
                }
              : () => {} // Empty function instead of undefined
          }
          hasNextPage={hasNextPage ?? false}
          isError={isError}
          onGridItemPress={handleGridItemPress}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <Icon name="play" size={48} color={Colors.lightGray} />
          <Text style={styles.emptyTitle}>No watched videos yet</Text>
          <Text style={styles.emptyDescription}>Videos you watch will appear here.</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Figtree-Regular',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 120,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 120,
  },
  emptyTitle: {
    color: Colors.white,
    fontSize: 20,
    fontWeight: '600',
    fontFamily: 'Figtree-SemiBold',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Figtree-Regular',
    textAlign: 'center',
    lineHeight: 22,
  },
  headerStyle: {
    marginHorizontal: -5,
  },
});

export default WatchedScreen;
