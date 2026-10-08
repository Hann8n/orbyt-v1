/**
 * Orbyt channels are Orbyt Communities.
 *
 * The directory comes from `com.getorbyt.community.listCommunities` on the
 * Orbyt AppView; the legacy catalog (`/v1/channels/active`) was dropped
 * server-side. This module owns the React Query cache of that directory (the
 * most popular pages only), of single Communities fetched with `getCommunity`,
 * and the synchronous lookups the UI uses against both. Whether a URI is a
 * Community never depends on these caches: see `isCommunityUri`.
 */
import { queryOptions, useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/utils/query/queryKeys';
import { queryClient } from '@/utils/query/queryClient';
import {
  getCommunity,
  isCommunityAvailable,
  isCommunityUri,
  listCommunities,
  searchCommunities,
  type CommunityView,
} from './orbyt/communities';

function getCommunitiesQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.channels.metadata(),
    queryFn: async ({ signal }) => (await listCommunities(signal)).filter(isCommunityAvailable),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
  });
}

function readCachedCommunities(): CommunityView[] {
  return queryClient.getQueryData<CommunityView[]>(queryKeys.channels.metadata()) ?? [];
}

export async function hydrateOrbytChannels(): Promise<CommunityView[]> {
  return queryClient.fetchQuery(getCommunitiesQueryOptions());
}

export function getActiveRemoteChannels(): CommunityView[] {
  return readCachedCommunities();
}

function getDirectoryCommunity(uri: string): CommunityView | undefined {
  return readCachedCommunities().find(
    community => community.uri === uri || community.declarationUri === uri
  );
}

/** One Community: its directory entry when cached, otherwise `getCommunity`. */
export function communityQueryOptions(uri: string) {
  return queryOptions({
    queryKey: queryKeys.channels.community(uri),
    queryFn: ({ signal }) => getCommunity({ community: uri }, signal),
    initialData: () => getDirectoryCommunity(uri),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/** A Community's metadata, fetched when it is outside the cached directory pages. */
export function useCommunity(uri: string | null | undefined) {
  return useQuery({
    ...communityQueryOptions(uri ?? ''),
    enabled: !!uri && isCommunityUri(uri),
  });
}

/**
 * Communities matching `query`, paged. Each result is cached as that Community
 * so its screen and label open without another request.
 */
export function useCommunitySearch(query: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.channels.search(query),
    queryFn: async ({ pageParam, signal }) => {
      const page = await searchCommunities(query, { cursor: pageParam, signal });
      for (const community of page.communities) {
        queryClient.setQueryData(queryKeys.channels.community(community.uri), community);
      }
      return page;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => lastPage.cursor,
    enabled: query.trim().length > 0,
    staleTime: 30 * 1000,
  });
}

/** The cached metadata of a Community, from the directory or an earlier `getCommunity`. */
export function getRemoteChannelByUri(uri: string): CommunityView | undefined {
  return (
    getDirectoryCommunity(uri) ??
    queryClient.getQueryData<CommunityView>(queryKeys.channels.community(uri))
  );
}

export function getRemoteChannelBySlug(slug: string): CommunityView | undefined {
  const name = slug.trim().toLowerCase();
  return readCachedCommunities().find(community => community.name === name);
}

/**
 * Map a pre-Communities channel reference (`at://local.orbyt.channel/<slug>` or
 * `hashtag:orbyt-channel-<slug>`) to the Community of the same name. Anything
 * else is returned unchanged.
 */
export function migrateLegacyChannelUri(uri: string): string {
  let slug: string | null = null;
  if (uri.startsWith('at://local.orbyt.channel/')) {
    slug = uri.slice('at://local.orbyt.channel/'.length).split(/[/?#]/)[0] || null;
  } else if (uri.startsWith('hashtag:orbyt-channel-')) {
    slug = uri.slice('hashtag:orbyt-channel-'.length).split(':')[0] || null;
  }
  if (!slug) return uri;
  return getRemoteChannelBySlug(slug)?.uri ?? uri;
}

export function useOrbytChannels<T = CommunityView[]>(
  select?: (communities: CommunityView[]) => T
) {
  return useQuery({ ...getCommunitiesQueryOptions(), select });
}
