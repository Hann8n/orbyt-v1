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
  ExtendedPostView,
  FeedResponse,
  ProfileViewBasic,
  GeneratorView,
} from './api/types';
import { isOrbytChannel, channelToHashtag, getChannelByUri } from '../utils/channels/orbyt';
import type { FeedOption } from '../types';
import { seenVideoService } from './SeenVideoService';
import { AtprotoFeedService } from './api/feed/FeedService';
import { BookmarkService } from './api/bookmark/BookmarkService';
import { ActorService } from './api/actor/ActorService';
import { AppBskyFeedDefs } from '@atproto/api';
import { useUserStore } from '../stores/userStore';
import { isValidAtUri } from '../utils/atproto/uriValidation';

// Re-export API types for convenience
export type { ExtendedFeedViewPost as FeedItem } from './api/types';

// API Response type matching AtprotoService return types
type APIResponse = FeedResponse;

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
  maxPostsPerFetch: QUERY_CONSTANTS.FEED_PAGE_DEFAULT,
  maxSubscribedChannels: 50,
  defaultLimit: QUERY_CONSTANTS.FEED_PAGE_DEFAULT,
  staleTime: QUERY_CONSTANTS.STALE_TIME_LONG, // 10 minutes - for slowly changing data
  cacheTime: 60 * 60 * 1000, // 60 minutes - increased to reduce unnecessary refetching
} as const;

// Search results state — module-level, no class boilerplate
let searchResults: ExtendedFeedViewPost[] = [];

function setSearchResults(feed: ExtendedFeedViewPost[]) {
  searchResults = feed;
}

function getSearchResults(): ExtendedFeedViewPost[] {
  return searchResults;
}

function clearSearchResults() {
  searchResults = [];
}

// Core feed fetching logic
class FeedService {
  /**
   * Get feed sources for "your-mix" feed
   * Pre-computed to avoid dynamic imports during fetch
   */
  private getYourMixSources(): FeedSource[] {
    const { subscribedChannels, algorithmicFeedProvider } = useUserStore.getState();
    const feedSources: FeedSource[] = [];

    // Add algorithmic feed provider if set
    if (algorithmicFeedProvider) {
      feedSources.push({
        uri: algorithmicFeedProvider,
        type: 'algorithmic',
      });
    }

    // Add channel feeds
    if (subscribedChannels && subscribedChannels.length > 0) {
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
        } else if (isOrbytChannel(channel.uri)) {
          // Orbyt channels - convert postable ones to hashtag
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
        } else if (isValidAtUri(channel.uri)) {
          // Regular feed generator URI
          const orbytChannel = getChannelByUri(channel.uri);
          if (orbytChannel && orbytChannel.isPostable !== false) {
            // Postable orbyt channel - try to convert to hashtag
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
          // Non-postable or non-orbyt - use as feed generator
          feedSources.push({
            uri: channel.uri,
            type: 'feed',
          });
        }
      }
    }

