/**
 * Narrowed type helpers for the AT Protocol API layer (`@atproto/api` generated types).
 *
 * All types are re-exported from public `@atproto/api` namespaces.
 * Use SDK-native type guards (`AppBskyFeedDefs.isNotFoundPost`, etc.) directly.
 */
import type { Agent, ModerationUI } from '@atproto/api';
import {
  AppBskyFeedDefs,
  AppBskyFeedPost,
  AppBskyFeedGetAuthorFeed,
  AppBskyFeedGetFeed,
  AppBskyFeedGetActorLikes,
  AppBskyFeedGetLikes,
  AppBskyFeedGetFeedGenerator,
  AppBskyActorDefs,
  AppBskyActorGetPreferences,
  AppBskyGraphDefs,
  AppBskyEmbedVideo,
  AppBskyEmbedImages,
  AppBskyEmbedRecordWithMedia,
  AppBskyBookmarkDefs,
  AppBskyNotificationListNotifications,
  AppBskyNotificationPutActivitySubscription,
  ChatBskyConvoDefs,
  ComAtprotoRepoGetRecord,
  ComAtprotoRepoListRecords,
} from '@atproto/api';

export type FeedViewPost = AppBskyFeedDefs.FeedViewPost;
export type PostView = AppBskyFeedDefs.PostView;
export type ThreadViewPost = AppBskyFeedDefs.ThreadViewPost;
export type NotFoundPost = AppBskyFeedDefs.NotFoundPost;
export type BlockedPost = AppBskyFeedDefs.BlockedPost;
export type GeneratorView = AppBskyFeedDefs.GeneratorView;
export type ViewerState = AppBskyFeedDefs.ViewerState;
export type Interaction = AppBskyFeedDefs.Interaction;

export type ProfileView = AppBskyActorDefs.ProfileView;
export type ProfileViewBasic = AppBskyActorDefs.ProfileViewBasic;
export type ProfileViewDetailed = AppBskyActorDefs.ProfileViewDetailed;
export type Preferences = AppBskyActorDefs.Preferences;
export type StatusView = AppBskyActorDefs.StatusView;

export type ListViewBasic = AppBskyGraphDefs.ListViewBasic;

export type VideoView = AppBskyEmbedVideo.View;
export type ImagesView = AppBskyEmbedImages.View;
export type RecordWithMediaView = AppBskyEmbedRecordWithMedia.View;

export type BookmarkView = AppBskyBookmarkDefs.BookmarkView;

export type Notification = AppBskyNotificationListNotifications.Notification;

export type ConvoView = ChatBskyConvoDefs.ConvoView;
export type MessageView = ChatBskyConvoDefs.MessageView;
export type DeletedMessageView = ChatBskyConvoDefs.DeletedMessageView;
export type MessageViewSender = ChatBskyConvoDefs.MessageViewSender;
export type ReactionView = ChatBskyConvoDefs.ReactionView;
export type ReactionViewSender = ChatBskyConvoDefs.ReactionViewSender;
export type MessageAndReactionView = ChatBskyConvoDefs.MessageAndReactionView;

export type GetRecordOutput = ComAtprotoRepoGetRecord.OutputSchema;
export type ListRecordsOutput = ComAtprotoRepoListRecords.OutputSchema;
export type AtprotoRecord = ComAtprotoRepoListRecords.Record;

export type PostRecord = AppBskyFeedPost.Record;

export type FeedGeneratorOutput = AppBskyFeedGetFeedGenerator.OutputSchema;
export type GetAuthorFeedOutput = AppBskyFeedGetAuthorFeed.OutputSchema;
export type GetFeedOutput = AppBskyFeedGetFeed.OutputSchema;
export type GetActorLikesOutput = AppBskyFeedGetActorLikes.OutputSchema;

export type GetPreferencesOutput = AppBskyActorGetPreferences.OutputSchema;

export type PutActivitySubscriptionOutput = AppBskyNotificationPutActivitySubscription.OutputSchema;

type Like = AppBskyFeedGetLikes.OutputSchema['likes'][number];
export type { Like };

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

export const INTERACTIONSEEN = AppBskyFeedDefs.INTERACTIONSEEN;

export type { Agent, ModerationUI };

export type ExtendedPostView = PostView & {
  repostedBy?: {
    avatar?: string;
    displayName?: string;
    handle?: string;
  };
  bookmarkSubject?: { uri: string; cid: string };
};

export type ExtendedFeedViewPost = FeedViewPost & {
  post: ExtendedPostView;
  uniqueKey?: string;
  shouldFilter?: boolean;
  contentListUI?: ModerationUI;
  contentMediaUI?: ModerationUI;
  avatarUI?: ModerationUI;
};

export type ThreadPost = ThreadViewPost | NotFoundPost | BlockedPost;

export type RawFeedApiOutput = GetFeedOutput | GetAuthorFeedOutput | GetActorLikesOutput;

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

export type AuthorFilter =
  | 'posts_with_replies'
  | 'posts_no_replies'
  | 'posts_and_author_threads'
  | 'posts_with_media'
  | 'posts_with_video';

export type FeedType = 'author' | 'likes' | 'reposts' | 'authorVideos' | 'custom';

export interface QueryParams {
  actor: string;
  limit?: number;
  cursor?: string;
}

export interface ApiClient {
  api: Agent['api'];
  isOAuth: boolean;
}

export interface Session {
  did: string;
  type: 'oauth' | 'app_password';
}

export interface Comment {
  uri: string;
  cid: string;
  author: ProfileViewBasic;
  record: PostRecord;
  embed?: PostView['embed'];
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

export interface LikesResponse {
  likes: Like[];
  cursor: string | null;
}

export interface ProfileSearchResponse {
  profiles: ProfileViewBasic[];
  cursor: string | null;
}

export interface BookmarksResponse {
  bookmarks: ExtendedPostView[];
  cursor: string | null;
}

export interface NotificationsResponse {
  notifications: Notification[];
  cursor: string | null;
}

export interface FollowersResponse {
  followers: ProfileViewBasic[];
  cursor: string | null;
}

export interface FollowingResponse {
  following: ProfileViewBasic[];
  cursor: string | null;
}

export interface UploadLimitsResponse {
  canUpload: boolean;
  remainingDailyVideos?: number;
  remainingDailyBytes?: number;
  message?: string;
  error?: string;
}

export interface FeedGeneratorResponse {
  generator: FeedGeneratorOutput | null;
  posts: ExtendedFeedViewPost[];
  cursor: string | null;
}

export interface VideoSearchResponse {
  videos: ExtendedFeedViewPost[];
  cursor: string | null;
}

export type RecordValue = {
  [_ in string]: unknown;
} & {
  $type?: string;
};

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
  /** Retired: read once to migrate pre-Communities subscriptions. */
  subscribedChannels?: string[];
  fontPreference?: string;
}

export interface RepostView {
  uri: string;
  cid: string;
  author: ProfileViewBasic;
  indexedAt: string;
  repostedBy?: ProfileViewBasic;
}

export type ApiResponse<T> = {
  data: T;
  success: boolean;
  error?: string;
};

export type CreateRecordResponse = {
  uri: string;
  cid: string;
};

export type Post = ExtendedPostView;
export type FeedItem = ExtendedFeedViewPost;

export type ProfileViewWithOrbyt = ProfileView & {
  orbytRecord?: OrbytProfileRecord | null;
};
