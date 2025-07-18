import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ChannelSubscriptionManager, { SubscribedChannel } from '../services/storage/ChannelSubscriptionManager';

export const useSubscribedChannels = () => {
  const queryClient = useQueryClient();

  const {
    data: channels = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['subscribedChannels'],
    queryFn: () => ChannelSubscriptionManager.getSubscribedChannels.call(ChannelSubscriptionManager),
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
    reorderChannels,
    isSubscribedToChannel,
    restoreDefaultChannel,
    getAvailableDefaultChannels,
  };
}; 