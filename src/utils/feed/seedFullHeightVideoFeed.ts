import { moderatePost } from '@atproto/api';

import { feedService } from '@/services/FeedService';
import { ModerationService } from '@/services/moderation/ModerationService';
import type { ExtendedFeedViewPost, PostView } from '@/services/api/types';

/**
 * The full-height video feed item for a `PostView`, moderated like
 * `AtprotoFeedService.applyModerationBatch` does for a single item.
 * Returns null when the post should not be shown (`contentList.filter`).
 */
export function fullHeightVideoFeedItem(
  postData: PostView,
  uniqueKey: string,
  userDid: string | undefined
): ExtendedFeedViewPost | null {
  const opts = ModerationService.getModerationOpts(userDid ?? undefined);
  const base = {
    post: postData,
    uniqueKey,
  } as ExtendedFeedViewPost;

  if (!opts) return base;

  const mod = moderatePost(postData, opts);
  if (mod.ui('contentList').filter) {
    return null;
  }

  return {
    ...base,
    contentListUI: mod.ui('contentList'),
    contentMediaUI: mod.ui('contentMedia'),
    avatarUI: mod.ui('avatar'),
  } as ExtendedFeedViewPost;
}

/**
 * Seeds `feedService` for full-height video routes from a `PostView` (e.g. notifications).
 * Synchronous. Returns false when the post should not be shown.
 */
export function seedFullHeightVideoFeedFromPostView(
  postData: PostView,
  uniqueKey: string,
  userDid: string | undefined
): boolean {
  const item = fullHeightVideoFeedItem(postData, uniqueKey, userDid);
  if (!item) return false;
  feedService.setCurrentFeed([item]);
  return true;
}
