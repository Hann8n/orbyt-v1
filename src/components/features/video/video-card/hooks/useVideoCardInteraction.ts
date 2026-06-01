import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import * as Haptics from 'expo-haptics';

import { useLikeMutation } from '@/hooks/useLikeMutation';
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
  handleLike: () => Promise<void>;
  handleLikeOnly: () => Promise<void>;
  handleRepost: () => Promise<void>;
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

  const displayRef = useRef(display);
  // Refs for mutation objects so callbacks don't re-create when isPending flips
  const likeMutationRef = useRef(likeMutation);
  const repostMutationRef = useRef(repostMutation);

  useLayoutEffect(() => {
    displayRef.current = display;
    likeMutationRef.current = likeMutation;
    repostMutationRef.current = repostMutation;
  }, [display, likeMutation, repostMutation]);

  const handleLike = useCallback(async () => {
    if (likeMutationRef.current.isPending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { isLiked, likeUri, likeCount } = displayRef.current;
    await likeMutationRef.current.mutateAsync({
      postUri: postView.uri,
      postCid: postView.cid,
      isLiked,
      likeUri,
      likeCount,
    });
  }, [postView.uri, postView.cid]);

  const handleLikeOnly = useCallback(async () => {
    if (displayRef.current.isLiked || likeMutationRef.current.isPending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { likeUri, likeCount } = displayRef.current;
    await likeMutationRef.current.mutateAsync({
      postUri: postView.uri,
      postCid: postView.cid,
      isLiked: false,
      likeUri,
      likeCount,
    });
  }, [postView.uri, postView.cid]);

  const handleRepost = useCallback(async () => {
    if (repostMutationRef.current.isPending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { isReposted, repostUri, repostCount } = displayRef.current;
    await repostMutationRef.current.mutateAsync({
      postUri: postView.uri,
      postCid: postView.cid,
      isReposted,
      repostUri,
      repostCount,
    });
  }, [postView.uri, postView.cid]);

  return {
    display,
    isLikePending: likeMutation.isPending,
    isRepostPending: repostMutation.isPending,
    handleLike,
    handleLikeOnly,
    handleRepost,
  };
}
