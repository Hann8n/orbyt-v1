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
import { useUserStore } from '../stores/userStore';

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

export type FeedOption = 'profile' | 'following' | 'likes' | 'reposts' | 'search' | 'hashtag' | string;

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

  /**
   * Helper function to merge, deduplicate, and sort posts chronologically
   */
  private mergeAndDeduplicatePosts(posts: FeedItem[], limit: number): FeedItem[] {
    // Remove duplicates
    const seen = new Set<string>();
    const uniquePosts = posts.filter(post => {
      if (seen.has(post.post.uri)) {
        return false;
      }
      seen.add(post.post.uri);
      return true;
    });
    
    // Sort chronologically
    uniquePosts.sort((a, b) => {
      const aIndexedAt = (a.post as any)?.indexedAt;
      const bIndexedAt = (b.post as any)?.indexedAt;
      const aTime = aIndexedAt ? new Date(aIndexedAt).getTime() : 0;
      const bTime = bIndexedAt ? new Date(bIndexedAt).getTime() : 0;
      return bTime - aTime;
    });
    
    // Apply limit
    return uniquePosts.slice(0, limit);
  }

  /**
   * Normalize feed option for API calls - convert local Orbyt channel URIs to hashtag format
   * Skips channels that should remain as feed generators (e.g., "latest" aggregates multiple hashtags)
   * This normalization is only used when making API calls, not for caching or routing
   */
  private normalizeFeedOptionForAPI(feedOption: FeedOption): FeedOption {
    // Import here to avoid circular dependency issues
    const { isOrbytChannel, channelToHashtag, getChannelByUri } = require('../utils/orbytChannels');
    
    // If it's already a hashtag or not an Orbyt channel URI, return as-is
    if (feedOption.startsWith('hashtag:') || !feedOption.startsWith('at://')) {
      return feedOption;
    }
    
    // Convert local Orbyt channel URIs (at://local.orbyt.channel/{slug}) to hashtag format
    // Skip channels that aren't postable (like "latest" and "popular-now") - they should use feed generators
    if (isOrbytChannel(feedOption)) {
      const channel = getChannelByUri(feedOption);
      // Keep feed generators for non-postable channels (they aggregate multiple hashtags or have special logic)
      if (channel?.isPostable === false) {
        return feedOption; // Don't normalize - keep as feed generator
      }
      
      // Convert local URIs to hashtag format for API calls
      // This only affects local.orbyt.channel URIs, not feed generator URIs
      if (feedOption.startsWith('at://local.orbyt.channel/')) {
        const hashtagOption = channelToHashtag(feedOption);
        return hashtagOption || feedOption;
      }
    }
    
    return feedOption;
  }

  private getFeedLink(feedOption: FeedOption): string | null {
    if (feedOption.startsWith('at://')) {
      return feedOption;
    }
    
    switch (feedOption) {
      case 'profile':
        return null; // Handle specially with user-specific logic
      case 'likes':
        return null; // Handle specially with user-specific logic
      case 'reposts':
        return null; // Handle specially with user-specific logic
      case 'your-mix':
        return null; // Handle specially with mixed feed logic
      case 'discover':
        return 'at://did:plc:tenurhgjptubkk5zf5qhi3og/app.bsky.feed.generator/discover-video';
      case 'following':
        return 'at://did:plc:vpkhqolt662uhesyj6nxm7ys/app.bsky.feed.generator/tube';
      default:
        return null;
    }
  }

  async fetchFeed(feedOption: FeedOption, userDid?: string, cursor?: string): Promise<APIResponse> {
    // Use original feedOption for caching (keeps URI format for consistency)
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
      
      // Normalize feed option only for API calls (converts local URIs to hashtags)
      const feedOptionForAPI = this.normalizeFeedOptionForAPI(feedOption);
      
      // Handle different feed types (using normalized feed option for API calls)
      if (feedOptionForAPI === 'likes' && userDid) {
        response = await AtprotoService.getFeed(cursor, userDid, {}, true, limit, 'likes');
      } else if (feedOptionForAPI === 'reposts' && userDid) {
        response = await (AtprotoService as any).getRepostedVideos(userDid, cursor, limit);
      } else if (feedOptionForAPI === 'profile' && userDid) {
        response = await AtprotoService.getFeed(cursor, userDid, {}, true, limit, 'authorVideos');
      } else if (feedOptionForAPI === 'profile' && !userDid) {
        return { feed: [], cursor: null };
      } else if (feedOptionForAPI === 'likes' && !userDid) {
        return { feed: [], cursor: null };
      } else if (feedOptionForAPI === 'reposts' && !userDid) {
        return { feed: [], cursor: null };
      } else if (feedOptionForAPI === 'following') {
        const feedLink = this.getFeedLink(feedOptionForAPI);
        if (!feedLink) {
          return { feed: [], cursor: null };
        }
        response = await AtprotoService.getFeed(cursor, feedLink, {}, false, limit, 'custom');
      } else if (feedOptionForAPI === 'your-mix') {
        // Get subscribed channels from user store
        const { subscribedChannels } = await import('../stores/userStore').then(m => m.useUserStore.getState());
        
        // Import orbyt channel utilities once at the start
        const { isOrbytChannel, channelToHashtag, getChannelByUri } = await import('../utils/orbytChannels');
        
        // Filter out default channels (following and your-mix itself)
        const userChannels = subscribedChannels.filter(
          ch => !ch.isDefault && ch.uri !== 'following' && ch.uri !== 'your-mix'
        );
        
        // If no channels subscribed, return empty feed
        if (userChannels.length === 0) {
          return { feed: [], cursor: null };
        }
        
        // Separate channels by type: regular feed URIs vs hashtag/local channels
        const regularFeedUris: string[] = [];
        const hashtagChannels: string[] = [];
        
        userChannels.forEach(ch => {
          if (ch.uri.startsWith('at://') && !ch.uri.startsWith('at://local.orbyt.channel/')) {
            // Regular feed generator URIs (not local Orbyt channels)
            // Check if it's an Orbyt channel (like popular-now, latest)
            if (!isOrbytChannel(ch.uri)) {
              regularFeedUris.push(ch.uri);
            } else {
              // Check if this Orbyt channel is postable
              const channel = getChannelByUri(ch.uri);
              if (channel?.isPostable === false) {
                // Non-postable channels like "popular-now" and "latest" remain as feed generators
                regularFeedUris.push(ch.uri);
              } else {
                // Postable Orbyt channels can be converted to hashtag format
                const hashtagFormat = channelToHashtag(ch.uri);
                if (hashtagFormat) {
                  hashtagChannels.push(hashtagFormat);
                }
              }
            }
          } else if (ch.uri.startsWith('at://local.orbyt.channel/')) {
            // Local Orbyt channels - check if postable before converting
            const channel = getChannelByUri(ch.uri);
            if (channel?.isPostable === false) {
              // Non-postable local channels remain as-is (shouldn't happen but handle gracefully)
              regularFeedUris.push(ch.uri);
            } else {
              // Convert postable local Orbyt channels to hashtag format
              const hashtagFormat = channelToHashtag(ch.uri);
              if (hashtagFormat) {
                hashtagChannels.push(hashtagFormat);
              }
            }
          } else if (ch.uri.startsWith('hashtag:')) {
            // Already in hashtag format
            hashtagChannels.push(ch.uri);
          }
        });
        
        // Fetch and merge feeds based on what we have
        if (regularFeedUris.length > 0 && hashtagChannels.length === 0) {
          // Only regular feed URIs - use getMixedFeed
          response = await AtprotoService.getMixedFeed(
            regularFeedUris,
            cursor,
            limit,
            true, // filter videos only
            FEED_CONFIG.maxFeedsPerFetch
          );
        } else if (hashtagChannels.length > 0 && regularFeedUris.length === 0) {
          // Only hashtag channels - fetch from multiple hashtags and merge
          // For simplicity, we'll fetch from each hashtag sequentially and merge
          // Parse cursor if it exists (for pagination)
          let cursorState: { [key: string]: string | null } = {};
          if (cursor) {
            try {
              cursorState = JSON.parse(cursor);
            } catch {
              cursorState = {};
            }
          }
          
          // Fetch from each hashtag channel
          const hashtagPromises = hashtagChannels.slice(0, FEED_CONFIG.maxFeedsPerFetch).map(async (hashtagUri) => {
            try {
              const hashtagWithSort = hashtagUri.substring(8); // Remove 'hashtag:' prefix
              const parts = hashtagWithSort.split(':');
              const hashtag = parts[0];
              const sort = parts[1] === 'top' ? 'top' : 'latest';
              
              const hashtagCursor = cursorState[hashtagUri] || null;
              const hashtagResponse = await AtprotoService.searchHashtagVideosPaginated(
                hashtag,
                hashtagCursor,
                Math.ceil(limit / Math.min(hashtagChannels.length, FEED_CONFIG.maxFeedsPerFetch)),
                sort as 'top' | 'latest'
              );
              
              return {
                feed: hashtagResponse.videos || [],
                cursor: hashtagResponse.cursor,
                hashtagUri,
              };
            } catch (error) {
              logger.warn('Failed to fetch hashtag feed for your-mix', { hashtagUri, error });
              return { feed: [], cursor: null, hashtagUri };
            }
          });
          
          const hashtagResults = await Promise.all(hashtagPromises);
          
          // Merge all feeds
          const allPosts = hashtagResults.flatMap(result => 
            result.feed.map(post => ({
              ...post,
              sourceFeed: result.hashtagUri
            }))
          );
          
          // Merge, deduplicate, and sort posts
          const limitedPosts = this.mergeAndDeduplicatePosts(allPosts, limit);
          
          // Update cursor state (including null for exhausted feeds)
          hashtagResults.forEach(result => {
            cursorState[result.hashtagUri] = result.cursor;
          });
          
          const compositeCursor = Object.keys(cursorState).length > 0 ? JSON.stringify(cursorState) : null;
          
          response = {
            feed: limitedPosts,
            cursor: compositeCursor,
          };
        } else if (regularFeedUris.length > 0 && hashtagChannels.length > 0) {
          // Mixed: both regular feeds and hashtag channels
          // Fetch from both types and merge them
          let cursorState: { [key: string]: string | null } = {};
          if (cursor) {
            try {
              cursorState = JSON.parse(cursor);
            } catch {
              cursorState = {};
            }
          }
          
          // Calculate optimal distribution of fetch slots
          const totalFeeds = regularFeedUris.length + hashtagChannels.length;
          const maxFeeds = FEED_CONFIG.maxFeedsPerFetch;
          const regularFeedLimit = Math.min(
            regularFeedUris.length,
            Math.ceil((regularFeedUris.length / totalFeeds) * maxFeeds)
          );
          const hashtagFeedLimit = Math.min(
            hashtagChannels.length,
            maxFeeds - regularFeedLimit
          );
          
          // Fetch from regular feeds
          const regularFeedPromises = regularFeedUris.slice(0, regularFeedLimit).map(async (feedUri) => {
            try {
              const feedCursor = cursorState[feedUri] || null;
              const feedLimit = Math.ceil(limit / totalFeeds);
              
              const response = await AtprotoService.getFeed(feedCursor, feedUri, {}, true, feedLimit, 'custom');
              
              return {
                feed: response?.feed || [],
                cursor: response?.cursor || null,
                sourceUri: feedUri,
              };
            } catch (error) {
              logger.warn('Failed to fetch regular feed for your-mix', { feedUri, error });
              return { feed: [], cursor: null, sourceUri: feedUri };
            }
          });
          
          // Fetch from hashtag channels
          const hashtagPromises = hashtagChannels.slice(0, hashtagFeedLimit).map(async (hashtagUri) => {
            try {
              const hashtagWithSort = hashtagUri.substring(8); // Remove 'hashtag:' prefix
              const parts = hashtagWithSort.split(':');
              const hashtag = parts[0];
              const sort = parts[1] === 'top' ? 'top' : 'latest';
              
              const hashtagCursor = cursorState[hashtagUri] || null;
              const hashtagLimit = Math.ceil(limit / totalFeeds);
              const hashtagResponse = await AtprotoService.searchHashtagVideosPaginated(
                hashtag,
                hashtagCursor,
                hashtagLimit,
                sort as 'top' | 'latest'
              );
              
              return {
                feed: hashtagResponse.videos || [],
                cursor: hashtagResponse.cursor,
                sourceUri: hashtagUri,
              };
            } catch (error) {
              logger.warn('Failed to fetch hashtag feed for your-mix', { hashtagUri, error });
              return { feed: [], cursor: null, sourceUri: hashtagUri };
            }
          });
          
          const [regularResults, hashtagResults] = await Promise.all([
            Promise.all(regularFeedPromises),
            Promise.all(hashtagPromises)
          ]);
          
          // Merge all feeds
          const allPosts = [...regularResults, ...hashtagResults].flatMap(result => 
            result.feed.map(post => ({
              ...post,
              sourceFeed: result.sourceUri
            }))
          );
          
          // Merge, deduplicate, and sort posts
          const limitedPosts = this.mergeAndDeduplicatePosts(allPosts, limit);
          
          // Update cursor state (including null for exhausted feeds)
          [...regularResults, ...hashtagResults].forEach(result => {
            cursorState[result.sourceUri] = result.cursor;
          });
          
          const compositeCursor = Object.keys(cursorState).length > 0 ? JSON.stringify(cursorState) : null;
          
          response = {
            feed: limitedPosts,
            cursor: compositeCursor,
          };
        } else {
          return { feed: [], cursor: null };
        }
      } else if (feedOptionForAPI === 'profile' || feedOptionForAPI === 'likes' || feedOptionForAPI === 'reposts') {
        return { feed: [], cursor: null };
      } else if (feedOptionForAPI.startsWith('search:')) {
        const searchQuery = feedOptionForAPI.substring(7);
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
      } else if (feedOptionForAPI.startsWith('hashtag:')) {
        // Hashtag feeds (normalized local Orbyt channels use this format: hashtag:orbyt-channel-{slug})
        // May include sort parameter: hashtag:orbyt-channel-{slug}:top or hashtag:orbyt-channel-{slug}:latest
        const hashtagWithSort = feedOptionForAPI.substring(8); // Remove 'hashtag:' prefix
        if (!hashtagWithSort || hashtagWithSort.trim() === '') {
          return { feed: [], cursor: null };
        }

        // Parse sort parameter (default to 'latest' if not specified)
        let hashtag = hashtagWithSort.trim();
        let sort: 'top' | 'latest' = 'latest';
        
        const sortMatch = hashtag.match(/^(.+):(top|latest)$/);
        if (sortMatch) {
          hashtag = sortMatch[1];
          sort = sortMatch[2] as 'top' | 'latest';
        }

        if (!hashtag) {
          return { feed: [], cursor: null };
        }

        try {
          const response = await AtprotoService.searchHashtagVideosPaginated(
            hashtag,
            cursor as string | null,
            FEED_CONFIG.maxPostsPerFetch,
            sort
          );

          return {
            feed: response.videos,
            cursor: response.cursor,
          };
        } catch (error) {
          return { feed: [], cursor: null };
        }
      } else if (feedOptionForAPI === 'search') {
        return {
          feed: feedStateManager.getCurrentFeed(),
          cursor: null,
        };
      } else {
        // Handle custom feed URIs (external feed generators and non-postable Orbyt channels)
        // Use original feedOption for feed generator URIs, not the normalized one
        const feedLink = feedOption.startsWith('at://') ? feedOption : this.getFeedLink(feedOptionForAPI);
        if (!feedLink) {
          return { feed: [], cursor: null };
        }
        response = await AtprotoService.getFeed(cursor, feedLink, {}, true, limit, 'custom');
      }

      // Apply moderation to the fetched posts
      if (response && response.feed && response.feed.length > 0) {
        try {
          // Get agent from userStore to pass to moderation
          const agent = useUserStore.getState().agent;
          
          if (!agent) {
            logger.warn('No agent available for moderation, applying basic label-based filtering', { component: 'FeedService' });
            // Fail-safe: filter out posts with sensitive labels when no agent
            response.feed = ModerationService.filterSensitiveByLabels(response.feed);
          } else {
            const moderatedFeed = await ModerationService.batchModeratePosts(response.feed, 'contentList', agent);
            response.feed = moderatedFeed.filteredPosts;
            
            logger.debug('Moderation applied to feed', {
              component: 'FeedService',
              total: moderatedFeed.stats.total,
              filtered: moderatedFeed.stats.filtered,
              blurred: moderatedFeed.stats.blurred,
              allowed: moderatedFeed.stats.allowed
            });
          }
        } catch (error) {
          // Fail-safe: if moderation fails, apply basic label-based filtering
          logger.error('Error applying moderation to feed, applying basic label filtering', error, { 
            component: 'FeedService',
            feedLength: response.feed?.length || 0
          });
          
          // Basic fail-safe: filter out posts with sensitive labels
          response.feed = ModerationService.filterSensitiveByLabels(response.feed || []);
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