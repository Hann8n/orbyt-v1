import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useRecyclingState } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useShallow } from 'zustand/react/shallow';

import { AtprotoFeedService } from '../../../../../services/api/feed/FeedService';
import {
  mergePostInteractionDelta,
  usePostInteractionStore,
  type PostInteraction,
} from '../../../../../stores/postInteractionStore';
import { useLikeInteraction } from '@/hooks/useLikeInteraction';
import type { ExtendedPostView } from '../../../../../services/api/types';

export type VideoCardInteractionDisplay = PostInteraction;

export interface UseVideoCardInteractionArgs {
  postView: ExtendedPostView;
  feedOption?: string;
}

export interface UseVideoCardInteractionResult {
  /** Final displayable interaction (persisted store + any pending optimistic delta). */
  display: VideoCardInteractionDisplay;
  /** Local optimistic flags (used by overlay buttons to know if a request is in flight). */
  isLikePending: boolean;
  isRepostPending: boolean;
  /** Live ref of `display`; safe to read from gesture/runOnJS callbacks. */
  displayRef: React.RefObject<VideoCardInteractionDisplay>;
  /** Live ref of `{ isLikePending, isRepostPending }`. */
  pendingRef: React.RefObject<{ isLikePending: boolean; isRepostPending: boolean }>;
  /** Toggle like (with double-tap haptic). Updates store + optimistic state. */
  handleLike: () => Promise<void>;
  /** Like-only (used by double-tap heart) — never unlikes. */
  handleLikeOnly: () => Promise<void>;
  /** Toggle repost. */
  handleRepost: () => Promise<void>;
}

/**
 * Encapsulates the per-card interaction state machine: persisted counts from
 * `usePostInteractionStore` merged with local optimistic flags + the like/repost
 * mutations. Carved out of VideoCard.tsx so a like/repost on row N never re-renders
 * rows N±1 just because the parent's `displayInteraction` memo invalidated.
 */
export function useVideoCardInteraction({
  postView,
  feedOption,
}: UseVideoCardInteractionArgs): UseVideoCardInteractionResult {
  const defaultInteraction = useMemo(
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

  const { postInteractionDelta, updatePostInteraction } = usePostInteractionStore(
    useShallow(state => ({
      postInteractionDelta: state.interactions.get(postView.uri),
      updatePostInteraction: state.updatePostInteraction,
    }))
  );
  const persistedInteraction = useMemo(
    () => mergePostInteractionDelta(defaultInteraction, postInteractionDelta),
    [defaultInteraction, postInteractionDelta]
  );

  const [overlayState, setOverlayState] = useRecyclingState(
    {
      isLikePending: false,
      isRepostPending: false,
      ...persistedInteraction,
    },
    [postView.uri, feedOption]
  );

  // Depend on specific fields — not the full overlayState object — so an unrelated
  // setOverlayState (e.g. isRepostPending: false) doesn't invalidate this memo.
  const display = useMemo<VideoCardInteractionDisplay>(() => {
    let d = persistedInteraction;
    if (overlayState.isLikePending) {
      d = {
        ...d,
        isLiked: overlayState.isLiked,
        likeCount: overlayState.likeCount,
        likeUri: overlayState.likeUri,
      };
    }
    if (overlayState.isRepostPending) {
      d = {
        ...d,
        isReposted: overlayState.isReposted,
        repostCount: overlayState.repostCount,
        repostUri: overlayState.repostUri,
      };
    }
    return d;
  }, [
    persistedInteraction,
    overlayState.isLikePending,
    overlayState.isLiked,
    overlayState.likeCount,
    overlayState.likeUri,
    overlayState.isRepostPending,
    overlayState.isReposted,
    overlayState.repostCount,
    overlayState.repostUri,
  ]);

  const displayRef = useRef(display);
  const pendingRef = useRef({
    isLikePending: overlayState.isLikePending,
    isRepostPending: overlayState.isRepostPending,
  });

  useLayoutEffect(() => {
    displayRef.current = display;
    pendingRef.current.isLikePending = overlayState.isLikePending;
    pendingRef.current.isRepostPending = overlayState.isRepostPending;
  }, [display, overlayState.isLikePending, overlayState.isRepostPending]);

  const likeStateForHook = useMemo(
    () => ({
      isLiked: display.isLiked,
      likeCount: display.likeCount,
      likeUri: display.likeUri,
      isLikePending: overlayState.isLikePending,
      isReposted: display.isReposted,
      isBookmarked: display.isBookmarked,
      commentCount: display.commentCount,
      repostCount: display.repostCount,
      isRepostPending: overlayState.isRepostPending,
    }),
    [display, overlayState.isLikePending, overlayState.isRepostPending]
  );

  const { toggleLike: toggleLikeInteraction, likeOnly: likeOnlyInteraction } = useLikeInteraction({
    state: likeStateForHook,
    setState: setOverlayState,
    postUri: postView.uri,
    postCid: postView.cid,
    updatePostInteraction,
  });

  const handleLike = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await toggleLikeInteraction();
  }, [toggleLikeInteraction]);

  const handleLikeOnly = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await likeOnlyInteraction();
  }, [likeOnlyInteraction]);

  const handleRepost = useCallback(async () => {
    if (pendingRef.current.isRepostPending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const wasReposted = displayRef.current.isReposted;
    const newIsReposted = !wasReposted;
    const newRepostCount = newIsReposted
      ? displayRef.current.repostCount + 1
      : Math.max(0, displayRef.current.repostCount - 1);

    setOverlayState(prev => ({
      ...prev,
      isRepostPending: true,
      isReposted: newIsReposted,
      repostCount: newRepostCount,
    }));

    try {
      if (!wasReposted) {
        const repostUri = await AtprotoFeedService.repostPost(postView.uri, postView.cid);
        setOverlayState(prev => ({ ...prev, repostUri }));
        updatePostInteraction(postView.uri, {
          isReposted: true,
          repostCount: newRepostCount,
          repostUri,
        });
      } else {
        if (!displayRef.current.repostUri) throw new Error('No repost URI found');
        await AtprotoFeedService.deleteRepost(displayRef.current.repostUri);
        setOverlayState(prev => ({ ...prev, repostUri: undefined }));
        updatePostInteraction(postView.uri, {
          isReposted: false,
          repostCount: newRepostCount,
          repostUri: undefined,
        });
      }
    } catch (_error) {
      setOverlayState(prev => ({
        ...prev,
        isReposted: displayRef.current.isReposted,
        repostCount: displayRef.current.repostCount,
      }));
    } finally {
      setOverlayState(prev => ({ ...prev, isRepostPending: false }));
    }
  }, [postView.uri, postView.cid, setOverlayState, updatePostInteraction]);

  return {
    display,
    isLikePending: overlayState.isLikePending,
    isRepostPending: overlayState.isRepostPending,
    displayRef,
    pendingRef,
    handleLike,
    handleLikeOnly,
    handleRepost,
  };
}
