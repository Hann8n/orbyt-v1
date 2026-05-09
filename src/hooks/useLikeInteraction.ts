import { useCallback, useLayoutEffect, useRef } from 'react';
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
  const stateRef = useRef(state);
  const onLikeSuccessRef = useRef(onLikeSuccess);

  useLayoutEffect(() => {
    stateRef.current = state;
    onLikeSuccessRef.current = onLikeSuccess;
  }, [state, onLikeSuccess]);

  const toggleLike = useCallback(async () => {
    const s = stateRef.current;
    if (!postUri || s.isLikePending) return;

    const newIsLiked = !s.isLiked;
    const newLikeCount = newIsLiked ? s.likeCount + 1 : Math.max(0, s.likeCount - 1);

    setState(prev => ({
      ...prev,
      isLikePending: true,
      isLiked: newIsLiked,
      likeCount: newLikeCount,
    }));

    updatePostInteraction(postUri, {
      isLiked: newIsLiked,
      likeCount: newLikeCount,
      likeUri: newIsLiked ? s.likeUri : undefined,
    });

    try {
      if (!s.isLiked) {
        const likeUri = await AtprotoFeedService.likePost(postUri, postCid || '');
        setState(prev => ({ ...prev, likeUri }));
        updatePostInteraction(postUri, {
          isLiked: true,
          likeCount: newLikeCount,
          likeUri,
        });
        onLikeSuccessRef.current?.();
      } else {
        if (!s.likeUri) throw new Error('No like URI found');
        await AtprotoFeedService.deleteLike(s.likeUri);
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
        isLiked: s.isLiked,
        likeCount: s.likeCount,
        likeUri: s.likeUri,
      }));
      updatePostInteraction(postUri, {
        isLiked: s.isLiked,
        likeCount: s.likeCount,
        likeUri: s.likeUri,
      });
    } finally {
      setState(prev => ({ ...prev, isLikePending: false }));
    }
  }, [postUri, postCid, setState, updatePostInteraction]);

  const likeOnly = useCallback(async () => {
    const s = stateRef.current;
    if (!postUri || s.isLiked || s.isLikePending) return;

    const newLikeCount = s.likeCount + 1;

    setState(prev => ({
      ...prev,
      isLikePending: true,
      isLiked: true,
      likeCount: newLikeCount,
    }));

    updatePostInteraction(postUri, {
      isLiked: true,
      likeCount: newLikeCount,
      likeUri: s.likeUri,
    });

    try {
      const likeUri = await AtprotoFeedService.likePost(postUri, postCid || '');
      setState(prev => ({ ...prev, likeUri }));
      updatePostInteraction(postUri, {
        isLiked: true,
        likeCount: newLikeCount,
        likeUri,
      });
      onLikeSuccessRef.current?.();
    } catch {
      setState(prev => ({
        ...prev,
        isLiked: false,
        likeCount: s.likeCount,
        likeUri: s.likeUri,
      }));
      updatePostInteraction(postUri, {
        isLiked: s.isLiked,
        likeCount: s.likeCount,
        likeUri: s.likeUri,
      });
    } finally {
      setState(prev => ({ ...prev, isLikePending: false }));
    }
  }, [postUri, postCid, setState, updatePostInteraction]);

  return { toggleLike, likeOnly };
}
