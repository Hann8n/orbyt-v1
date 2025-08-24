import { useCallback } from 'react';
import { useChannelSubscriptions, useCurrentUser } from '../stores/userStore';

export const useSubscribedChannels = () => {
  const { currentUser } = useCurrentUser();

  const { 
    subscribedChannels, 
    subscribeToChannel, 
    unsubscribeFromChannel, 
    isSubscribedToChannel,
    restoreDefaultChannel,
    getAvailableDefaultChannels
  } = useChannelSubscriptions();

  const handleSubscribeToChannel = useCallback(async (channelData: {
    uri: string;
    displayName: string;
    description?: string;
    avatar?: string;
    memberCount?: number;
  }) => {
    try {
      await subscribeToChannel(channelData);
    } catch (error) {
      console.error('Error subscribing to channel:', error);
      throw error;
    }
  }, [subscribeToChannel]);

  const handleUnsubscribeFromChannel = useCallback(async (uri: string) => {
    try {
      await unsubscribeFromChannel(uri);
    } catch (error) {
      console.error('Error unsubscribing from channel:', error);
      throw error;
    }
  }, [unsubscribeFromChannel]);

  const handleIsSubscribedToChannel = useCallback(async (uri: string): Promise<boolean> => {
    return isSubscribedToChannel(uri);
  }, [isSubscribedToChannel]);

  const handleRestoreDefaultChannel = useCallback(async (uri: string) => {
    try {
      await restoreDefaultChannel(uri);
    } catch (error) {
      console.error('Error restoring default channel:', error);
      throw error;
    }
  }, [restoreDefaultChannel]);

  const handleGetAvailableDefaultChannels = useCallback(async () => {
    try {
      return await getAvailableDefaultChannels();
    } catch (error) {
      console.error('Error getting available default channels:', error);
      return [];
    }
  }, [getAvailableDefaultChannels]);

  return {
    channels: subscribedChannels,
    isLoading: false, // No loading state since we're reading directly from store
    error: null,
    refetch: () => {}, // No-op since we're reading directly from store
    subscribeToChannel: handleSubscribeToChannel,
    unsubscribeFromChannel: handleUnsubscribeFromChannel,
    isSubscribedToChannel: handleIsSubscribedToChannel,
    restoreDefaultChannel: handleRestoreDefaultChannel,
    getAvailableDefaultChannels: handleGetAvailableDefaultChannels,
  };
}; 