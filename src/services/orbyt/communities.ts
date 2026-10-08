/**
 * Orbyt Communities — the AppView's `com.getorbyt.community.*` surface.
 *
 * Communities replaced the retired channel catalog (`/v1/channels/active`) and
 * the `orbyt-channel-<slug>` post tag. A post joins a Community through a
 * `com.getorbyt.community.post` sidecar record in the author's repo (record key
 * = the post's record key); membership is a `com.getorbyt.community.membership`
 * record keyed by `hashedRecordKey(communityUri)`.
 */
import { TID } from '@atproto/common-web';

import { sha256 } from '@/utils/crypto/sha256';
import { orbytAuthedCall, orbytPublicQuery } from './orbytApi';

const COMMUNITY_DECLARATION_COLLECTION = 'com.getorbyt.community.declaration';
export const COMMUNITY_POST_COLLECTION = 'com.getorbyt.community.post';
const COMMUNITY_MEMBERSHIP_COLLECTION = 'com.getorbyt.community.membership';

/** `com.getorbyt.community.defs#view` */
export interface CommunityView {
  uri: string;
  declarationUri?: string;
  cid: string;
  name: string;
  description?: string;
  accentColor?: string;
  avatar?: string;
  avatarVideo?: string;
  avatarFallback?: string;
  postPolicy?: 'anyone' | 'members' | 'moderators' | (string & {});
  ownerDid: string;
  memberCount?: number;
  postCount?: number;
  createdAt: string;
  updatedAt?: string;
  publicationState?: 'published' | 'unpublished' | 'deleting' | 'deleted' | (string & {});
  access?: 'public' | (string & {});
}

/** `com.getorbyt.community.defs#feedItem` */
export interface CommunityFeedItem {
  post: string;
  playbackToken?: string;
  status?: 'visible' | 'removed' | (string & {});
  pinned?: boolean;
}

export type CommunityFeedSort = 'latest' | 'top';

/** Feed option prefix for a Community feed: `community:<at-uri>[:top|:latest]`. */
export const COMMUNITY_FEED_PREFIX = 'community:';

const LIST_PAGE_SIZE = 50;
const LIST_MAX_PAGES = 4;
const SEARCH_PAGE_SIZE = 25;
const POST_COMMUNITIES_BATCH = 100;

/** Published, publicly accessible Communities; unknown states fail closed. */
export function isCommunityAvailable(community: CommunityView): boolean {
  const state = community.publicationState ?? 'published';
  const access = community.access ?? 'public';
  return state === 'published' && access === 'public';
}

export function isCommunityUri(uri: string): boolean {
  return typeof uri === 'string' && uri.includes(`/${COMMUNITY_DECLARATION_COLLECTION}/`);
}

/** One page of the public directory, most popular first; `query` matches name or description. */
function listCommunitiesPage(
  params: { query?: string; cursor?: string; limit: number },
  signal?: globalThis.AbortSignal
) {
  return orbytPublicQuery<{ communities?: CommunityView[]; cursor?: string }>(
    'com.getorbyt.community.listCommunities',
    { sort: 'popular', ...params },
    { signal }
  );
}

/** The public Community directory, most popular first. */
export async function listCommunities(signal?: globalThis.AbortSignal): Promise<CommunityView[]> {
  const communities: CommunityView[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < LIST_MAX_PAGES; page++) {
    const response = await listCommunitiesPage({ limit: LIST_PAGE_SIZE, cursor }, signal);
    communities.push(...(response.communities ?? []));
    cursor = response.cursor;
    if (!cursor || (response.communities?.length ?? 0) === 0) break;
  }
  return communities;
}

/** The term to search Communities for; a leading `/` (how names are shown) is dropped. */
export function communitySearchTerm(query: string): string {
  return query.trim().replace(/^\/+/, '').trim();
}

/**
 * Communities matching `query` by name or description (`listCommunities` `query`,
 * as Orbyt iOS searches), most popular first. Only available Communities are kept.
 */
export async function searchCommunities(
  query: string,
  options: { cursor?: string; limit?: number; signal?: globalThis.AbortSignal } = {}
): Promise<{ communities: CommunityView[]; cursor?: string }> {
  const term = communitySearchTerm(query);
  if (!term) return { communities: [] };
  const response = await listCommunitiesPage(
    { query: term, cursor: options.cursor, limit: options.limit ?? SEARCH_PAGE_SIZE },
    options.signal
  );
  return {
    communities: (response.communities ?? []).filter(isCommunityAvailable),
    cursor: response.cursor,
  };
}

export async function getCommunity(
  params: { community: string } | { name: string },
  signal?: globalThis.AbortSignal
): Promise<CommunityView> {
  const response = await orbytPublicQuery<{ community: CommunityView }>(
    'com.getorbyt.community.getCommunity',
    params,
    { signal }
  );
  return response.community;
}

/**
 * A Community's feed skeleton: post AT-URIs to hydrate through the Bluesky AppView.
 * Sent without `viewer`: a declared viewer only mints playback tokens, which this
 * app does not use, and makes the AppView answer `private, no-store`, bypassing
 * its edge cache.
 */
export async function getCommunityFeed(
  community: string,
  options: {
    sort?: CommunityFeedSort;
    cursor?: string | null;
    limit?: number;
  }
): Promise<{ feed: CommunityFeedItem[]; cursor?: string }> {
  const response = await orbytPublicQuery<{ feed?: CommunityFeedItem[]; cursor?: string }>(
    'com.getorbyt.community.getFeed',
    {
      community,
      sort: options.sort ?? 'latest',
      limit: options.limit,
      cursor: options.cursor ?? undefined,
    }
  );
  return { feed: response.feed ?? [], cursor: response.cursor };
}

