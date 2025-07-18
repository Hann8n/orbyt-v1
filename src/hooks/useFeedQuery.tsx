import { useRef, useCallback, useState, useEffect } from 'react';
import { useInfiniteQuery, InfiniteData } from '@tanstack/react-query';
import AtprotoService from '../services/api/AtprotoService';
import WatchHistory from '../services/WatchHistory';
import { queryKeys } from '../services/queryKeys';
import { hasVideoContent } from '../utils/helpers/video';
import type { ModerationDecision } from '../services/ModerationTypes';

export interface Post {
  embed?: {
    $type: string;
    mime?: string;
    playlist?: string | string[];
    media?: {
      $type: string;
      playlist?: string | string[];
    };
  };
  uri: string;
  author?: {
    avatar?: string;
    displayName?: string;
    handle?: string;
  };
  repostedBy?: {
    avatar?: string;
    displayName?: string;
    handle?: string;
  };
  moderationDecision?: ModerationDecision;
}

export interface FeedItem {
  post: Post;
  shouldCache?: boolean;
  uniqueKey?: string;
  reason?: {
    $type?: string;
    by?: {
      avatar?: string;
      displayName?: string;
      handle?: string;
    };
  };
  moderationDecision?: ModerationDecision;
}

export interface APIResponse {
  feed: FeedItem[];
  cursor: string | null;
}

export type FeedOption = 'yourMix' | 'profile' | 'following' | 'author' | 'likes' | 'reposts' | string;

interface QueryOptions {
  enabled?: boolean;
  staleTime?: number;
  cacheTime?: number;
  refetchOnWindowFocus?: boolean;
  refetchOnMount?: boolean;
}

// This stores the scroll position and state for each feed
const feedStateStore = new Map<
  string,
  {
    cursor: string | null;
    offset: number;
    pages: APIResponse[];
  }
>();

