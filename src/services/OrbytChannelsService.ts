/**
 * Orbyt channels are Orbyt Communities.
 *
 * The directory comes from `com.getorbyt.community.listCommunities` on the
 * Orbyt AppView; the legacy catalog (`/v1/channels/active`) was dropped
 * server-side. This module owns the React Query cache of that directory and the
 * synchronous lookups the UI uses against it.
 */
import { queryOptions, useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/utils/query/queryKeys';
import { queryClient } from '@/utils/query/queryClient';
import { isCommunityAvailable, listCommunities, type CommunityView } from './orbyt/communities';

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

export function getRemoteChannelByUri(uri: string): CommunityView | undefined {
  return readCachedCommunities().find(
    community => community.uri === uri || community.declarationUri === uri
  );
}

export function getRemoteChannelBySlug(slug: string): CommunityView | undefined {
  const name = slug.trim().toLowerCase();
  return readCachedCommunities().find(community => community.name === name);
}

export function isKnownOrbytChannelUri(uri: string): boolean {
  return getRemoteChannelByUri(uri) !== undefined;
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
