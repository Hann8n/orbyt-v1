/**
 * Narrowed type helpers for AtprotoService using @atproto/api generated types.
 *
 * This file follows AT Protocol's recommended structure and React Native TypeScript best practices:
 * 1. Groups imports by namespace (Feed, Actor, Embed, etc.) for better organization
 * 2. Uses type-only imports to avoid bundling runtime code in React Native
 * 3. Imports from stable paths that match the package's internal structure
 * 4. Maintains type safety while following package conventions
 *
 * Note: We import types directly from defs files rather than namespace objects because:
 * - TypeScript type-only imports are stripped at compile time (safe for React Native)
 * - Direct imports provide better IDE autocomplete and type checking
 * - The paths are stable and match the package's generated structure
 */
import type { Agent } from '@atproto/api';

// ============================================================================
// Runtime imports (type guards - these must be functions, not types)
// ============================================================================
import {
  isThreadViewPost as sdkIsThreadViewPost,
  isNotFoundPost as sdkIsNotFoundPost,
  isBlockedPost as sdkIsBlockedPost,
  REQUESTLESS,
  REQUESTMORE,
  CLICKTHROUGHITEM,
  CLICKTHROUGHAUTHOR,
  CLICKTHROUGHREPOSTER,
  CLICKTHROUGHEMBED,
  INTERACTIONSEEN,
  INTERACTIONLIKE,
  INTERACTIONREPOST,
  INTERACTIONREPLY,
  INTERACTIONQUOTE,
  INTERACTIONSHARE,
} from '@atproto/api/dist/client/types/app/bsky/feed/defs';

// ============================================================================
// Feed namespace types (app.bsky.feed.*)
// ============================================================================
import type {
  FeedViewPost,
  PostView,
  ThreadViewPost,
  NotFoundPost,
  BlockedPost,
  GeneratorView,
  ViewerState,
  Interaction,
} from '@atproto/api/dist/client/types/app/bsky/feed/defs';
import type { Record as PostRecord } from '@atproto/api/dist/client/types/app/bsky/feed/post';
import type { OutputSchema as GetAuthorFeedOutput } from '@atproto/api/dist/client/types/app/bsky/feed/getAuthorFeed';
import type { OutputSchema as GetFeedOutput } from '@atproto/api/dist/client/types/app/bsky/feed/getFeed';
import type { OutputSchema as GetActorLikesOutput } from '@atproto/api/dist/client/types/app/bsky/feed/getActorLikes';
import type { OutputSchema as GetLikesOutput } from '@atproto/api/dist/client/types/app/bsky/feed/getLikes';
import type { OutputSchema as FeedGeneratorOutput } from '@atproto/api/dist/client/types/app/bsky/feed/getFeedGenerator';

// ============================================================================
// Actor namespace types (app.bsky.actor.*)
// ============================================================================
import type {
  ProfileView,
  ProfileViewBasic,
  ProfileViewDetailed,
  Preferences,
  StatusView,
} from '@atproto/api/dist/client/types/app/bsky/actor/defs';
import type { OutputSchema as GetPreferencesOutput } from '@atproto/api/dist/client/types/app/bsky/actor/getPreferences';

// ============================================================================
// Graph namespace types (app.bsky.graph.*)
// ============================================================================
import type { ListViewBasic } from '@atproto/api/dist/client/types/app/bsky/graph/defs';

// ============================================================================
// Embed namespace types (app.bsky.embed.*)
// ============================================================================
import type { View as VideoView } from '@atproto/api/dist/client/types/app/bsky/embed/video';
import type { View as ImagesView } from '@atproto/api/dist/client/types/app/bsky/embed/images';
import type { View as RecordWithMediaView } from '@atproto/api/dist/client/types/app/bsky/embed/recordWithMedia';

// ============================================================================
// Bookmark namespace types (app.bsky.bookmark.*)
// ============================================================================
import type { BookmarkView } from '@atproto/api/dist/client/types/app/bsky/bookmark/defs';

// ============================================================================
// Notification namespace types (app.bsky.notification.*)
// ============================================================================
import type { Notification } from '@atproto/api/dist/client/types/app/bsky/notification/listNotifications';
import type { OutputSchema as PutActivitySubscriptionOutput } from '@atproto/api/dist/client/types/app/bsky/notification/putActivitySubscription';

// ============================================================================
// Chat namespace types (chat.bsky.convo.*)
// ============================================================================
import type { ConvoView, MessageView } from '@atproto/api/dist/client/types/chat/bsky/convo/defs';

// ============================================================================
// Repo namespace types (com.atproto.repo.*)
// ============================================================================
import type { OutputSchema as GetRecordOutput } from '@atproto/api/dist/client/types/com/atproto/repo/getRecord';
import type {
  OutputSchema as ListRecordsOutput,
  Record as AtprotoRecord,
} from '@atproto/api/dist/client/types/com/atproto/repo/listRecords';

// ============================================================================
// Type aliases for cleaner usage (following React Native TypeScript best practices)
// ============================================================================
type Like = GetLikesOutput['likes'][number];

