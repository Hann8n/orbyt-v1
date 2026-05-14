/**
 * Reads: app.bsky.feed.getFeed, getAuthorFeed, searchPosts, getPosts, generators, mixed feed.
 */
import { moderatePost } from '@atproto/api';
import { ModerationService } from '../../moderation/ModerationService';
import { AtprotoCore } from '../core';
import type {
  FeedResponse,
  FeedType,
  AuthorFilter,
  ExtendedFeedViewPost,
  ExtendedPostView,
  FeedViewPost,
  PostView,
  NotFoundPost,
  BlockedPost,
  PostRecord,
  FeedGeneratorOutput,
  VideoSearchResponse,
  GetAuthorFeedOutput,
  RawFeedApiOutput,
  GeneratorView,
} from '../types';
import { isVideoEmbed, isVideoEmbedInMedia } from '../types';
import i18n from '../../../i18n';
import { QUERY_CONSTANTS } from '../../../utils/constants';
import { logger } from '../../../utils/logger';
import { hydrateOrbytChannels } from '../../OrbytChannelsService';

/**
 * Get feed content - optimized for video-only feeds with maximum batch loading
 * Uses @atproto/api directly - React Query handles retries
 *
 * @param cursor - Pagination cursor
 * @param feedLink - Link to the feed
 * @param filterVideosOnly - Whether to filter only video posts at API level
 * @param limit - Number of posts to fetch
 * @param feedType - Type of feed (author, likes, custom)
 * @returns Promise with feed data
 */
export async function getFeed(
  cursor: string | null = null,
  feedLink: string | null = null,
  filterVideosOnly: boolean = true,
  limit: number = QUERY_CONSTANTS.FEED_PAGE_MAX_SINGLE,
  feedType?: FeedType
): Promise<FeedResponse> {
  if (!AtprotoCore.isIncomingApiEnabled()) {
    return { feed: [], cursor: null };
  }

  try {
    const { api } = await AtprotoCore.getApiClient();

    let responseData: RawFeedApiOutput;

    // Unified feed handling based on feedType
    if (feedType === 'author' || feedType === 'authorVideos') {
      // Author feed - use author filter
      const authorFilter = feedType === 'authorVideos' ? 'posts_with_video' : 'posts_with_media';
      try {
        const params = {
          actor: feedLink || '',
          limit: limit,
          cursor: cursor || undefined,
          filter: authorFilter as AuthorFilter,
        };

        const apiResponse = await api.app.bsky.feed.getAuthorFeed(params);
        responseData = apiResponse.data;
      } catch (authorError: unknown) {
        // Handle blocked actor gracefully - this is expected behavior, not an error
        if (
          authorError &&
          typeof authorError === 'object' &&
          'name' in authorError &&
          (authorError.name === 'BlockedActorError' ||
            (typeof authorError === 'object' &&
              'message' in authorError &&
              typeof authorError.message === 'string' &&
              authorError.message.includes('blocked actor')))
        ) {
          // Silently return empty feed for blocked actors
          return { feed: [], cursor: null };
        }
        return { feed: [], cursor: null };
      }
    } else if (feedType === 'likes') {
      // Liked posts feed
      try {
        const params = {
          actor: feedLink || '',
          limit: limit,
          cursor: cursor || undefined,
        };

        const apiResponse = await api.app.bsky.feed.getActorLikes(params);
        responseData = apiResponse.data;
      } catch (_likesError: unknown) {
        return { feed: [], cursor: null };
      }
    } else {
      // Custom feed handling
      let feed = feedLink || '';

      // Validate feed URI format before making the request
      if (!feed) {
        return { feed: [], cursor: null };
      }

      // Validate AT-URI format
      if (!feed.startsWith('at://') && !feed.startsWith('did:')) {
        return { feed: [], cursor: null };
      }

      const params = {
        feed,
        limit: limit,
        cursor: cursor || undefined,
      };

      // Bluesky recommends Accept-Language for feed generators to prefer posts in user's language
      const lang = i18n.language?.replace(/-.+$/, '') || 'en';
      const acceptLang = lang === 'en' ? 'en' : `${lang},en`;
      const opts = { headers: { 'Accept-Language': acceptLang } as Record<string, string> };

      try {
        const apiResponse = await api.app.bsky.feed.getFeed(params, opts);
        responseData = apiResponse.data;
      } catch (customFeedError: unknown) {
        if (
          customFeedError instanceof Error &&
          customFeedError.message.includes('feed must be a valid at-uri')
        ) {
          return { feed: [], cursor: null };
        }
        return { feed: [], cursor: null };
      }
    }

    // Ensure the response has the expected data structure
    if (!responseData || !responseData.feed) {
      return { feed: [], cursor: null };
    }

    let feedData: ExtendedFeedViewPost[] = responseData.feed.map((post: FeedViewPost) => ({
      ...post,
      feedContext: post.feedContext, // Preserve feedContext from feed generator
      reqId: post.reqId, // Preserve reqId from feed generator
      post: {
        ...post.post,
      } as ExtendedPostView,
    }));

    // Filter for video posts at API level if requested
    // Skip filtering if:
    // 1. filterVideosOnly is false
    // 2. feedType is 'authorVideos' (API already filters with 'posts_with_video')
    const shouldFilter = filterVideosOnly && feedType !== 'authorVideos';

    if (shouldFilter) {
      feedData = feedData.filter(post => {
        const embed = post.post.embed;
        if (!embed) {
          return false;
        }

        // Only include posts with video embeds
        return isVideoEmbed(embed) || isVideoEmbedInMedia(embed);
      });
    }

    feedData = await applyModerationBatch(feedData);

    return { feed: feedData, cursor: responseData.cursor ?? null };
  } catch (_error: unknown) {
    return { feed: [], cursor: null };
  }
}

