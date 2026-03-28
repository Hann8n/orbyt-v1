import { moderatePost } from '@atproto/api';

import { feedService } from '@/services/FeedService';
import { ModerationService } from '@/services/moderation/ModerationService';
import type { ExtendedFeedViewPost, PostView } from '@/services/api/types';

/** Minimal embed.record (viewRecord) fields needed to open full-height video from chat. */
export type ChatEmbedRecordForVideo = {
  uri?: string;
  cid?: string;
  author?: {
    did: string;
    handle?: string;
    displayName?: string;
    avatar?: string;
  };
  value?: unknown;
  embeds?: unknown[] | undefined;
  indexedAt?: string;
  replyCount?: number;
  repostCount?: number;
  likeCount?: number;
};

/** Seeds `feedService` with a single post for `/(modals)/full-height-video`. Returns whether seeding ran. */
export function seedChatEmbedVideoFeed(record: ChatEmbedRecordForVideo): boolean {
  const uri = record.uri ?? '';
  if (!uri || !record.author) return false;

  const postFromRecord: PostView = {
    uri,
    cid: record.cid ?? '',
    author: {
      did: record.author.did,
      handle: record.author.handle,
      displayName: record.author.displayName,
      avatar: record.author.avatar,
    } as PostView['author'],
    record: (record.value ?? {}) as PostView['record'],
    embed: record.embeds?.[0] as PostView['embed'],
    indexedAt: record.indexedAt ?? new Date().toISOString(),
    replyCount: record.replyCount ?? 0,
    repostCount: record.repostCount ?? 0,
    likeCount: record.likeCount ?? 0,
  };

  feedService.setCurrentFeed([
    {
      post: postFromRecord as ExtendedFeedViewPost['post'],
      uniqueKey: uri,
    },
  ]);
  return true;
}

/**
 * Seeds `feedService` for `/(modals)/full-height-video` from a `PostView` (e.g. notifications).
 * Synchronous; mirrors `AtprotoFeedService.applyModerationBatch` for a single item.
 * Returns false when the post should not be shown (`contentList.filter`).
 */
export function seedFullHeightVideoFeedFromPostView(
  postData: PostView,
  uniqueKey: string,
  userDid: string | undefined
): boolean {
  const opts = ModerationService.getModerationOpts(userDid ?? undefined);
  const base = {
    post: postData,
    uniqueKey,
  } as ExtendedFeedViewPost;

  if (!opts) {
    feedService.setCurrentFeed([base]);
    return true;
  }

  const mod = moderatePost(postData, opts);
  if (mod.ui('contentList').filter) {
    return false;
  }

  feedService.setCurrentFeed([
    {
      ...base,
      contentListUI: mod.ui('contentList'),
      contentMediaUI: mod.ui('contentMedia'),
      avatarUI: mod.ui('avatar'),
    } as ExtendedFeedViewPost,
  ]);
  return true;
}
