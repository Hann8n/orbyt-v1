import { feedService } from '@/services/FeedService';
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
