import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ChannelSubscriptionManager, { SubscribedChannel, ChannelMixSettings } from '../services/storage/ChannelSubscriptionManager';
import AccountManager from '../services/storage/AccountManager';

export const useSubscribedChannels = () => {
  const queryClient = useQueryClient();
  const [did, setDid] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const active = await AccountManager.getActiveAccount();
        if (mounted) setDid(active?.did || null);
      } catch {
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
    queryFn: () => ChannelSubscriptionManager.getSubscribedChannels.call(ChannelSubscriptionManager),
    enabled: did !== null, 
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const {
    data: channelsInMix = [],
    isLoading: isLoadingMix,
    refetch: refetchMix,
  } = useQuery({
    queryKey: ['channelsInMix', did],
    queryFn: () => ChannelSubscriptionManager.getChannelsInMix.call(ChannelSubscriptionManager),
    enabled: did !== null,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const {
    data: excludedChannels = [],
    isLoading: isLoadingExcluded,
    refetch: refetchExcluded,
  } = useQuery({
    queryKey: ['excludedChannels', did],
    queryFn: () => ChannelSubscriptionManager.getExcludedChannels.call(ChannelSubscriptionManager),
    enabled: did !== null,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

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
      queryClient.invalidateQueries({ queryKey: ['channelsInMix'] });
      queryClient.invalidateQueries({ queryKey: ['excludedChannels'] });
    } catch (error) {
      console.error('Error subscribing to channel:', error);
      throw error;
    }
  }, [queryClient]);

  const unsubscribeFromChannel = useCallback(async (uri: string) => {
    try {
      await ChannelSubscriptionManager.unsubscribeFromChannel(uri);
      queryClient.invalidateQueries({ queryKey: ['subscribedChannels'] });
      queryClient.invalidateQueries({ queryKey: ['channelsInMix'] });
      queryClient.invalidateQueries({ queryKey: ['excludedChannels'] });
    } catch (error) {
      console.error('Error unsubscribing from channel:', error);
      throw error;
    }
  }, [queryClient]);

  const reorderChannels = useCallback(async (channelUris: string[]) => {
    try {
      await ChannelSubscriptionManager.reorderChannels(channelUris);
      queryClient.invalidateQueries({ queryKey: ['subscribedChannels'] });
    } catch (error) {
      console.error('Error reordering channels:', error);
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
      queryClient.invalidateQueries({ queryKey: ['channelsInMix'] });
      queryClient.invalidateQueries({ queryKey: ['excludedChannels'] });
    } catch (error) {
      console.error('Error restoring default channel:', error);
      throw error;
    }
  }, [queryClient]);

  const getAvailableDefaultChannels = useCallback(async () => {
    return ChannelSubscriptionManager.getAvailableDefaultChannels();
  }, []);

  const updateMixSettings = useCallback(async (uri: string, settings: Partial<ChannelMixSettings>) => {
    try {
      await ChannelSubscriptionManager.updateMixSettings(uri, settings);
      queryClient.invalidateQueries({ queryKey: ['subscribedChannels'] });
      queryClient.invalidateQueries({ queryKey: ['channelsInMix'] });
      queryClient.invalidateQueries({ queryKey: ['excludedChannels'] });
    } catch (error) {
      console.error('Error updating mix settings:', error);
      throw error;
    }
  }, [queryClient]);

  const addToMix = useCallback(async (uri: string) => {
    await updateMixSettings(uri, { inMix: true, isExcluded: false });
  }, [updateMixSettings]);

  const removeFromMix = useCallback(async (uri: string) => {
    await updateMixSettings(uri, { inMix: false });
  }, [updateMixSettings]);

  const excludeChannel = useCallback(async (uri: string) => {
    await updateMixSettings(uri, { isExcluded: true, inMix: false });
  }, [updateMixSettings]);

  const includeChannel = useCallback(async (uri: string) => {
    await updateMixSettings(uri, { isExcluded: false });
  }, [updateMixSettings]);

  return {
    channels,
    channelsInMix,
    excludedChannels,
    isLoading,
    isLoadingMix,
    isLoadingExcluded,
    error,
    refetch,
    refetchMix,
    refetchExcluded,
    subscribeToChannel,
    unsubscribeFromChannel,
    reorderChannels,
    isSubscribedToChannel,
    restoreDefaultChannel,
    getAvailableDefaultChannels,
    updateMixSettings,
    addToMix,
    removeFromMix,
    excludeChannel,
    includeChannel,
  };
}; 