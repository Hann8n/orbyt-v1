/**
 * Likes and reposts patch every cached copy of a post: paginated feeds under `feed` and the
 * single post a link opened under `posts`, and never trip over data of another shape.
 */
import { QueryClient } from '@tanstack/react-query';

import type { FeedResponse, PostView } from '@/services/api/types';
import { readFeedPostToggle, setFeedPostToggle } from '@/utils/query/postToggleCache';
import { queryKeys } from '@/utils/query/queryKeys';

const URI = 'at://did:plc:a/app.bsky.feed.post/1';
const OTHER = 'at://did:plc:a/app.bsky.feed.post/2';
const LIKE = 'at://did:plc:me/app.bsky.feed.like/1';

const post = (uri: string, likeCount = 3): PostView =>
  ({ uri, cid: 'cid', likeCount, viewer: {} }) as unknown as PostView;

const feed = (...posts: PostView[]) => ({
  pages: [{ feed: posts.map(p => ({ post: p })), cursor: null } as FeedResponse],
  pageParams: [null],
});

const like = (client: QueryClient, uri = URI) =>
  setFeedPostToggle(client, uri, 'like', current => ({ uri: LIKE, count: current.count + 1 }));

describe('setFeedPostToggle', () => {
  it('patches the post in a feed and leaves other posts alone', () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.feed.infinite('following'), feed(post(URI), post(OTHER)));
    like(client);
    expect(readFeedPostToggle(client, URI, 'like')).toEqual({ uri: LIKE, count: 4 });
    expect(readFeedPostToggle(client, OTHER, 'like')).toEqual({ uri: undefined, count: 3 });
  });

  it('patches a linked post cached on its own', () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.posts.detail(URI), post(URI));
    like(client);
    expect(client.getQueryData<PostView>(queryKeys.posts.detail(URI))).toMatchObject({
      likeCount: 4,
      viewer: { like: LIKE },
    });
    expect(readFeedPostToggle(client, URI, 'like')).toEqual({ uri: LIKE, count: 4 });
  });

  it('skips data under the feed root that is not a paginated feed', () => {
    const client = new QueryClient();
    const plain = post(URI);
    client.setQueryData(['feed', 'something-else'], plain);
    client.setQueryData(queryKeys.feed.infinite('following'), feed(post(URI)));
    expect(() => like(client)).not.toThrow();
    expect(client.getQueryData(['feed', 'something-else'])).toBe(plain);
    expect(readFeedPostToggle(client, URI, 'like')).toEqual({ uri: LIKE, count: 4 });
  });

  it('reads nothing for a post no cache holds', () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.posts.detail(URI), null);
    like(client);
    expect(readFeedPostToggle(client, URI, 'like')).toBeNull();
  });
});