// Extract notification reason type from Notification (excluding string fallback)
export type NotificationReason = Extract<
  Notification['reason'],
  | 'like'
  | 'repost'
  | 'follow'
  | 'mention'
  | 'reply'
  | 'quote'
  | 'starterpack-joined'
  | 'verified'
  | 'unverified'
  | 'like-via-repost'
  | 'repost-via-repost'
  | 'subscribed-post'
>;

// Re-export commonly used SDK types
export type {
  FeedViewPost,
  PostView,
  ThreadViewPost,
  NotFoundPost,
  BlockedPost,
  GeneratorView,
  ViewerState,
  Interaction,
  ProfileView,
  ProfileViewBasic,
  ProfileViewDetailed,
  StatusView,
  Preferences as ActorPreferences,
  Like,
  Notification,
  BookmarkView,
  ConvoView,
  MessageView,
  VideoView,
  ImagesView,
  RecordWithMediaView,
  PostRecord,
  FeedGeneratorOutput,
  GetAuthorFeedOutput,
  GetFeedOutput,
  GetActorLikesOutput,
  GetRecordOutput,
  ListRecordsOutput,
  GetPreferencesOutput,
  PutActivitySubscriptionOutput,
  ListViewBasic,
};

// Re-export AtprotoRecord type for repo records
export type { AtprotoRecord };

// Re-export interaction event constants
export {
  REQUESTLESS,
  REQUESTMORE,
  CLICKTHROUGHITEM,
  CLICKTHROUGHAUTHOR,
  CLICKTHROUGHREPOSTER,
  CLICKTHROUGHEMBED,
  INTERACTIONSEEN,
  INTERACTIONLIKE,
  INTERACTIONREPOST,
  INTERACTIONREPLY,
  INTERACTIONQUOTE,
  INTERACTIONSHARE,
};

export type ExtendedPostView = PostView & {
  repostedBy?: {
    avatar?: string;
    displayName?: string;
    handle?: string;
  };
};

export type ExtendedFeedViewPost = FeedViewPost & {
  post: ExtendedPostView;
  uniqueKey?: string;
  // Simple moderation flags computed at feed level for performance
  shouldBlur?: boolean;
  shouldFilter?: boolean;
};

export type ThreadPost = ThreadViewPost | NotFoundPost | BlockedPost;

// Feed response types
export interface FeedResponse {
  feed: ExtendedFeedViewPost[];
  cursor: string | null;
}

export interface MessagesResponse {
  messages: MessageView[];
  cursor: string | null;
}

export interface ConversationsResponse {
  conversations: ConvoView[];
  cursor?: string | null;
}

// Author feed filter types
export type AuthorFilter =
  | 'posts_with_replies'
  | 'posts_no_replies'
  | 'posts_and_author_threads'
  | 'posts_with_media'
  | 'posts_with_video';

export type FeedType = 'author' | 'likes' | 'reposts' | 'authorVideos' | 'custom';

// Query parameter types
export interface QueryParams {
  actor: string;
  limit?: number;
  cursor?: string;
}

export interface FeedParams {
  [key: string]: unknown;
}

// API client response type (narrowed Agent)
export interface ApiClient {
  api: Agent['api'];
  isOAuth: boolean;
}

// Session types
export interface Session {
  did: string;
  type: 'oauth' | 'app_password';
}

// Comment/Reply types
export interface Comment {
  uri: string;
  cid: string;
  author: ProfileViewBasic;
  record: PostRecord;
  indexedAt: string;
  viewer?: ViewerState;
  likeCount?: number;
  replyCount?: number;
  replies?: Comment[];
  parent?: Comment | null;
}

export interface CommentsResponse {
  comments: Comment[];
  cursor: string | null;
}

// Likes response
export interface LikesResponse {
  likes: Like[];
  cursor: string | null;
}

// Profile search response
export interface ProfileSearchResponse {
  profiles: ProfileViewBasic[];
  cursor: string | null;
}

// Bookmarks response
export interface BookmarksResponse {
  bookmarks: ExtendedPostView[];
  cursor: string | null;
}

// Notifications response
export interface NotificationsResponse {
  notifications: Notification[];
  cursor: string | null;
}

// Followers/Following response
export interface FollowersResponse {
  followers: ProfileViewBasic[];
  cursor: string | null;
}

export interface FollowingResponse {
  following: ProfileViewBasic[];
  cursor: string | null;
}

// Video upload types
export interface UploadLimitsResponse {
  canUpload: boolean;
  remainingDailyVideos?: number;
  remainingDailyBytes?: number;
  message?: string;
  error?: string;
}

// Feed generator types
export interface FeedGeneratorResponse {
  generator: FeedGeneratorOutput | null;
  posts: ExtendedFeedViewPost[];
  cursor: string | null;
}

// Search response types
export interface VideoSearchResponse {
  videos: ExtendedFeedViewPost[];
  cursor: string | null;
}