/**
 * Efficiently filter posts for video content - simplified and optimized
 */
function filterVideoPostsEfficiently(posts: FeedViewPost[]): ExtendedFeedViewPost[] {
  const videoPosts: ExtendedFeedViewPost[] = [];

  for (const item of posts) {
    const embed = item?.post?.embed;
    if (!embed) continue;

    // Only include posts where embed is of type 'app.bsky.embed.video' or 'app.bsky.embed.video#view'
    const hasVideo = isVideoEmbed(embed) || isVideoEmbedInMedia(embed);

    if (hasVideo) {
      // Create extended post with repost information
      const reason = item.reason;
      const repostedBy =
        reason?.$type === 'app.bsky.feed.defs#reasonRepost' && 'by' in reason && reason.by
          ? {
              avatar: reason.by.avatar,
              displayName: reason.by.displayName,
              handle: reason.by.handle,
            }
          : undefined;

      const extendedPost: ExtendedFeedViewPost = {
        ...item,
        post: {
          ...item.post,
          repostedBy,
        } as ExtendedPostView,
        uniqueKey: `${item.post.uri}_${videoPosts.length}`,
      };

      videoPosts.push(extendedPost);
    }
  }

  return videoPosts;
}

/**
 * Apply moderation batch to items with a post. Single place for moderatePost + ui(context).
 * No network: uses labels already on post and getModerationOpts from store.
 * Excludes items where mod.ui('contentList').filter is true (e.g. NSFW with "hide") so
 * they never reach list, grid, or spotlight — sorted out on load as content is received.
 * When opts is null (prefs not yet loaded), passes items through unchanged so feeds
 * are never empty; downstream treats missing contentListUI/contentMediaUI as no blur/filter.
 */
export async function applyModerationBatch<T extends { post: PostView }>(items: T[]): Promise<T[]> {
  if (items.length === 0) return items;
  const userDid = AtprotoCore.getCurrentUserDid();
  const opts = ModerationService.getModerationOpts(userDid ?? undefined);
  if (!opts) return items;
  const mapped = items.map(item => {
    const mod = moderatePost(item.post, opts);
    return {
      ...item,
      contentListUI: mod.ui('contentList'),
      contentMediaUI: mod.ui('contentMedia'),
      avatarUI: mod.ui('avatar'),
      shouldFilter: mod.ui('contentList').filter,
    };
  }) as (T & { shouldFilter?: boolean })[];
  // Exclude items that should be hidden (e.g. NSFW with "hide") — never render, never blur
  return mapped.filter(i => !i.shouldFilter) as T[];
}

/**
 * Get a single post by URI (uses getPosts — lighter than getPostThread for depth-0 lookups).
 * @param uri - Post URI
 * @returns Post view or null (not-found / blocked / missing entries return null, same as thread-only path)
 */
export async function getPost(uri: string): Promise<PostView | null> {
  const trimmed = typeof uri === 'string' ? uri.trim() : '';
  if (!trimmed) return null;
  try {
    const map = await getPosts([trimmed]);
    const entry = map.get(trimmed);
    if (!entry) return null;
    const entryType = (entry as { $type?: string }).$type;
    if (
      entryType === 'app.bsky.feed.defs#notFoundPost' ||
      entryType === 'app.bsky.feed.defs#blockedPost'
    )
      return null;
    return entry as PostView;
  } catch (_error: unknown) {
    return null;
  }
}

