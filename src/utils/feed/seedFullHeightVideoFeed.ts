import { moderatePost } from '@atproto/api';

import { feedService } from '@/services/FeedService';
import { ModerationService } from '@/services/moderation/ModerationService';
import type { ExtendedFeedViewPost, PostView } from '@/services/api/types';

/**
 * Seeds `feedService` for full-height video routes from a `PostView` (e.g. notifications).
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
