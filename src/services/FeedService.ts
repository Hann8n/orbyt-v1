/**
 * FlashList v2-Optimized Feed Service
 * Consolidates all feed-related functionality with FlashList v2 performance optimizations
 * Enhanced memory management and caching for optimal video playback
 * Takes advantage of v2's automatic sizing and maintainVisibleContentPosition
 */

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type { ModerationDecision } from './ModerationTypes';
import { ModerationService } from './ModerationService';
import { logger } from '../utils/logger';

// Import AtprotoService with error handling for circular dependency issues
let AtprotoService: any = null;
try {
  AtprotoService = require('./api/AtprotoService').default;
} catch (error) {
  // Fallback implementation
  AtprotoService = {
    getFeed: async () => ({ feed: [], cursor: null }),
    getMixedFeed: async () => ({ feed: [], cursor: null }),
    searchProfilesPaginated: async () => ({ profiles: [], cursor: null }),
    searchPopularFeeds: async () => [],
  };
}

// Simplified performance constants - relying on React Query and FlashList defaults
const CACHE_CONFIG = {
  CLEANUP_INTERVAL: 30000,      // 30 seconds cleanup
  MAX_CACHE_SIZE: 100,         // Reasonable cache size
  STALE_TIME: 5 * 60 * 1000,   // 5 minutes
  GC_TIME: 10 * 60 * 1000,     // 10 minutes
} as const;

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

export type FeedOption = 'yourMix' | 'profile' | 'following' | 'likes' | 'reposts' | 'search' | 'hashtag' | string;

// Configuration constants
const FEED_CONFIG = {
  maxFeedsPerFetch: 8,
  maxPostsPerFetch: 50,
  maxSubscribedChannels: 50,
  defaultLimit: 50,
  staleTime: 10 * 60 * 1000, // 10 minutes - increased to reduce unnecessary refreshes
  cacheTime: 60 * 60 * 1000, // 60 minutes - increased to better preserve video cache
} as const;

// FlashList-optimized feed state management
class FeedStateManager {
  private currentFeed: FeedItem[] = [];
  
  // FlashList-optimized caching with memory management
  private feedCache = new Map<string, { 
    data: FeedItem[]; 
    timestamp: number; 
    cursor?: string | null;
    accessCount: number;
    lastAccessed: number;
  }>();
  private readonly CACHE_TTL = FEED_CONFIG.staleTime; // Use FEED_CONFIG for consistency
  
  // Performance metrics for optimization tracking
  private performanceMetrics = {
    cacheHits: 0,
    cacheMisses: 0,
    memoryCleanups: 0,
  };
  
  // Memory management
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  
  constructor() {
    this.startMemoryManagement();
  }

  setCurrentFeed(feed: FeedItem[]) {
    this.currentFeed = feed;
  }

  getCurrentFeed(): FeedItem[] {
    return this.currentFeed;
  }

  clearCurrentFeed() {
    this.currentFeed = [];
  }
  
  // FlashList-optimized cache management with performance tracking
  getCachedFeed(cacheKey: string): { data: FeedItem[]; cursor?: string | null } | null {
    const cached = this.feedCache.get(cacheKey);
    
    if (!cached) {
      this.performanceMetrics.cacheMisses++;
      return null;
    }
    
    if (Date.now() - cached.timestamp < this.CACHE_TTL) {
      // Update access tracking for LRU-style management
      cached.accessCount++;
      cached.lastAccessed = Date.now();
      this.performanceMetrics.cacheHits++;
      return { data: cached.data, cursor: cached.cursor };
    }
    
    // Remove expired data
    this.feedCache.delete(cacheKey);
    this.performanceMetrics.cacheMisses++;
    return null;
  }

  setCachedFeed(cacheKey: string, data: FeedItem[], cursor?: string | null): void {
    // Implement cache size limit for memory management
    if (this.feedCache.size >= CACHE_CONFIG.MAX_CACHE_SIZE) {
      this.performLRUCleanup();
    }
    
    this.feedCache.set(cacheKey, { 
      data, 
      timestamp: Date.now(), 
      cursor,
      accessCount: 1,
      lastAccessed: Date.now(),
    });
  }

  clearFeedCache(): void {
    this.feedCache.clear();
    this.performanceMetrics.memoryCleanups++;
  }
  
