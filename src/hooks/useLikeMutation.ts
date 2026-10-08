import { useCallback, useSyncExternalStore } from 'react';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { getAnalytics, logEvent } from '@react-native-firebase/analytics';
import { AtprotoFeedService } from '../services/api/feed/FeedService';
import {
  confirmToggle,
  isConfirmedUri,
  optimisticToggle,
  rollbackToggle,
  type ToggleState,
} from '../utils/query/viewerToggle';
import {
  readFeedPostToggle,
  setFeedPostToggle,
  type PostToggleField,
} from '../utils/query/postToggleCache';

/** Subscribes to the post's cached toggle state (`readFeedPostToggle`); null when nothing holds it. */
export function useFeedPostToggle(
  postUri: string | undefined,
  field: PostToggleField
): ToggleState | null {
  const queryClient = useQueryClient();
  const subscribe = useCallback(
    (onChange: () => void) => queryClient.getQueryCache().subscribe(onChange),
    [queryClient]
  );
  // A primitive snapshot, so unrelated cache events do not re-render.
  const snapshot = useSyncExternalStore(subscribe, () => {
    const state = postUri ? readFeedPostToggle(queryClient, postUri, field) : null;
    return state ? `${state.count} ${state.uri ?? ''}` : null;
  });
  if (snapshot === null) return null;
  const space = snapshot.indexOf(' ');
  return { count: Number(snapshot.slice(0, space)), uri: snapshot.slice(space + 1) || undefined };
}

/**
 * Whether a like or repost of this post is in flight on any surface. Taps are ignored until it
 * settles, so an unlike never races the create whose record it would delete.
 */
export function isPostTogglePending(
  queryClient: QueryClient,
  field: PostToggleField,
  postUri: string
): boolean {
  return (
    queryClient.isMutating({
      mutationKey: [field],
      predicate: mutation =>
        (mutation.state.variables as { postUri?: string } | undefined)?.postUri === postUri,
    }) > 0
  );
}

interface LikeVars {
  postUri: string;
  postCid: string;
  /** The state at tap time. */
  isLiked: boolean;
  likeUri?: string;
  likeCount: number;
}

interface ToggleContext {
  previous: ToggleState;
  optimistic: ToggleState;
}

export function useLikeMutation() {
  const queryClient = useQueryClient();

  return useMutation<string | undefined, Error, LikeVars, ToggleContext>({
    mutationKey: ['like'],
    mutationFn: async ({ postUri, postCid, isLiked, likeUri }) => {
      if (!isLiked) return AtprotoFeedService.likePost(postUri, postCid);
      if (!isConfirmedUri(likeUri)) throw new Error('No like URI');
      await AtprotoFeedService.deleteLike(likeUri);
      return undefined;
    },

    onMutate: ({ postUri, isLiked, likeUri, likeCount }) => {
      const previous = { uri: isLiked ? likeUri : undefined, count: likeCount };
      const optimistic = optimisticToggle(previous, !isLiked);
      setFeedPostToggle(queryClient, postUri, 'like', () => optimistic);
      return { previous, optimistic };
    },

    onSuccess: (likeUri, { postUri, isLiked }) => {
      if (!isLiked) {
        logEvent(getAnalytics(), 'video_like', { post_uri: postUri, content_type: 'video' }).catch(
          () => {}
        );
      }
      setFeedPostToggle(queryClient, postUri, 'like', current =>
        confirmToggle(current, !isLiked, likeUri)
      );
    },

    onError: (_, { postUri }, context) => {
      if (!context) return;
      setFeedPostToggle(queryClient, postUri, 'like', current =>
        rollbackToggle(current, context.optimistic, context.previous)
      );
    },
  });
}
