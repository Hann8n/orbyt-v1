import { AtpAgent } from '@atproto/api';
import type { BlobRef } from '@atproto/api';
import { storageHelpers } from '../../utils/storage/storage';
import { AtprotoCore } from './core';
import { FeedService } from './feed/FeedService';
import { ActorService } from './actor/ActorService';
import { GraphService } from './graph/GraphService';
import { NotificationService } from './notification/NotificationService';
import { BookmarkService } from './bookmark/BookmarkService';
import { VideoService } from './video/VideoService';
import { RepoService } from './repo/RepoService';
import { ModerationService } from './moderation/ModerationService';
import type {
  FeedResponse,
  FeedParams,
  MessagesResponse,
  ConversationsResponse,
  ThreadPost,
  FeedType,
  ApiClient,
  Session,
  Comment,
  CommentsResponse,
  LikesResponse,
  ProfileSearchResponse,
  BookmarksResponse,
  NotificationsResponse,
  NotificationReason,
  FollowersResponse,
  FollowingResponse,
  UploadLimitsResponse,
  FeedGeneratorResponse,
  VideoSearchResponse,
  PostView,
  ProfileView,
  ProfileViewBasic,
  ProfileViewDetailed,
  ProfileViewWithOrbyt,
  NotFoundPost,
  BlockedPost,
  Like,
  GeneratorView,
  ExtendedFeedViewPost,
  PostRecord,
  ActorPreferences,
  FeedGeneratorOutput,
  GetRecordOutput,
  PutActivitySubscriptionOutput,
  ProfileRecord,
  OrbytProfileRecord,
  RepostView,
  CreateRecordResponse,
} from './types';
import type { SubscribedChannel } from '../../stores/userStore';
import {
  isThreadViewPost,
  isNotFoundPost as checkIsNotFoundPost,
  isBlockedPost as checkIsBlockedPost,
} from './types';

const SERVICE_URL = 'https://bsky.social';
const CHAT_SERVICE_URL = 'https://api.bsky.chat';

class AtprotoService {
  static agent = new AtpAgent({ service: SERVICE_URL });
  // Cache resolved PDS endpoints per DID for cross-PDS reads
  private static _pdsEndpointCache = new Map<string, string>();

  // Request deduplication cache to prevent multiple identical API calls
  private static _requestCache = new Map<
    string,
    { promise: Promise<unknown>; timestamp: number }
  >();
  private static readonly REQUEST_CACHE_TTL = 2000; // 2 second deduplication window

  /**
   * Deduplicate API requests to prevent multiple identical calls
   * Made public so namespace services can access it if needed
   */
  static async deduplicateRequest<T>(key: string, requestFn: () => Promise<T>): Promise<T> {
    const now = Date.now();

    // Check if we have a recent identical request
    const cached = this._requestCache.get(key);
    if (cached && now - cached.timestamp < this.REQUEST_CACHE_TTL) {
      return cached.promise as Promise<T>;
    }

    // Create new request and cache it
    const promise = requestFn();
    this._requestCache.set(key, { promise, timestamp: now });

    // Clean up expired entries
    for (const [k, v] of this._requestCache.entries()) {
      if (now - v.timestamp > this.REQUEST_CACHE_TTL) {
        this._requestCache.delete(k);
      }
    }

    return promise;
  }

  // Custom caching removed - React Query handles all caching