/** post URI → Community URI for each post published to a visible Community. */
export async function getPostCommunities(postUris: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(postUris.filter(uri => uri.includes('/app.bsky.feed.post/'))));
  const associations = new Map<string, string>();
  for (let i = 0; i < unique.length; i += POST_COMMUNITIES_BATCH) {
    const batch = unique.slice(i, i + POST_COMMUNITIES_BATCH);
    const response = await orbytPublicQuery<{
      associations?: Array<{ post: string; community: string }>;
    }>('com.getorbyt.community.getPostCommunities', { posts: batch });
    for (const association of response.associations ?? []) {
      associations.set(association.post, association.community);
    }
  }
  return associations;
}

const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
const RECORD_KEY_LENGTH = 24;

/**
 * `base32(sha256(input))` truncated to 24 lowercase characters — byte-identical
 * to `hashedRecordKey` in orbyt-platform `packages/core/src/record-key.ts`.
 * The AppView rejects membership records under any other key.
 */
export function hashedRecordKey(input: string): string {
  let bits = 0;
  let accumulator = 0;
  let key = '';
  for (const byte of sha256(input)) {
    accumulator = ((accumulator << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      key += BASE32_ALPHABET[(accumulator >> bits) & 31];
      if (key.length === RECORD_KEY_LENGTH) return key;
    }
  }
  return key;
}

interface RepoWriter {
  com: {
    atproto: {
      repo: {
        putRecord: (input: {
          repo: string;
          collection: string;
          rkey: string;
          record: Record<string, unknown>;
        }) => Promise<unknown>;
        deleteRecord: (input: {
          repo: string;
          collection: string;
          rkey: string;
        }) => Promise<unknown>;
      };
    };
  };
}

/** Join: write the viewer's membership record. Idempotent by construction. */
export async function joinCommunity(api: RepoWriter, did: string, communityUri: string) {
  await api.com.atproto.repo.putRecord({
    repo: did,
    collection: COMMUNITY_MEMBERSHIP_COLLECTION,
    rkey: hashedRecordKey(communityUri),
    record: {
      $type: COMMUNITY_MEMBERSHIP_COLLECTION,
      community: communityUri,
      createdAt: new Date().toISOString(),
    },
  });
}

/** Leave: delete the viewer's membership record. */
export async function leaveCommunity(api: RepoWriter, did: string, communityUri: string) {
  await api.com.atproto.repo.deleteRecord({
    repo: did,
    collection: COMMUNITY_MEMBERSHIP_COLLECTION,
    rkey: hashedRecordKey(communityUri),
  });
}

interface MembershipLister {
  com: {
    atproto: {
      repo: {
        listRecords: (
          input: {
            repo: string;
            collection: string;
            limit?: number;
            cursor?: string;
          },
          options?: { signal?: globalThis.AbortSignal }
        ) => Promise<{
          data: { records: Array<{ value: { [k: string]: unknown } }>; cursor?: string };
        }>;
      };
    };
  };
}

const MEMBERSHIP_PAGE_SIZE = 100;
const MEMBERSHIP_MAX_PAGES = 5;

/**
 * Communities the account has joined, from its own membership records — the
 * same records Orbyt iOS and Byte write, so joins made in any client show up.
 */
export async function listJoinedCommunities(
  api: MembershipLister,
  did: string,
  signal?: globalThis.AbortSignal
): Promise<string[]> {
  const communities = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < MEMBERSHIP_MAX_PAGES; page++) {
    const { data } = await api.com.atproto.repo.listRecords(
      {
        repo: did,
        collection: COMMUNITY_MEMBERSHIP_COLLECTION,
        limit: MEMBERSHIP_PAGE_SIZE,
        cursor,
      },
      { signal }
    );
    for (const record of data.records) {
      const community = record.value.community;
      if (typeof community === 'string' && isCommunityUri(community)) communities.add(community);
    }
    cursor = data.cursor;
    if (!cursor || data.records.length === 0) break;
  }
  return Array.from(communities);
}

/** A fresh TID record key, shared by a post and its Community link. */
export function nextRecordKey(): string {
  return TID.nextStr();
}

/**
 * Ask the AppView to project the given records now instead of waiting for the
 * Jetstream ingester. Best-effort: the records are already durable on the PDS.
 */
export async function requestCommunitySync(
  agent: Parameters<typeof orbytAuthedCall>[0],
  uris: string[]
): Promise<void> {
  if (uris.length === 0) return;
  await orbytAuthedCall(agent, 'com.getorbyt.community.requestSync', {
    method: 'POST',
    body: { uris },
  });
}

/**
 * Parse a `community:<at-uri>[:top|:latest]` feed option.
 */
export function parseCommunityFeedOption(
  feedOption: string
): { communityUri: string; sort: CommunityFeedSort } | null {
  if (!feedOption.startsWith(COMMUNITY_FEED_PREFIX)) {
    return null;
  }
  const rest = feedOption.slice(COMMUNITY_FEED_PREFIX.length);
  const match = rest.match(/^(at:\/\/.+?)(?::(top|latest))?$/);
  if (!match) {
    return null;
  }
  return { communityUri: match[1], sort: match[2] === 'top' ? 'top' : 'latest' };
}
