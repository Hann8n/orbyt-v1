import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { getAnalytics, logEvent } from '@react-native-firebase/analytics';
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

const OPTIMISTIC_LIKE_URI = 'optimistic';

export function useLikeMutation() {
  const queryClient = useQueryClient();

  const setPostLike = (postUri: string, like: string | undefined, likeCount?: number) =>
    queryClient.setQueriesData<InfiniteData<FeedResponse>>({ queryKey: queryKeys.feed.all }, old =>
      patchFeedPost(old, postUri, post => ({
        ...post,
        ...(likeCount === undefined ? null : { likeCount }),
        viewer: { ...post.viewer, like },
      }))
    );

  return useMutation<string | undefined, Error, LikeVars>({
    mutationFn: async ({ postUri, postCid, isLiked, likeUri }) => {
      if (!isLiked) return AtprotoFeedService.likePost(postUri, postCid);
      // Another surface's like is still in flight; there is no record to delete yet.
      if (!likeUri || likeUri === OPTIMISTIC_LIKE_URI) throw new Error('No like URI');
      await AtprotoFeedService.deleteLike(likeUri);
      return undefined;
    },

    onMutate: ({ postUri, isLiked, likeCount }) => {
      const newIsLiked = !isLiked;
      const newCount = newIsLiked ? likeCount + 1 : Math.max(0, likeCount - 1);
      setPostLike(postUri, newIsLiked ? OPTIMISTIC_LIKE_URI : undefined, newCount);
    },

    onSuccess: (likeUri, { postUri, isLiked }) => {
      const newIsLiked = !isLiked;
      if (newIsLiked) {
        logEvent(getAnalytics(), 'video_like', { post_uri: postUri, content_type: 'video' }).catch(
          () => {}
        );
      }
      setPostLike(postUri, newIsLiked ? likeUri : undefined);
    },

    // Roll back only this post; restoring whole-cache snapshots would undo concurrent mutations.
    onError: (_, { postUri, isLiked, likeUri, likeCount }) => {
      setPostLike(postUri, isLiked ? likeUri : undefined, likeCount);
    },
  });
}