    return feedSources;
  }

  /**
   * Fetch from a single feed source
   * React Query handles retries - no timeout needed
   */
  private async fetchFromSource(
    source: FeedSource,
    cursor: string | null,
    limit: number
  ): Promise<FeedFetchResult> {
    try {
      if (source.type === 'hashtag') {
        const response = await AtprotoFeedService.searchHashtagVideosPaginated(
          source.hashtag!,
          cursor,
          limit,
          source.sort || 'latest'
        );
        return {
          feed: response.videos,
          cursor: response.cursor,
          sourceUri: source.uri,
          success: true,
        };
      } else if (source.type === 'algorithmic') {
        const response = await AtprotoFeedService.getFeed(
          cursor,
          source.uri,

          false, // Algorithmic feeds already return video-only content
          limit,
          'custom'
        );
        return {
          feed: response.feed,
          cursor: response.cursor,
          sourceUri: source.uri,
          success: true,
        };
      } else {
        const response = await AtprotoFeedService.getFeed(
          cursor,
          source.uri,

          true, // Filter videos for regular feed generators
          limit,
          'custom'
        );
        return {
          feed: response.feed,
          cursor: response.cursor,
          sourceUri: source.uri,
          success: true,
        };
      }
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
   * Normalize feed option for API calls - convert local orbyt channel URIs to hashtag format
   * Skips channels that should remain as feed generators (e.g., "latest" aggregates multiple hashtags)
   * This normalization is only used when making API calls, not for caching or routing
   */
  private normalizeFeedOptionForAPI(feedOption: FeedOption): FeedOption {
    // If it's already a hashtag or not an orbyt channel URI, return as-is
    if (feedOption.startsWith('hashtag:') || !isValidAtUri(feedOption)) {
      return feedOption;
    }

    // Convert local orbyt channel URIs (at://local.orbyt.channel/{slug}) to hashtag format
    // Skip channels that aren't postable (like "latest" and "popular-now") - they should use feed generators
    if (isOrbytChannel(feedOption)) {
      const channel = getChannelByUri(feedOption);
      // Keep feed generators for non-postable channels (they aggregate multiple hashtags or have special logic)
      if (channel?.isPostable === false) {
        return feedOption; // Don't normalize - keep as feed generator
      }

      // Convert postable orbyt channels to hashtag format for API calls.
      const hashtagOption = channelToHashtag(feedOption);
      return hashtagOption || feedOption;
    }

    return feedOption;
  }

  private getFeedLink(feedOption: FeedOption): string | null {
    if (isValidAtUri(feedOption)) {
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

      // Normalize feed option only for API calls (converts local URIs to hashtags)
      const feedOptionForAPI = this.normalizeFeedOptionForAPI(feedOption);

      // Handle different feed types (using normalized feed option for API calls)
      if (feedOptionForAPI === 'likes' && userDid) {
        return await AtprotoFeedService.getFeed(
          cursor ?? null,
          userDid ?? null,

          true,
          limit,
          'likes'
        );
      } else if (feedOptionForAPI === 'reposts' && userDid) {
        return await AtprotoFeedService.getRepostedVideos(userDid, cursor ?? null, limit);
      } else if (feedOptionForAPI === 'profile' && userDid) {
        return await AtprotoFeedService.getFeed(
          cursor ?? null,
          userDid ?? null,

          true,
          limit,
          'authorVideos'
        );
      } else if (feedOptionForAPI === 'profile' && !userDid) {
        return { feed: [], cursor: null };
      } else if (feedOptionForAPI === 'likes' && !userDid) {
        return { feed: [], cursor: null };
      } else if (feedOptionForAPI === 'reposts' && !userDid) {
        return { feed: [], cursor: null };
      } else if (feedOptionForAPI === 'bookmarks' && userDid) {
        const bookmarksResponse = await BookmarkService.getBookmarks(cursor || undefined, limit);
        // Transform bookmarks to feed items
        const feed = bookmarksResponse.bookmarks.map((bookmark: ExtendedPostView) => ({
          post: bookmark,
          uniqueKey: bookmark.uri,
        }));
        const moderatedFeed = await AtprotoFeedService.applyModerationBatch(feed);
        return { feed: moderatedFeed, cursor: bookmarksResponse.cursor };
      } else if (feedOptionForAPI === 'bookmarks' && !userDid) {
        return { feed: [], cursor: null };
      } else if (feedOptionForAPI === 'following') {
        const feedLink = this.getFeedLink(feedOptionForAPI);
        if (!feedLink) {
          return { feed: [], cursor: null };
        }
        return await AtprotoFeedService.getFeed(
          cursor ?? null,
          feedLink,

          false,
          limit,
          'custom'
        );
      } else if (feedOptionForAPI === 'your-mix') {
        const feedSources = this.getYourMixSources();

        if (feedSources.length === 0) {
          return { feed: [], cursor: null };
        }

        const currentUserDid = useUserStore.getState().currentUser?.did ?? null;

        // First page: fetch only the algo source (or first source) for fast initial load.
        // Subsequent pages use the full mixing loop below.
        if (!cursor) {
          const bootSource = feedSources.find(s => s.type === 'algorithmic') ?? feedSources[0];
          const bootIndex = feedSources.indexOf(bootSource);
          const result = await this.fetchFromSource(bootSource, null, limit);
          const filtered = seenVideoService.filterSeen(result.feed, currentUserDid).slice(0, limit);

          let nextCursor: string | null = null;
          if (result.cursor) {
            nextCursor = JSON.stringify({ index: bootIndex, cursor: result.cursor });
          } else if (bootIndex + 1 < feedSources.length) {
            nextCursor = JSON.stringify({ index: bootIndex + 1, cursor: null });
          }

          return { feed: filtered, cursor: nextCursor };
        }

        // Parse cursor to get source index and cursor
        let sourceIndex = 0;
        let sourceCursor: string | null = null;
        try {
          const parsed = JSON.parse(cursor);
          if (typeof parsed === 'object' && parsed !== null) {
            sourceIndex = parsed.index ?? 0;
            sourceCursor = parsed.cursor ?? null;
          }
        } catch {
          // Invalid cursor, start fresh
        }

        const allPosts: ExtendedFeedViewPost[] = [];
        const seenUris = new Set<string>();
        let currentIndex = sourceIndex;
        let currentCursor = sourceCursor;

        while (allPosts.length < limit && currentIndex < feedSources.length) {
          const source = feedSources[currentIndex];
          const result = await this.fetchFromSource(source, currentCursor, limit);

          if (result.success) {
            for (const post of result.feed) {
              const uri = post.post?.uri;
              if (uri && !seenUris.has(uri)) {
                seenUris.add(uri);
                allPosts.push(post);
              }
            }
            currentCursor = result.cursor;
          } else {
            currentIndex++;
            currentCursor = null;
            continue;
          }

          if (!currentCursor) {
            currentIndex++;
            currentCursor = null;
          } else if (allPosts.length >= limit) {
            break;
          }
        }

        // Filter seen videos
        const filteredPosts = seenVideoService.filterSeen(allPosts, currentUserDid);

        // Sort chronologically by indexedAt (newest first)
        filteredPosts.sort((a, b) => {
          const aTime = new Date(a?.post?.indexedAt || 0).getTime();
          const bTime = new Date(b?.post?.indexedAt || 0).getTime();
          return bTime - aTime;
        });

        // Apply limit
        const limitedPosts = filteredPosts.slice(0, limit);

        // Create cursor for next fetch
        const newCursor =
          currentIndex < feedSources.length
            ? JSON.stringify({ index: currentIndex, cursor: currentCursor })
            : null;

        return { feed: limitedPosts, cursor: newCursor };
      } else if (feedOptionForAPI.startsWith('search:')) {
        const searchQuery = feedOptionForAPI.substring(7);
        if (!searchQuery || searchQuery.trim() === '') {
          return { feed: [], cursor: null };
        }

        try {
          const [profilesResponse, channelsResponse] = await Promise.all([
            ActorService.searchProfilesPaginated(
              searchQuery,
              cursor as string | null,
              FEED_CONFIG.maxPostsPerFetch
            ),
            AtprotoFeedService.searchPopularFeeds(searchQuery, 15),
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
                contentMode: channel.contentMode,
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
        // Hashtag feeds (normalized local orbyt channels use this format: hashtag:orbyt-channel-{slug})
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
          const response = await AtprotoFeedService.searchHashtagVideosPaginated(
            hashtag,
            (cursor as string | null) ?? null,
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
          feed: getSearchResults(),
          cursor: null,
        };
      } else if (feedOptionForAPI === 'watched') {
        if (!userDid) return { feed: [], cursor: null };
        const seenVideos = seenVideoService.getSeenVideos(userDid);
        const pageSize = 25;
        const startIndex = cursor != null ? parseInt(cursor, 10) : 0;
        if (isNaN(startIndex) || startIndex < 0 || startIndex >= seenVideos.length) {
          return { feed: [], cursor: null };
        }
        const urisToFetch = seenVideos.slice(startIndex, startIndex + pageSize).map(v => v.uri);
        if (urisToFetch.length === 0) return { feed: [], cursor: null };
        const postsMap = await AtprotoFeedService.getPosts(urisToFetch);
        const validPosts: ExtendedFeedViewPost[] = [];
        for (const uri of urisToFetch) {
          const post = postsMap.get(uri);
          if (
            post &&
            typeof post === 'object' &&
            !AppBskyFeedDefs.isNotFoundPost(post) &&
            !AppBskyFeedDefs.isBlockedPost(post)
          ) {
            validPosts.push({ post } as ExtendedFeedViewPost);
          }
        }
        const feed = await AtprotoFeedService.applyModerationBatch(validPosts);
        const nextIndex = startIndex + pageSize;
        const nextCursor = nextIndex < seenVideos.length ? String(nextIndex) : null;
        return { feed, cursor: nextCursor };
      } else {
        // Handle custom feed URIs (external feed generators and non-postable orbyt channels)
        // Use original feedOption for feed generator URIs, not the normalized one
        const feedLink = isValidAtUri(feedOption) ? feedOption : this.getFeedLink(feedOptionForAPI);
        if (!feedLink) {
          return { feed: [], cursor: null };
        }

        // For reposts and likes feeds, we always apply filtering
        // Other feeds may skip filtering if they're video-only generators
        const shouldFilter = feedOptionForAPI === 'reposts' || feedOptionForAPI === 'likes';

        return await AtprotoFeedService.getFeed(
          cursor ?? null,
          feedLink,

          shouldFilter,
          limit,
          'custom'
        );
      }
    } catch (error) {
      logger.error('Failed to fetch feed', error, {
        component: 'FeedService',
        feedOption,
        userDid,
      });
      return { feed: [], cursor: null };
    }
  }

  setCurrentFeed = setSearchResults;
  getCurrentFeed = getSearchResults;
  clearCurrentFeed = clearSearchResults;
}

// Export singleton instance
export const feedService = new FeedService();