/**
 * Batch fetch multiple posts by URI
 * Uses app.bsky.feed.getPosts which accepts up to 25 URIs at once
 * @param uris - Array of post URIs to fetch
 * @returns Map of URI to post data (includes NotFoundPost and BlockedPost objects)
 */
export async function getPosts(
  uris: string[]
): Promise<Map<string, PostView | NotFoundPost | BlockedPost>> {
  const result = new Map<string, PostView | NotFoundPost | BlockedPost>();
  if (!uris.length) return result;

  try {
    const { api } = await AtprotoCore.getApiClient();

    // API accepts max 25 URIs per request
    const BATCH_SIZE = 25;
    const batches: string[][] = [];
    for (let i = 0; i < uris.length; i += BATCH_SIZE) {
      batches.push(uris.slice(i, i + BATCH_SIZE));
    }

    // Fetch all batches in parallel
    const responses = await Promise.all(
      batches.map(batch =>
        api.app.bsky.feed.getPosts({ uris: batch }).catch(() => ({ data: { posts: [] } }))
      )
    );

    // Collect all posts into the map (including NotFoundPost and BlockedPost)
    for (const response of responses) {
      for (const post of response.data.posts) {
        result.set(post.uri, post);
      }
    }
  } catch (_error: unknown) {
    // ignore errors
  }

  return result;
}

export async function getFeedGenerator(uri: string): Promise<FeedGeneratorOutput | null> {
  try {
    // Validate URI format
    if (!uri || !uri.startsWith('at://')) {
      return null;
    }

    const params = { feed: uri };

    const { api } = await AtprotoCore.getApiClient();
    const response = await api.app.bsky.feed.getFeedGenerator(params);

    return response.data as FeedGeneratorOutput;
  } catch (_error: unknown) {
    // Ignore invalid feed URI errors
    return null;
  }
}

/**
 * Get subscriber count for a feed generator
 * @param uri - Feed generator URI
 * @returns Subscriber count (number of likes on the feed generator post)
 */
export async function getFeedGeneratorSubscriberCount(uri: string): Promise<number> {
  try {
    // Validate URI format
    if (!uri || !uri.startsWith('at://') || !uri.includes('/app.bsky.feed.generator/')) {
      return 0;
    }

    // Get the feed generator details first
    const params = { feed: uri };

    const { api } = await AtprotoCore.getApiClient();
    const generatorResponse = await api.app.bsky.feed.getFeedGenerator(params);

    if (!generatorResponse.data?.view?.likeCount) {
      return 0;
    }

    return generatorResponse.data.view.likeCount;
  } catch (_error: unknown) {
    return 0;
  }
}

/**
 * Search for video posts with hashtag support
 * @param hashtag - Hashtag to search for (without #)
 * @param cursor - Pagination cursor
 * @param limit - Number of results per page
 * @param sort - Sort order: 'top' for popular posts, 'latest' for most recent (default: 'latest')
 * @returns Array of video post results and next cursor
 */
export async function searchHashtagVideosPaginated(
  hashtag: string,
  cursor: string | null = null,
  limit: number = 20,
  sort: 'top' | 'latest' = 'latest'
): Promise<VideoSearchResponse> {
  try {
    // Search for posts with hashtag (include # in search query)
    const searchQuery = `#${hashtag}`;
    const { api } = await AtprotoCore.getApiClient();

    // Build search params - only include sort if it's 'top'
    const params: { q: string; limit: number; cursor?: string; sort?: 'top' | 'latest' } = {
      q: searchQuery,
      limit,
    };
    if (cursor) {
      params.cursor = cursor;
    }
    if (sort === 'top') {
      params.sort = 'top';
    }

    const response = await api.app.bsky.feed.searchPosts(params);

    const posts = response?.data?.posts || [];

    // Filter for video posts only and normalize structure
    const videoPosts = posts.filter((post: PostView) => {
      const embed = post.embed;
      if (!embed) return false;

      // Check for video embeds
      return isVideoEmbed(embed) || isVideoEmbedInMedia(embed);
    });

    // Normalize video structure for UI consumption
    const videos: ExtendedFeedViewPost[] = videoPosts.map((post: PostView) => ({
      post: {
        ...post,
      } as ExtendedPostView,
      uniqueKey: post.uri,
    }));

    const moderated = await applyModerationBatch(videos);

    return {
      videos: moderated,
      cursor: response?.data?.cursor ?? null,
    };
  } catch (_error: unknown) {
    return { videos: [], cursor: null };
  }
}