  /**
   * Resolve a DID's PDS service endpoint via PLC and cache it.
   */
  static async resolvePdsEndpointForDid(did: string): Promise<string | null> {
    try {
      if (!did) return null;
      const cached = this._pdsEndpointCache.get(did);
      if (cached) return cached;

      const url = `https://plc.directory/${encodeURIComponent(did)}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const doc = await res.json();
      const services = Array.isArray(doc?.service) ? doc.service : [];
      const pds = services.find(
        (s: { type?: string; id?: string; serviceEndpoint?: string }) =>
          (typeof s?.type === 'string' && s.type.includes('AtprotoPersonalDataServer')) ||
          (typeof s?.id === 'string' && s.id.includes('atproto_pds'))
      ) as { serviceEndpoint?: string } | undefined;
      const endpoint = pds?.serviceEndpoint || null;
      if (endpoint) {
        this._pdsEndpointCache.set(did, endpoint);
      }
      return endpoint;
    } catch {
      return null;
    }
  }

  /**
   * Create an unauthenticated agent targeting the repo's PDS for cross-PDS reads.
   */
  static async getAgentForRepo(did: string): Promise<AtpAgent | null> {
    const endpoint = await this.resolvePdsEndpointForDid(did);
    if (!endpoint) return null;
    try {
      return new AtpAgent({ service: endpoint });
    } catch {
      return null;
    }
  }

  /**
   * Ensures a valid session exists (OAuth or app password)
   * Delegates to AtprotoCore to avoid circular dependencies
   */
  static async ensureSession(): Promise<Session> {
    return AtprotoCore.ensureSession();
  }

  /**
   * Get the current user's DID from session (OAuth or app password)
   * Delegates to AtprotoCore to avoid circular dependencies
   */
  static async getCurrentUserDid(): Promise<string | null> {
    return AtprotoCore.getCurrentUserDid();
  }

  /**
   * Get the API client (OAuth or app password)
   * Delegates to AtprotoCore to avoid circular dependencies
   */
  static async getApiClient(): Promise<ApiClient> {
    return AtprotoCore.getApiClient();
  }

  /**
   * Get feed content - optimized for video-only feeds with maximum batch loading
   * Delegates to FeedService
   *
   * @param cursor - Pagination cursor
   * @param feedLink - Link to the feed
   * @param feedVariables - Additional parameters
   * @param filterVideosOnly - Whether to filter only video posts at API level
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
    return FeedService.getFeed(cursor, feedLink, _feedVariables, filterVideosOnly, limit, feedType);
  }

  static async getCurrentUser(): Promise<ProfileViewDetailed> {
    return ActorService.getCurrentUser();
  }

  // Unified getFeed method now handles all feed types
  // Removed redundant getAuthorFeed method

  // Unified getFeed method now handles all feed types
  // Removed redundant getAuthorVideos method

  /**
   * Fetch conversations for React Query
   * @returns Promise with conversations data
   */
  static async getConversations(cursor: string | null = null): Promise<ConversationsResponse> {
    const apiClient = await this.getApiClient();

    // Handle case where no session is available or restoration is in progress
    if (!apiClient) {
      return { conversations: [], cursor: null };
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-bsky-service': 'did:web:api.bsky.chat',
    };

    // Get the current agent from userStore
    const { useUserStore } = await import('../../stores/userStore');
    const userStore = useUserStore.getState();

    if (!userStore.agent) {
      return { conversations: [], cursor: null };
    }

    const params = new URLSearchParams({ limit: '50' });
    if (cursor) {
      params.append('cursor', cursor);
    }
    const response = await fetch(
      `${CHAT_SERVICE_URL}/xrpc/chat.bsky.convo.listConversations?${params.toString()}`,
      { headers }
    );
    if (response.status === 501) {
      return { conversations: [], cursor: null };
    }
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    const json = await response.json();
    return { conversations: json.convos || [], cursor: json.cursor || null };
  }

  /**
   * Fetch messages for a conversation
   * @param convoId - The conversation ID
   * @param cursor - Pagination cursor
   * @returns Promise with messages data
   */
  static async getMessages(
    convoId: string,
    cursor: string | null = null
  ): Promise<MessagesResponse> {
    await this.ensureSession();
    const params = new URLSearchParams({ convoId, limit: '50' });
    if (cursor) {
      params.append('cursor', cursor);
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-bsky-service': 'did:web:api.bsky.chat',
    };

    // For OAuth, authentication is handled automatically by the agent
    const response = await fetch(
      `${CHAT_SERVICE_URL}/xrpc/chat.bsky.convo.getMessages?${params.toString()}`,
      { headers }
    );
    if (response.status === 501) {
      return { messages: [], cursor: null };
    }
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    const json = await response.json();
    return { messages: json.logs, cursor: json.cursor || null };
  }

  /**
   * Like a post and return the URI
   * @param uri - Post URI
   * @param cid - Post CID
   * @returns The URI of the created like
   */
  static async likePost(uri: string, cid: string): Promise<string> {
    return FeedService.likePost(uri, cid);
  }

  static async deleteLike(likeUri: string): Promise<void> {
    return FeedService.deleteLike(likeUri);
  }

  static async repostPost(uri: string, cid: string): Promise<string> {
    return FeedService.repostPost(uri, cid);
  }

  static async deleteRepost(repostURI: string): Promise<void> {
    return FeedService.deleteRepost(repostURI);
  }

  /**
   * Create a bookmark for a post
   * @param uri - Post URI
   * @param cid - Post CID
   * @returns The post URI (bookmark URI not needed since deleteBookmark uses post URI)
   */
  static async createBookmark(uri: string, cid: string): Promise<string> {
    return BookmarkService.createBookmark(uri, cid);
  }

  /**
   * Delete a bookmark
   * @param bookmarkUri - The URI of the bookmark to delete
   */
  static async deleteBookmark(postUri: string): Promise<void> {
    return BookmarkService.deleteBookmark(postUri);
  }

  /**
   * Get bookmarks for the current user
   * @param cursor - Pagination cursor
   * @param limit - Number of bookmarks to fetch
   * @returns Object with bookmarks array and cursor
   */
  static async getBookmarks(cursor?: string, limit: number = 50): Promise<BookmarksResponse> {
    return BookmarkService.getBookmarks(cursor, limit);
  }

  /**
   * Post a comment on a post or reply to another comment
   * Delegates to FeedService
   */
  static async postComment(
    text: string,
    rootUri: string,
    rootCid: string,
    parentUri?: string,
    parentCid?: string,
    images?: { uri: string; alt: string; aspectRatio?: { width: number; height: number } }[]
  ): Promise<{ uri: string; cid: string }> {
    return FeedService.postComment(text, rootUri, rootCid, parentUri, parentCid, images);
  }

  /**
   * Create a new post with video content using Bluesky's video service
   * Delegates to FeedService
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
    return FeedService.createVideoPost(
      text,
      videoPath,
      contentWarnings,
      commentFilter,
      feedSlug,
      onProgress,
      jobId,
      videoBlob
    );
  }

  /**
   * Get video upload limits for the authenticated user
   * Delegates to VideoService
   */
  static async getUploadLimits(): Promise<UploadLimitsResponse> {
    return VideoService.getUploadLimits();
  }

  /**
   * Upload a video file to Bluesky
   * Delegates to RepoService
   */
  static async uploadVideo(
    videoPath: string
  ): Promise<{ ref: { $link: string }; mimeType: string; size: number }> {
    return RepoService.uploadVideo(videoPath);
  }

  /**
   * Get comments for a post with pagination support
   * Delegates to FeedService
   * @param postUri - The URI of the post
   * @param cursor - Pagination cursor
   * @param limit - Number of comments per page
   * @returns Array of comments and next cursor
   */
  static async getComments(
    postUri: string,
    cursor: string | null = null,
    limit: number = 25
  ): Promise<CommentsResponse> {
    return FeedService.getComments(postUri, cursor, limit);
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
    await this.ensureSession();
    try {
      const params: { uri: string; limit: number; cursor?: string } = { uri, limit };
      if (cursor) params.cursor = cursor;

      const { api } = await this.getApiClient();
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
   * Search profiles by query
   * Delegates to ActorService
   */
  static async searchProfiles(query: string): Promise<ProfileViewBasic[]> {
    return ActorService.searchProfiles(query);
  }

  /**
   * Search profiles by query with pagination support
   * Delegates to ActorService
   */
  static async searchProfilesPaginated(
    query: string,
    cursor: string | null = null,
    limit: number = 20
  ): Promise<ProfileSearchResponse> {
    return ActorService.searchProfilesPaginated(query, cursor, limit);
  }

  /**
   * Get profile by DID with orbyt record - always fetches com.getorbyt.profile in parallel
   * Delegates to ActorService
   */
  static async getProfileByDid(did: string): Promise<ProfileViewWithOrbyt | null> {
    return ActorService.getProfileByDid(did);
  }

  /**
   * Get profile by handle with orbyt record - always fetches com.getorbyt.profile in parallel
   * Delegates to ActorService
   */
  static async getProfile(handle: string): Promise<ProfileViewWithOrbyt | null> {
    return ActorService.getProfile(handle);
  }

  /**
   * Batch fetch multiple actor profiles efficiently
   * Delegates to ActorService
   */
  static async getProfilesInBatch(handles: string[]): Promise<ProfileViewWithOrbyt[]> {
    return ActorService.getProfilesInBatch(handles);
  }

  /**
   * Follow a user
   * Delegates to GraphService
   */
  static async follow(did: string): Promise<string> {
    return GraphService.follow(did);
  }

  /**
   * Unfollow a user
   * Delegates to GraphService
   */
  static async unfollow(did: string): Promise<boolean> {
    return GraphService.unfollow(did);
  }

  /**
   * Unblock a user
   * Delegates to GraphService
   */
  static async unblockUser(did: string): Promise<void> {
    return GraphService.unblockUser(did);
  }

  /**
   * Block a user
   * Delegates to GraphService
   */
  static async blockUser(did: string): Promise<void> {
    return GraphService.blockUser(did);
  }

  /**
   * Mute a user
   * Delegates to GraphService
   */
  static async muteUser(did: string): Promise<boolean> {
    return GraphService.muteUser(did);
  }

  /**
   * Unmute a user
   * Delegates to GraphService
   */
  static async unmuteUser(did: string): Promise<boolean> {
    return GraphService.unmuteUser(did);
  }

  static async getPost(uri: string): Promise<PostView | null> {
    try {
      await this.ensureSession();
      const { api } = await this.getApiClient();
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
   * Check if a post is NotFoundPost or BlockedPost using $type field
   */
  static isNotFoundPost(post: unknown): post is NotFoundPost {
    if (!post || typeof post !== 'object') return false;
    return checkIsNotFoundPost(post as ThreadPost);
  }

  static isBlockedPost(post: unknown): post is BlockedPost {
    if (!post || typeof post !== 'object') return false;
    return checkIsBlockedPost(post as ThreadPost);
  }

  /**
   * Check if a post is a valid post view (not NotFoundPost or BlockedPost)
   */
  static isValidPost(post: unknown): post is PostView {
    if (!post) return false;
    return !this.isNotFoundPost(post) && !this.isBlockedPost(post);
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
      await this.ensureSession();
      const { api } = await this.getApiClient();

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
   * Check if a user is blocked
   * Delegates to GraphService
   */
  static async isBlocked(did: string): Promise<boolean> {
    return GraphService.isBlocked(did);
  }

  /**
   * Send video feedback (show more/show less) to the appropriate feed provider
   * Delegates to FeedService
   * @param postUri - The post URI to send feedback for
   * @param type - Type of feedback: 'interested' (show more) or 'not_interested' (show less)
   * @param sourceFeed - Optional source feed URI where the post came from (for accurate interaction routing)
   * @param feedContext - Optional context string from the feed generator (for tracking)
   */
  static async sendVideoFeedback(
    postUri: string,
    type: 'interested' | 'not_interested',
    sourceFeed?: string,
    feedContext?: string
  ): Promise<void> {
    return FeedService.sendVideoFeedback(postUri, type, sourceFeed, feedContext);
  }

  /**
   * Get stored video feedback for a post
   */
  static async getVideoFeedback(
    postUri: string
  ): Promise<{ type: 'interested' | 'not_interested'; timestamp: string; userDid: string } | null> {
    try {
      const feedbackKey = `video_feedback_${postUri}`;
      const feedbackStr = await storageHelpers.getItem(feedbackKey);

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
  static async removeVideoFeedback(postUri: string): Promise<void> {
    const feedbackKey = `video_feedback_${postUri}`;
    await storageHelpers.removeItem(feedbackKey);
  }

  /**
   * List notifications for the current user
   * Delegates to NotificationService
   * @param cursor - Pagination cursor
   * @param limit - Number of notifications to fetch
   * @param reasons - Optional array of notification reasons to filter (server-side)
   */
  static async listNotifications(
    cursor: string | null = null,
    limit = 50,
    reasons?: NotificationReason[]
  ): Promise<NotificationsResponse> {
    return NotificationService.listNotifications(cursor, limit, reasons);
  }

  /**
   * Mark all notifications as seen for the current user
   * Delegates to NotificationService
   */
  static async updateNotificationSeen(): Promise<void> {
    return NotificationService.updateNotificationSeen();
  }

  // Unified getFeed method now handles all feed types
  // Removed redundant getLikedPosts and getRepostedPosts methods

  /**
   * Delete a post
   * @param uri - Post URI to delete
   * @returns A boolean indicating whether the deletion was successful
   */
  static async deletePost(uri: string): Promise<boolean> {
    try {
      await this.ensureSession();

      // Extract the record key (rkey) from the URI
      // URI format: at://did:plc:xxxx/app.bsky.feed.post/rkey
      const parts = uri.split('/');
      if (parts.length < 4) {
        throw new Error('Invalid post URI format');
      }

      const did = parts[2];
      const rkey = parts[4];

      // Get the current user's DID to ensure they own the post
      const userDid = await this.getCurrentUserDid();
      if (!userDid) {
        throw new Error('No authenticated user found');
      }

      // Ensure the user owns the post
      if (did !== userDid) {
        throw new Error('Cannot delete a post that you do not own');
      }

      // Delete the post
      const { api } = await this.getApiClient();

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
   * Report a post or user for moderation
   * @param uri - URI of the content to report (post or user)
   * @param reasonType - The reason for reporting (can be simple type or full namespace type)
   * @param reason - Optional additional context for the report
   * @param labelerDid - Optional DID of the labeler to receive the report (default: uses Bluesky's moderation)
   * @returns A boolean indicating whether the report was successfully submitted
   */
  /**
   * Report content - delegates to ModerationService
   * @deprecated This method duplicates ModerationService.reportContent(). Use ModerationService directly.
   */
  static async reportContent(
    uri: string,
    reasonType: string | 'spam' | 'violation' | 'misleading' | 'sexual' | 'rude' | 'other',
    reason?: string,
    _labelerDid?: string
  ): Promise<boolean> {
    // Delegate to the dedicated moderation service to avoid duplication
    return ModerationService.reportContent(uri, reasonType, reason, _labelerDid);
  }

  /**
   * Mute a post's comments (as a workaround using threadgate rules)
   * This essentially creates a threadgate that doesn't allow any comments
   * @param postUri - URI of the post to mute comments for
   * @returns A boolean indicating success
   */
  static async mutePostComments(postUri: string): Promise<boolean> {
    try {
      await this.ensureSession();
      // Extract the record key (rkey) from the URI
      const parts = postUri.split('/');
      if (parts.length < 4) {
        throw new Error('Invalid post URI format');
      }

      const did = parts[2];
      const rkey = parts[4];

      // Get the current user's DID to ensure they own the post
      const userDid = await this.getCurrentUserDid();
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

      const { api } = await this.getApiClient();

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
   * Get profile information for a DID (verifier)
   * Delegates to ActorService
   */
  static async getVerifierProfile(did: string): Promise<ProfileView | null> {
    return ActorService.getVerifierProfile(did);
  }

  /**
   * Update profile information using Bluesky's upsertProfile pattern.
   * Delegates to ActorService.
   *
   * Field semantics:
   * - undefined: Don't change this field
   * - null: Explicitly clear this field
   * - "value": Set to this value
   */
  static async updateProfile(updates: {
    displayName?: string | null;
    description?: string | null;
    avatar?: string | null;
  }): Promise<ProfileViewDetailed> {
    return ActorService.updateProfile({
      displayName: updates.displayName ?? undefined,
      description: updates.description ?? undefined,
      avatar: updates.avatar ?? undefined,
    });
  }

  /**
   * Fetch suggested accounts to follow using the Bluesky API
   * Delegates to ActorService
   */
  static async getSuggestedAccounts(limit: number = 20): Promise<ProfileViewBasic[]> {
    return ActorService.getSuggestedAccounts(limit);
  }

  /**
   * Get followers for a user
   * Delegates to GraphService
   */
  static async getFollowers(
    actor: string,
    cursor: string | null = null,
    limit: number = 100
  ): Promise<FollowersResponse> {
    return GraphService.getFollowers(actor, cursor, limit);
  }

  /**
   * Get following list for a user
   * Delegates to GraphService
   */
  static async getFollowing(
    actor: string,
    cursor: string | null = null,
    limit: number = 100
  ): Promise<FollowingResponse> {
    return GraphService.getFollowing(actor, cursor, limit);
  }

  /**
   * Get all followers for a user (paginated)
   * Delegates to GraphService
   */
  static async getAllFollowers(actor: string): Promise<ProfileViewBasic[]> {
    return GraphService.getAllFollowers(actor);
  }

  /**
   * Get all following for a user (paginated)
   * Delegates to GraphService
   */
  static async getAllFollowing(actor: string): Promise<ProfileViewBasic[]> {
    return GraphService.getAllFollowing(actor);
  }

  /**
   * Get mutual connections (users you follow who also follow you)
   * Delegates to GraphService
   */
  static async getMutualConnections(userDid: string): Promise<ProfileViewBasic[]> {
    return GraphService.getMutualConnections(userDid);
  }

  /**
   * Get engagement data for a specific post
   * Delegates to FeedService
   */
  static async getPostEngagement(
    uri: string
  ): Promise<{ likes: Like[]; reposts: RepostView[]; replies: Comment[] }> {
    return FeedService.getPostEngagement(uri);
  }

  /**
   * Search for popular feed generators (channels) with query support
   * @param query - Search query
   * @param limit - Number of results to return
   * @returns Array of feed generator objects
   */
  static async searchPopularFeeds(query: string, limit: number = 5): Promise<GeneratorView[]> {
    await this.ensureSession();
    try {
      const params = { limit: limit, query: query };

      const { api } = await this.getApiClient();
      const response = await api.app.bsky.unspecced.getPopularFeedGenerators(params);

      // Return all feeds without filtering
      const allFeeds = response.data.feeds || [];

      // Extract contentMode from API response (may be at feed.contentMode or feed.view?.contentMode)
      // If contentMode is missing, derive it from isExperimental flag
      const processedFeeds = allFeeds.map((feed: GeneratorView) => {
        let contentMode =
          (feed as unknown as { contentMode?: string; view?: { contentMode?: string } })
            .contentMode ||
          (feed as unknown as { contentMode?: string; view?: { contentMode?: string } }).view
            ?.contentMode;

        // Fallback: if contentMode is missing but isExperimental exists, derive it
        const feedWithExperimental = feed as unknown as { isExperimental?: boolean };
        if (!contentMode && feedWithExperimental.isExperimental !== undefined) {
          contentMode = feedWithExperimental.isExperimental
            ? undefined // Non-video feed (no contentMode set)
            : 'app.bsky.feed.defs#contentModeVideo'; // Video-only feed
        }

        const isVideoOnly = contentMode === 'app.bsky.feed.defs#contentModeVideo';
        return {
          ...feed,
          contentMode, // Preserve contentMode at top level for easy access
          isExperimental: !isVideoOnly,
        } as GeneratorView & { contentMode?: string; isExperimental: boolean };
      });

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
    await this.ensureSession();
    try {
      const params = { limit: limit };

      const { api } = await this.getApiClient();
      const response = await api.app.bsky.unspecced.getPopularFeedGenerators(params);

      // Return all feeds without filtering
      const allFeeds = response.data.feeds || [];

      // Extract contentMode from API response (may be at feed.contentMode or feed.view?.contentMode)
      // If contentMode is missing, derive it from isExperimental flag
      const processedFeeds = allFeeds.map((feed: GeneratorView) => {
        let contentMode =
          (feed as unknown as { contentMode?: string; view?: { contentMode?: string } })
            .contentMode ||
          (feed as unknown as { contentMode?: string; view?: { contentMode?: string } }).view
            ?.contentMode;

        // Fallback: if contentMode is missing but isExperimental exists, derive it
        const feedWithExperimental = feed as unknown as { isExperimental?: boolean };
        if (!contentMode && feedWithExperimental.isExperimental !== undefined) {
          contentMode = feedWithExperimental.isExperimental
            ? undefined // Non-video feed (no contentMode set)
            : 'app.bsky.feed.defs#contentModeVideo'; // Video-only feed
        }

        const isVideoOnly = contentMode === 'app.bsky.feed.defs#contentModeVideo';
        return {
          ...feed,
          contentMode, // Preserve contentMode at top level for easy access
          isExperimental: !isVideoOnly,
        } as GeneratorView & { contentMode?: string; isExperimental: boolean };
      });

      return processedFeeds;
    } catch (_error: unknown) {
      return [];
    }
  }

  /**
   * Get feed generator details by URI
   * Delegates to FeedService
   * @param uri - Feed generator URI
   * @returns Feed generator details
   */
  static async getFeedGenerator(uri: string): Promise<FeedGeneratorOutput | null> {
    return FeedService.getFeedGenerator(uri);
  }

  /**
   * Get subscriber count for a feed generator
   * Delegates to FeedService
   */
  static async getFeedGeneratorSubscriberCount(uri: string): Promise<number> {
    return FeedService.getFeedGeneratorSubscriberCount(uri);
  }

  /**
   * Get feed generator details by URI with pagination support
   * Delegates to FeedService
   */
  static async getFeedGeneratorWithPosts(
    uri: string,
    cursor: string | null = null,
    _limit: number = 50
  ): Promise<FeedGeneratorResponse> {
    return FeedService.getFeedGeneratorWithPosts(uri, cursor, _limit);
  }

  /**
   * Get user's moderation preferences from Bluesky
   * Delegates to ActorService
   */
  static async getModerationPreferences(): Promise<ActorPreferences | null> {
    return ActorService.getModerationPreferences();
  }

  /**
   * Update user's moderation preferences on Bluesky
   * Delegates to ActorService
   */
  static async updateModerationPreferences(preferences: ActorPreferences): Promise<boolean> {
    return ActorService.updateModerationPreferences(preferences);
  }

  /**
   * Get user's blocked users list from Bluesky
   * Delegates to GraphService
   */
  static async getBlockedUsersFromAPI(): Promise<string[]> {
    return GraphService.getBlockedUsersFromAPI();
  }

  /**
   * Get user's muted users list from Bluesky
   * Delegates to GraphService
   */
  static async getMutedUsersFromAPI(): Promise<string[]> {
    return GraphService.getMutedUsersFromAPI();
  }

  /**
   * Search for video posts with hashtag support. Delegates to FeedService (includes moderation batch).
   */
  static async searchHashtagVideosPaginated(
    hashtag: string,
    cursor: string | null = null,
    limit: number = 20,
    sort: 'top' | 'latest' = 'latest'
  ): Promise<VideoSearchResponse> {
    return FeedService.searchHashtagVideosPaginated(hashtag, cursor, limit, sort);
  }

  /**
   * Search for hashtag suggestions
   * @param query - Search query (partial hashtag without #)
   * @param limit - Number of suggestions to return
   * @returns Array of unique hashtag suggestions
   */
  static async searchHashtagSuggestions(query: string = '', limit: number = 10): Promise<string[]> {
    await this.ensureSession();
    try {
      const { api } = await this.getApiClient();

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
    } catch {
      return [];
    }
  }

  /**
   * Search for video posts with query support. Delegates to FeedService (includes moderation batch).
   */
  static async searchVideosPaginated(
    query: string,
    cursor: string | null = null,
    limit: number = 20
  ): Promise<VideoSearchResponse> {
    return FeedService.searchVideosPaginated(query, cursor, limit);
  }

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
        } catch {
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
        } catch {
          // Silently handle individual feed failures
          return {
            posts: [],
            cursor: null,
            feedUri,
            success: false,
          };
        }
      });

      const feedResults = await Promise.all(feedPromises);

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
          result.posts.map(
            post =>
              ({
                ...post,
                sourceFeed: result.feedUri,
              }) as ExtendedFeedViewPost & { sourceFeed: string }
          )
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
    } catch {
      return { feed: [], cursor: null };
    }
  }

  /**
   * Aggressively fetch an actor's reposted videos by paging raw author feed data
   * and filtering client-side for reposts that contain video embeds.
   * This avoids server-side author filters that exclude reposts.
   * Delegates to FeedService
   */
  static async getRepostedVideos(
    actor: string,
    cursor: string | null = null,
    limit: number = 50
  ): Promise<FeedResponse> {
    return FeedService.getRepostedVideos(actor, cursor, limit);
  }

  /**
   * Deduplicate posts based on URI and CID
   */
  private static deduplicatePosts<T extends ExtendedFeedViewPost>(posts: T[]): T[] {
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
   * Fetch the orbyt profile record for the current user
   */
  static async getOrbytProfileRecord(): Promise<unknown | null> {
    try {
      const userDid = await this.getCurrentUserDid();
      if (!userDid) return null;
      const { api } = await this.getApiClient();
      try {
        const rec = await api.com.atproto.repo.getRecord({
          repo: userDid,
          collection: 'com.getorbyt.profile',
          rkey: 'self',
        });
        return rec?.data?.value || null;
      } catch (_e) {
        // Fallback: try listRecords once
        try {
          const list = await api.com.atproto.repo.listRecords({
            repo: userDid,
            collection: 'com.getorbyt.profile',
            limit: 1,
          });
          const first = list?.data?.records?.[0]?.value;
          return first || null;
        } catch {
          return null;
        }
      }
    } catch {
      return null;
    }
  }

  /**
   * Fetch the orbyt profile record for any DID by hitting that DID's PDS directly
   * Delegates to RepoService
   */
  static async getOrbytProfileRecordForDid(did: string): Promise<unknown | null> {
    return RepoService.getOrbytProfileRecordForDid(did);
  }

  /**
   * Fetch both profile records (standard and custom) using listRecords in parallel
   * This ensures both records are always fetched together
   * Delegates to RepoService
   */
  static async getProfileRecordsForDid(did: string): Promise<{
    profileRecord: ProfileRecord | null;
    orbytRecord: OrbytProfileRecord | null;
  }> {
    return RepoService.getProfileRecordsForDid(did);
  }

  /**
   * Create or update the orbyt profile record with a stable rkey 'self'
   */
  static async upsertOrbytProfileRecord(update: {
    joinDate?: string;
    colors?: { backgroundColor: string; textColor: string } | null;
    subscribedChannels?: string[];
    algorithmicFeedProvider?: string | null;
  }): Promise<boolean> {
    try {
      const userDid = await this.getCurrentUserDid();

      if (!userDid) {
        return false;
      }

      const apiClient = await this.getApiClient();

      if (!apiClient) {
        return false;
      }
      const { api } = apiClient;

      // Read existing
      let existing: OrbytProfileRecord | null = null;

      try {
        const rec = await api.com.atproto.repo.getRecord({
          repo: userDid,
          collection: 'com.getorbyt.profile',
          rkey: 'self',
        });
        const output: GetRecordOutput = rec.data;
        existing = (output.value as OrbytProfileRecord) || null;
      } catch {
        // No existing record found (this is OK for first-time creation)
      }

      const nowIso = new Date().toISOString();
      const existingRecord = existing;
      const nextRecord: Record<string, unknown> = {
        $type: 'com.getorbyt.profile',
        joinDate: existingRecord?.joinDate || update.joinDate || nowIso,
        updatedAt: nowIso,
        // Preserve prior fields unless overridden
        colors: update.colors === undefined ? existingRecord?.colors || null : update.colors,
        subscribedChannels: update.subscribedChannels ?? existingRecord?.subscribedChannels ?? [],
        algorithmicFeedProvider:
          update.algorithmicFeedProvider === undefined
            ? (existingRecord?.algorithmicFeedProvider ?? null)
            : update.algorithmicFeedProvider,
      };

      if (existing) {
        // putRecord
        await api.com.atproto.repo.putRecord({
          repo: userDid,
          collection: 'com.getorbyt.profile',
          rkey: 'self',
          record: nextRecord,
        });
      } else {
        // createRecord
        await api.com.atproto.repo.createRecord({
          repo: userDid,
          collection: 'com.getorbyt.profile',
          rkey: 'self',
          record: nextRecord,
        });
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Initialize "com.getorbyt.profile" on first login if missing
   */
  static async initOrbytProfileIfNeeded(): Promise<void> {
    try {
      const existing = await this.getOrbytProfileRecord();
      if (existing) return;

      const userDid = await this.getCurrentUserDid();
      if (!userDid) return;

      // No legacy migration; initialize without colors by default
      let colors: { backgroundColor: string; textColor: string } | null = null;

      // Pull current subscribed channels from userStore (filter built-ins)
      let subscribedChannels: string[] = [];
      try {
        const { useUserStore } = await import('../../stores/userStore');
        const channels = useUserStore.getState().subscribedChannels || [];
        const allUris = channels.map((c: SubscribedChannel) => c.uri).filter(Boolean);
        // Filter out built-in channels
        const BUILT_IN_CHANNELS = ['following', 'your-mix'];
        subscribedChannels = allUris.filter((uri: string) => !BUILT_IN_CHANNELS.includes(uri));
      } catch {
        // ignore errors
      }

      // Pull current algorithmic feed provider from userStore
      let algorithmicFeedProvider: string | null = null;
      try {
        const { useUserStore, ALGORITHMIC_FEED_PROVIDERS } = await import('../../stores/userStore');
        const provider = useUserStore.getState().algorithmicFeedProvider;
        // Use current value or default to Bluesky Video
        algorithmicFeedProvider = provider ?? ALGORITHMIC_FEED_PROVIDERS.BLUESKY_VIDEO.uri;
      } catch {
        // ignore errors
      }

      await this.upsertOrbytProfileRecord({
        joinDate: new Date().toISOString(),
        colors,
        subscribedChannels,
        algorithmicFeedProvider,
      });
    } catch {
      // best-effort only
    }
  }

  /**
   * Update only colors in orbyt profile record
   */
  static async updateOrbytProfileColors(backgroundColor: string, textColor: string): Promise<void> {
    await this.upsertOrbytProfileRecord({
      colors: { backgroundColor, textColor },
    });
  }

  /**
   * Update subscribed channels in orbyt profile record
   */
  static async updateOrbytProfileChannels(channelUris: string[]): Promise<void> {
    // Filter out built-in channels before saving
    const BUILT_IN_CHANNELS = ['following', 'your-mix'];
    const filteredUris = (channelUris || []).filter(uri => !BUILT_IN_CHANNELS.includes(uri));
    await this.upsertOrbytProfileRecord({
      subscribedChannels: Array.from(new Set(filteredUris)),
    });
  }

  /**
   * Update algorithmic feed provider in orbyt profile record
   */
  static async updateOrbytProfileAlgorithmicFeedProvider(uri: string | null): Promise<void> {
    await this.upsertOrbytProfileRecord({
      algorithmicFeedProvider: uri,
    });
  }

  /**
   * Subscribe to activity notifications from a user
   * Delegates to NotificationService
   */
  static async putActivitySubscription(
    did: string,
    preferences: { post: boolean; reply: boolean } = { post: true, reply: true }
  ): Promise<PutActivitySubscriptionOutput> {
    return NotificationService.putActivitySubscription(did, preferences);
  }

  /**
   * Unsubscribe from activity notifications from a user
   * Delegates to NotificationService
   */
  static async deleteActivitySubscription(did: string): Promise<void> {
    return NotificationService.deleteActivitySubscription(did);
  }

  /**
   * List all activity subscriptions (users you're subscribed to)
   * Delegates to NotificationService
   */
  static async listActivitySubscriptions(
    cursor?: string
  ): Promise<{ cursor?: string; subscriptions: ProfileView[] }> {
    return NotificationService.listActivitySubscriptions(cursor);
  }

  /**
   * Check if subscribed to a specific user's activity
   * Delegates to NotificationService
   */
  static async isSubscribedToActivity(did: string): Promise<boolean> {
    return NotificationService.isSubscribedToActivity(did);
  }

  /**
   * Get static channels from the web API
   * Delegates to FeedService
   */
  static async getStaticChannels(
    limit: number = 10
  ): Promise<(GeneratorView & { isExperimental: boolean; contentMode?: string })[]> {
    return FeedService.getStaticChannels(limit);
  }
}

// Use a named export to ensure TypeScript picks up the type correctly
export { AtprotoService };
// Keep the default export for backward compatibility
export default AtprotoService;
