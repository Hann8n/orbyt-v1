import type { BlobRef } from '@atproto/api';
import { storage } from '../../utils/storage/storage';
import { QUERY_CONSTANTS } from '../../utils/constants';
import { AtprotoCore } from './core';
import { deduplicateRequest as deduplicateInFlightRequest } from './inFlightDedup';
import {
  getAgentForRepo as getAgentForRepoForDid,
  resolvePdsEndpointForDid as resolvePdsEndpointForDidFromPlc,
} from './pdsEndpointResolver';
import { AtprotoFeedService } from './feed/FeedService';
import { ActorService } from './actor/ActorService';
import { GraphService } from './graph/GraphService';
import { NotificationService } from './notification/NotificationService';
import { BookmarkService } from './bookmark/BookmarkService';
import { VideoService } from './video/VideoService';
import { RepoService } from './repo/RepoService';
import { ModerationService } from '../moderation/ModerationService';
import {
  isNotFoundPost as isNotFoundPostGuard,
  isBlockedPost as isBlockedPostGuard,
  isValidPost as isValidPostGuard,
} from './postGuards';

// Declare global types (polyfilled at the app entrypoint)
declare global {
  var AbortController: typeof AbortController;
  var Response: typeof Response;
}

import type {
  FeedResponse,
  FeedParams,
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
  FeedGeneratorOutput,
  PutActivitySubscriptionOutput,
  ProfileRecord,
  OrbytProfileRecord,
  RepostView,
  CreateRecordResponse,
} from './types';
class AtprotoService {
  /**
   * Deduplicate API requests to prevent multiple identical calls
   * Delegates to inFlightDedup (namespace services should import that module directly)
   */
  static async deduplicateRequest<T>(key: string, requestFn: () => Promise<T>): Promise<T> {
    return deduplicateInFlightRequest(key, requestFn);
  }

  /** Resolve a DID's PDS service endpoint via PLC and cache it. */
  static async resolvePdsEndpointForDid(did: string): Promise<string | null> {
    return resolvePdsEndpointForDidFromPlc(did);
  }

