import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import AtprotoService from '@/services/api/AtprotoService';
import ChannelService from '@/services/data/ChannelService';
import type { CachedChannel } from '@/services/data/ChannelService';
import { queryKeys } from '@/utils/query/queryKeys';

import { EXPLORE_SPOTLIGHT_FEED_URI } from './exploreConstants';
import type { Channel } from './types';

export function useExploreSuggestionsQueries(orbytChannelUris: string[]) {
  /** Stable cache identity for the same URI set regardless of source order. */
  const sortedOrbytKeyUris = useMemo(
    () => [...orbytChannelUris].sort((a, b) => a.localeCompare(b)),
    [orbytChannelUris]
  );

  const orbytQuery = useQuery({
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
        })
      );
    },
    enabled: orbytChannelUris.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const spotlightQuery = useQuery({
    queryKey: queryKeys.explore.spotlightFeed(),
    queryFn: async () => {
      const response = await AtprotoService.getFeed(
        null,
        EXPLORE_SPOTLIGHT_FEED_URI,
        {},
        true,
        10,
        'custom'
      );
      return response.feed || [];
    },
    enabled: true,
    staleTime: 5 * 60 * 1000,
  });

  return {
    orbytChannelsData: orbytQuery.data,
    isLoadingOrbytChannels: orbytQuery.isLoading,
    orbytChannelsError: orbytQuery.error,
    refetchOrbytChannels: orbytQuery.refetch,
    spotlightFeed: spotlightQuery.data,
    isLoadingSpotlightFeed: spotlightQuery.isLoading,
    spotlightFeedError: spotlightQuery.error,
    refetchSpotlightFeed: spotlightQuery.refetch,
  };
}
