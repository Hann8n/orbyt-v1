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
import { channelToFeedOption } from '../utils/channels/orbyt';
import { parseCommunityFeedOption } from './orbyt/communities';
import { getOrbytProviders } from './orbyt/serviceInfo';
import {
  decodeYourMixCursor,
  nextYourMixCursor,
  type YourMixPosition,
} from './orbyt/yourMixCursor';
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
   * Your Mix, as Orbyt iOS and Byte serve it (orbyt-platform
   * `packages/contracts/src/your-mix.ts`): the discovery generator, then
   * Bluesky's top videos, in turn, so it never ends.
   */
  private async fetchYourMix(cursor: string | null, limit: number): Promise<APIResponse> {
    const { discoveryFeed } = await getOrbytProviders();
    const currentUserDid = useUserStore.getState().currentUser?.did ?? null;
    // With no generator configured, the network run is the whole mix.
    const resolve = (position: YourMixPosition): YourMixPosition =>
      !discoveryFeed && position.source === 'discovery'
        ? { source: 'network', cursor: null }
        : position;

    let position = resolve(decodeYourMixCursor(cursor));
    // Each source is tried at most once per page, so two empty sources end
    // the feed instead of paging empty results forever.
    for (let attempt = 0; attempt < 2; attempt++) {
      let page: APIResponse = { feed: [], cursor: null };
      try {
        page =
          position.source === 'discovery' && discoveryFeed
            ? await AtprotoFeedService.getFeed(
                position.cursor,
                discoveryFeed,
                false, // The generator serves video only
                limit,
                'custom'
              )
            : await AtprotoFeedService.searchNetworkTopVideos(position.cursor, limit);
      } catch (error) {
        logger.warn('Your Mix source failed', { source: position.source, error });
      }
      const nextCursor = nextYourMixCursor(position, page.cursor);
      if (page.feed.length > 0) {
        return {
          feed: seenVideoService.filterSeen(page.feed, currentUserDid),
          cursor: nextCursor,
        };
      }
      position = resolve(decodeYourMixCursor(nextCursor));
    }
    return { feed: [], cursor: null };
  }

  /**
   * Normalize feed option for API calls - an Orbyt Community URI becomes
   * `community:<uri>`, served by the Orbyt AppView.
   * This normalization is only used when making API calls, not for caching or routing
   */
  private normalizeFeedOptionForAPI(feedOption: FeedOption): FeedOption {
    if (!isValidAtUri(feedOption)) {
      return feedOption;
    }
    return channelToFeedOption(feedOption) || feedOption;
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
        // `searchPostsV2` selects followed accounts' videos server-side, as Orbyt
        // iOS and Byte do, replacing the third-party Tube generator.
        return await AtprotoFeedService.getFollowingVideos(cursor ?? null, limit);
      } else if (feedOptionForAPI === 'your-mix') {
        return await this.fetchYourMix(cursor ?? null, limit);
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
      } else if (feedOptionForAPI.startsWith('community:')) {
        // Orbyt Community feeds: community:{at-uri} with optional :top / :latest
        const parsed = parseCommunityFeedOption(feedOptionForAPI);
        if (!parsed) {
          return { feed: [], cursor: null };
        }
        try {
          return await AtprotoFeedService.getCommunityVideoFeed(
            parsed.communityUri,
            cursor ?? null,
            FEED_CONFIG.maxPostsPerFetch,
            parsed.sort
          );
        } catch (error) {
          logger.error('Failed to fetch community feed', error, {
            component: 'FeedService',
            community: parsed.communityUri,
            sort: parsed.sort,
          });
          return { feed: [], cursor: null };
        }
      } else if (feedOptionForAPI.startsWith('hashtag:')) {
        // Hashtag feeds; may include sort parameter: hashtag:{tag}:top or hashtag:{tag}:latest
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
        // Handle custom feed URIs (external feed generators)
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
      // Surface the failure so React Query retries and the feed shows its error state.
      throw error;
    }
  }

  setCurrentFeed = setSearchResults;
  getCurrentFeed = getSearchResults;
  clearCurrentFeed = clearSearchResults;
}

// Export singleton instance
export const feedService = new FeedService();