/**
 * Search for hashtag suggestions by scraping hashtags from post search results.
 *
 * NOTE: Bluesky has no native hashtag suggestions API. This works by calling
 * `searchPosts` with `#<query>` and extracting hashtags from matching post text.
 * As a result it is relatively slow and results depend on Bluesky's full-text
 * ranking rather than hashtag popularity. Callers should gate requests to a
 * minimum query length (≥ 3 chars) and cache results aggressively.
 *
 * @param query - Partial hashtag text (without #). Must be at least 1 char.
 * @param limit - Maximum number of suggestions to return (default 10).
 * @returns Array of unique lowercase hashtag strings.
 */
export async function searchHashtagSuggestions(
  query: string = '',
  limit: number = 10
): Promise<string[]> {
  // Require at least one character — empty-query searches are expensive and return noise.
  if (!query.trim()) return [];

  try {
    const { api } = await AtprotoCore.getApiClient();

    const searchQuery = `#${query}`;

    const response = await api.app.bsky.feed.searchPosts({
      q: searchQuery,
      limit: 50, // Get more posts to extract more hashtags
    });

    const posts = response?.data?.posts || [];
    const hashtagSet = new Set<string>();

    // Extract hashtags from post text
    for (const post of posts) {
      const text = (post.record as PostRecord)?.text || '';

      // Extract hashtags from text
      const hashtagRegex = /#([\w]+)/g;
      let match;
      while ((match = hashtagRegex.exec(text)) !== null) {
        const tag = match[1].toLowerCase();
        // Filter by query if provided
        if (!query || tag.startsWith(query.toLowerCase())) {
          hashtagSet.add(tag);
          if (hashtagSet.size >= limit) break;
        }
      }
      if (hashtagSet.size >= limit) break;
    }

    return Array.from(hashtagSet).slice(0, limit);
  } catch (_error: unknown) {
    return [];
  }
}

/**
 * Search for video posts with query support
 * @param query - Search query
 * @param cursor - Pagination cursor
 * @param limit - Number of results per page
 * @returns Array of video post results and next cursor
 */
export async function searchVideosPaginated(
  query: string,
  cursor: string | null = null,
  limit: number = 20
): Promise<VideoSearchResponse> {
  try {
    // Use search posts endpoint for query-based search
    if (!query || !query.trim()) {
      // Return empty results when no query is provided
      return { videos: [], cursor: null };
    }

    // Search for posts with the query
    const { api } = await AtprotoCore.getApiClient();
    const params: { q: string; limit: number; cursor?: string } = {
      q: query,
      limit,
    };
    if (cursor) {
      params.cursor = cursor;
    }
    const response = await api.app.bsky.feed.searchPosts(params);

    const posts = response?.data?.posts || [];

    // Filter for video posts only
    const videoPosts = posts.filter((post: PostView) => {
      const embed = post.embed;
      if (!embed) return false;
      return isVideoEmbed(embed) || isVideoEmbedInMedia(embed);
    });

    // Normalize video structure for UI consumption
    const videos: ExtendedFeedViewPost[] = videoPosts.map((post: PostView) => ({
      post: {
        ...post,
      } as ExtendedPostView,
      uniqueKey: post.uri,
    }));

    const moderated = await applyModerationBatch(videos);

    return {
      videos: moderated,
      cursor: response?.data?.cursor ?? null,
    };
  } catch (_error) {
    return { videos: [], cursor: null };
  }
}

/**
 * Aggressively fetch an actor's reposted videos by paging raw author feed data
 * and filtering client-side for reposts that contain video embeds.
 * This avoids server-side author filters that exclude reposts.
 */
export async function getRepostedVideos(
  actor: string,
  cursor: string | null = null,
  limit: number = 50
): Promise<FeedResponse> {
  try {
    const collected: ExtendedFeedViewPost[] = [];
    let nextCursor: string | null = cursor || null;
    let safetyCounter = 0;

    // Aggressively page until we have enough items or run out
    while (collected.length < limit && safetyCounter < 10) {
      safetyCounter++;

      const params: { actor: string; limit: number; cursor?: string; filter: AuthorFilter } = {
        actor,
        limit: Math.min(100, Math.max(limit, 50)),
        ...(nextCursor ? { cursor: nextCursor } : {}),
        // Use a posts-only filter that still includes reposts; do not use media/video filters
        filter: 'posts_no_replies' as AuthorFilter,
      };

      let response: { data?: GetAuthorFeedOutput };
      try {
        const { api } = await AtprotoCore.getApiClient();
        response = await api.app.bsky.feed.getAuthorFeed(params);
      } catch (_err: unknown) {
        break;
      }

      const feedChunk: ExtendedFeedViewPost[] = (response?.data?.feed ||
        []) as ExtendedFeedViewPost[];
      if (feedChunk.length === 0) {
        nextCursor = null;
        break;
      }

      // Keep only items that are reposts
      const reposts = feedChunk.filter(
        (item: ExtendedFeedViewPost) =>
          item?.reason?.$type && String(item.reason.$type).includes('reasonRepost')
      );

      // Within reposts, keep only those that contain video embeds using our efficient filter
      const videoReposts = filterVideoPostsEfficiently(reposts);

      collected.push(...videoReposts);

      nextCursor = response?.data?.cursor || null;
      if (!nextCursor) break;
    }

    let feedData = collected.slice(0, limit);

    // Basic structural filter (uri, cid, author)
    if (feedData.length > 0) {
      feedData = feedData.filter(item => {
        const post = item?.post;
        if (!post) return false;
        if (!post.uri || !post.cid || !post.author) return false;
        return true;
      });
    }

    feedData = await applyModerationBatch(feedData);

    return { feed: feedData, cursor: nextCursor };
  } catch (_error: unknown) {
    return { feed: [], cursor: null };
  }
}

