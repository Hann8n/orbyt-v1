/**
 * Unified Feed Service
 * Consolidates all feed-related functionality into a single service
 * Replaces: FeedStore.ts, FeedConfig.ts, and parts of AtprotoService.tsx
 */

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import AtprotoService from './api/AtprotoService';
import type { ModerationDecision } from './ModerationTypes';

// Types
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
  sourceFeed?: string;
}

export interface APIResponse {
  feed: FeedItem[];
  cursor: string | null;
}

export type FeedOption = 'yourMix' | 'profile' | 'following' | 'likes' | 'reposts' | 'search' | string;

// Configuration constants
const FEED_CONFIG = {
  maxFeedsPerFetch: 8,
  maxPostsPerFetch: 50,
  maxSubscribedChannels: 50,
  defaultLimit: 50,
  staleTime: 5 * 60 * 1000, // 5 minutes
  cacheTime: 30 * 60 * 1000, // 30 minutes
} as const;

// Global feed state management
class FeedStateManager {
  private currentFeed: FeedItem[] = [];
  private videoBlurState = new Map<string, boolean>();

  setCurrentFeed(feed: FeedItem[]) {
    this.currentFeed = feed;
  }

  getCurrentFeed(): FeedItem[] {
    return this.currentFeed;
  }

  clearCurrentFeed() {
    this.currentFeed = [];
  }

  setVideoBlurState(uri: string, blurred: boolean) {
    this.videoBlurState.set(uri, blurred);
  }

  isVideoBlurred(uri: string, moderationBlur: boolean): boolean {
    if (this.videoBlurState.has(uri)) {
      return this.videoBlurState.get(uri)!;
    }
    return moderationBlur;
  }
}

// Singleton instance
const feedStateManager = new FeedStateManager();

// Query keys factory - consolidated from the old queryKeys.ts
const createQueryKeys = {
  comments: {
    all: ['comments'] as const,
    byPost: (postUri: string) => [...createQueryKeys.comments.all, postUri] as const,
    infinite: () => [...createQueryKeys.comments.all, 'infinite'] as const,
    infiniteByPost: (postUri: string) => [...createQueryKeys.comments.infinite(), postUri] as const,
  },
  likes: {
    all: ['likes'] as const,
    byPost: (postUri: string) => [...createQueryKeys.likes.all, postUri] as const,
    infinite: () => [...createQueryKeys.likes.all, 'infinite'] as const,
    infiniteByPost: (postUri: string) => [...createQueryKeys.likes.infinite(), postUri] as const,
  },
  profiles: {
    all: ['profiles'] as const,
    lists: () => [...createQueryKeys.profiles.all, 'list'] as const,
    list: (filters: string) => [...createQueryKeys.profiles.lists(), { filters }] as const,
    details: () => [...createQueryKeys.profiles.all, 'detail'] as const,
    detail: (handle: string) => [...createQueryKeys.profiles.details(), handle] as const,
    refresh: (handle: string) => [...createQueryKeys.profiles.detail(handle), 'refresh', Date.now()] as const,
  },
  blocks: {
    all: ['blocks'] as const,
    status: (did: string) => [...createQueryKeys.blocks.all, did] as const,
  },
  feed: {
    all: ['feed'] as const,
    byOption: (feedOption: string) => [...createQueryKeys.feed.all, feedOption] as const,
    byUser: (feedOption: string, userDid?: string) => 
      userDid 
        ? [...createQueryKeys.feed.byOption(feedOption), userDid] as const
        : createQueryKeys.feed.byOption(feedOption),
    infinite: (feedOption: string, userDid?: string) => 
      [...createQueryKeys.feed.byUser(feedOption, userDid), 'infinite'] as const,
    batch: (feedOption: string, userDid?: string) => 
      [...createQueryKeys.feed.byUser(feedOption, userDid), 'batch'] as const,
  },
  feeds: {
    all: ['feeds'] as const,
    search: (query: string) => [...createQueryKeys.feeds.all, 'search', query] as const,
    details: () => [...createQueryKeys.feeds.all, 'detail'] as const,
    detail: (uri: string) => [...createQueryKeys.feeds.details(), uri] as const,
    infinite: (uri: string) => [...createQueryKeys.feeds.detail(uri), 'infinite'] as const,
  },
  search: {
    all: ['search'] as const,
    unified: (query: string) => [...createQueryKeys.search.all, 'unified', query] as const,
    profiles: (query: string) => [...createQueryKeys.search.all, 'profiles', query] as const,
    feeds: (query: string) => [...createQueryKeys.search.all, 'feeds', query] as const,
  }
};

// Core feed fetching logic
class FeedService {
  private subscribedChannels: any[] = [];

  setSubscribedChannels(channels: any[]) {
    this.subscribedChannels = channels;
  }

  private getFeedLink(feedOption: FeedOption): string | null {
    if (feedOption.startsWith('at://')) {
      return feedOption;
    }
    
    switch (feedOption) {
      case 'yourMix':
        return null; // Handle specially with mixed feed logic
      case 'discover':
        return 'at://did:plc:tenurhgjptubkk5zf5qhi3og/app.bsky.feed.generator/discover-video';
      case 'following':
        return 'at://following';
      default:
        return null;
    }
  }

