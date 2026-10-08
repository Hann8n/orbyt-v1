/**
 * Your Mix falls through a failed source to the other, and only fails the
 * page when every source attempt threw, so React Query shows the error state
 * instead of caching an empty, finished feed.
 */
import { AtprotoFeedService } from '@/services/api/feed/FeedService';
import { feedService } from '@/services/FeedService';

jest.mock('@/services/api/feed/FeedService', () => ({
  AtprotoFeedService: { getFeed: jest.fn(), searchNetworkTopVideos: jest.fn() },
}));
jest.mock('@/services/orbyt/serviceInfo', () => ({
  getOrbytProviders: jest.fn(async () => ({
    discoveryFeed: 'at://did:plc:x/app.bsky.feed.generator/mix',
  })),
}));
jest.mock('@/stores/userStore', () => ({
  useUserStore: { getState: () => ({ currentUser: { did: 'did:plc:me' } }) },
}));
jest.mock('@/utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));
jest.mock('@/utils/channels/orbyt', () => ({ channelToFeedOption: jest.fn() }));
jest.mock('@/services/api/bookmark/BookmarkService', () => ({}));
jest.mock('@/services/api/actor/ActorService', () => ({}));
jest.mock('@/services/SeenVideoService', () => ({
  seenVideoService: { filterSeen: <T>(feed: T) => feed },
}));

const getFeed = AtprotoFeedService.getFeed as jest.Mock;
const searchNetworkTopVideos = AtprotoFeedService.searchNetworkTopVideos as jest.Mock;
const post = { post: { uri: 'at://did:plc:a/app.bsky.feed.post/1' } };

beforeEach(() => {
  getFeed.mockReset();
  searchNetworkTopVideos.mockReset();
});

describe('Your Mix', () => {
  it('rethrows when every source failed', async () => {
    getFeed.mockRejectedValue(new Error('generator down'));
    searchNetworkTopVideos.mockRejectedValue(new Error('search down'));
    await expect(feedService.fetchFeed('your-mix')).rejects.toThrow('search down');
  });

  it('serves the other source when one fails', async () => {
    getFeed.mockRejectedValue(new Error('generator down'));
    searchNetworkTopVideos.mockResolvedValue({ feed: [post], cursor: 'n1' });
    const page = await feedService.fetchFeed('your-mix');
    expect(page.feed).toEqual([post]);
  });

  it('ends the mix when the sources answered with nothing', async () => {
    getFeed.mockResolvedValue({ feed: [], cursor: null });
    searchNetworkTopVideos.mockRejectedValue(new Error('search down'));
    await expect(feedService.fetchFeed('your-mix')).resolves.toEqual({ feed: [], cursor: null });
  });
});
