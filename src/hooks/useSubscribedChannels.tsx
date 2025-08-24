import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ChannelSubscriptionManager, { SubscribedChannel } from '../services/storage/ChannelSubscriptionManager';
import AccountManager from '../services/storage/AccountManager';

export const useSubscribedChannels = () => {
  const queryClient = useQueryClient();
  const [did, setDid] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const active = await AccountManager.getActiveAccount();
        console.log('[useSubscribedChannels] Active account:', active);
        if (mounted) setDid(active?.did || null);
      } catch (error) {
        console.log('[useSubscribedChannels] Error getting active account:', error);
        if (mounted) setDid(null);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const {
    data: channels = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['subscribedChannels', did],
    queryFn: async () => {
      console.log('[useSubscribedChannels] Fetching subscribed channels for DID:', did);
      const result = await ChannelSubscriptionManager.getSubscribedChannels.call(ChannelSubscriptionManager);
      console.log('[useSubscribedChannels] Fetched channels:', result);
      return result;
    },
    enabled: did !== null, 
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  console.log('[useSubscribedChannels] Query state:', { did, enabled: did !== null, channels: channels.length });

  const subscribeToChannel = useCallback(async (channelData: {
    uri: string;
    displayName: string;
    description?: string;
    avatar?: string;
    memberCount?: number;
  }) => {
    try {
      await ChannelSubscriptionManager.subscribeToChannel(channelData);
      queryClient.invalidateQueries({ queryKey: ['subscribedChannels'] });
    } catch (error) {
      console.error('Error subscribing to channel:', error);
      throw error;
    }
  }, [queryClient]);

  const unsubscribeFromChannel = useCallback(async (uri: string) => {
    try {
      await ChannelSubscriptionManager.unsubscribeFromChannel(uri);
      queryClient.invalidateQueries({ queryKey: ['subscribedChannels'] });
    } catch (error) {
      console.error('Error unsubscribing from channel:', error);
      throw error;
    }
  }, [queryClient]);

  const isSubscribedToChannel = useCallback(async (uri: string): Promise<boolean> => {
    return ChannelSubscriptionManager.isSubscribedToChannel(uri);
  }, []);

  const restoreDefaultChannel = useCallback(async (uri: string) => {
    try {
      await ChannelSubscriptionManager.restoreDefaultChannel(uri);
      queryClient.invalidateQueries({ queryKey: ['subscribedChannels'] });
    } catch (error) {
      console.error('Error restoring default channel:', error);
      throw error;
    }
  }, [queryClient]);

  const getAvailableDefaultChannels = useCallback(async () => {
    return ChannelSubscriptionManager.getAvailableDefaultChannels();
  }, []);

  return {
    channels,
    isLoading,
    error,
    refetch,
    subscribeToChannel,
    unsubscribeFromChannel,
    isSubscribedToChannel,
    restoreDefaultChannel,
    getAvailableDefaultChannels,
  };
}; 