import { useCallback, useSyncExternalStore } from 'react';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { getAnalytics, logEvent } from '@react-native-firebase/analytics';
import { AtprotoFeedService } from '../services/api/feed/FeedService';
import { queryKeys } from '../utils/query/queryKeys';
import {
  confirmToggle,
  isConfirmedUri,
  optimisticToggle,
  rollbackToggle,
  type ToggleState,
} from '../utils/query/viewerToggle';
import type { FeedResponse, ExtendedPostView } from '../services/api/types';

function patchFeedPost(
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

/** The viewer's like or repost of a post, owned by the feed query cache. */
export type PostToggleField = 'like' | 'repost';

const COUNT_FIELD = { like: 'likeCount', repost: 'repostCount' } as const;

/** Apply a toggle transition to the post in every cached feed. */
export function setFeedPostToggle(
  queryClient: QueryClient,
  postUri: string,
  field: PostToggleField,
  update: (current: ToggleState) => ToggleState
) {
  const countField = COUNT_FIELD[field];
  queryClient.setQueriesData<InfiniteData<FeedResponse>>({ queryKey: queryKeys.feed.all }, old =>
    patchFeedPost(old, postUri, post => {
      const next = update({ uri: post.viewer?.[field], count: post[countField] ?? 0 });
      return { ...post, [countField]: next.count, viewer: { ...post.viewer, [field]: next.uri } };
    })
  );
}

/** The post's toggle state in the first cached feed holding it, or null when none does. */
export function readFeedPostToggle(
  queryClient: QueryClient,
  postUri: string,
  field: PostToggleField
): ToggleState | null {
  const caches = queryClient.getQueriesData<InfiniteData<FeedResponse>>({
    queryKey: queryKeys.feed.all,
  });
  for (const [, data] of caches) {
    for (const page of data?.pages ?? []) {
      const item = page?.feed?.find(entry => entry.post?.uri === postUri);
      if (item) {
        return { uri: item.post.viewer?.[field], count: item.post[COUNT_FIELD[field]] ?? 0 };
      }
    }
  }
  return null;
}

/** Subscribes to the post's toggle state in the feed caches; null when no cached feed holds it. */
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
