import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData, QueryKey } from '@tanstack/react-query';
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

type FeedSnapshot = [QueryKey, InfiniteData<FeedResponse> | undefined];

export function useRepostMutation() {
  const queryClient = useQueryClient();

  return useMutation<string | undefined, Error, RepostVars, { snapshots: FeedSnapshot[] }>({
    mutationFn: async ({ postUri, postCid, isReposted, repostUri }) => {
      if (!isReposted) return AtprotoFeedService.repostPost(postUri, postCid);
      if (!repostUri) throw new Error('No repost URI');
      await AtprotoFeedService.deleteRepost(repostUri);
      return undefined;
    },

    onMutate: async ({ postUri, isReposted, repostCount }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.feed.all });
      const newIsReposted = !isReposted;
      const newCount = newIsReposted ? repostCount + 1 : Math.max(0, repostCount - 1);
      const snapshots = queryClient.getQueriesData<InfiniteData<FeedResponse>>({
        queryKey: queryKeys.feed.all,
      }) as FeedSnapshot[];
      queryClient.setQueriesData<InfiniteData<FeedResponse>>(
        { queryKey: queryKeys.feed.all },
        old =>
          patchFeedPost(old, postUri, post => ({
            ...post,
            repostCount: newCount,
            viewer: { ...post.viewer, repost: newIsReposted ? 'optimistic' : undefined },
          }))
      );
      return { snapshots };
    },

    onSuccess: (repostUri, { postUri, isReposted }) => {
      const newIsReposted = !isReposted;
      if (newIsReposted) {
        try {
          logShare(getAnalytics(), {
            content_type: 'video',
            item_id: postUri,
            method: 'repost',
          }).catch(() => {});
        } catch (_error) {
          // Firebase not initialized yet, ignore
        }
      }
      queryClient.setQueriesData<InfiniteData<FeedResponse>>(
        { queryKey: queryKeys.feed.all },
        old =>
          patchFeedPost(old, postUri, post => ({
            ...post,
            viewer: { ...post.viewer, repost: newIsReposted ? repostUri : undefined },
          }))
      );
    },

    onError: (_, __, context) => {
      for (const [key, data] of context?.snapshots ?? []) queryClient.setQueryData(key, data);
    },
  });
}