/**
 * Type guard for ThreadViewPost.
 * Checks if a thread post is a valid ThreadViewPost (not NotFoundPost or BlockedPost).
 *
 * @param post - The thread post to check, which may be ThreadViewPost, NotFoundPost, or BlockedPost
 * @returns Type predicate indicating if post is a ThreadViewPost
 *
 * @example
 * ```typescript
 * const threadPost = await getThreadPost(uri);
 * if (isThreadViewPost(threadPost)) {
 *   // TypeScript knows threadPost is ThreadViewPost here
 *   const author = threadPost.post.author;
 * }
 * ```
 */
export function isThreadViewPost(post: ThreadPost): post is ThreadViewPost {
  return sdkIsThreadViewPost(post);
}

/**
 * Type guard for NotFoundPost.
 * Checks if a thread post indicates the post was not found.
 *
 * @param post - The thread post to check, which may be ThreadViewPost, NotFoundPost, or BlockedPost
 * @returns Type predicate indicating if post is a NotFoundPost
 *
 * @example
 * ```typescript
 * const threadPost = await getThreadPost(uri);
 * if (isNotFoundPost(threadPost)) {
 *   // TypeScript knows threadPost is NotFoundPost here
 *   // handle not found state
 * }
 * ```
 */
export function isNotFoundPost(post: ThreadPost): post is NotFoundPost {
  return sdkIsNotFoundPost(post);
}

/**
 * Type guard for BlockedPost.
 * Checks if a thread post indicates the post is blocked.
 *
 * @param post - The thread post to check, which may be ThreadViewPost, NotFoundPost, or BlockedPost
 * @returns Type predicate indicating if post is a BlockedPost
 *
 * @example
 * ```typescript
 * const threadPost = await getThreadPost(uri);
 * if (isBlockedPost(threadPost)) {
 *   // TypeScript knows threadPost is BlockedPost here
 *   // handle blocked post state
 * }
 * ```
 */
export function isBlockedPost(post: ThreadPost): post is BlockedPost {
  return sdkIsBlockedPost(post);
}

/**
 * Type guard for video embeds.
 * Checks if an embed is of type `app.bsky.embed.video` or `app.bsky.embed.video#view`.
 *
 * @param embed - The embed object from a post, which may be null or undefined
 * @returns Type predicate indicating if embed is a VideoView
 *
 * @example
 * ```typescript
 * const embed = post.embed;
 * if (isVideoEmbed(embed)) {
 *   // TypeScript knows embed is VideoView here
 *   const playlist = embed.playlist;
 * }
 * ```
 */
export function isVideoEmbed(
  embed: FeedViewPost['post']['embed'] | null | undefined
): embed is VideoView & FeedViewPost['post']['embed'] {
  if (!embed || typeof embed !== 'object') return false;
  return embed.$type === 'app.bsky.embed.video' || embed.$type === 'app.bsky.embed.video#view';
}

/**
 * Type guard for video embeds within recordWithMedia.
 * Checks if an embed is of type `app.bsky.embed.recordWithMedia#view` and contains a video in the media field.
 *
 * @param embed - The embed object from a post, which may be null or undefined
 * @returns Type predicate indicating if embed is a RecordWithMediaView containing a VideoView
 *
 * @example
 * ```typescript
 * const embed = post.embed;
 * if (isVideoEmbedInMedia(embed)) {
 *   // TypeScript knows embed is RecordWithMediaView with VideoView media here
 *   const videoPlaylist = embed.media.playlist;
 * }
 * ```
 */
export function isVideoEmbedInMedia(
  embed: FeedViewPost['post']['embed'] | null | undefined
): embed is RecordWithMediaView & FeedViewPost['post']['embed'] {
  if (!embed || typeof embed !== 'object') return false;
  if (embed.$type === 'app.bsky.embed.recordWithMedia#view') {
    const mediaEmbed = (embed as RecordWithMediaView).media;
    return (
      mediaEmbed?.$type === 'app.bsky.embed.video' ||
      mediaEmbed?.$type === 'app.bsky.embed.video#view'
    );
  }
  return false;
}

// Record value type (used by ATProto records)
// Records are dynamic objects with string keys and unknown values
export type RecordValue = {
  [_ in string]: unknown;
} & {
  $type?: string;
};

// Profile record types
export interface ProfileRecord extends RecordValue {
  displayName?: string;
  description?: string;
  avatar?: { $type: string; ref: { $link: string } };
  banner?: { $type: string; ref: { $link: string } };
}

export interface OrbytProfileRecord extends RecordValue {
  $type: 'com.getorbyt.profile';
  joinDate?: string;
  updatedAt?: string;
  colors?: { backgroundColor: string; textColor: string } | null;
  subscribedChannels?: string[];
  algorithmicFeedProvider?: string | null;
}

// Repost type (based on FeedViewPost structure)
export interface RepostView {
  uri: string;
  cid: string;
  author: ProfileViewBasic;
  indexedAt: string;
  repostedBy?: ProfileViewBasic;
}

// Utility types
export type ApiResponse<T> = {
  data: T;
  success: boolean;
  error?: string;
};

export type CreateRecordResponse = {
  uri: string;
  cid: string;
};

// Component-friendly type aliases for UI usage
// These make it easier for components to use API types
export type Post = ExtendedPostView;
export type FeedItem = ExtendedFeedViewPost;
