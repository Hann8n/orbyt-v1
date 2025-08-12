/**
 * FlashList v2-Optimized Feed Service
 * Consolidates all feed-related functionality with FlashList v2 performance optimizations
 * Enhanced memory management and caching for optimal video playback
 * Takes advantage of v2's automatic sizing and maintainVisibleContentPosition
 */

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import AtprotoService from './api/AtprotoService';
import type { ModerationDecision } from './ModerationTypes';

// FlashList v2 optimization constants
const FLASHLIST_PERFORMANCE_CONFIG = {
  CACHE_CLEANUP_INTERVAL: 25000, // 25 seconds - more frequent for v2
  MAX_CACHE_SIZE: 150,           // Increased cache size for v2's better memory management
  STALE_TIME: 7 * 60 * 1000,     // 7 minutes - longer cache for v2 efficiency
  GC_TIME: 15 * 60 * 1000,       // 15 minutes for garbage collection
  PREFETCH_DISTANCE: 2,          // Reduced for v2's smarter prefetching
  MEMORY_WARNING_THRESHOLD: 0.85, // Higher threshold for v2's efficiency
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

// FlashList-optimized feed state management
class FeedStateManager {
  private currentFeed: FeedItem[] = [];
  private videoBlurState = new Map<string, boolean>();
  
  // FlashList-optimized caching with memory management
  private feedCache = new Map<string, { 
    data: FeedItem[]; 
    timestamp: number; 
    cursor?: string | null;
    accessCount: number;
    lastAccessed: number;
  }>();
  private readonly CACHE_TTL = FLASHLIST_PERFORMANCE_CONFIG.STALE_TIME;
  
  // Performance metrics for optimization tracking
  private performanceMetrics = {
    cacheHits: 0,
    cacheMisses: 0,
    memoryCleanups: 0,
  };
  
  // Memory management
  private cleanupInterval: NodeJS.Timeout | null = null;
  
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

  setVideoBlurState(uri: string, blurred: boolean) {
    this.videoBlurState.set(uri, blurred);
  }

  isVideoBlurred(uri: string, moderationBlur: boolean): boolean {
    if (this.videoBlurState.has(uri)) {
      return this.videoBlurState.get(uri)!;
    }
    return moderationBlur;
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
    if (this.feedCache.size >= FLASHLIST_PERFORMANCE_CONFIG.MAX_CACHE_SIZE) {
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
    }, FLASHLIST_PERFORMANCE_CONFIG.CACHE_CLEANUP_INTERVAL);
  }
  
  private performMemoryCleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    // Remove expired entries
    for (const [key, value] of this.feedCache.entries()) {
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
      memoryUsage: this.feedCache.size / FLASHLIST_PERFORMANCE_CONFIG.MAX_CACHE_SIZE,
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
    
    // Check cache first for performance (only for initial loads)
    if (!cursor) {
      const cachedResult = feedStateManager.getCachedFeed(cacheKey);
      if (cachedResult) {
        return {
          feed: cachedResult.data,
          cursor: cachedResult.cursor,
        };
      }
    }

    try {
      const limit = FEED_CONFIG.defaultLimit;
      let response;
      


      // Handle different feed types
      if (feedOption === 'likes' && userDid) {
        response = await AtprotoService.getFeed(cursor, userDid, {}, true, limit, 'likes');
      } else if (feedOption === 'reposts' && userDid) {
        // Aggressive client-side fetch of reposted videos for the actor
        response = await (AtprotoService as any).getRepostedVideos(userDid, cursor, limit);
      } else if (feedOption === 'profile' && userDid) {
        response = await AtprotoService.getFeed(cursor, userDid, {}, true, limit, 'authorVideos');
      } else if (feedOption === 'profile' && !userDid) {
        console.warn(`[FeedService] Profile feed requested but no userDid provided for option: ${feedOption}`);
        return { feed: [], cursor: null };
      } else if (feedOption === 'likes' && !userDid) {
        console.warn(`[FeedService] Likes feed requested but no userDid provided for option: ${feedOption}`);
        return { feed: [], cursor: null };
      } else if (feedOption === 'reposts' && !userDid) {
        console.warn(`[FeedService] Reposts feed requested but no userDid provided for option: ${feedOption}`);
        return { feed: [], cursor: null };
      } else if (feedOption === 'following') {
        // Handle following feed as a custom feed using the specific feed URI
        const feedLink = this.getFeedLink(feedOption);
        if (!feedLink) {
          console.warn(`[FeedService] No feed link found for option: ${feedOption}`);
          return { feed: [], cursor: null };
        }
        // Disable video filtering since this should already be a video-only feed
        response = await AtprotoService.getFeed(cursor, feedLink, {}, false, limit, 'custom');
      } else if (feedOption === 'profile' || feedOption === 'likes' || feedOption === 'reposts') {
        // These feed types require a userDid but none was provided
        console.warn(`[FeedService] ${feedOption} feed requires userDid but none provided`);
        return { feed: [], cursor: null };
      } else if (feedOption === 'yourMix') {
        const feedUris = this.subscribedChannels
          .filter((channel: any) => channel.uri !== 'following')
          .map((channel: any) => {
            if (channel.uri === 'yourMix') {
              return 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/thevids';
            }
            return channel.uri;
          })
          .filter(uri => uri && uri.startsWith('at://')); // Filter out invalid URIs
        
        if (feedUris.length > 0) {
          response = await AtprotoService.getMixedFeed(feedUris, cursor, limit, true, FEED_CONFIG.maxFeedsPerFetch);
        } else {
          // Fallback to a default video feed if no valid channels
          response = await AtprotoService.getFeed(cursor, 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/thevids', {}, true, limit, 'custom');
          // Set sourceFeed for fallback case
          if (response.feed) {
            response.feed = response.feed.map(item => ({
              ...item,
              sourceFeed: 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/thevids'
            }));
          }
        }
      } else if (feedOption.startsWith('search:')) {
        // Handle search feeds
        const searchQuery = feedOption.substring(7); // Remove 'search:' prefix
        if (!searchQuery || searchQuery.trim() === '') {
          return { feed: [], cursor: null };
        }

        try {
          // Search for profiles and channels in parallel
          const [profilesResponse, channelsResponse] = await Promise.all([
            AtprotoService.searchProfilesPaginated(searchQuery, cursor as string | null),
            AtprotoService.searchPopularFeeds(searchQuery, 15)
          ]);

          // Convert to feed items format
          const feedItems: FeedItem[] = [];
          
          // Add profiles
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

          // Add channels
          channelsResponse.forEach(channel => {
            feedItems.push({
              post: {
                uri: channel.uri,
                cid: channel.cid,
                author: channel.creator,
                text: channel.displayName,
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
          console.error('Error performing search:', error);
          return { feed: [], cursor: null };
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
        if (!feedLink) {
          console.warn(`[FeedService] No feed link found for option: ${feedOption}`);
          return { feed: [], cursor: null };
        }
        response = await AtprotoService.getFeed(cursor, feedLink, {}, true, limit, 'custom');
      }

      const result = {
        feed: response.feed || [],
        cursor: response.cursor,
      };

      // Cache successful responses for initial loads only
      if (!cursor && result.feed.length > 0) {
        feedStateManager.setCachedFeed(cacheKey, result.feed, result.cursor);
      }

      return result;
    } catch (error) {
      console.error(`[FeedService] Error fetching ${feedOption} feed:`, error);
      return { feed: [], cursor: null };
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
  
  // Cache management methods for performance optimization
  clearFeedCache = feedStateManager.clearFeedCache.bind(feedStateManager);
  getCachedFeed = feedStateManager.getCachedFeed.bind(feedStateManager);
  setCachedFeed = feedStateManager.setCachedFeed.bind(feedStateManager);
}

// Export singleton instance
export const feedService = new FeedService();
export default feedService;
export { FEED_CONFIG, createQueryKeys };