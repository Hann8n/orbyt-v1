/**
 * Orbyt Community record keys must match the AppView byte-for-byte
 * (orbyt-platform `packages/core/src/record-key.ts`), or membership records
 * are rejected as mis-keyed. Expected values come from Node's crypto and the
 * platform's reference implementation.
 */
import { sha256 } from '@/utils/crypto/sha256';
import {
  communitySearchTerm,
  hashedRecordKey,
  isCommunityAvailable,
  isCommunityUri,
  parseCommunityFeedOption,
  searchCommunities,
} from '@/services/orbyt/communities';
import { orbytPublicQuery } from '@/services/orbyt/orbytApi';

jest.mock('@/services/orbyt/orbytApi', () => ({
  orbytPublicQuery: jest.fn(),
  orbytAuthedCall: jest.fn(),
}));

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

describe('sha256', () => {
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['a'.repeat(55), '9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318'],
    ['a'.repeat(56), 'b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a'],
    ['a'.repeat(64), 'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb'],
    ['héllo 🌍', 'cbbcee01a3fc5f1c0db23e02be25316adf28ede876031fdbabe5f4fabe47ed7f'],
  ])('hashes case %#', (input, expected) => {
    expect(toHex(sha256(input))).toBe(expected);
  });
});

describe('hashedRecordKey', () => {
  const community = 'at://did:plc:alice/com.getorbyt.community.declaration/3abc';

  it('derives the same 24-character key as the AppView', () => {
    expect(hashedRecordKey(community)).toBe('ujmcyqderf5icuggvj2syt6j');
  });

  it('derives a different key per Community', () => {
    expect(hashedRecordKey(community)).not.toBe(
      hashedRecordKey('at://did:plc:alice/com.getorbyt.community.declaration/3def')
    );
  });
});

describe('community helpers', () => {
  it('recognises declaration URIs', () => {
    expect(isCommunityUri('at://did:plc:x/com.getorbyt.community.declaration/abc')).toBe(true);
    expect(isCommunityUri('at://local.orbyt.channel/art')).toBe(false);
  });

  it('fails closed on unknown publication state or access', () => {
    const base = { uri: 'u', cid: 'c', name: 'art', ownerDid: 'did:plc:x', createdAt: '' };
    expect(isCommunityAvailable(base)).toBe(true);
    expect(isCommunityAvailable({ ...base, publicationState: 'unpublished' })).toBe(false);
    expect(isCommunityAvailable({ ...base, publicationState: 'mystery' })).toBe(false);
    expect(isCommunityAvailable({ ...base, access: 'private' })).toBe(false);
  });

  it('parses community feed options', () => {
    const uri = 'at://did:plc:x/com.getorbyt.community.declaration/3abc';
    expect(parseCommunityFeedOption(`community:${uri}`)).toEqual({
      communityUri: uri,
      sort: 'latest',
    });
    expect(parseCommunityFeedOption(`community:${uri}:top`)).toEqual({
      communityUri: uri,
      sort: 'top',
    });
    expect(parseCommunityFeedOption('hashtag:art')).toBeNull();
  });
});

describe('community search', () => {
  const view = (name: string, extra: object = {}) => ({
    uri: `at://did:plc:x/com.getorbyt.community.declaration/${name}`,
    cid: 'c',
    name,
    ownerDid: 'did:plc:x',
    createdAt: '',
    ...extra,
  });

  afterEach(() => jest.mocked(orbytPublicQuery).mockReset());

  it('normalizes the search term', () => {
    expect(communitySearchTerm('  /Art ')).toBe('Art');
    expect(communitySearchTerm('//')).toBe('');
  });

  it('asks the directory for the term and keeps available Communities', async () => {
    jest.mocked(orbytPublicQuery).mockResolvedValue({
      communities: [view('art'), view('artists', { access: 'private' })],
      cursor: 'next',
    });
    const page = await searchCommunities('/art', { cursor: 'c1' });
    expect(orbytPublicQuery).toHaveBeenCalledWith(
      'com.getorbyt.community.listCommunities',
      { sort: 'popular', query: 'art', cursor: 'c1', limit: 25 },
      { signal: undefined }
    );
    expect(page.communities.map(c => c.name)).toEqual(['art']);
    expect(page.cursor).toBe('next');
  });

  it('does not search for an empty term', async () => {
    expect(await searchCommunities(' / ')).toEqual({ communities: [] });
    expect(orbytPublicQuery).not.toHaveBeenCalled();
  });
});
