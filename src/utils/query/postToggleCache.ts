/**
 * The viewer's like or repost of a post, owned by the query cache: every paginated feed under
 * the `feed` root and the single posts under `posts` (a video opened from a link).
 */
import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import type { FeedResponse, PostView } from '../../services/api/types';
import { queryKeys } from './queryKeys';
import type { ToggleState } from './viewerToggle';

export type PostToggleField = 'like' | 'repost';

const COUNT_FIELD = { like: 'likeCount', repost: 'repostCount' } as const;

function isFeedPages(data: unknown): data is InfiniteData<FeedResponse> {
  return !!data && Array.isArray((data as { pages?: unknown }).pages);
}

function patchFeedPages<T>(data: T, postUri: string, patch: (post: PostView) => PostView): T {
  if (!isFeedPages(data)) return data;
  return {
    ...data,
    pages: data.pages.map(page =>
      Array.isArray(page?.feed)
        ? {
            ...page,
            feed: page.feed.map(item =>
              item.post?.uri === postUri ? { ...item, post: patch(item.post) } : item
            ),
          }
        : page
    ),
  };
}

function readToggle(post: PostView, field: PostToggleField): ToggleState {
  return { uri: post.viewer?.[field], count: post[COUNT_FIELD[field]] ?? 0 };
}

/** Apply a toggle transition to the post in every cached feed and its cached single post. */
export function setFeedPostToggle(
  queryClient: QueryClient,
  postUri: string,
  field: PostToggleField,
  update: (current: ToggleState) => ToggleState
) {
  const patch = <P extends PostView>(post: P): P => {
    const next = update(readToggle(post, field));
    return {
      ...post,
      [COUNT_FIELD[field]]: next.count,
      viewer: { ...post.viewer, [field]: next.uri },
    };
  };
  queryClient.setQueriesData({ queryKey: queryKeys.feed.all }, (old: unknown) =>
    patchFeedPages(old, postUri, patch)
  );
  queryClient.setQueryData<PostView | null>(queryKeys.posts.detail(postUri), old =>
    old ? patch(old) : old
  );
}

/** The post's toggle state in the first cache holding it, or null when none does. */
export function readFeedPostToggle(
  queryClient: QueryClient,
  postUri: string,
  field: PostToggleField
): ToggleState | null {
  for (const [, data] of queryClient.getQueriesData<unknown>({ queryKey: queryKeys.feed.all })) {
    if (!isFeedPages(data)) continue;
    for (const page of data.pages) {
      const item = page?.feed?.find(entry => entry.post?.uri === postUri);
      if (item) return readToggle(item.post, field);
    }
  }
  const single = queryClient.getQueryData<PostView | null>(queryKeys.posts.detail(postUri));
  return single ? readToggle(single, field) : null;
}