export function useFeedQuery(
  feedOption: FeedOption, 
  userDid?: string, 
  queryOptions: QueryOptions = {}
) {
  // Store the feed state for persistence across components
  const feedState = useRef<{
    [key: string]: {
      cursor: string | null;
      offset: number;
      pages: APIResponse[];
    }
  }>({});

  // Initialize from global store if available
  if (feedStateStore.has(feedOption) && !feedState.current[feedOption]) {
    feedState.current[feedOption] = feedStateStore.get(feedOption)!;
  }

  /**
   * Helper function to decide feed link from feedOption
   */
  const getFeedLink = useCallback(() => {
    // Check if feedOption is a custom feed URI (starts with at://)
    if (feedOption.startsWith('at://')) {
      return feedOption;
    }
    
    switch (feedOption) {
      case 'yourMix':
        return 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/thevids';
      case 'discover':
        return 'at://did:plc:tenurhgjptubkk5zf5qhi3og/app.bsky.feed.generator/discover-video';
      case 'following':
        return 'at://following'; // Specific URI for following feed
      default:
        // profile, author, or custom...
        return null;
    }
  }, [feedOption]);

  /**
   * The fetch function for React Query's useInfiniteQuery
   * Always loads maximum metadata for optimal batch loading
   */
  const fetchFeed = useCallback(async ({ pageParam }: { pageParam?: unknown }): Promise<APIResponse> => {
    const startTime = Date.now();
    let rawPosts: FeedItem[] = [];
    let apiCursor: string | null = null;

    try {
      // Handle different feed types - always load maximum metadata
      if (feedOption === 'likes' && userDid) {
        const response = await AtprotoService.getLikedPosts(userDid, pageParam as string | null);
        rawPosts = response.feed ?? [];
        apiCursor = response.cursor ?? null;
      } else if (feedOption === 'reposts' && userDid) {
        const response = await AtprotoService.getRepostedPosts(userDid, pageParam as string | null);
        rawPosts = response.feed ?? [];
        apiCursor = response.cursor ?? null;
      } else if ((feedOption === 'profile' || feedOption === 'author') && userDid) {
        // Profile or author feed - always load maximum metadata
        const response = await AtprotoService.getAuthorFeed(userDid, pageParam as string | null);
        
        // For 'profile' feed, filter out reposts to only show original posts
        if (feedOption === 'profile') {
          rawPosts = response.feed.filter((item: FeedItem) => 
            !(item.reason && item.reason.$type === 'app.bsky.feed.defs#reasonRepost'));
        } else {
          rawPosts = response.feed ?? [];
        }
        
        apiCursor = response.cursor ?? null;
      } else {
        // "yourMix", "discover", "following", or custom feed URIs - always load maximum metadata
        const feedLink = getFeedLink();
        const response = await AtprotoService.getFeed(pageParam as string | null, feedLink);
        rawPosts = response.feed ?? [];
        apiCursor = response.cursor ?? null;
      }

      // Posts are already filtered for videos at the API level
      let finalPosts = rawPosts;

      // For yourMix feed, filter out watched videos
      if (feedOption === 'yourMix' && rawPosts.length > 0) {
        const watchedUris = await WatchHistory.getWatchHistory();
        const watchedSet = new Set(watchedUris);
        finalPosts = rawPosts.filter((item: FeedItem) => !watchedSet.has(item.post.uri));
      }

      return {
        feed: finalPosts,
        cursor: apiCursor,
      };
    } catch (error) {
      const fetchTime = Date.now() - startTime;
      console.error(`[useFeedQuery] Error fetching ${feedOption} feed after ${fetchTime}ms:`, error);
      throw error;
    }
  }, [feedOption, userDid, getFeedLink]);

  /**
   * Setup the infinite query with optimized batch loading
   */
  const query = useInfiniteQuery<APIResponse, Error, InfiniteData<APIResponse>>({
    queryKey: queryKeys.feed.infinite(feedOption, userDid),
    queryFn: async (context) => {
      try {
        const response = await fetchFeed({ 
          pageParam: context.pageParam as string | null 
        });
        
        // Save the feed state after successful fetch
        if (!feedState.current[feedOption]) {
          feedState.current[feedOption] = {
            cursor: null,
            offset: 0,
            pages: []
          };
        }
        
        feedState.current[feedOption].cursor = response.cursor;
        feedStateStore.set(feedOption, feedState.current[feedOption]);
        
        return response;
      } catch (error) {
        throw error;
      }
    },
    initialPageParam: feedState.current[feedOption]?.cursor || null,
    getPreviousPageParam: (firstPage) => firstPage.cursor || null,
    getNextPageParam: (lastPage) => lastPage.cursor || null,
    // Optimized caching for batch loading
    staleTime: queryOptions.staleTime ?? 10 * 60 * 1000, // 10 minutes default for better caching
    gcTime: 60 * 60 * 1000, // 1 hour for better memory management
    refetchOnWindowFocus: queryOptions.refetchOnWindowFocus ?? false,
    refetchOnMount: queryOptions.refetchOnMount ?? false,
    refetchOnReconnect: false,
    ...queryOptions
  });

  // Flatten the pages for a single data array
  const feed = query.data?.pages.flatMap((page) => page.feed).filter(Boolean) || [];

  const saveScrollPosition = useCallback((offset: number) => {
    if (feedState.current[feedOption]) {
      feedState.current[feedOption].offset = offset;
      feedStateStore.set(feedOption, feedState.current[feedOption]);
    }
  }, [feedOption]);

  const getScrollPosition = useCallback(() => {
    return feedState.current[feedOption]?.offset || 0;
  }, [feedOption]);

  // Return everything needed by the component
  return {
    ...query,
    feed,
    isProfileFeed: (feedOption === 'profile' || feedOption === 'author' || 
                    feedOption === 'likes' || feedOption === 'reposts' || 
                    feedOption.startsWith('at://')) && Boolean(userDid),
    saveScrollPosition,
    getScrollPosition,
  };
}