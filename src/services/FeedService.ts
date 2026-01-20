/**
 * FlashList v2-Optimized Feed Service
 * Consolidates all feed-related functionality with FlashList v2 performance optimizations
 * Enhanced memory management and caching for optimal video playback
 * Takes advantage of v2's automatic sizing and maintainVisibleContentPosition
 */

import { logger } from '../utils/logger';
import { QUERY_CONSTANTS } from '../utils/constants';
import type {
  ExtendedFeedViewPost,
  FeedResponse,
  VideoSearchResponse,
  ProfileViewBasic,
  GeneratorView,
} from './api/types';
import { isOrbytChannel, channelToHashtag, getChannelByUri } from '../utils/channels/orbyt';
import type { FeedOption } from '../types';
import { seenVideoService } from './SeenVideoService';

// Import AtprotoService with error handling for circular dependency issues
let AtprotoService: any = null;
try {
  AtprotoService = require('./api/AtprotoService').default;
} catch (_error) {
  // Fallback implementation
  AtprotoService = {
    getFeed: async () => ({ feed: [], cursor: null }),
    getMixedFeed: async () => ({ feed: [], cursor: null }),
    searchProfilesPaginated: async () => ({ profiles: [], cursor: null }),
    searchPopularFeeds: async () => [],
  };
}

// Re-export API types for convenience
export type { ExtendedFeedViewPost as FeedItem, ExtendedPostView as Post } from './api/types';

// API Response type matching AtprotoService return types
export type APIResponse = FeedResponse;

// Re-export FeedOption for convenience (defined in types/index.ts)
export type { FeedOption } from '../types';

// Type definitions for your-mix feed implementation
interface FeedSource {
  readonly uri: string;
  readonly type: 'feed' | 'hashtag' | 'algorithmic';
  readonly hashtag?: string;
  readonly sort?: 'top' | 'latest';
}

interface FeedFetchResult {
  readonly feed: ExtendedFeedViewPost[];
  readonly cursor: string | null;
  readonly sourceUri: string;
  readonly success: boolean;
}

// Configuration constants
const FEED_CONFIG = {
  maxFeedsPerFetch: 8,
  maxPostsPerFetch: 50,
  maxSubscribedChannels: 50,
  defaultLimit: 50,
  staleTime: QUERY_CONSTANTS.STALE_TIME_LONG, // 10 minutes - for slowly changing data
  cacheTime: 60 * 60 * 1000, // 60 minutes - increased to better preserve video cache
} as const;

/**
 * Minimal state manager - only used for search results display
 * React Query handles all feed caching via useInfiniteQuery
 */
class SearchFeedState {
  private searchResults: ExtendedFeedViewPost[] = [];

  setSearchResults(feed: ExtendedFeedViewPost[]) {
    this.searchResults = feed;
  }

  getSearchResults(): ExtendedFeedViewPost[] {
    return this.searchResults;
  }

  clearSearchResults() {
    this.searchResults = [];
  }
}

// Singleton for search state only
const searchFeedState = new SearchFeedState();

// Core feed fetching logic
class FeedService {
  /**
   * Fetch and filter from a single source (used when only one source is active)
   */
  private async fetchSingleSource(
    source: FeedSource,
    cursor: string | null,
    limit: number,
    currentUserDid: string | null
  ): Promise<APIResponse> {
    // Fetch more than limit to compensate for seen video filtering
    const fetchLimit = Math.min(limit * 1.5, 75);

    const result = await this.fetchFromSource(source, cursor, Math.ceil(fetchLimit));

    // Filter seen videos (only for your-mix)
    const filteredResults = seenVideoService.filterSeen(result.feed, currentUserDid);

    // Apply limit after filtering
    const limitedResults = filteredResults.slice(0, limit);

    return {
      feed: limitedResults,
      cursor: result.cursor,
    };
  }

