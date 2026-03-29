/**
 * AT Protocol feed API (`AtprotoFeedService`) — `app.bsky.feed.*` and related post/comment/search operations.
 * Distinct from `src/services/FeedService.ts`, which holds app-level feed state (bookmarks, seen videos).
 */

import { RichText, AtUri, moderatePost } from '@atproto/api';
import { BlobRef } from '@atproto/api';
import { ModerationService } from '../../moderation/ModerationService';
import { Platform } from 'react-native';
import { storage } from '../../../utils/storage/storage';
import { AtprotoCore } from '../core';
import { logger } from '../../../utils/logger';
import type {
  FeedResponse,
  FeedParams,
  FeedType,
  AuthorFilter,
  ExtendedFeedViewPost,
  ExtendedPostView,
  FeedViewPost,
  PostView,
  ThreadPost,
  NotFoundPost,
  BlockedPost,
  Comment,
  CommentsResponse,
  LikesResponse,
  Like,
  PostRecord,
  FeedGeneratorResponse,
  FeedGeneratorOutput,
  VideoSearchResponse,
  GetAuthorFeedOutput,
  RawFeedApiOutput,
  RepostView,
  GeneratorView,
  CreateRecordResponse,
  Interaction,
} from '../types';
import {
  isThreadViewPost,
  isNotFoundPost as checkIsNotFoundPost,
  isBlockedPost as checkIsBlockedPost,
  isVideoEmbed,
  isVideoEmbedInMedia,
} from '../types';
import { REQUESTMORE, REQUESTLESS } from '@atproto/api/dist/client/types/app/bsky/feed/defs';
import i18n from '../../../i18n';

/** Resolve remote or local thumb URL for external embed upload (protocol-relative → https, keep file://). */
function normalizeExternalEmbedThumbSource(raw: string | undefined): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const t = raw.trim();
  if (!t) return undefined;
  if (t.startsWith('file://')) return t;
  if (t.startsWith('https://') || t.startsWith('http://')) return t;
  if (t.startsWith('//')) return `https:${t}`;
  return undefined;
}

export class AtprotoFeedService {
  // Tracks whether app.bsky.feed.sendInteractions is supported by the current PDS/AppView
  // null = unknown (try once), true = supported, false = known unsupported (skip quietly)
  private static interactionsSupported: boolean | null = null;
  /**
   * Get feed content - optimized for video-only feeds with maximum batch loading
   * Uses @atproto/api directly - React Query handles retries
   *
   * @param cursor - Pagination cursor
   * @param feedLink - Link to the feed
   * @param _feedVariables - Additional parameters
   * @param filterVideosOnly - Whether to filter only video posts at API level
   * @param limit - Number of posts to fetch
   * @param feedType - Type of feed (author, likes, custom)
   * @returns Promise with feed data
   */
  static async getFeed(
    cursor: string | null = null,
    feedLink: string | null = null,
    _feedVariables: FeedParams = {},
    filterVideosOnly: boolean = true,
    limit: number = 100,
    feedType?: FeedType
  ): Promise<FeedResponse> {
    try {
      const apiClient = await AtprotoCore.getApiClient();

      // Handle case where no session is available
      if (!apiClient) {
        return { feed: [], cursor: null };
      }

      const { api } = apiClient;

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

        // Handle both ATProto URI format and direct URLs
        if (feed && feed.includes('/profile/')) {
          // Convert from URL format to AT protocol URI if needed
          const parts = feed.split('/profile/');
          if (parts.length > 1) {
            const didAndFeed = parts[1].split('/feed/');
            if (didAndFeed.length > 1) {
              feed = `at://did:plc:${didAndFeed[0]}/app.bsky.feed.generator/${didAndFeed[1]}`;
            }
          }
        }

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

      feedData = await this.applyModerationBatch(feedData);

      return { feed: feedData, cursor: responseData.cursor ?? null };
    } catch (_error: unknown) {
      return { feed: [], cursor: null };
    }
  }

