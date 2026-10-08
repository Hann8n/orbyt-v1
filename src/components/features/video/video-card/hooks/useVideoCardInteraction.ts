import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';

import { isPostTogglePending, useLikeMutation } from '@/hooks/useLikeMutation';
import { useRepostMutation } from '@/hooks/useRepostMutation';
import type { ExtendedPostView } from '../../../../../services/api/types';

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
  handleLike: () => void;
  handleLikeOnly: () => void;
  handleRepost: () => void;
}

export function useVideoCardInteraction({
  postView,
}: UseVideoCardInteractionArgs): UseVideoCardInteractionResult {
  const likeMutation = useLikeMutation();
  const repostMutation = useRepostMutation();

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

  const queryClient = useQueryClient();
  const displayRef = useRef(display);

  useLayoutEffect(() => {
    displayRef.current = display;
  }, [display]);

  // Taps read the cache-derived state of the moment and are ignored while a like or repost of
  // this post is in flight on any surface (the comment sheet included).
  const like = useCallback(
    (only: boolean) => {
      const { isLiked, likeUri, likeCount } = displayRef.current;
      if ((only && isLiked) || isPostTogglePending(queryClient, 'like', postView.uri)) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      likeMutation.mutate({
        postUri: postView.uri,
        postCid: postView.cid,
        isLiked,
        likeUri,
        likeCount,
      });
    },
    [likeMutation, queryClient, postView.uri, postView.cid]
  );
  const handleLike = useCallback(() => like(false), [like]);
  // Double-tap only ever likes.
  const handleLikeOnly = useCallback(() => like(true), [like]);

  const handleRepost = useCallback(() => {
    if (isPostTogglePending(queryClient, 'repost', postView.uri)) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { isReposted, repostUri, repostCount } = displayRef.current;
    repostMutation.mutate({
      postUri: postView.uri,
      postCid: postView.cid,
      isReposted,
      repostUri,
      repostCount,
    });
  }, [repostMutation, queryClient, postView.uri, postView.cid]);

  return {
    display,
    isLikePending: likeMutation.isPending,
    isRepostPending: repostMutation.isPending,
    handleLike,
    handleLikeOnly,
    handleRepost,
  };
}