  /**
   * Fetch from a single feed source with timeout protection
   */
  private async fetchFromSource(
    source: FeedSource,
    cursor: string | null,
    limit: number
  ): Promise<FeedFetchResult> {
    const FEED_FETCH_TIMEOUT = 10000; // 10 seconds per feed
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Feed fetch timeout')), FEED_FETCH_TIMEOUT);
    });

    try {
      const fetchPromise =
        source.type === 'hashtag'
          ? AtprotoService.searchHashtagVideosPaginated(
              source.hashtag!,
              cursor,
              limit,
              source.sort || 'latest'
            ).then(
              (response: VideoSearchResponse): FeedFetchResult => ({
                feed: response.videos, // Direct type: ExtendedFeedViewPost[]
                cursor: response.cursor, // Direct type: string | null
                sourceUri: source.uri,
                success: true,
              })
            )
          : source.type === 'algorithmic'
            ? AtprotoService.getFeed(
                cursor,
                source.uri,
                {},
                false, // Algorithmic feeds already return video-only content
                limit,
                'custom'
              ).then(
                (response: FeedResponse): FeedFetchResult => ({
                  feed: response.feed, // Direct type: ExtendedFeedViewPost[]
                  cursor: response.cursor, // Direct type: string | null
                  sourceUri: source.uri,
                  success: true,
                })
              )
            : AtprotoService.getFeed(
                cursor,
                source.uri,
                {},
                true, // Filter videos for regular feed generators
                limit,
                'custom'
              ).then(
                (response: FeedResponse): FeedFetchResult => ({
                  feed: response.feed, // Direct type: ExtendedFeedViewPost[]
                  cursor: response.cursor, // Direct type: string | null
                  sourceUri: source.uri,
                  success: true,
                })
              );

      return await Promise.race([fetchPromise, timeoutPromise]);
    } catch (error) {
      logger.warn('Failed to fetch feed source', { sourceUri: source.uri, error });
      return {
        feed: [],
        cursor: null,
        sourceUri: source.uri,
        success: false,
      };
    }
  }

  /**
   * Normalize feed option for API calls - convert local Orbyt channel URIs to hashtag format
   * Skips channels that should remain as feed generators (e.g., "latest" aggregates multiple hashtags)
   * This normalization is only used when making API calls, not for caching or routing
   */
  private normalizeFeedOptionForAPI(feedOption: FeedOption): FeedOption {
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
    // React Query handles caching - no need for manual cache management
    try {
      const limit = FEED_CONFIG.defaultLimit;
      let response;

      // Normalize feed option only for API calls (converts local URIs to hashtags)
      const feedOptionForAPI = this.normalizeFeedOptionForAPI(feedOption);

      // Handle different feed types (using normalized feed option for API calls)
      if (feedOptionForAPI === 'likes' && userDid) {
        response = await AtprotoService.getFeed(cursor, userDid, {}, true, limit, 'likes');
      } else if (feedOptionForAPI === 'reposts' && userDid) {
        // getRepostedVideos is a static method on AtprotoService
        response = await AtprotoService.getRepostedVideos(userDid, cursor, limit);
      } else if (feedOptionForAPI === 'profile' && userDid) {
        response = await AtprotoService.getFeed(cursor, userDid, {}, true, limit, 'authorVideos');
      } else if (feedOptionForAPI === 'profile' && !userDid) {
        return { feed: [], cursor: null };
      } else if (feedOptionForAPI === 'likes' && !userDid) {
        return { feed: [], cursor: null };
      } else if (feedOptionForAPI === 'reposts' && !userDid) {
        return { feed: [], cursor: null };
      } else if (feedOptionForAPI === 'bookmarks' && userDid) {
        const bookmarksResponse = await AtprotoService.getBookmarks(cursor || undefined, limit);
        // Transform bookmarks to feed items
        const feed = bookmarksResponse.bookmarks.map((bookmark: any) => ({
          post: bookmark,
          uniqueKey: bookmark.uri,
        }));
        return { feed, cursor: bookmarksResponse.cursor };
      } else if (feedOptionForAPI === 'bookmarks' && !userDid) {
        return { feed: [], cursor: null };
      } else if (feedOptionForAPI === 'following') {
        const feedLink = this.getFeedLink(feedOptionForAPI);
        if (!feedLink) {
          return { feed: [], cursor: null };
        }
        response = await AtprotoService.getFeed(cursor, feedLink, {}, false, limit, 'custom');
      } else if (feedOptionForAPI === 'your-mix') {
        // Parallelize imports to reduce latency
        const [userStoreModule, orbytChannelsModule] = await Promise.all([
          import('../stores/userStore'),
          import('../utils/channels/orbyt'),
        ]);

        // Get subscribed channels and algorithmic feed provider from user store
        const { subscribedChannels, algorithmicFeedProvider } =
          userStoreModule.useUserStore.getState();

        // If no channels subscribed AND no algorithmic feed, return empty feed
        const hasChannels = subscribedChannels && subscribedChannels.length > 0;
        const hasAlgorithmic = !!algorithmicFeedProvider;

        if (!hasChannels && !hasAlgorithmic) {
          return { feed: [], cursor: null };
        }

        // Import orbyt channel utilities
        const { channelToHashtag, getChannelByUri } = orbytChannelsModule;

        // Prepare feed sources - convert channels to appropriate format
        const feedSources: FeedSource[] = [];

        // Add algorithmic feed provider if set
        if (algorithmicFeedProvider) {
          feedSources.push({
            uri: algorithmicFeedProvider,
            type: 'algorithmic',
          });
        }

        // Add channel feeds
        if (hasChannels) {
          const maxFeeds = Math.min(subscribedChannels.length, FEED_CONFIG.maxFeedsPerFetch);

          for (const channel of subscribedChannels.slice(0, maxFeeds)) {
            if (channel.uri.startsWith('hashtag:')) {
              // Already in hashtag format
              const hashtagWithSort = channel.uri.substring(8);
              const parts = hashtagWithSort.split(':');
              const hashtag = parts[0];
              const sort = parts[1] === 'top' ? 'top' : 'latest';
              feedSources.push({
                uri: channel.uri,
                type: 'hashtag',
                hashtag,
                sort,
              });
            } else if (channel.uri.startsWith('at://local.orbyt.channel/')) {
              // Local Orbyt channels - convert postable ones to hashtag
              const orbytChannel = getChannelByUri(channel.uri);
              if (orbytChannel?.isPostable !== false) {
                const hashtagFormat = channelToHashtag(channel.uri);
                if (hashtagFormat) {
                  const hashtag = hashtagFormat.substring(8);
                  feedSources.push({
                    uri: channel.uri,
                    type: 'hashtag',
                    hashtag,
                    sort: 'latest',
                  });
                  continue;
                }
              }
              // Non-postable or conversion failed - treat as feed URI
              feedSources.push({
                uri: channel.uri,
                type: 'feed',
              });
            } else if (channel.uri.startsWith('at://')) {
              // Regular feed generator URI
              const orbytChannel = getChannelByUri(channel.uri);
              if (orbytChannel && orbytChannel.isPostable !== false) {
                // Postable Orbyt channel - try to convert to hashtag
                const hashtagFormat = channelToHashtag(channel.uri);
                if (hashtagFormat) {
                  const hashtag = hashtagFormat.substring(8);
                  feedSources.push({
                    uri: channel.uri,
                    type: 'hashtag',
                    hashtag,
                    sort: 'latest',
                  });
                  continue;
                }
              }
              // Non-postable or non-Orbyt - use as feed generator
              feedSources.push({
                uri: channel.uri,
                type: 'feed',
              });
            }
          }
        }

        // Safety check: if no feed sources, return empty
        if (feedSources.length === 0) {
          return { feed: [], cursor: null };
        }

        // Get current user for seen video filtering
        const currentUser = userStoreModule.useUserStore.getState().currentUser;
        const currentUserDid = currentUser?.did ?? null;

        // Optimization: if only one source, use direct fetch
        if (feedSources.length === 1) {
          const singleSource = feedSources[0];
          // Parse simple cursor format or use null
          let sourceCursor: string | null = null;
          if (cursor) {
            try {
              const parsed = JSON.parse(cursor);
              if (typeof parsed === 'object' && parsed !== null && parsed[singleSource.uri]) {
                sourceCursor = parsed[singleSource.uri];
              }
            } catch {
              // Invalid cursor, start fresh
            }
          }
          return await this.fetchSingleSource(singleSource, sourceCursor, limit, currentUserDid);
        }

        // Parse cursor to get source cursors map
        let sourceCursors: { [sourceUri: string]: string | null } = {};
        if (cursor) {
          try {
            const parsed = JSON.parse(cursor);
            if (typeof parsed === 'object' && parsed !== null) {
              sourceCursors = parsed;
            }
          } catch {
            // Invalid cursor, start fresh
          }
        }

        // Filter out exhausted sources (null cursor means exhausted after a fetch attempt)
        // On first load (undefined), sources are active and should be fetched
        const activeSources = feedSources.filter(source => sourceCursors[source.uri] !== null);

        // If no active sources, return empty feed
        if (activeSources.length === 0) {
          return { feed: [], cursor: null };
        }

        // Calculate fetch size per source to account for seen video filtering
        // Fetch 1.5x limit distributed across sources to ensure enough results after filtering
        const fetchSizePerSource = Math.max(Math.ceil((limit * 1.5) / activeSources.length), 10);

        // Fetch from all active sources in parallel
        const feedPromises = activeSources.map(async source => {
          const sourceCursor = sourceCursors[source.uri] ?? null;
          return this.fetchFromSource(source, sourceCursor, fetchSizePerSource);
        });

        const feedResults = await Promise.allSettled(feedPromises);

        // Process results and collect successful fetches
        const successfulResults: FeedFetchResult[] = [];

        feedResults.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value.success) {
            const fetchResult = result.value;
            successfulResults.push(fetchResult);
            // Update cursor for successful sources
            if (fetchResult.cursor) {
              sourceCursors[fetchResult.sourceUri] = fetchResult.cursor;
            } else {
              // Mark as exhausted (null cursor)
              sourceCursors[fetchResult.sourceUri] = null;
            }
          } else {
            // Mark failed sources as exhausted
            const source = activeSources[index];
            if (source) {
              sourceCursors[source.uri] = null;
            }
          }
        });

        // Flatten all results
        let allPosts: ExtendedFeedViewPost[] = successfulResults.flatMap(result => result.feed);

        // Deduplicate across all sources by URI
        const seenUris = new Set<string>();
        allPosts = allPosts.filter(post => {
          const uri = post.post?.uri;
          if (uri && !seenUris.has(uri)) {
            seenUris.add(uri);
            return true;
          }
          return false;
        });

        // Filter seen videos BEFORE limiting (ensures we get enough results)
        // This must happen before sorting/limiting to account for seen video filtering
        allPosts = seenVideoService.filterSeen(allPosts, currentUserDid);

        // Sort chronologically by indexedAt (newest first)
        allPosts.sort((a, b) => {
          const aTime = new Date(a?.post?.indexedAt || 0).getTime();
          const bTime = new Date(b?.post?.indexedAt || 0).getTime();
          return bTime - aTime;
        });

        // Apply limit after sorting and filtering
        const limitedPosts = allPosts.slice(0, limit);

        // Create cursor from active sources (only include sources with valid cursors)
        // Filter out exhausted sources (null cursors) directly from sourceCursors
        const activeFeedStates = Object.fromEntries(
          Object.entries(sourceCursors).filter(([_, cursor]) => cursor !== null)
        );

        const newCursor =
          Object.keys(activeFeedStates).length > 0 ? JSON.stringify(activeFeedStates) : null;

        response = {
          feed: limitedPosts,
          cursor: newCursor,
        };
      } else if (
        feedOptionForAPI === 'profile' ||
        feedOptionForAPI === 'likes' ||
        feedOptionForAPI === 'reposts'
      ) {
        return { feed: [], cursor: null };
      } else if (feedOptionForAPI.startsWith('search:')) {
        const searchQuery = feedOptionForAPI.substring(7);
        if (!searchQuery || searchQuery.trim() === '') {
          return { feed: [], cursor: null };
        }

        try {
          const [profilesResponse, channelsResponse] = await Promise.all([
            AtprotoService.searchProfilesPaginated(
              searchQuery,
              cursor as string | null,
              FEED_CONFIG.maxPostsPerFetch
            ),
            AtprotoService.searchPopularFeeds(searchQuery, 15),
          ]);

          const feedItems: ExtendedFeedViewPost[] = [];

          profilesResponse.profiles.forEach((profile: ProfileViewBasic) => {
            feedItems.push({
              post: {
                uri: `at://${profile.did}/profile`,
                cid: '',
                author: {
                  did: profile.did,
                  handle: profile.handle,
                  displayName: profile.displayName,
                  avatar: profile.avatar,
                },
                viewer: profile.viewer,
              } as ExtendedFeedViewPost['post'],
              uniqueKey: profile.did,
            });
          });

          channelsResponse.forEach((channel: GeneratorView) => {
            feedItems.push({
              post: {
                uri: channel.uri,
                cid: channel.cid,
                author: channel.creator,
                text: channel.displayName,
                avatar: channel.avatar,
                contentMode: (channel as any).contentMode, // Already extracted by AtprotoService
              } as unknown as ExtendedFeedViewPost['post'],
              uniqueKey: channel.uri,
            });
          });

          return {
            feed: feedItems,
            cursor: profilesResponse.cursor,
          };
        } catch (_error) {
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
          logger.error('Failed to fetch hashtag feed', error, {
            component: 'FeedService',
            hashtag,
            sort,
          });
          return { feed: [], cursor: null };
        }
      } else if (feedOptionForAPI === 'search') {
        return {
          feed: searchFeedState.getSearchResults(),
          cursor: null,
        };
      } else if (feedOptionForAPI === 'watched') {
        // Watched videos use the current feed set via setCurrentFeed
        return {
          feed: searchFeedState.getSearchResults(), // Reuse search state for watched videos
          cursor: null,
        };
      } else {
        // Handle custom feed URIs (external feed generators and non-postable Orbyt channels)
        // Use original feedOption for feed generator URIs, not the normalized one
        const feedLink = feedOption.startsWith('at://')
          ? feedOption
          : this.getFeedLink(feedOptionForAPI);
        if (!feedLink) {
          return { feed: [], cursor: null };
        }

        // Check ChannelCache to see if this is a video-only feed generator
        // If so, skip client-side filtering (API already returns video-only content)
        const { default: ChannelService } = await import('./cache/ChannelCache');
        const cached = ChannelService.getChannelFromCacheSync(feedLink);
        const isVideoOnlyGenerator = cached?.isExperimental === false;

        response = await AtprotoService.getFeed(
          cursor,
          feedLink,
          {},
          !isVideoOnlyGenerator, // Skip filtering if video-only generator
          limit,
          'custom'
        );
      }

      return response || { feed: [], cursor: null };
    } catch (error) {
      logger.error('Failed to fetch feed', error, {
        component: 'FeedService',
        feedOption,
        userDid,
      });
      return { feed: [], cursor: null };
    }
  }

  // Removed custom infinite scroll - using FlashList's onEndReached instead

  // Query configuration helper (hooks must be called in useFeed hook, not here)
  // This method is kept for backwards compatibility but should not use hooks
  createInfiniteQuery(_feedOption: FeedOption, _userDid?: string, _queryOptions: any = {}) {
    throw new Error(
      'createInfiniteQuery should not be called directly. Use the useFeed hook instead.'
    );
  }

  // Search results state management (only used for search feeds)
  setCurrentFeed = searchFeedState.setSearchResults.bind(searchFeedState);
  getCurrentFeed = searchFeedState.getSearchResults.bind(searchFeedState);
  clearCurrentFeed = searchFeedState.clearSearchResults.bind(searchFeedState);
}

// Export singleton instance
export const feedService = new FeedService();
export default feedService;
export { FEED_CONFIG };
