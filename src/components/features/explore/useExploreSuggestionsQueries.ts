import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { AtprotoFeedService } from '@/services/api/feed/FeedService';
import ChannelService from '@/services/data/ChannelService';
import type { CachedChannel } from '@/services/data/ChannelService';
import { queryKeys } from '@/utils/query/queryKeys';

import { EXPLORE_SPOTLIGHT_FEED_URI } from './exploreConstants';
import type { Channel } from './types';
import type { ExtendedFeedViewPost } from '@/services/api/types';

export function useExploreSuggestionsQueries(
  orbytChannelUris: string[],
  options?: { isResolvingOrbytUris?: boolean }
) {
  /** Stable cache identity for the same URI set regardless of source order. */
  const sortedOrbytKeyUris = useMemo(
    () => [...orbytChannelUris].sort((a, b) => a.localeCompare(b)),
    [orbytChannelUris]
  );
  const isResolvingOrbytUris = options?.isResolvingOrbytUris ?? false;
  const shouldLoadOrbytChannels = orbytChannelUris.length > 0;

  const orbytQuery = useQuery<Channel[], Error>({
    queryKey: queryKeys.explore.orbytGrid(sortedOrbytKeyUris),
    queryFn: async () => {
      const channelPromises = orbytChannelUris.map(uri => ChannelService.getChannel(uri));
      const results = await Promise.allSettled(channelPromises);

      const cachedChannels: CachedChannel[] = [];
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value !== null) {
          cachedChannels.push(result.value);
        }
      }

      return cachedChannels.map(
        (cachedChannel): Channel => ({
          uri: cachedChannel.uri,
          cid: cachedChannel.cid,
          did: cachedChannel.did,
          creator: cachedChannel.creator,
          displayName: cachedChannel.displayName,
          description: cachedChannel.description,
          avatar: cachedChannel.avatar,
          likeCount: cachedChannel.likeCount || 0,
          indexedAt: cachedChannel.indexedAt,
          lastUpdated: cachedChannel.lastUpdated,
        })
      );
    },
    enabled: shouldLoadOrbytChannels,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const spotlightQuery = useQuery<ExtendedFeedViewPost[], Error>({
    queryKey: queryKeys.explore.spotlightFeed(),
    queryFn: async () => {
      const response = await AtprotoFeedService.getFeed(
        null,
        EXPLORE_SPOTLIGHT_FEED_URI,
        true,
        10,
        'custom'
      );
      return response.feed || [];
    },
    enabled: true,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const isSpotlightPending = spotlightQuery.isPending;
  const isOrbytChannelsPending = shouldLoadOrbytChannels
    ? orbytQuery.isPending
    : isResolvingOrbytUris;
  const spotlightCount = spotlightQuery.data?.length ?? 0;
  const orbytCount = shouldLoadOrbytChannels ? (orbytQuery.data?.length ?? 0) : 0;
  const isInitialSuggestionsLoading =
    isSpotlightPending && isOrbytChannelsPending && !(spotlightCount || orbytCount);
  const hasSettledSpotlight = spotlightQuery.isFetched || !!spotlightQuery.error;
  const hasSettledOrbyt = shouldLoadOrbytChannels
    ? orbytQuery.isFetched || !!orbytQuery.error
    : !isResolvingOrbytUris;
  const hasSettledInitialSuggestions = hasSettledSpotlight && hasSettledOrbyt;

  return {
    orbytChannelsData: orbytQuery.data,
    isLoadingOrbytChannels: isOrbytChannelsPending,
    orbytChannelsError: orbytQuery.error,
    refetchOrbytChannels: orbytQuery.refetch,
    spotlightFeed: spotlightQuery.data,
    isLoadingSpotlightFeed: isSpotlightPending,
    spotlightFeedError: spotlightQuery.error,
    refetchSpotlightFeed: spotlightQuery.refetch,
    isInitialSuggestionsLoading,
    hasSettledInitialSuggestions,
  };
}
