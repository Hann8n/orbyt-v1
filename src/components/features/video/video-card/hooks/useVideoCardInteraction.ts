import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData, QueryKey } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

import { AtprotoFeedService } from '../../../../../services/api/feed/FeedService';
import { useLikeMutation, patchFeedPost } from '@/hooks/useLikeMutation';
import { queryKeys } from '../../../../../utils/query/queryKeys';
import type { ExtendedPostView, FeedResponse } from '../../../../../services/api/types';

type FeedSnapshot = [QueryKey, InfiniteData<FeedResponse> | undefined];

export type VideoCardInteractionDisplay = {
  isLiked: boolean;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  isReposted: boolean;
  isBookmarked: boolean;
  likeUri?: string;
  repostUri?: string;
};

export interface UseVideoCardInteractionArgs {
  postView: ExtendedPostView;
  feedOption?: string;
}

export interface UseVideoCardInteractionResult {
  display: VideoCardInteractionDisplay;
  isLikePending: boolean;
  isRepostPending: boolean;
  handleLike: () => Promise<void>;
  handleLikeOnly: () => Promise<void>;
  handleRepost: () => Promise<void>;
}

export function useVideoCardInteraction({
  postView,
}: UseVideoCardInteractionArgs): UseVideoCardInteractionResult {
  const queryClient = useQueryClient();

  // Source of truth is the feed query cache — patched optimistically by mutations.
  const display = useMemo<VideoCardInteractionDisplay>(
    () => ({
      isLiked: !!postView.viewer?.like,
      likeCount: postView.likeCount ?? 0,
      commentCount: postView.replyCount ?? 0,
      repostCount: postView.repostCount ?? 0,
      isReposted: !!postView.viewer?.repost,
      isBookmarked: false,
      likeUri: postView.viewer?.like,
      repostUri: postView.viewer?.repost,
    }),
    [
      postView.viewer?.like,
      postView.likeCount,
      postView.replyCount,
      postView.repostCount,
      postView.viewer?.repost,
    ]
  );

  const displayRef = useRef(display);
  const pendingRef = useRef({ isLikePending: false, isRepostPending: false });

  const likeMutation = useLikeMutation();

  const repostMutation = useMutation<
    string | undefined,
    Error,
    { postUri: string; postCid: string; isReposted: boolean; repostUri?: string; repostCount: number },
    { snapshots: FeedSnapshot[] }
  >({
    mutationFn: async ({ postUri, postCid, isReposted, repostUri }) => {
      if (!isReposted) return AtprotoFeedService.repostPost(postUri, postCid);
      if (!repostUri) throw new Error('No repost URI');
      await AtprotoFeedService.deleteRepost(repostUri);
      return undefined;
    },
    onMutate: ({ postUri, isReposted, repostCount }) => {
      const newIsReposted = !isReposted;
      const newCount = newIsReposted ? repostCount + 1 : Math.max(0, repostCount - 1);
      const snapshots = queryClient.getQueriesData<InfiniteData<FeedResponse>>({
        queryKey: queryKeys.feed.all,
      }) as FeedSnapshot[];
      queryClient.setQueriesData<InfiniteData<FeedResponse>>(
        { queryKey: queryKeys.feed.all },
        old => patchFeedPost(old, postUri, post => ({
          ...post,
          repostCount: newCount,
          viewer: { ...post.viewer, repost: newIsReposted ? 'optimistic' : undefined },
        }))
      );
      return { snapshots };
    },
    onSuccess: (repostUri, { postUri, isReposted }) => {
      const newIsReposted = !isReposted;
      queryClient.setQueriesData<InfiniteData<FeedResponse>>(
        { queryKey: queryKeys.feed.all },
        old => patchFeedPost(old, postUri, post => ({
          ...post,
          viewer: { ...post.viewer, repost: newIsReposted ? repostUri : undefined },
        }))
      );
    },
    onError: (_, __, context) => {
      for (const [key, data] of context?.snapshots ?? []) queryClient.setQueryData(key, data);
    },
  });

  useLayoutEffect(() => {
    displayRef.current = display;
    pendingRef.current.isLikePending = likeMutation.isPending;
    pendingRef.current.isRepostPending = repostMutation.isPending;
  }, [display, likeMutation.isPending, repostMutation.isPending]);

  const handleLike = useCallback(async () => {
    if (likeMutation.isPending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { isLiked, likeUri, likeCount } = displayRef.current;
    await likeMutation.mutateAsync({
      postUri: postView.uri,
      postCid: postView.cid,
      isLiked,
      likeUri,
      likeCount,
    });
  }, [likeMutation, postView.uri, postView.cid]);

  const handleLikeOnly = useCallback(async () => {
    if (displayRef.current.isLiked || likeMutation.isPending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { likeUri, likeCount } = displayRef.current;
    await likeMutation.mutateAsync({
      postUri: postView.uri,
      postCid: postView.cid,
      isLiked: false,
      likeUri,
      likeCount,
    });
  }, [likeMutation, postView.uri, postView.cid]);

  const handleRepost = useCallback(async () => {
    if (repostMutation.isPending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { isReposted, repostUri, repostCount } = displayRef.current;
    await repostMutation.mutateAsync({
      postUri: postView.uri,
      postCid: postView.cid,
      isReposted,
      repostUri,
      repostCount,
    });
  }, [repostMutation, postView.uri, postView.cid]);

  return {
    display,
    isLikePending: likeMutation.isPending,
    isRepostPending: repostMutation.isPending,
    handleLike,
    handleLikeOnly,
    handleRepost,
  };
}