  // FlashList memory management methods
  private startMemoryManagement(): void {
    this.cleanupInterval = setInterval(() => {
      this.performMemoryCleanup();
    }, CACHE_CONFIG.CLEANUP_INTERVAL);
  }
  
  private performMemoryCleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    // Remove expired entries
    const entries = Array.from(this.feedCache.entries());
    for (const [key, value] of entries) {
      if (now - value.timestamp > this.CACHE_TTL) {
        expiredKeys.push(key);
      }
    }
    
    expiredKeys.forEach(key => this.feedCache.delete(key));
    
    if (expiredKeys.length > 0) {
      this.performanceMetrics.memoryCleanups++;
    }
  }
  
  private performLRUCleanup(): void {
    // Remove least recently used items when cache is full
    const entries = Array.from(this.feedCache.entries());
    entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
    
    // Remove oldest 20% of entries
    const removeCount = Math.floor(entries.length * 0.2);
    for (let i = 0; i < removeCount; i++) {
      this.feedCache.delete(entries[i][0]);
    }
  }
  
  getPerformanceMetrics() {
    return {
      ...this.performanceMetrics,
      cacheSize: this.feedCache.size,
      hitRate: this.performanceMetrics.cacheHits / 
               (this.performanceMetrics.cacheHits + this.performanceMetrics.cacheMisses) || 0,
      memoryUsage: this.feedCache.size / CACHE_CONFIG.MAX_CACHE_SIZE,
    };
  }
  
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clearFeedCache();
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
  mutes: {
    all: ['mutes'] as const,
    status: (did: string) => [...createQueryKeys.mutes.all, did] as const,
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
    search: (query: string) => [...createQueryKeys.feed.all, 'search', query] as const,
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

  private getFeedLink(feedOption: FeedOption): string | null {
    if (feedOption.startsWith('at://')) {
      return feedOption;
    }
    
    switch (feedOption) {
      case 'yourMix':
        return 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/thevids';
      case 'profile':
        return null; // Handle specially with user-specific logic
      case 'likes':
        return null; // Handle specially with user-specific logic
      case 'reposts':
        return null; // Handle specially with user-specific logic
      case 'discover':
        return 'at://did:plc:tenurhgjptubkk5zf5qhi3og/app.bsky.feed.generator/discover-video';
      case 'following':
        return 'at://did:plc:vpkhqolt662uhesyj6nxm7ys/app.bsky.feed.generator/tube';
      default:
        return null;
    }
  }

  async fetchFeed(feedOption: FeedOption, userDid?: string, cursor?: string): Promise<APIResponse> {
    // Create cache key for this specific feed request
    const cacheKey = `${feedOption}_${userDid || 'anonymous'}_${cursor || 'initial'}`;
    
    // Check cache first for performance (for both initial loads and pagination)
    const cachedResult = feedStateManager.getCachedFeed(cacheKey);
    if (cachedResult) {
      // Return cached data immediately - React Query will handle freshness
      return {
        feed: cachedResult.data,
        cursor: cachedResult.cursor,
      };
    }

    try {
      const limit = FEED_CONFIG.defaultLimit;
      let response;
      
      // Handle different feed types
      if (feedOption === 'likes' && userDid) {
        response = await AtprotoService.getFeed(cursor, userDid, {}, true, limit, 'likes');
      } else if (feedOption === 'reposts' && userDid) {
        response = await (AtprotoService as any).getRepostedVideos(userDid, cursor, limit);
      } else if (feedOption === 'profile' && userDid) {
        response = await AtprotoService.getFeed(cursor, userDid, {}, true, limit, 'authorVideos');
      } else if (feedOption === 'profile' && !userDid) {
        return { feed: [], cursor: null };
      } else if (feedOption === 'likes' && !userDid) {
        return { feed: [], cursor: null };
      } else if (feedOption === 'reposts' && !userDid) {
        return { feed: [], cursor: null };
      } else if (feedOption === 'yourMix') {
        // Your Mix simply serves the thevids feed directly
        const feedLink = this.getFeedLink(feedOption);
        if (!feedLink) {
          return { feed: [], cursor: null };
        }
        response = await AtprotoService.getFeed(cursor, feedLink, {}, true, limit, 'custom');
      } else if (feedOption === 'following') {
        const feedLink = this.getFeedLink(feedOption);
        if (!feedLink) {
          return { feed: [], cursor: null };
        }
        response = await AtprotoService.getFeed(cursor, feedLink, {}, false, limit, 'custom');
      } else if (feedOption === 'profile' || feedOption === 'likes' || feedOption === 'reposts') {
        return { feed: [], cursor: null };
      } else if (feedOption.startsWith('search:')) {
        const searchQuery = feedOption.substring(7);
        if (!searchQuery || searchQuery.trim() === '') {
          return { feed: [], cursor: null };
        }

        try {
          const [profilesResponse, channelsResponse] = await Promise.all([
            AtprotoService.searchProfilesPaginated(searchQuery, cursor as string | null),
            AtprotoService.searchPopularFeeds(searchQuery, 15)
          ]);

          const feedItems: FeedItem[] = [];
          
          profilesResponse.profiles.forEach(profile => {
            feedItems.push({
              post: {
                uri: `at://${profile.did}/profile`,
                cid: profile.cid || '',
                author: {
                  did: profile.did,
                  handle: profile.handle,
                  displayName: profile.displayName,
                  avatar: profile.avatar,
                },
                viewer: profile.viewer,
              } as any,
              shouldCache: true,
              uniqueKey: profile.did,
            });
          });

          channelsResponse.forEach(channel => {
            feedItems.push({
              post: {
                uri: channel.uri,
                cid: channel.cid,
                author: channel.creator,
                text: channel.displayName,
                avatar: channel.avatar,
              } as any,
              shouldCache: true,
              uniqueKey: channel.uri,
            });
          });

          return {
            feed: feedItems,
            cursor: profilesResponse.cursor,
          };
        } catch (error) {
          return { feed: [], cursor: null };
        }
      } else if (feedOption.startsWith('hashtag:')) {
        const hashtag = feedOption.substring(8); // Remove 'hashtag:' prefix
        if (!hashtag || hashtag.trim() === '') {
          return { feed: [], cursor: null };
        }

        try {
          const response = await AtprotoService.searchHashtagVideosPaginated(
            hashtag.trim(),
            cursor as string | null,
            FEED_CONFIG.maxPostsPerFetch
          );

          return {
            feed: response.videos,
            cursor: response.cursor,
          };
        } catch (error) {
          return { feed: [], cursor: null };
        }
      } else if (feedOption === 'search') {
        return {
          feed: feedStateManager.getCurrentFeed(),
          cursor: null,
        };
      } else {
        // Handle custom feed URIs
        const feedLink = this.getFeedLink(feedOption);
        if (!feedLink) {
          return { feed: [], cursor: null };
        }
        response = await AtprotoService.getFeed(cursor, feedLink, {}, true, limit, 'custom');
      }

      // Apply moderation to the fetched posts
      if (response && response.feed) {
        try {
          const moderatedFeed = await ModerationService.batchModeratePosts(response.feed, 'contentList');
          response.feed = moderatedFeed.filteredPosts;
        } catch (error) {
          // Continue with unfiltered posts if moderation fails
        }
      }

      // Cache the result (both initial loads and pagination)
      if (response) {
        feedStateManager.setCachedFeed(cacheKey, response.feed, response.cursor);
      }

      return response || { feed: [], cursor: null };
    } catch (error) {
      return { feed: [], cursor: null };
    }
  }

  // Removed custom infinite scroll - using FlashList's onEndReached instead

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
      refetchOnMount: queryOptions.refetchOnMount ?? false, // Changed from true to false to prevent unnecessary refreshes
      refetchOnReconnect: queryOptions.refetchOnReconnect ?? true,
      ...queryOptions
    });
  }


  // State management methods
  setCurrentFeed = feedStateManager.setCurrentFeed.bind(feedStateManager);
  getCurrentFeed = feedStateManager.getCurrentFeed.bind(feedStateManager);
  clearCurrentFeed = feedStateManager.clearCurrentFeed.bind(feedStateManager);
  
  // Cache management methods for performance optimization
  clearFeedCache = feedStateManager.clearFeedCache.bind(feedStateManager);
  getCachedFeed = feedStateManager.getCachedFeed.bind(feedStateManager);
  setCachedFeed = feedStateManager.setCachedFeed.bind(feedStateManager);
}

// Export singleton instance
export const feedService = new FeedService();
export default feedService;
export { FEED_CONFIG, createQueryKeys };