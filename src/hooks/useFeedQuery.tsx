import { useRef, useCallback, useState, useEffect } from 'react';
import { useInfiniteQuery, useQueryClient, InfiniteData } from '@tanstack/react-query';
import AtprotoService from '../services/api/AtprotoService';
import WatchHistory from '../services/WatchHistory';
import { queryKeys } from '../services/queryKeys';
import type { ModerationDecision } from '../services/ModerationTypes';
import { useSubscribedChannels } from './useSubscribedChannels';
import FeedConfigManager from '../services/FeedConfig';
import { feedPerformanceMonitor } from '../utils/helpers/performance';

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
  cid: string;
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
  sourceFeed?: string; // Added for your mix feed to track which feed each post comes from
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
  queryOptions: QueryOptions = {},
  maxFeeds?: number // Use config default if not provided
) {
  // Store the feed state for persistence across components
  const feedState = useRef<{
    [key: string]: {
      cursor: string | null;
      offset: number;
      pages: APIResponse[];
    }
  }>({});

  // Get subscribed channels for your mix feed
  const { channels: subscribedChannels = [] } = useSubscribedChannels();

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
        // Your Mix now uses mixed feed logic, so return null to indicate it should be handled specially
        return null;
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
    const operationId = `${feedOption}-${pageParam ? 'pagination' : 'initial'}`;
    feedPerformanceMonitor.startTimer(operationId);
    
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
      } else if (feedOption === 'yourMix') {
        // Your Mix feed - combine all subscribed channels (mixed feed logic moved here)
        const feedUris = subscribedChannels
          .filter((channel: any) => channel.uri !== 'following') // Only exclude following
          .map((channel: any) => {
            // Convert 'yourMix' to the actual feed URI
            if (channel.uri === 'yourMix') {
              return 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/thevids';
            }
            return channel.uri;
          });
        
        if (feedUris.length > 0) {
          const effectiveMaxFeeds = maxFeeds ?? FeedConfigManager.getMaxFeedsPerFetch();
          // Use smaller limit for initial load to improve performance and get content faster
          const initialLimit = pageParam ? 50 : 20; // Reduced from 30 to 20 for faster initial load
          const response = await AtprotoService.getMixedFeed(feedUris, pageParam as string | null, initialLimit, true, effectiveMaxFeeds);
          rawPosts = response.feed ?? [];
          apiCursor = response.cursor ?? null;
        } else {
          // Fallback to single feed if no other channels
          const initialLimit = pageParam ? 50 : 20; // Reduced from 30 to 20 for faster initial load
          const response = await AtprotoService.getFeed(pageParam as string | null, 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/thevids', {}, true, initialLimit);
          rawPosts = response.feed ?? [];
          apiCursor = response.cursor ?? null;
        }
      } else {
        // "discover", "following", or custom feed URIs - always load maximum metadata
        const feedLink = getFeedLink();
        const initialLimit = pageParam ? 50 : 20; // Reduced from 30 to 20 for faster initial load
        const response = await AtprotoService.getFeed(pageParam as string | null, feedLink, {}, true, initialLimit);
        rawPosts = response.feed ?? [];
        apiCursor = response.cursor ?? null;
      }

      // Posts are already filtered for videos at the API level
      let finalPosts = rawPosts;

      // For yourMix feed, filter out watched videos and ensure no duplicates
      if (feedOption === 'yourMix' && rawPosts.length > 0) {
        const watchedUris = await WatchHistory.getWatchHistory();
        const watchedSet = new Set(watchedUris);
        
        // Remove watched videos and duplicates
        const seenUris = new Set<string>();
        const seenCids = new Set<string>();
        
        finalPosts = rawPosts.filter((item: FeedItem) => {
          const uri = item.post.uri;
          const cid = item.post.cid;
          
          // Skip if watched
          if (watchedSet.has(uri)) {
            return false;
          }
          
          // Skip if duplicate
          if (!uri || !cid || seenUris.has(uri) || seenCids.has(cid)) {
            return false;
          }
          
          // Mark as seen
          seenUris.add(uri);
          seenCids.add(cid);
          return true;
        });
      }

      const duration = feedPerformanceMonitor.endTimer(operationId);
      console.log(`[useFeedQuery] ${feedOption} feed loaded ${finalPosts.length} posts in ${duration}ms`);
      
      return {
        feed: finalPosts,
        cursor: apiCursor,
      };
    } catch (error) {
      feedPerformanceMonitor.endTimer(operationId);
      console.error(`[useFeedQuery] Error fetching ${feedOption} feed:`, error);
      throw error;
    }
  }, [feedOption, userDid, getFeedLink, subscribedChannels, maxFeeds]);

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
    // Add lazy loading for better performance
    refetchInterval: false, // Disable automatic refetching
    ...queryOptions
  });

  // Flatten the pages for a single data array
  const feed = query.data?.pages.flatMap((page: APIResponse) => page.feed).filter(Boolean) || [];

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