  /**
   * Efficiently filter posts for video content - simplified and optimized
   */
  private static filterVideoPostsEfficiently(posts: FeedViewPost[]): ExtendedFeedViewPost[] {
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
  static async applyModerationBatch<T extends { post: PostView }>(items: T[]): Promise<T[]> {
    if (items.length === 0) return items;
    const userDid = await AtprotoCore.getCurrentUserDid();
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
   * Like a post and return the URI
   * @param uri - Post URI
   * @param cid - Post CID
   * @returns The URI of the created like
   */
  static async likePost(uri: string, cid: string): Promise<string> {
    const cacheKey = `like:${uri}:${cid}`;
    // Use dynamic import to avoid circular dependency
    const { AtprotoService } = await import('../AtprotoService');
    return AtprotoService.deduplicateRequest(cacheKey, async () => {
      const userDid = await AtprotoCore.getCurrentUserDid();
      if (!userDid) throw new Error('No authenticated user');

      const record = {
        $type: 'app.bsky.feed.like' as const,
        subject: { uri, cid },
        createdAt: new Date().toISOString(),
      };
      const { api } = await AtprotoCore.getApiClient();
      const response = await api.app.bsky.feed.like.create({ repo: userDid }, record);
      return response.uri;
    });
  }

  /**
   * Delete a like
   * @param likeUri - URI of the like to delete
   */
  static async deleteLike(likeUri: string): Promise<void> {
    await AtprotoCore.ensureSession();
    const { api } = await AtprotoCore.getApiClient();
    const parts = likeUri.split('/');
    const rkey = parts[parts.length - 1];
    await api.app.bsky.feed.like.delete({ repo: (await AtprotoCore.getCurrentUserDid())!, rkey });
  }

  /**
   * Repost a post and return the URI
   * @param uri - Post URI
   * @param cid - Post CID
   * @returns The URI of the created repost
   */
  static async repostPost(uri: string, cid: string): Promise<string> {
    const cacheKey = `repost:${uri}:${cid}`;
    // Use dynamic import to avoid circular dependency
    const { AtprotoService } = await import('../AtprotoService');
    return AtprotoService.deduplicateRequest(cacheKey, async () => {
      const userDid = await AtprotoCore.getCurrentUserDid();
      if (!userDid) throw new Error('No authenticated user');

      const record = {
        $type: 'app.bsky.feed.repost' as const,
        subject: { uri, cid },
        createdAt: new Date().toISOString(),
      };
      const { api } = await AtprotoCore.getApiClient();
      const response = await api.app.bsky.feed.repost.create({ repo: userDid }, record);
      return response.uri;
    });
  }

  /**
   * Delete a repost
   * @param repostURI - URI of the repost to delete
   */
  static async deleteRepost(repostURI: string): Promise<void> {
    const { api } = await AtprotoCore.getApiClient();
    const userDid = await AtprotoCore.getCurrentUserDid();
    if (!userDid) throw new Error('No authenticated user');

    const parts = repostURI.split('/');
    const rkey = parts[parts.length - 1];
    await api.app.bsky.feed.repost.delete({ repo: userDid, rkey });
  }

  /**
   * Post a comment on a post or reply to another comment
   * @param text - The comment text
   * @param rootUri - The URI of the root post
   * @param rootCid - The CID of the root post
   * @param parentUri - The URI of the parent (post or comment) to reply to
   * @param parentCid - The CID of the parent to reply to
   * @param images - Optional images to attach
   * @returns The response from creating the comment
   */
  static async postComment(
    text: string,
    rootUri: string,
    rootCid: string,
    parentUri?: string,
    parentCid?: string,
    images?: { uri: string; alt: string; aspectRatio?: { width: number; height: number } }[],
    externalEmbed?: { uri: string; title?: string; description?: string; thumb?: string }
  ): Promise<{ uri: string; cid: string }> {
    await AtprotoCore.ensureSession();
    const { api } = await AtprotoCore.getApiClient();

    // If no parent is specified, reply directly to the post (parent = root)
    const actualParentUri = parentUri || rootUri;
    const actualParentCid = parentCid || rootCid;

    // Use official RichText API to detect facets
    const richText = new RichText({ text: text || '' });
    await richText.detectFacets(api);

    const postRecord: PostRecord = {
      $type: 'app.bsky.feed.post',
      text: richText.text,
      createdAt: new Date().toISOString(),
      reply: {
        root: { uri: rootUri, cid: rootCid },
        parent: { uri: actualParentUri, cid: actualParentCid },
      },
    };

    // Add facets if they exist (from RichText API)
    if (richText.facets && richText.facets.length > 0) {
      postRecord.facets = richText.facets;
    }

    // Add images if provided
    if (externalEmbed?.uri) {
      let uploadedThumb:
        | { $type?: string; ref: { $link: string }; mimeType: string; size: number }
        | undefined;
      const thumbSource = normalizeExternalEmbedThumbSource(externalEmbed.thumb);
      if (thumbSource) {
        try {
          const thumbRes = await fetch(thumbSource);
          if (!thumbRes.ok) {
            throw new Error(`Thumb fetch failed: ${thumbRes.status}`);
          }
          const blob = await thumbRes.blob();
          const fromBlob = typeof blob?.type === 'string' ? blob.type : '';
          const encoding =
            fromBlob && fromBlob.startsWith('image/')
              ? fromBlob
              : (() => {
                  const clean = thumbSource.split('?')[0].toLowerCase();
                  if (clean.endsWith('.webp')) return 'image/webp';
                  if (clean.endsWith('.png')) return 'image/png';
                  if (clean.endsWith('.gif')) return 'image/gif';
                  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
                  return 'image/jpeg';
                })();
          const uploadResult = await api.uploadBlob(blob, { encoding });
          uploadedThumb = uploadResult.data.blob;
        } catch (err) {
          logger.error('External embed thumbnail fetch/upload failed', {
            rootUri,
            embedUri: externalEmbed.uri,
            thumbUrl: externalEmbed.thumb,
            err,
          });
          uploadedThumb = undefined;
        }
      }

      const externalPayload =
        uploadedThumb !== undefined
          ? {
              uri: externalEmbed.uri,
              title: externalEmbed.title ?? externalEmbed.uri,
              description: externalEmbed.description ?? '',
              thumb: uploadedThumb,
            }
          : {
              uri: externalEmbed.uri,
              title: externalEmbed.title ?? externalEmbed.uri,
              description: externalEmbed.description ?? '',
            };

      postRecord.embed = {
        $type: 'app.bsky.embed.external',
        external: externalPayload,
      } as PostRecord['embed'];
    } else if (images && images.length > 0) {
      try {
        const inferImageEncoding = (uri: string, blob: Blob): string => {
          const fromBlob = typeof blob?.type === 'string' ? blob.type : '';
          if (fromBlob.startsWith('image/')) return fromBlob;

          const clean = uri.split('?')[0].toLowerCase();
          if (clean.endsWith('.png')) return 'image/png';
          if (clean.endsWith('.webp')) return 'image/webp';
          if (clean.endsWith('.gif')) return 'image/gif';
          if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
          return 'image/jpeg';
        };

        // Upload each image and get its blob reference
        const uploadedImages = await Promise.all(
          images.map(async img => {
            if (img.uri.startsWith('file://')) {
              const response = await fetch(img.uri);
              const blob = await response.blob();

              // Upload the blob to Bluesky
              const { api } = await AtprotoCore.getApiClient();
              const uploadResult = await api.uploadBlob(blob, {
                encoding: inferImageEncoding(img.uri, blob),
              });

              return {
                image: uploadResult.data.blob,
                alt: img.alt || 'Image',
                aspectRatio: img.aspectRatio,
              };
            } else {
              throw new Error('Unsupported image URI format');
            }
          })
        );

        // Add embed with images to post record
        postRecord.embed = {
          $type: 'app.bsky.embed.images',
          images: uploadedImages,
        };
      } catch (_error) {
        // Continue without images if there was an error
      }
    }

    const commentResponse = await api.post(postRecord);
    return commentResponse;
  }

  /**
   * Converts upload blob response to BlobRef format required by Bluesky API.
   * Handles both BlobRef instances (from video service) and blob objects (from uploadBlob).
   *
   * @param blob - Blob data, either:
   *               - BlobRef instance (from video service)
   *               - Blob object: `{ ref: { $link: string }, mimeType: string, size: number }`
   * @returns BlobRef compatible with app.bsky.embed.video structure
   */
  private static toBlobRef(
    blob: BlobRef | { ref: { $link: string }; mimeType: string; size: number }
  ): import('@atproto/lexicon').BlobRef {
    // If already a BlobRef instance (from video service), return as-is
    if (blob instanceof BlobRef) {
      return blob as unknown as import('@atproto/lexicon').BlobRef;
    }
    // Otherwise cast the blob object format
    return blob as unknown as import('@atproto/lexicon').BlobRef;
  }

  /**
   * Create a new post with video content using Bluesky's video service
   * @param text - The post text
   * @param videoPath - Path to the video file
   * @param contentWarnings - Optional content warnings
   * @param commentFilter - Comment filtering settings
   * @param feedSlug - Optional feed slug for tagging
   * @returns The response from creating the post
   */
  static async createVideoPost(
    text: string,
    videoPath: string,
    contentWarnings?: string[],
    commentFilter?: 'all' | 'followers' | 'mentioned' | 'none',
    feedSlug?: string,
    onProgress?: (progress: number) => void,
    jobId?: string,
    videoBlob?: BlobRef
  ): Promise<CreateRecordResponse> {
    await AtprotoCore.ensureSession();

    // Check email confirmation before allowing video post
    // Use userStore as source of truth (uses API field name directly: emailConfirmed)
    try {
      const { useUserStore } = await import('../../../stores/userStore');
      const currentUser = useUserStore.getState().currentUser;

      // Block if emailConfirmed is explicitly false (has email but not confirmed)
      // Allow if true (confirmed) or undefined (no email scope)
      // Use API field name directly: emailConfirmed
      if (currentUser?.emailConfirmed === false) {
        throw new Error(
          'Email verification required. Please verify your email address before posting videos.'
        );
      }
      // Allow access if emailConfirmed is true or undefined
    } catch (error) {
      // Re-throw verification errors
      if (error instanceof Error && error.message.includes('Email verification required')) {
        throw error;
      }
      // Log and continue on import errors (don't block on service errors)
      logger.warn('Failed to check email confirmation status', {
        component: 'AtprotoFeedService',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    try {
      // Validate video file
      if (!videoPath || !videoPath.startsWith('file://')) {
        throw new Error('Invalid video path');
      }

      const { api } = await AtprotoCore.getApiClient();
      const { VideoService } = await import('../video/VideoService');

      // Use Bluesky video service for upload and processing
      // If videoBlob is provided, use it directly (job was already waited for)
      // If jobId is provided without blob, job is being tracked - don't wait again
      // Otherwise, upload and wait for processing
      let processedVideoBlob: BlobRef;
      if (videoBlob) {
        // Blob already available - no need to wait
        processedVideoBlob = videoBlob;
      } else if (jobId) {
        // Job ID provided but no blob - job is being tracked elsewhere
        // This should not happen in normal flow, but handle it gracefully
        processedVideoBlob = await VideoService.waitForJob(jobId);
      } else {
        // No jobId or blob - full upload and wait flow
        processedVideoBlob = await VideoService.uploadVideoAndWait(videoPath, onProgress);
      }

      // Get video aspect ratio
      const aspectRatio = await this.getVideoAspectRatio(videoPath);

      // Use official RichText API to detect facets
      const richText = new RichText({ text: text || '' });
      await richText.detectFacets(api);

      // Determine platform tag
      let platformTag: string;
      if (Platform.OS === 'ios') {
        platformTag = 'orbyt-ios';
      } else if (Platform.OS === 'android') {
        platformTag = 'orbyt-android';
      } else if (Platform.OS === 'web') {
        platformTag = 'orbyt-web';
      } else {
        // Fallback for unknown platforms
        platformTag = 'orbyt-ios';
      }

      // Build tags array
      const tags: string[] = [platformTag];
      if (feedSlug) {
        tags.push(`orbyt-channel-${feedSlug}`);
      }

      const postRecord: PostRecord = {
        $type: 'app.bsky.feed.post',
        text: richText.text,
        createdAt: new Date().toISOString(),
        embed: {
          $type: 'app.bsky.embed.video',
          video: this.toBlobRef(processedVideoBlob),
          aspectRatio,
        },
        tags: tags,
        facets: richText.facets && richText.facets.length > 0 ? richText.facets : undefined,
      };

      // Add content warnings if provided
      // Map UI labels to valid Bluesky self-label values
      // Only these values are valid for self-labeling: porn, sexual, nudity, graphic-media, !no-unauthenticated
      if (contentWarnings && contentWarnings.length > 0) {
        const validLabels = contentWarnings
          .map(warning => {
            // Remove 'other:' prefix if present (custom warnings aren't valid for self-labeling)
            const cleanWarning = warning.startsWith('other:') ? null : warning;
            if (!cleanWarning) return null;

            // Map UI label IDs to valid Bluesky self-label values
            const labelMap: Record<string, string> = {
              nsfw: 'porn',
              nudity: 'nudity',
              violence: 'graphic-media',
              sensitive: 'sexual',
            };

            const mappedLabel = labelMap[cleanWarning] || null;
            return mappedLabel;
          })
          .filter((label): label is string => label !== null);

        if (validLabels.length > 0) {
          // Self-labels should be an array of selfLabel objects
          // Each object has $type: 'com.atproto.label.defs#selfLabel' and val: string
          postRecord.labels = {
            $type: 'com.atproto.label.defs#selfLabels',
            values: validLabels.map(label => ({
              $type: 'com.atproto.label.defs#selfLabel',
              val: label,
            })),
          };
        }
      }

      // Create the post - report progress at 95% before creating
      if (onProgress) {
        onProgress(95);
      }

      const postResponse = await api.post(postRecord);

      // Set comment filtering if specified
      if (commentFilter && commentFilter !== 'all') {
        try {
          await this.setCommentFilter(postResponse.uri, commentFilter);
        } catch (_error) {
          // Comment filter is best-effort; ignore failures
        }
      }

      // Report completion
      if (onProgress) {
        onProgress(100);
      }

      return postResponse;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Video upload failed: ${errorMessage}`);
    }
  }

  /**
   * Get video aspect ratio from video file
   * @param _videoPath - Path to the video file
   * @returns Aspect ratio object with width and height
   */
  private static async getVideoAspectRatio(
    _videoPath: string
  ): Promise<{ width: number; height: number }> {
    // For React Native, we'll use a default aspect ratio
    // In a real implementation, you might want to use a video metadata library
    return { width: 9, height: 16 }; // Default to 9:16 (portrait)
  }

  /**
   * Set comment filter for a post using threadgate
   * @param postUri - URI of the post
   * @param filter - Filter type (followers, mentioned, none)
   */
  private static async setCommentFilter(
    postUri: string,
    filter: 'followers' | 'mentioned' | 'none'
  ): Promise<void> {
    try {
      // Extract the record key (rkey) from the URI using AtUri
      let rkey: string;
      try {
        const uri = new AtUri(postUri);
        rkey = uri.rkey;
        if (!rkey) {
          throw new Error('Could not extract rkey from URI');
        }
      } catch (uriError: unknown) {
        const errorMessage = uriError instanceof Error ? uriError.message : 'Could not parse URI';
        throw new Error(`Invalid post URI: ${errorMessage}`);
      }

      // Create threadgate record based on filter
      // According to Bluesky docs:
      // - followerRule: allows replies from users who follow you
      // - followingRule: allows replies from users you follow
      // - mentionRule: allows replies from users mentioned in the post
      let allow: Array<{ $type: string }> = [];

      switch (filter) {
        case 'followers':
          // "Only followers can comment" means users who follow you
          allow = [{ $type: 'app.bsky.feed.threadgate#followerRule' }];
          break;
        case 'mentioned':
          allow = [{ $type: 'app.bsky.feed.threadgate#mentionRule' }];
          break;
        case 'none':
          allow = []; // Empty array means no one can comment
          break;
      }

      const record = {
        $type: 'app.bsky.feed.threadgate',
        post: postUri,
        createdAt: new Date().toISOString(),
        allow,
      };

      const { api } = await AtprotoCore.getApiClient();
      const userDid = await AtprotoCore.getCurrentUserDid();
      if (!userDid) {
        throw new Error('No authenticated user');
      }

      await api.com.atproto.repo.createRecord({
        repo: userDid,
        collection: 'app.bsky.feed.threadgate',
        rkey: rkey,
        record,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(errorMessage);
    }
  }

  /**
   * Get comments for a post with pagination support
   * @param postUri - The URI of the post
   * @param cursor - Pagination cursor
   * @param _limit - Number of comments per page (not used currently as API doesn't support it)
   * @returns Array of comments and next cursor
   */
  static async getComments(
    postUri: string,
    cursor: string | null = null,
    _limit: number = 25
  ): Promise<CommentsResponse> {
    await AtprotoCore.ensureSession();
    try {
      // Use Bluesky threading parameters
      // depth: how many levels of replies to fetch (6 is standard for full threading)
      // parentHeight: how many parent levels to include (0 = only direct replies to root post)
      const params: { uri: string; depth: number; parentHeight: number; cursor?: string } = {
        uri: postUri,
        depth: 6, // Fetch up to 6 levels of nested replies (Bluesky standard)
        parentHeight: 0, // Only get direct replies to the root post
      };
      if (cursor) params.cursor = cursor;

      const { api } = await AtprotoCore.getApiClient();

      // Use getPostThread (V2 may not be available in all SDK versions)
      // The threading structure is preserved through parent/replies relationships
      const response = await api.app.bsky.feed.getPostThread(params);

      // Function to recursively process thread posts with proper typing
      // Preserves Bluesky's threading structure with parent/child relationships
      const processThreadViewPost = (
        post: ThreadPost,
        parent: Comment | null = null
      ): Comment | null => {
        if (!isThreadViewPost(post)) {
          return null;
        }

        const result: Comment = {
          uri: post.post.uri,
          cid: post.post.cid,
          author: post.post.author,
          record: post.post.record as PostRecord,
          embed: post.post.embed, // View format with thumb/fullsize URLs for link previews
          indexedAt: post.post.indexedAt,
          viewer: post.post.viewer,
          likeCount: post.post.likeCount,
          replyCount: post.post.replyCount,
          replies: [],
          parent: parent || null, // Preserve parent reference for threading
        };

        // Process replies if they exist, passing current post as parent
        if (post.replies && Array.isArray(post.replies)) {
          result.replies = (post.replies as ThreadPost[])
            .map((reply: ThreadPost) => {
              // Type guard to ensure it's a valid ThreadPost
              if (isThreadViewPost(reply)) return processThreadViewPost(reply, result);
              if (checkIsNotFoundPost(reply)) return null;
              if (checkIsBlockedPost(reply)) return null;
              return null;
            })
            .filter((reply): reply is Comment => reply !== null);
        }

        return result;
      };

      // Get the thread from response
      const thread = response.data.thread as ThreadPost;
      let comments: Comment[] = [];

      // Process replies at the root level (top-level comments have no parent)
      if (isThreadViewPost(thread) && thread.replies) {
        comments = (thread.replies as ThreadPost[])
          .map((reply: ThreadPost) => {
            // Type guard to ensure it's a valid ThreadPost
            if (isThreadViewPost(reply)) return processThreadViewPost(reply, null);
            if (checkIsNotFoundPost(reply)) return null;
            if (checkIsBlockedPost(reply)) return null;
            return null;
          })
          .filter((reply): reply is Comment => reply !== null);
      }

      return {
        comments,
        cursor: (response.data as { cursor?: string | null }).cursor ?? null,
      };
    } catch (_error: unknown) {
      return { comments: [], cursor: null };
    }
  }

  /**
   * Get likes for a post with pagination support
   * @param uri - Post URI
   * @param cursor - Pagination cursor
   * @param limit - Number of likes per page
   * @returns Array of likes and next cursor
   */
  static async getLikes(
    uri: string,
    cursor: string | null = null,
    limit: number = 25
  ): Promise<LikesResponse> {
    await AtprotoCore.ensureSession();
    try {
      const params: { uri: string; limit: number; cursor?: string } = { uri, limit };
      if (cursor) params.cursor = cursor;

      const { api } = await AtprotoCore.getApiClient();
      const response = await api.app.bsky.feed.getLikes(params);
      return {
        likes: response.data.likes || [],
        cursor: response.data.cursor || null,
      };
    } catch (_error: unknown) {
      return { likes: [], cursor: null };
    }
  }

  /**
   * Get a single post by URI
   * @param uri - Post URI
   * @returns Post view or null
   */
  static async getPost(uri: string): Promise<PostView | null> {
    try {
      await AtprotoCore.ensureSession();
      const { api } = await AtprotoCore.getApiClient();
      const response = await api.app.bsky.feed.getPostThread({
        uri: uri,
        depth: 0,
      });

      const thread = response.data.thread as ThreadPost;
      if (isThreadViewPost(thread)) {
        return thread.post;
      }
      return null;
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
  static async getPosts(
    uris: string[]
  ): Promise<Map<string, PostView | NotFoundPost | BlockedPost>> {
    const result = new Map<string, PostView | NotFoundPost | BlockedPost>();
    if (!uris.length) return result;

    try {
      await AtprotoCore.ensureSession();
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

  /**
   * Delete a post
   * @param uri - Post URI to delete
   * @returns A boolean indicating whether the deletion was successful
   */
  static async deletePost(uri: string): Promise<boolean> {
    try {
      await AtprotoCore.ensureSession();

      // Extract the record key (rkey) from the URI
      // URI format: at://did:plc:xxxx/app.bsky.feed.post/rkey
      const parts = uri.split('/');
      if (parts.length < 4) {
        throw new Error('Invalid post URI format');
      }

      const did = parts[2];
      const rkey = parts[4];

      // Get the current user's DID to ensure they own the post
      const userDid = await AtprotoCore.getCurrentUserDid();
      if (!userDid) {
        throw new Error('No authenticated user found');
      }

      // Ensure the user owns the post
      if (did !== userDid) {
        throw new Error('Cannot delete a post that you do not own');
      }

      // Delete the post
      const { api } = await AtprotoCore.getApiClient();

      await api.app.bsky.feed.post.delete({
        repo: userDid,
        rkey: rkey,
      });

      return true;
    } catch (_error: unknown) {
      return false;
    }
  }

  /**
   * Mute a post's comments (as a workaround using threadgate rules)
   * This essentially creates a threadgate that doesn't allow any comments
   * @param postUri - URI of the post to mute comments for
   * @returns A boolean indicating success
   */
  static async mutePostComments(postUri: string): Promise<boolean> {
    try {
      await AtprotoCore.ensureSession();
      // Extract the record key (rkey) from the URI
      const parts = postUri.split('/');
      if (parts.length < 4) {
        throw new Error('Invalid post URI format');
      }

      const did = parts[2];
      const rkey = parts[4];

      // Get the current user's DID to ensure they own the post
      const userDid = await AtprotoCore.getCurrentUserDid();
      if (!userDid) {
        throw new Error('No authenticated user found');
      }

      // Ensure the user owns the post
      if (did !== userDid) {
        throw new Error('Cannot mute comments on a post that you do not own');
      }

      // Create a threadgate with no allow rules (effectively muting all comments)
      const record = {
        $type: 'app.bsky.feed.threadgate',
        post: postUri,
        createdAt: new Date().toISOString(),
        allow: [], // Empty array means no one can comment
      };

      const { api } = await AtprotoCore.getApiClient();

      await api.com.atproto.repo.createRecord({
        repo: userDid,
        collection: 'app.bsky.feed.threadgate',
        rkey: rkey,
        record,
      });

      return true;
    } catch (_error: unknown) {
      return false;
    }
  }

  /**
   * Send feed interactions directly to the Bluesky API
   * Accepts Interaction[] array directly from ATProto SDK types
   * @param interactions - Array of Interaction objects to send
   */
  static async sendFeedInteractions(interactions: Interaction[]): Promise<void> {
    if (!interactions || interactions.length === 0) {
      return;
    }

    // If we've previously confirmed the endpoint is not supported, skip quietly
    if (AtprotoFeedService.interactionsSupported === false) return;

    try {
      await AtprotoCore.ensureSession();

      const { api } = await AtprotoCore.getApiClient();

      const hasSendInteractionsMethod =
        typeof api?.app?.bsky?.feed?.sendInteractions === 'function';

      // Send interactions directly to Bluesky's API
      if (!hasSendInteractionsMethod) {
        throw new Error('sendInteractions method not available on API client');
      }

      // Call sendInteractions - procedures use (data, opts) where data is the input and opts contains qp
      // The SDK implementation: _client.call('app.bsky.feed.sendInteractions', opts?.qp, data, opts)
      // So we pass { interactions } as data, and {} as opts (which means opts.qp is undefined, so query params are empty)
      await api.app.bsky.feed.sendInteractions({ interactions });

      // Mark endpoint as supported once we have a successful call
      AtprotoFeedService.interactionsSupported = true;
    } catch (error: unknown) {
      // Check if the error is XRPCNotSupported (404) - this is expected when:
      // 1. The PDS doesn't support this endpoint (older PDS versions)
      // 2. The feed generator doesn't support interactions
      // Since interactions are best-effort, we should handle 404s silently
      const errorMessage = error instanceof Error ? error.message : String(error);
      const hasXRPCErrorProperties =
        error && typeof error === 'object' && 'status' in error && 'error' in error;
      const statusCode =
        hasXRPCErrorProperties && 'status' in error
          ? (error as { status?: unknown }).status
          : undefined;
      const is404 = statusCode === 404;
      const isXRPCNotSupportedMessage =
        hasXRPCErrorProperties && errorMessage === 'XRPCNotSupported';
      const includesNotSupported = errorMessage.includes('NotSupported');
      const equalsXRPCNotSupported = errorMessage === 'XRPCNotSupported';
      const isNotSupported =
        is404 || isXRPCNotSupportedMessage || includesNotSupported || equalsXRPCNotSupported;

      // Silently handle 404/NotSupported errors - these are expected when:
      // - PDS doesn't support the endpoint
      // - Feed generator doesn't accept interactions
      // - Session not fully authenticated yet (initial app load)
      // Interactions are best-effort and failures shouldn't spam logs
      if (isNotSupported) {
        // Remember that this endpoint is not supported so we can skip future attempts
        AtprotoFeedService.interactionsSupported = false;
        return;
      }
    }
  }

  /**
   * Send video feedback to feed generators
   * @deprecated Use sendFeedInteractions with Interaction[] directly instead
   * @param postUri - URI of the post
   * @param type - Feedback type (interested or not_interested)
   * @param sourceFeed - Optional source feed URI
   * @param feedContext - Optional feed context
   */
  static async sendVideoFeedback(
    postUri: string,
    type: 'interested' | 'not_interested',
    sourceFeed?: string,
    feedContext?: string
  ): Promise<void> {
    try {
      await AtprotoCore.ensureSession();

      // Get the current user's DID from OAuth session
      const userDid = await AtprotoCore.getCurrentUserDid();
      if (!userDid) {
        throw new Error('No authenticated user found');
      }

      // Determine target feed for the interaction
      // Priority: 1. sourceFeed (if post came from an algorithmic feed)
      //           2. User's selected algorithmic feed provider
      //           3. null (no target, just store locally)
      let targetFeed: string | null = null;

      // Import algorithmic feed providers to check if sourceFeed is one of them
      const { useUserStore } = await import('../../../stores/userStore');
      const { ALGORITHMIC_FEED_PROVIDERS } = await import('../../../utils/constants');
      const algorithmicFeedUris: string[] = Object.values(ALGORITHMIC_FEED_PROVIDERS).map(
        p => p.uri
      );

      if (sourceFeed && algorithmicFeedUris.includes(sourceFeed)) {
        // Post came from an algorithmic feed - route interaction to that feed
        targetFeed = sourceFeed;
      } else {
        // Fall back to user's selected algorithmic feed provider
        const { algorithmicFeedProvider } = useUserStore.getState();
        targetFeed = algorithmicFeedProvider;
      }

      // Store feedback in local storage for persistence/history
      const feedbackKey = `video_feedback_${postUri}`;
      const feedbackData = {
        postUri,
        type,
        timestamp: new Date().toISOString(),
        userDid: userDid,
        targetFeed: targetFeed,
      };
      storage.set(feedbackKey, JSON.stringify(feedbackData));

      // If we have a target feed, send the interaction to Bluesky's API
      // This communicates the preference to the feed generator
      if (targetFeed) {
        // Map our feedback types to Bluesky's interaction events using SDK constants
        // REQUESTMORE = show more like this, REQUESTLESS = show less like this
        const event = type === 'interested' ? REQUESTMORE : REQUESTLESS;

        // Build the interaction object using proper Interaction type from @atproto/api
        const interaction: Interaction = {
          $type: 'app.bsky.feed.defs#interaction',
          item: postUri,
          event: event,
        };

        // Include feedContext if provided (helps feed generators track context)
        if (feedContext) {
          interaction.feedContext = feedContext;
        }

        // Send the interaction using AtprotoFeedService.sendFeedInteractions
        // This ensures consistent error handling and deduplication
        await AtprotoFeedService.sendFeedInteractions([interaction]);
      }
    } catch (_error: unknown) {
      // Interactions are best-effort; swallow errors
    }
  }

  /**
   * Get stored video feedback for a post
   */
  static async getVideoFeedback(
    postUri: string
  ): Promise<{ type: 'interested' | 'not_interested'; timestamp: string; userDid: string } | null> {
    try {
      const feedbackKey = `video_feedback_${postUri}`;
      const feedbackStr = storage.getString(feedbackKey) ?? null;

      if (feedbackStr) {
        const feedbackData = JSON.parse(feedbackStr);
        return feedbackData;
      }

      return null;
    } catch (_error: unknown) {
      return null;
    }
  }

  /**
   * Remove stored video feedback for a post
   */
  static removeVideoFeedback(postUri: string): void {
    const feedbackKey = `video_feedback_${postUri}`;
    storage.delete(feedbackKey);
  }

  /**
   * Get engagement data for a specific post
   * @param uri - Post URI
   * @returns Promise with engagement data
   */
  static async getPostEngagement(
    uri: string
  ): Promise<{ likes: Like[]; reposts: RepostView[]; replies: Comment[] }> {
    try {
      const [likesResponse, commentsResponse] = await Promise.all([
        this.getLikes(uri, null, 100),
        this.getComments(uri, null, 100),
      ]);

      return {
        likes: likesResponse.likes,
        reposts: [], // Repost data not directly available via API
        replies: commentsResponse.comments,
      };
    } catch (_error: unknown) {
      return { likes: [], reposts: [], replies: [] };
    }
  }

  /**
   * Get feed generator details by URI
   * @param uri - Feed generator URI
   * @returns Feed generator details
   */
  static async getFeedGenerator(uri: string): Promise<FeedGeneratorOutput | null> {
    await AtprotoCore.ensureSession();
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
  static async getFeedGeneratorSubscriberCount(uri: string): Promise<number> {
    await AtprotoCore.ensureSession();
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
   * Get feed generator details by URI with pagination support
   * @param uri - Feed generator URI
   * @param cursor - Pagination cursor
   * @param _limit - Number of posts to fetch
   * @returns Feed generator details with posts
   */
  static async getFeedGeneratorWithPosts(
    uri: string,
    cursor: string | null = null,
    _limit: number = 50
  ): Promise<FeedGeneratorResponse> {
    await AtprotoCore.ensureSession();
    try {
      // Validate URI format
      if (!uri || !uri.startsWith('at://') || !uri.includes('/app.bsky.feed.generator/')) {
        return { generator: null, posts: [], cursor: null };
      }

      // Get generator details
      const generatorParams = { feed: uri };

      const { api } = await AtprotoCore.getApiClient();
      const generatorResponse = await api.app.bsky.feed.getFeedGenerator(generatorParams);

      // Get feed posts
      const feedResponse = await this.getFeed(cursor, uri, {}, true);

      return {
        generator: generatorResponse.data,
        posts: feedResponse.feed,
        cursor: feedResponse.cursor,
      };
    } catch (_error: unknown) {
      return { generator: null, posts: [], cursor: null };
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
  static async searchHashtagVideosPaginated(
    hashtag: string,
    cursor: string | null = null,
    limit: number = 20,
    sort: 'top' | 'latest' = 'latest'
  ): Promise<VideoSearchResponse> {
    await AtprotoCore.ensureSession();
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

      const moderated = await this.applyModerationBatch(videos);

      return {
        videos: moderated,
        cursor: response?.data?.cursor ?? null,
      };
    } catch (_error: unknown) {
      return { videos: [], cursor: null };
    }
  }

  /**
   * Search for hashtag suggestions
   * @param query - Search query (partial hashtag without #)
   * @param limit - Number of suggestions to return
   * @returns Array of unique hashtag suggestions
   */
  static async searchHashtagSuggestions(query: string = '', limit: number = 10): Promise<string[]> {
    await AtprotoCore.ensureSession();
    try {
      const { api } = await AtprotoCore.getApiClient();

      // Build search query
      // If query is empty, search for popular hashtags by searching common terms
      // If query exists, search for posts with that hashtag pattern
      let searchQuery: string;
      if (query) {
        searchQuery = `#${query}`;
      } else {
        // For empty query, search for popular terms that often have hashtags
        searchQuery = 'video OR art OR music OR photography';
      }

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
  static async searchVideosPaginated(
    query: string,
    cursor: string | null = null,
    limit: number = 20
  ): Promise<VideoSearchResponse> {
    await AtprotoCore.ensureSession();
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

      const moderated = await this.applyModerationBatch(videos);

      return {
        videos: moderated,
        cursor: response?.data?.cursor ?? null,
      };
    } catch (_error) {
      return { videos: [], cursor: null };
    }
  }

  /**
   * Get mixed feed from multiple feed URIs
   * @param feedUris - Array of feed URIs
   * @param cursor - Pagination cursor
   * @param limit - Number of posts to fetch
   * @param filterVideosOnly - Whether to filter only video posts
   * @param maxFeeds - Maximum number of feeds to fetch from
   * @returns Promise with feed data
   */
  static async getMixedFeed(
    feedUris: string[],
    cursor: string | null = null,
    limit: number = 50,
    filterVideosOnly: boolean = true,
    maxFeeds: number = 8
  ): Promise<FeedResponse> {
    try {
      // Filter out invalid URIs first
      const validFeedUris = feedUris.filter(
        uri => uri && typeof uri === 'string' && (uri.startsWith('at://') || uri.startsWith('did:'))
      );

      if (validFeedUris.length === 0) {
        return { feed: [], cursor: null };
      }

      // Limit the number of feeds to fetch from
      const limitedFeedUris = validFeedUris.slice(0, maxFeeds);

      // Parse cursor to get individual feed states
      let feedStates: { [feedUri: string]: string | null } = {};

      if (cursor) {
        try {
          feedStates = JSON.parse(cursor);
        } catch (_error) {
          feedStates = {};
        }
      } else {
        // Initialize feeds with null cursors
        limitedFeedUris.forEach(feedUri => {
          feedStates[feedUri] = null;
        });
      }

      // Fetch from feeds in parallel with better error handling
      const feedPromises = limitedFeedUris.map(async feedUri => {
        try {
          const feedCursor = feedStates[feedUri] || null;
          // Distribute limit across feeds, ensuring each gets at least 10 posts
          const feedLimit = Math.max(10, Math.floor(limit / limitedFeedUris.length) + 10);

          const response = await this.getFeed(
            feedCursor,
            feedUri,
            {},
            filterVideosOnly,
            feedLimit,
            'custom'
          );

          return {
            posts: response?.feed || [],
            cursor: response?.cursor || null,
            feedUri,
            success: true,
          };
        } catch (_error) {
          return {
            posts: [],
            cursor: null,
            feedUri,
            success: false,
          };
        }
      });

      const feedResults = await Promise.all(feedPromises);

      // Log success rate for debugging
      const successfulFeeds = feedResults.filter(r => r.success).length;
      if (successfulFeeds === 0) {
        return { feed: [], cursor: null };
      }

      // Update feed states with new cursors (only for successful feeds)
      feedResults.forEach(result => {
        if (result.success && result.cursor !== null) {
          feedStates[result.feedUri] = result.cursor;
        }
      });

      // Flatten and merge all feeds, preserving source feed information
      let allPosts: (ExtendedFeedViewPost & { sourceFeed: string })[] = feedResults.flatMap(
        result =>
          result.posts.map(post => ({
            ...post,
            sourceFeed: result.feedUri,
          }))
      );

      // Remove duplicates
      allPosts = this.deduplicatePosts(allPosts) as (ExtendedFeedViewPost & {
        sourceFeed: string;
      })[];

      // Sort chronologically
      allPosts.sort((a, b) => {
        const aTime = new Date(a?.post?.indexedAt || 0).getTime();
        const bTime = new Date(b?.post?.indexedAt || 0).getTime();
        return bTime - aTime;
      });

      // Apply limit
      const limitedPosts = allPosts.slice(0, limit);

      // Create cursor from active feeds (only include feeds that have more data)
      const activeFeedStates: { [feedUri: string]: string | null } = {};
      feedResults.forEach(result => {
        if (result.success && result.cursor !== null) {
          activeFeedStates[result.feedUri] = result.cursor;
        }
      });

      const compositeCursor =
        Object.keys(activeFeedStates).length > 0 ? JSON.stringify(activeFeedStates) : null;

      return {
        feed: limitedPosts,
        cursor: compositeCursor,
      };
    } catch (_error) {
      return { feed: [], cursor: null };
    }
  }

  /**
   * Aggressively fetch an actor's reposted videos by paging raw author feed data
   * and filtering client-side for reposts that contain video embeds.
   * This avoids server-side author filters that exclude reposts.
   */
  static async getRepostedVideos(
    actor: string,
    cursor: string | null = null,
    limit: number = 50
  ): Promise<FeedResponse> {
    try {
      await AtprotoCore.ensureSession();

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
        const videoReposts = this.filterVideoPostsEfficiently(reposts);

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

      feedData = await this.applyModerationBatch(feedData);

      return { feed: feedData, cursor: nextCursor };
    } catch (_error: unknown) {
      return { feed: [], cursor: null };
    }
  }

  /**
   * Deduplicate posts based on URI and CID
   */
  private static deduplicatePosts(posts: ExtendedFeedViewPost[]): ExtendedFeedViewPost[] {
    const seenUris = new Set<string>();
    const seenCids = new Set<string>();

    return posts.filter(post => {
      const uri = post?.post?.uri;
      const cid = post?.post?.cid;

      if (!uri || !cid) {
        return false;
      }

      const uniqueId = `${uri}_${cid}`;

      if (seenUris.has(uri) || seenCids.has(cid) || seenUris.has(uniqueId)) {
        return false;
      }

      seenUris.add(uri);
      seenCids.add(cid);
      seenUris.add(uniqueId);

      return true;
    });
  }

  /**
   * Search for popular feed generators (channels) with query support
   * @param query - Search query
   * @param limit - Number of results to return
   * @returns Array of feed generator objects
   */
  static async searchPopularFeeds(query: string, limit: number = 5): Promise<GeneratorView[]> {
    await AtprotoCore.ensureSession();
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
  static async getSuggestedFeeds(limit: number = 10): Promise<GeneratorView[]> {
    await AtprotoCore.ensureSession();
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
  static async getStaticChannels(
    limit: number = 10
  ): Promise<(GeneratorView & { contentMode?: string })[]> {
    try {
      const { StaticChannelsService } = await import('../../OrbytBannerService');
      const channelDids = await StaticChannelsService.getChannels();

      if (!channelDids || channelDids.length === 0) {
        return [];
      }

      // Directly fetch feed generators using the URIs
      const feedGenerators = await Promise.all(
        channelDids.map(async uri => {
          try {
            const { api } = await AtprotoCore.getApiClient();
            const response = await api.app.bsky.feed.getFeedGenerators({
              feeds: [uri],
            });

            const feeds = response.data.feeds || [];
            if (feeds.length > 0) {
              return feeds[0];
            }
            return null;
          } catch (_error) {
            return null;
          }
        })
      );

      // Filter out null results and return up to the limit
      return feedGenerators.filter((feed): feed is GeneratorView => feed !== null).slice(0, limit);
    } catch (_error: unknown) {
      return [];
    }
  }
}