/**
 * Search for popular feed generators (channels) with query support
 * @param query - Search query
 * @param limit - Number of results to return
 * @returns Array of feed generator objects
 */
export async function searchPopularFeeds(
  query: string,
  limit: number = 5
): Promise<GeneratorView[]> {
  try {
    const params = { limit: limit, query: query };

    const { api } = await AtprotoCore.getApiClient();
    const response = await api.app.bsky.unspecced.getPopularFeedGenerators(params);

    const allFeeds = response.data.feeds || [];

    // Extract contentMode and filter to only include video-only feeds in a single pass
    const processedFeeds: (GeneratorView & { contentMode?: string })[] = [];

    for (const feed of allFeeds) {
      const contentMode =
        (feed as unknown as { contentMode?: string; view?: { contentMode?: string } })
          .contentMode ||
        (feed as unknown as { contentMode?: string; view?: { contentMode?: string } }).view
          ?.contentMode;

      // Only process and include video-only feeds
      if (contentMode === 'app.bsky.feed.defs#contentModeVideo') {
        processedFeeds.push({
          ...feed,
          contentMode, // Preserve contentMode at top level for easy access
        } as GeneratorView & { contentMode?: string });
      }
    }

    return processedFeeds;
  } catch (_error: unknown) {
    return [];
  }
}

/**
 * Get suggested feed generators (channels) without search query
 * @param limit - Number of results to return
 * @returns Array of feed generator objects
 */
export async function getSuggestedFeeds(limit: number = 10): Promise<GeneratorView[]> {
  try {
    const params = { limit: limit };

    const { api } = await AtprotoCore.getApiClient();
    const response = await api.app.bsky.unspecced.getPopularFeedGenerators(params);

    const allFeeds = response.data.feeds || [];

    // Extract contentMode and filter to only include video-only feeds in a single pass
    const processedFeeds: (GeneratorView & { contentMode?: string })[] = [];

    for (const feed of allFeeds) {
      const contentMode =
        (feed as unknown as { contentMode?: string; view?: { contentMode?: string } })
          .contentMode ||
        (feed as unknown as { contentMode?: string; view?: { contentMode?: string } }).view
          ?.contentMode;

      // Only process and include video-only feeds
      if (contentMode === 'app.bsky.feed.defs#contentModeVideo') {
        processedFeeds.push({
          ...feed,
          contentMode, // Preserve contentMode at top level for easy access
        } as GeneratorView & { contentMode?: string });
      }
    }

    return processedFeeds;
  } catch (_error: unknown) {
    return [];
  }
}

/**
 * Get static channels (feed generators)
 * @param limit - Number of channels to return
 * @returns Array of feed generator objects
 */
export async function getStaticChannels(
  limit: number = 10
): Promise<(GeneratorView & { contentMode?: string })[]> {
  try {
    const remoteChannels = await hydrateOrbytChannels();
    const channelUris = remoteChannels.map(channel => channel.uri);

    if (!channelUris || channelUris.length === 0) {
      return [];
    }

    const { api } = await AtprotoCore.getApiClient();
    const response = await api.app.bsky.feed.getFeedGenerators({ feeds: channelUris });
    const feedGenerators = response.data.feeds ?? [];

    if (channelUris.length > 0 && feedGenerators.length === 0) {
      logger.warn('getStaticChannels: no feed generators returned for remote channel URIs', {
        component: 'feedQueries',
        uriCount: channelUris.length,
      });
    }

    return feedGenerators.slice(0, limit);
  } catch (_error: unknown) {
    return [];
  }
}
