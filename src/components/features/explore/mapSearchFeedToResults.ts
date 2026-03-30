import type { TFunction } from 'i18next';

import type { ExtendedFeedViewPost } from '@/services/api/types';
import { isCurrentUser } from '@/stores/profileInteractionStore';
import type { UserState } from '@/stores/userStore';

import type { Channel, Profile, SearchResult, SearchFeedPost } from './types';

type FollowMap = Map<string, { isFollowing?: boolean }> | undefined;

function relevanceScore(index: number): number {
  return Math.max(0, 10 - index);
}

/**
 * Map explore search feed posts to profile/channel results.
 * Generator URIs are handled as channels first; other records with an author become profile hits.
 */
export function mapSearchFeedToResults(
  searchFeed: ExtendedFeedViewPost[],
  options: {
    followStoreFollows: FollowMap;
    currentUser: UserState['currentUser'];
    t: TFunction;
  }
): SearchResult[] {
  const { followStoreFollows, currentUser, t } = options;
  const results: SearchResult[] = [];

  for (let index = 0; index < searchFeed.length; index++) {
    const feedItem = searchFeed[index];
    const post = feedItem.post as SearchFeedPost;

    const isChannel = post.uri?.includes('app.bsky.feed.generator');

    if (isChannel) {
      const contentMode = post.contentMode;
      if (contentMode && contentMode !== 'app.bsky.feed.defs#contentModeVideo') {
        continue;
      }

      results.push({
        type: 'channel' as const,
        data: {
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
          contentMode,
        } as Channel & { contentMode?: string },
        relevance: relevanceScore(index),
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
      const author = post.author;
      const postText = post.text || '';
      const did = author.did || '';
      const followStoreState = followStoreFollows?.get(did);

      results.push({
        type: 'profile' as const,
        data: {
          did,
          handle: author.handle || '',
          displayName: author.displayName || '',
          avatar: author.avatar || '',
          description: postText || '',
          viewer: {
            following: followStoreState?.isFollowing ? 'at://placeholder' : post.viewer?.following,
          },
          verification: author.verification,
          status: author.status,
        } as Profile,
        relevance: relevanceScore(index),
      });
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
        const contentMode = embedRecord?.contentMode || embedRecord?.view?.contentMode;
        results.push({
          type: 'channel' as const,
          data: {
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
            contentMode,
          } as Channel & { contentMode?: string },
          relevance: relevanceScore(index),
        });
        continue;
      }
    }
  }

  return results.filter(result => {
    if (result.type === 'profile') {
      const profile = result.data as Profile;
      if (isCurrentUser(profile.did, profile.handle, currentUser)) {
        return false;
      }
    }
    return true;
  });
}
