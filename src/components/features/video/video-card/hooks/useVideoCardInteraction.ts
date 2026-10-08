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

  const displayRef = useRef(display);
  const pendingRef = useRef({ isLikePending: false, isRepostPending: false });

  useLayoutEffect(() => {
    displayRef.current = display;
    pendingRef.current.isLikePending = likeMutation.isPending;
    pendingRef.current.isRepostPending = repostMutation.isPending;
  }, [display, likeMutation.isPending, repostMutation.isPending]);

  const handleLike = useCallback(() => {
    if (likeMutation.isPending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { isLiked, likeUri, likeCount } = displayRef.current;
    likeMutation.mutate({
      postUri: postView.uri,
      postCid: postView.cid,
      isLiked,
      likeUri,
      likeCount,
    });
  }, [likeMutation, postView.uri, postView.cid]);

  const handleLikeOnly = useCallback(() => {
    if (displayRef.current.isLiked || likeMutation.isPending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { likeUri, likeCount } = displayRef.current;
    likeMutation.mutate({
      postUri: postView.uri,
      postCid: postView.cid,
      isLiked: false,
      likeUri,
      likeCount,
    });
  }, [likeMutation, postView.uri, postView.cid]);

  const handleRepost = useCallback(() => {
    if (repostMutation.isPending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { isReposted, repostUri, repostCount } = displayRef.current;
    repostMutation.mutate({
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
