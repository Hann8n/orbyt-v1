import { useCallback } from 'react';
import { AtprotoFeedService } from '@/services/api/feed/FeedService';

type PostInteractionUpdate = {
  isLiked?: boolean;
  likeCount?: number;
  likeUri?: string | undefined;
};

interface BaseLikeState {
  isLiked: boolean;
  likeCount: number;
  likeUri?: string | undefined;
  isLikePending: boolean;
}

interface UseLikeInteractionParams<T extends BaseLikeState> {
  state: T;
  setState: React.Dispatch<React.SetStateAction<T>>;
  postUri?: string | null;
  postCid?: string | null;
  updatePostInteraction: (postUri: string, update: PostInteractionUpdate) => void;
  onLikeSuccess?: () => void;
}

export function useLikeInteraction<T extends BaseLikeState>({
  state,
  setState,
  postUri,
  postCid,
  updatePostInteraction,
  onLikeSuccess,
}: UseLikeInteractionParams<T>) {
  const toggleLike = useCallback(async () => {
    if (!postUri || state.isLikePending) return;

    const newIsLiked = !state.isLiked;
    const newLikeCount = newIsLiked ? state.likeCount + 1 : Math.max(0, state.likeCount - 1);

    setState(prev => ({
      ...prev,
      isLikePending: true,
      isLiked: newIsLiked,
      likeCount: newLikeCount,
    }));

    updatePostInteraction(postUri, {
      isLiked: newIsLiked,
      likeCount: newLikeCount,
      likeUri: newIsLiked ? state.likeUri : undefined,
    });

    try {
      if (!state.isLiked) {
        const likeUri = await AtprotoFeedService.likePost(postUri, postCid || '');
        setState(prev => ({ ...prev, likeUri }));
        updatePostInteraction(postUri, {
          isLiked: true,
          likeCount: newLikeCount,
          likeUri,
        });
        onLikeSuccess?.();
      } else {
        if (!state.likeUri) throw new Error('No like URI found');
        await AtprotoFeedService.deleteLike(state.likeUri);
        setState(prev => ({ ...prev, likeUri: undefined }));
        updatePostInteraction(postUri, {
          isLiked: false,
          likeCount: newLikeCount,
          likeUri: undefined,
        });
      }
    } catch {
      setState(prev => ({
        ...prev,
        isLiked: state.isLiked,
        likeCount: state.likeCount,
        likeUri: state.likeUri,
      }));
      updatePostInteraction(postUri, {
        isLiked: state.isLiked,
        likeCount: state.likeCount,
        likeUri: state.likeUri,
      });
    } finally {
      setState(prev => ({ ...prev, isLikePending: false }));
    }
  }, [
    onLikeSuccess,
    postCid,
    postUri,
    setState,
    state.isLikePending,
    state.isLiked,
    state.likeCount,
    state.likeUri,
    updatePostInteraction,
  ]);

  const likeOnly = useCallback(async () => {
    if (!postUri || state.isLiked || state.isLikePending) return;

    const newLikeCount = state.likeCount + 1;

    setState(prev => ({
      ...prev,
      isLikePending: true,
      isLiked: true,
      likeCount: newLikeCount,
    }));

    updatePostInteraction(postUri, {
      isLiked: true,
      likeCount: newLikeCount,
      likeUri: state.likeUri,
    });

    try {
      const likeUri = await AtprotoFeedService.likePost(postUri, postCid || '');
      setState(prev => ({ ...prev, likeUri }));
      updatePostInteraction(postUri, {
        isLiked: true,
        likeCount: newLikeCount,
        likeUri,
      });
      onLikeSuccess?.();
    } catch {
      setState(prev => ({
        ...prev,
        isLiked: false,
        likeCount: state.likeCount,
        likeUri: state.likeUri,
      }));
      updatePostInteraction(postUri, {
        isLiked: state.isLiked,
        likeCount: state.likeCount,
        likeUri: state.likeUri,
      });
    } finally {
      setState(prev => ({ ...prev, isLikePending: false }));
    }
  }, [
    onLikeSuccess,
    postCid,
    postUri,
    setState,
    state.isLikePending,
    state.isLiked,
    state.likeCount,
    state.likeUri,
    updatePostInteraction,
  ]);

  return { toggleLike, likeOnly };
}
