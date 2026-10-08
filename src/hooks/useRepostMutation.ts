import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { getAnalytics, logShare } from '@react-native-firebase/analytics';
import { AtprotoFeedService } from '../services/api/feed/FeedService';
import { queryKeys } from '../utils/query/queryKeys';
import { patchFeedPost } from './useLikeMutation';
import type { FeedResponse } from '../services/api/types';

export interface RepostVars {
  postUri: string;
  postCid: string;
  isReposted: boolean;
  repostUri?: string;
  repostCount: number;
}

const OPTIMISTIC_REPOST_URI = 'optimistic';

export function useRepostMutation() {
  const queryClient = useQueryClient();

  const setPostRepost = (postUri: string, repost: string | undefined, repostCount?: number) =>
    queryClient.setQueriesData<InfiniteData<FeedResponse>>({ queryKey: queryKeys.feed.all }, old =>
      patchFeedPost(old, postUri, post => ({
        ...post,
        ...(repostCount === undefined ? null : { repostCount }),
        viewer: { ...post.viewer, repost },
      }))
    );

  return useMutation<string | undefined, Error, RepostVars>({
    mutationFn: async ({ postUri, postCid, isReposted, repostUri }) => {
      if (!isReposted) return AtprotoFeedService.repostPost(postUri, postCid);
      // Another surface's repost is still in flight; there is no record to delete yet.
      if (!repostUri || repostUri === OPTIMISTIC_REPOST_URI) throw new Error('No repost URI');
      await AtprotoFeedService.deleteRepost(repostUri);
      return undefined;
    },

    onMutate: async ({ postUri, isReposted, repostCount }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.feed.all });
      const newIsReposted = !isReposted;
      const newCount = newIsReposted ? repostCount + 1 : Math.max(0, repostCount - 1);
      setPostRepost(postUri, newIsReposted ? OPTIMISTIC_REPOST_URI : undefined, newCount);
    },

    onSuccess: (repostUri, { postUri, isReposted }) => {
      const newIsReposted = !isReposted;
      if (newIsReposted) {
        logShare(getAnalytics(), {
          content_type: 'video',
          item_id: postUri,
          method: 'repost',
        }).catch(() => {});
      }
      setPostRepost(postUri, newIsReposted ? repostUri : undefined);
    },

    // Roll back only this post; restoring whole-cache snapshots would undo concurrent mutations.
    onError: (_, { postUri, isReposted, repostUri, repostCount }) => {
      setPostRepost(postUri, isReposted ? repostUri : undefined, repostCount);
    },
  });
}
