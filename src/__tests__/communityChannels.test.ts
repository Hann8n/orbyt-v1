/**
 * A Community URI is a Community whether or not the directory pages are
 * cached: its feed and channel screen must open regardless.
 */
import { channelToFeedOption, getChannelByUri, isOrbytChannel } from '@/utils/channels/orbyt';
import { queryClient } from '@/utils/query/queryClient';
import { queryKeys } from '@/utils/query/queryKeys';

jest.mock('@/utils/query/queryClient', () => {
  const { QueryClient } = jest.requireActual('@tanstack/react-query');
  return { queryClient: new QueryClient() };
});
jest.mock('@/i18n', () => ({
  __esModule: true,
  default: {
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  },
}));

const uncached = 'at://did:plc:x/com.getorbyt.community.declaration/3zzz';
const feedGenerator = 'at://did:plc:x/app.bsky.feed.generator/cats';

afterEach(() => queryClient.clear());

describe('Community URIs outside the cached directory', () => {
  it('are Communities', () => {
    expect(isOrbytChannel(uncached)).toBe(true);
    expect(isOrbytChannel(feedGenerator)).toBe(false);
    expect(isOrbytChannel('')).toBe(false);
  });

  it('open their Community feed', () => {
    expect(channelToFeedOption(uncached)).toBe(`community:${uncached}`);
    expect(channelToFeedOption(feedGenerator)).toBeNull();
  });

  it('resolve metadata fetched with getCommunity', () => {
    expect(getChannelByUri(uncached)).toBeUndefined();
    queryClient.setQueryData(queryKeys.channels.community(uncached), {
      uri: uncached,
      cid: 'c',
      name: 'deepcuts',
      ownerDid: 'did:plc:x',
      createdAt: '',
    });
    expect(getChannelByUri(uncached)?.slug).toBe('deepcuts');
  });
});
