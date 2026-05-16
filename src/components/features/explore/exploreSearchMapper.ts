import type { TFunction } from 'i18next';

import type { ExtendedFeedViewPost, ProfileViewWithOrbyt } from '@/services/api/types';
import { isCurrentUser } from '@/utils/atproto/isCurrentUser';
import type { UserState } from '@/stores/userStore';
import type { CachedChannel } from '@/services/data/ChannelService';
import type { SearchFeedPost } from './types';

/**
 * Map explore search feed posts to profile/channel results.
 * Generator URIs are handled as channels first; other records with an author become profile hits.
 */
export function mapSearchFeedToResults(
  searchFeed: ExtendedFeedViewPost[],
  options: {
    currentUser: UserState['currentUser'];
    t: TFunction;
  }
): { profiles: ProfileViewWithOrbyt[]; channels: CachedChannel[] } {
  const { currentUser, t } = options;
  const profiles: ProfileViewWithOrbyt[] = [];
  const channels: CachedChannel[] = [];

  for (let index = 0; index < searchFeed.length; index++) {
    const feedItem = searchFeed[index];
    const post = feedItem.post as SearchFeedPost;

    const isChannel = post.uri?.includes('app.bsky.feed.generator');

    if (isChannel) {
      const contentMode = post.contentMode;
      if (contentMode && contentMode !== 'app.bsky.feed.defs#contentModeVideo') {
        continue;
      }

      channels.push({
        uri: post.uri ?? '',
        cid: post.cid ?? '',
        did: post.author?.did || '',
        displayName: post.text || post.author?.displayName || t('feed.unknownChannel'),
        description: post.description || '',
        creator: post.author
          ? {
              did: post.author.did || '',
              handle: post.author.handle || '',
              displayName: post.author.displayName || '',
              avatar: post.author.avatar || '',
            }
          : {
              did: '',
              handle: '',
            },
        avatar: post.avatar || post.author?.avatar || '',
        likeCount: post.likeCount || 0,
        indexedAt: post.indexedAt || new Date().toISOString(),
        lastUpdated: Date.now(),
      });
      continue;
    }

    // Any record with an author counts as a people hit unless it is a feed generator
    // (generators are handled above). Search returns varied AT URI collections; do not
    // whitelist only post/profile paths or most results disappear.
    if (
      post.author &&
      (post.uri?.includes('/profile') || !post.uri?.includes('app.bsky.feed.generator'))
    ) {
      profiles.push(post.author as ProfileViewWithOrbyt);
      continue;
    }

    if (post.embed?.$type === 'app.bsky.embed.record') {
      const postText = post.text || '';
      const embedRecord = (
        post.embed as {
          record?: {
            uri?: string;
            cid?: string;
            contentMode?: string;
            view?: { contentMode?: string };
          };
        }
      )?.record;
      const isEmbedChannel = embedRecord?.uri?.includes('app.bsky.feed.generator');

      if (isEmbedChannel) {
        channels.push({
          uri: embedRecord?.uri || post.uri || '',
          cid: embedRecord?.cid ?? post.cid ?? '',
          did: post.author?.did || '',
          displayName: postText || t('feed.unknownChannel'),
          description: postText || '',
          creator: post.author
            ? {
                did: post.author.did || '',
                handle: post.author.handle || '',
                displayName: post.author.displayName || '',
                avatar: post.author.avatar || '',
              }
            : {
                did: '',
                handle: '',
              },
          indexedAt: post.indexedAt || new Date().toISOString(),
          lastUpdated: Date.now(),
        });
        continue;
      }
    }
  }

  return {
    profiles: profiles.filter(profile => !isCurrentUser(profile.did, profile.handle, currentUser)),
    channels,
  };
}