  async fetchFeed(feedOption: FeedOption, userDid?: string, cursor?: string): Promise<APIResponse> {
    try {
      const limit = FEED_CONFIG.defaultLimit;
      let response;

      // Handle different feed types
      if (feedOption === 'likes' && userDid) {
        response = await AtprotoService.getFeed(cursor, userDid, {}, true, limit, 'likes');
      } else if (feedOption === 'reposts' && userDid) {
        response = await AtprotoService.getFeed(cursor, userDid, {}, true, limit, 'author');
        response.feed = response.feed.filter(item => 
          item.reason && item.reason.$type === 'app.bsky.feed.defs#reasonRepost'
        );
      } else if (feedOption === 'profile' && userDid) {
        response = await AtprotoService.getFeed(cursor, userDid, {}, true, limit, 'authorVideos');
      } else if (feedOption === 'yourMix') {
        const feedUris = this.subscribedChannels
          .filter((channel: any) => channel.uri !== 'following')
          .map((channel: any) => {
            if (channel.uri === 'yourMix') {
              return 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/thevids';
            }
            return channel.uri;
          });
        
        if (feedUris.length > 0) {
          response = await AtprotoService.getMixedFeed(feedUris, cursor, limit, true, FEED_CONFIG.maxFeedsPerFetch);
        } else {
          response = await AtprotoService.getFeed(cursor, 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/thevids', {}, true, limit, 'custom');
          // Set sourceFeed for fallback case
          if (response.feed) {
            response.feed = response.feed.map(item => ({
              ...item,
              sourceFeed: 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/thevids'
            }));
          }
        }
      } else if (feedOption === 'search') {
        // Return current search feed from state
        return {
          feed: feedStateManager.getCurrentFeed(),
          cursor: null,
        };
      } else {
        // Standard feeds
        const feedLink = this.getFeedLink(feedOption);
        const feedType = feedOption === 'following' ? 'timeline' : 'custom';
        response = await AtprotoService.getFeed(cursor, feedLink, {}, true, limit, feedType);
      }

      return {
        feed: response.feed || [],
        cursor: response.cursor,
      };
    } catch (error) {
      console.error(`[FeedService] Error fetching ${feedOption} feed:`, error);
      throw error;
    }
  }

  // Infinite scroll logic
  createInfiniteScrollHandler({
    threshold = 0.3,
    hasNextPage = false,
    isFetchingNextPage = false,
    onLoadMore,
    debounceMs = 100,
  }: {
    threshold?: number;
    hasNextPage?: boolean;
    isFetchingNextPage?: boolean;
    onLoadMore: () => void;
    debounceMs?: number;
  }) {
    let isNearEnd = false;
    let debounceTimeout: NodeJS.Timeout;
    let lastTriggerPosition = -1;

    return (event: { nativeEvent: any }) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      
      const scrollY = contentOffset.y;
      const contentHeight = contentSize.height;
      const screenHeight = layoutMeasurement.height;
      
      if (contentHeight <= screenHeight) {
        return;
      }
      
      const maxScrollY = contentHeight - screenHeight;
      const scrollProgress = Math.min(scrollY / maxScrollY, 1);
      
      const nearEnd = scrollProgress >= threshold;
      isNearEnd = nearEnd;
      
      if (nearEnd && hasNextPage && !isFetchingNextPage) {
        const currentPosition = Math.floor(scrollProgress * 100);
        
        if (currentPosition !== lastTriggerPosition) {
          lastTriggerPosition = currentPosition;
          
          if (debounceTimeout) {
            clearTimeout(debounceTimeout);
          }
          
          debounceTimeout = setTimeout(() => {
            onLoadMore();
          }, debounceMs);
        }
      }
    };
  }

  // Query configuration
  createInfiniteQuery(feedOption: FeedOption, userDid?: string, queryOptions: any = {}) {
    return useInfiniteQuery({
      queryKey: createQueryKeys.feed.infinite(feedOption, userDid),
      queryFn: ({ pageParam }) => this.fetchFeed(feedOption, userDid, pageParam as string),
      initialPageParam: null,
      getNextPageParam: (lastPage) => lastPage.cursor,
      staleTime: queryOptions.staleTime ?? FEED_CONFIG.staleTime,
      gcTime: queryOptions.cacheTime ?? FEED_CONFIG.cacheTime,
      refetchOnWindowFocus: queryOptions.refetchOnWindowFocus ?? false,
      refetchOnMount: queryOptions.refetchOnMount ?? true,
      ...queryOptions
    });
  }

  // State management methods
  setCurrentFeed = feedStateManager.setCurrentFeed.bind(feedStateManager);
  getCurrentFeed = feedStateManager.getCurrentFeed.bind(feedStateManager);
  clearCurrentFeed = feedStateManager.clearCurrentFeed.bind(feedStateManager);
  setVideoBlurState = feedStateManager.setVideoBlurState.bind(feedStateManager);
  isVideoBlurred = feedStateManager.isVideoBlurred.bind(feedStateManager);
}

// Export singleton instance
export const feedService = new FeedService();
export default feedService;
export { FEED_CONFIG, createQueryKeys };