import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData, QueryKey } from '@tanstack/react-query';
import { AtprotoFeedService } from '../services/api/feed/FeedService';
import { queryKeys } from '../utils/query/queryKeys';
import type { FeedResponse, ExtendedPostView } from '../services/api/types';

export function patchFeedPost(
  data: InfiniteData<FeedResponse> | undefined,
  postUri: string,
  patch: (post: ExtendedPostView) => ExtendedPostView
): InfiniteData<FeedResponse> | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map(page => ({
      ...page,
      feed: page.feed.map(item =>
        item.post.uri === postUri ? { ...item, post: patch(item.post) } : item
      ),
    })),
  };
}

export interface LikeVars {
  postUri: string;
  postCid: string;
  isLiked: boolean;
  likeUri?: string;
  likeCount: number;
}

type FeedSnapshot = [QueryKey, InfiniteData<FeedResponse> | undefined];

export function useLikeMutation() {
  const queryClient = useQueryClient();

  return useMutation<string | undefined, Error, LikeVars, { snapshots: FeedSnapshot[] }>({
    mutationFn: async ({ postUri, postCid, isLiked, likeUri }) => {
      if (!isLiked) return AtprotoFeedService.likePost(postUri, postCid);
      if (!likeUri) throw new Error('No like URI');
      await AtprotoFeedService.deleteLike(likeUri);
      return undefined;
    },

    onMutate: ({ postUri, isLiked, likeCount }) => {
      const newIsLiked = !isLiked;
      const newCount = newIsLiked ? likeCount + 1 : Math.max(0, likeCount - 1);
      const snapshots = queryClient.getQueriesData<InfiniteData<FeedResponse>>({
        queryKey: queryKeys.feed.all,
      }) as FeedSnapshot[];
      queryClient.setQueriesData<InfiniteData<FeedResponse>>(
        { queryKey: queryKeys.feed.all },
        old =>
          patchFeedPost(old, postUri, post => ({
            ...post,
            likeCount: newCount,
            viewer: { ...post.viewer, like: newIsLiked ? 'optimistic' : undefined },
          }))
      );
      return { snapshots };
    },

    onSuccess: (likeUri, { postUri, isLiked }) => {
      const newIsLiked = !isLiked;
      queryClient.setQueriesData<InfiniteData<FeedResponse>>(
        { queryKey: queryKeys.feed.all },
        old =>
          patchFeedPost(old, postUri, post => ({
            ...post,
            viewer: { ...post.viewer, like: newIsLiked ? likeUri : undefined },
          }))
      );
    },

    onError: (_, __, context) => {
      for (const [key, data] of context?.snapshots ?? []) queryClient.setQueryData(key, data);
    },
  });
}