  /**
   * Check if a PDS is active by calling com.atproto.server.describeServer.
   * Used to enable "Continue to sign up" only when the entered domain (e.g. test.bsky.social) is reachable.
   * Returns an object with success status and error message if failed.
   */
  static async checkPdsActive(pdsInput: string): Promise<{ success: boolean; error?: string }> {
    try {
      const trimmed = (pdsInput.trim() || '').toLowerCase();
      if (!trimmed) {
        return { success: false, error: 'Please enter a server address' };
      }
      const base =
        trimmed.startsWith('http://') || trimmed.startsWith('https://')
          ? trimmed
          : `https://${trimmed}`;
      const url = `${base.replace(/\/+$/, '')}/xrpc/com.atproto.server.describeServer`;

      // Create timeout using AbortController for better compatibility

      const timeoutController = new AbortController();
      const timeoutId = setTimeout(() => timeoutController.abort(), 10000);

      // eslint-disable-next-line no-undef -- Response is a standard global provided by fetch polyfill
      let res: Response;
      try {
        res = await fetch(url, { method: 'GET', signal: timeoutController.signal });
        clearTimeout(timeoutId);
      } catch (fetchError) {
        clearTimeout(timeoutId);
        // Check for abort (timeout)
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          return { success: false, error: 'Could not connect' };
        }
        // Check error.cause for the actual error (Node.js/React Native pattern)
        const cause =
          fetchError instanceof Error && 'cause' in fetchError ? fetchError.cause : null;
        const causeMsg = cause instanceof Error ? cause.message : String(cause || '');
        const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
        const combinedMsg = `${errorMsg} ${causeMsg}`.toLowerCase();

        // DNS resolution failure
        if (combinedMsg.includes('enotfound') || combinedMsg.includes('getaddrinfo')) {
          return { success: false, error: 'Could not connect' };
        }
        // Connection refused
        if (combinedMsg.includes('econnrefused') || combinedMsg.includes('refused')) {
          return { success: false, error: 'Could not connect' };
        }
        // Generic fetch failure
        return { success: false, error: 'Could not connect' };
      }

      if (!res.ok) {
        // Server exists but endpoint not found (not an ATProto server)
        return { success: false, error: 'Could not connect' };
      }

      const data = (await res.json()) as { did?: string; availableUserDomains?: string[] };
      const isValid = typeof data?.did === 'string' || Array.isArray(data?.availableUserDomains);

      if (!isValid) {
        return { success: false, error: 'Could not connect' };
      }

      return { success: true };
    } catch (error) {
      // Handle any other unexpected errors
      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, error: 'Could not connect' };
      }
      return { success: false, error: 'Could not connect' };
    }
  }

  /** Create an unauthenticated agent targeting the repo's PDS for cross-PDS reads. */
  static async getAgentForRepo(
    did: string
  ): Promise<Awaited<ReturnType<typeof getAgentForRepoForDid>>> {
    return getAgentForRepoForDid(did);
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
   * Delegates to AtprotoFeedService
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
    limit: number = QUERY_CONSTANTS.FEED_PAGE_MAX_SINGLE,
    feedType?: FeedType
  ): Promise<FeedResponse> {
    return AtprotoFeedService.getFeed(
      cursor,
      feedLink,
      _feedVariables,
      filterVideosOnly,
      limit,
      feedType
    );
  }

  static async getCurrentUser(): Promise<ProfileViewDetailed> {
    return ActorService.getCurrentUser();
  }

  // Unified getFeed method now handles all feed types
  // Removed redundant getAuthorFeed method

  // Unified getFeed method now handles all feed types
  // Removed redundant getAuthorVideos method

  /**
   * Like a post and return the URI
   * @param uri - Post URI
   * @param cid - Post CID
   * @returns The URI of the created like
   */
  static async likePost(uri: string, cid: string): Promise<string> {
    return AtprotoFeedService.likePost(uri, cid);
  }

  static async deleteLike(likeUri: string): Promise<void> {
    return AtprotoFeedService.deleteLike(likeUri);
  }

  static async repostPost(uri: string, cid: string): Promise<string> {
    return AtprotoFeedService.repostPost(uri, cid);
  }

  static async deleteRepost(repostURI: string): Promise<void> {
    return AtprotoFeedService.deleteRepost(repostURI);
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
   * Delegates to AtprotoFeedService
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
    return AtprotoFeedService.postComment(
      text,
      rootUri,
      rootCid,
      parentUri,
      parentCid,
      images,
      externalEmbed
    );
  }

  /**
   * Create a new post with video content using Bluesky's video service
   * Delegates to AtprotoFeedService
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
    return AtprotoFeedService.createVideoPost(
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
  static async uploadVideo(videoPath: string): Promise<BlobRef> {
    return RepoService.uploadVideo(videoPath);
  }

  /**
   * Get comments for a post with pagination support
   * Delegates to AtprotoFeedService
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
    return AtprotoFeedService.getComments(postUri, cursor, limit);
  }

  /**
   * Get likes for a post with pagination support
   * Delegates to AtprotoFeedService
   */
  static async getLikes(
    uri: string,
    cursor: string | null = null,
    limit: number = 25
  ): Promise<LikesResponse> {
    return AtprotoFeedService.getLikes(uri, cursor, limit);
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
  static async unfollow(did: string, followUri?: string): Promise<boolean> {
    return GraphService.unfollow(did, followUri);
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

  /** Delegates to AtprotoFeedService */
  static async getPost(uri: string): Promise<PostView | null> {
    return AtprotoFeedService.getPost(uri);
  }

  /**
   * Check if a post is NotFoundPost or BlockedPost using $type field
   */
  static isNotFoundPost(post: unknown): post is NotFoundPost {
    return isNotFoundPostGuard(post);
  }

  static isBlockedPost(post: unknown): post is BlockedPost {
    return isBlockedPostGuard(post);
  }

  /**
   * Check if a post is a valid post view (not NotFoundPost or BlockedPost)
   */
  static isValidPost(post: unknown): post is PostView {
    return isValidPostGuard(post);
  }

  /**
   * Batch fetch multiple posts by URI
   * Delegates to AtprotoFeedService
   */
  static async getPosts(
    uris: string[]
  ): Promise<Map<string, PostView | NotFoundPost | BlockedPost>> {
    return AtprotoFeedService.getPosts(uris);
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
   * Delegates to AtprotoFeedService
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
    return AtprotoFeedService.sendVideoFeedback(postUri, type, sourceFeed, feedContext);
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
   * Get unread notification count (lightweight, for badge)
   * Delegates to NotificationService
   */
  static async getUnreadCount(): Promise<{ count: number }> {
    return NotificationService.getUnreadCount();
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

  /** Delegates to AtprotoFeedService */
  static async deletePost(uri: string): Promise<boolean> {
    return AtprotoFeedService.deletePost(uri);
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
   * Mute a post's comments (threadgate with no allow rules)
   * Delegates to AtprotoFeedService
   */
  static async mutePostComments(postUri: string): Promise<boolean> {
    return AtprotoFeedService.mutePostComments(postUri);
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
   * Delegates to AtprotoFeedService
   */
  static async getPostEngagement(
    uri: string
  ): Promise<{ likes: Like[]; reposts: RepostView[]; replies: Comment[] }> {
    return AtprotoFeedService.getPostEngagement(uri);
  }

  /**
   * Search for popular feed generators (channels) with query support
   * Delegates to AtprotoFeedService to avoid code duplication
   * @param query - Search query
   * @param limit - Number of results to return
   * @returns Array of feed generator objects (video-only feeds only)
   */
  static async searchPopularFeeds(query: string, limit: number = 5): Promise<GeneratorView[]> {
    return AtprotoFeedService.searchPopularFeeds(query, limit);
  }

  /**
   * Get suggested feed generators (channels) without search query
   * Delegates to AtprotoFeedService to avoid code duplication
   * @param limit - Number of results to return
   * @returns Array of feed generator objects (video-only feeds only)
   */
  static async getSuggestedFeeds(limit: number = 10): Promise<GeneratorView[]> {
    return AtprotoFeedService.getSuggestedFeeds(limit);
  }

  /**
   * Get feed generator details by URI
   * Delegates to AtprotoFeedService
   * @param uri - Feed generator URI
   * @returns Feed generator details
   */
  static async getFeedGenerator(uri: string): Promise<FeedGeneratorOutput | null> {
    return AtprotoFeedService.getFeedGenerator(uri);
  }

  /**
   * Get subscriber count for a feed generator
   * Delegates to AtprotoFeedService
   */
  static async getFeedGeneratorSubscriberCount(uri: string): Promise<number> {
    return AtprotoFeedService.getFeedGeneratorSubscriberCount(uri);
  }

  /**
   * Get feed generator details by URI with pagination support
   * Delegates to AtprotoFeedService
   */
  static async getFeedGeneratorWithPosts(
    uri: string,
    cursor: string | null = null,
    _limit: number = 50
  ): Promise<FeedGeneratorResponse> {
    return AtprotoFeedService.getFeedGeneratorWithPosts(uri, cursor, _limit);
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
   * Search for video posts with hashtag support. Delegates to AtprotoFeedService (includes moderation batch).
   */
  static async searchHashtagVideosPaginated(
    hashtag: string,
    cursor: string | null = null,
    limit: number = 20,
    sort: 'top' | 'latest' = 'latest'
  ): Promise<VideoSearchResponse> {
    return AtprotoFeedService.searchHashtagVideosPaginated(hashtag, cursor, limit, sort);
  }

  /**
   * Search for hashtag suggestions
   * Delegates to AtprotoFeedService
   */
  static async searchHashtagSuggestions(query: string = '', limit: number = 10): Promise<string[]> {
    return AtprotoFeedService.searchHashtagSuggestions(query, limit);
  }

  /**
   * Search for video posts with query support. Delegates to AtprotoFeedService (includes moderation batch).
   */
  static async searchVideosPaginated(
    query: string,
    cursor: string | null = null,
    limit: number = 20
  ): Promise<VideoSearchResponse> {
    return AtprotoFeedService.searchVideosPaginated(query, cursor, limit);
  }

  /** Delegates to AtprotoFeedService */
  static async getMixedFeed(
    feedUris: string[],
    cursor: string | null = null,
    limit: number = 50,
    filterVideosOnly: boolean = true,
    maxFeeds: number = 8
  ): Promise<FeedResponse> {
    return AtprotoFeedService.getMixedFeed(feedUris, cursor, limit, filterVideosOnly, maxFeeds);
  }

  /**
   * Aggressively fetch an actor's reposted videos by paging raw author feed data
   * and filtering client-side for reposts that contain video embeds.
   * This avoids server-side author filters that exclude reposts.
   * Delegates to AtprotoFeedService
   */
  static async getRepostedVideos(
    actor: string,
    cursor: string | null = null,
    limit: number = 50
  ): Promise<FeedResponse> {
    return AtprotoFeedService.getRepostedVideos(actor, cursor, limit);
  }

  /**
   * Fetch the orbyt profile record for the current user
   * Delegates to RepoService
   */
  static async getOrbytProfileRecord(): Promise<unknown | null> {
    return RepoService.getOrbytProfileRecord();
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
   * Delegates to RepoService
   */
  static async upsertOrbytProfileRecord(update: {
    joinDate?: string;
    colors?: { backgroundColor: string; textColor: string } | null;
    subscribedChannels?: string[];
    algorithmicFeedProvider?: string | null;
  }): Promise<boolean> {
    return RepoService.upsertOrbytProfileRecord(update);
  }

  /**
   * Initialize "com.getorbyt.profile" on first login if missing
   * Delegates to RepoService
   */
  static async initOrbytProfileIfNeeded(): Promise<void> {
    return RepoService.initOrbytProfileIfNeeded();
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
   * Disconnect Germ DM from the current user's profile.
   * Deletes the com.germnetwork.declaration record. Returns true on success.
   */
  static async deleteGermDeclaration(): Promise<boolean> {
    return RepoService.deleteGermDeclaration();
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
   * Delegates to AtprotoFeedService
   */
  static async getStaticChannels(
    limit: number = 10
  ): Promise<(GeneratorView & { contentMode?: string })[]> {
    return AtprotoFeedService.getStaticChannels(limit);
  }
}

// Use a named export to ensure TypeScript picks up the type correctly
export { AtprotoService };
// Keep the default export for backward compatibility
export default AtprotoService;
