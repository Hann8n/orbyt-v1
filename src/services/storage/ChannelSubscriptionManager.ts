import * as SecureStore from 'expo-secure-store';
import { FEED_CONFIG } from '../FeedService';

export interface SubscribedChannel {
  uri: string;
  displayName: string;
  description?: string;
  avatar?: string;
  memberCount?: number;
  isDefault?: boolean;
  order: number;
  subscribedAt: number;
  inMix?: boolean;
  isExcluded?: boolean;
}

export interface ChannelMixSettings {
  uri: string;
  inMix: boolean;
  isExcluded: boolean;
}

class ChannelSubscriptionManager {
  private static SUBSCRIBED_CHANNELS_KEY = 'subscribed_channels_v1';
  private static MIX_SETTINGS_KEY = 'channel_mix_settings_v1';
  private static DEFAULT_CHANNELS = [
    { uri: 'following', displayName: 'Following', isDefault: true, order: 0, subscribedAt: Date.now() },
    { uri: 'yourMix', displayName: 'Your Mix', isDefault: true, order: 1, subscribedAt: Date.now() },
  ];

  private static REMOVED_DEFAULTS_KEY = 'removed_default_channels_v1';

  /**
   * Get all subscribed channels including defaults
   */
  static async getSubscribedChannels(): Promise<SubscribedChannel[]> {
    try {
      const channelsStr = await SecureStore.getItemAsync(this.SUBSCRIBED_CHANNELS_KEY);
      
      const savedChannels: SubscribedChannel[] = channelsStr ? JSON.parse(channelsStr) : [];
      
      // Get removed default channels
      const removedDefaultsStr = await SecureStore.getItemAsync(this.REMOVED_DEFAULTS_KEY);
      const removedDefaults: string[] = removedDefaultsStr ? JSON.parse(removedDefaultsStr) : [];
      
      // Filter out removed default channels
      const availableDefaults = this.DEFAULT_CHANNELS.filter(ch => !removedDefaults.includes(ch.uri));
      
      // Merge with available default channels
      const allChannels = [...availableDefaults];
      
      // Add saved channels, preserving their order
      savedChannels.forEach(savedChannel => {
        const existingIndex = allChannels.findIndex(ch => ch.uri === savedChannel.uri);
        if (existingIndex >= 0) {
          // Update existing default channel with saved data
          allChannels[existingIndex] = { ...allChannels[existingIndex], ...savedChannel };
        } else {
          // Add new subscribed channel
          allChannels.push({
            ...savedChannel,
            isDefault: savedChannel.isDefault ?? false
          });
        }
      });
      
      // Apply mix settings
      const mixSettings = await this.getMixSettings();
      allChannels.forEach(channel => {
        const settings = mixSettings.find(s => s.uri === channel.uri);
        if (settings) {
          (channel as any).inMix = settings.inMix;
          (channel as any).isExcluded = settings.isExcluded;
        } else {
          // Default settings for new channels
          (channel as any).inMix = true;
          (channel as any).isExcluded = false;
        }
      });
      
      // Sort by order
      const finalChannels = allChannels.sort((a, b) => a.order - b.order);
      
      return finalChannels;
    } catch (error) {
      console.error('Error getting subscribed channels:', error);
      return [...this.DEFAULT_CHANNELS];
    }
  }

  /**
   * Get mix settings for all channels
   */
  static async getMixSettings(): Promise<ChannelMixSettings[]> {
    try {
      const settingsStr = await SecureStore.getItemAsync(this.MIX_SETTINGS_KEY);
      return settingsStr ? JSON.parse(settingsStr) : [];
    } catch (error) {
      console.error('Error getting mix settings:', error);
      return [];
    }
  }

  /**
   * Update mix settings for a channel
   */
  static async updateMixSettings(uri: string, settings: Partial<ChannelMixSettings>): Promise<void> {
    try {
      const currentSettings = await this.getMixSettings();
      const existingIndex = currentSettings.findIndex(s => s.uri === uri);
      
      if (existingIndex >= 0) {
        currentSettings[existingIndex] = { ...currentSettings[existingIndex], ...settings };
      } else {
        currentSettings.push({
          uri,
          inMix: settings.inMix ?? true,
          isExcluded: settings.isExcluded ?? false,
        });
      }
      
      await SecureStore.setItemAsync(this.MIX_SETTINGS_KEY, JSON.stringify(currentSettings));
    } catch (error) {
      console.error('Error updating mix settings:', error);
      throw error;
    }
  }

  /**
   * Get channels that are included in the mix
   */
  static async getChannelsInMix(): Promise<SubscribedChannel[]> {
    try {
      const channels = await this.getSubscribedChannels();
      return channels.filter(ch => ch.inMix && !ch.isExcluded);
    } catch (error) {
      console.error('Error getting channels in mix:', error);
      return [];
    }
  }

  /**
   * Get excluded channels
   */
  static async getExcludedChannels(): Promise<SubscribedChannel[]> {
    try {
      const channels = await this.getSubscribedChannels();
      return channels.filter(ch => ch.isExcluded);
    } catch (error) {
      console.error('Error getting excluded channels:', error);
      return [];
    }
  }

  /**
   * Subscribe to a channel
   */
  static async subscribeToChannel(channelData: {
    uri: string;
    displayName: string;
    description?: string;
    avatar?: string;
    memberCount?: number;
  }): Promise<void> {
    try {
      const channels = await this.getSubscribedChannels();
      
      // Check if already subscribed
      const existingIndex = channels.findIndex(ch => ch.uri === channelData.uri);
      
      if (existingIndex >= 0) {
        // Update existing channel
        channels[existingIndex] = {
          ...channels[existingIndex],
          ...channelData,
          subscribedAt: Date.now(),
        };
      } else {
        // Check if we've reached the maximum number of channels
        const maxChannels = FEED_CONFIG.maxSubscribedChannels;
        const nonDefaultChannels = channels.filter(ch => !ch.isDefault);
        
        if (nonDefaultChannels.length >= maxChannels) {
          throw new Error(`Maximum number of subscribed channels (${maxChannels}) reached. Please unsubscribe from some channels first.`);
        }
        
        // Add new channel
        const newChannel: SubscribedChannel = {
          ...channelData,
          isDefault: false,
          order: channels.length,
          subscribedAt: Date.now(),
        };
        channels.push(newChannel);
      }
      
      // Save only non-default channels
      const savedChannels = channels.filter(ch => !ch.isDefault);
      await SecureStore.setItemAsync(this.SUBSCRIBED_CHANNELS_KEY, JSON.stringify(savedChannels));
    } catch (error) {
      console.error('Error subscribing to channel:', error);
      throw error;
    }
  }

  /**
   * Unsubscribe from a channel
   */
  static async unsubscribeFromChannel(uri: string): Promise<void> {
    try {
      const channels = await this.getSubscribedChannels();
      const channelToRemove = channels.find(ch => ch.uri === uri);
      
      if (!channelToRemove) {
        return; // Channel not found
      }

      if (channelToRemove.isDefault) {
        // For default channels, add to removed defaults list
        const removedDefaultsStr = await SecureStore.getItemAsync(this.REMOVED_DEFAULTS_KEY);
        const removedDefaults: string[] = removedDefaultsStr ? JSON.parse(removedDefaultsStr) : [];
        
        if (!removedDefaults.includes(uri)) {
          removedDefaults.push(uri);
          await SecureStore.setItemAsync(this.REMOVED_DEFAULTS_KEY, JSON.stringify(removedDefaults));
        }
      } else {
        // For non-default channels, remove from saved channels
        const filteredChannels = channels.filter(ch => ch.uri !== uri);
        const savedChannels = filteredChannels.filter(ch => !ch.isDefault);
        await SecureStore.setItemAsync(this.SUBSCRIBED_CHANNELS_KEY, JSON.stringify(savedChannels));
      }
    } catch (error) {
      console.error('Error unsubscribing from channel:', error);
      throw error;
    }
  }

  /**
   * Check if user is subscribed to a channel
   */
  static async isSubscribedToChannel(uri: string): Promise<boolean> {
    try {
      const channels = await this.getSubscribedChannels();
      return channels.some(ch => ch.uri === uri);
    } catch (error) {
      console.error('Error checking subscription status:', error);
      return false;
    }
  }

  /**
   * Reorder channels
   */
  static async reorderChannels(channelUris: string[]): Promise<void> {
    try {
      const channels = await this.getSubscribedChannels();
      const reorderedChannels: SubscribedChannel[] = [];
      
      // Reorder based on the provided URI array
      channelUris.forEach((uri, index) => {
        const channel = channels.find(ch => ch.uri === uri);
        if (channel) {
          reorderedChannels.push({
            ...channel,
            order: index,
          });
        }
      });
      
      // Save only non-default channels
      const savedChannels = reorderedChannels.filter(ch => !ch.isDefault);
      await SecureStore.setItemAsync(this.SUBSCRIBED_CHANNELS_KEY, JSON.stringify(savedChannels));
    } catch (error) {
      console.error('Error reordering channels:', error);
      throw error;
    }
  }

  /**
   * Get channel by URI
   */
  static async getChannelByUri(uri: string): Promise<SubscribedChannel | null> {
    try {
      const channels = await this.getSubscribedChannels();
      return channels.find(ch => ch.uri === uri) || null;
    } catch (error) {
      console.error('Error getting channel by URI:', error);
      return null;
    }
  }

  /**
   * Restore a default channel
   */
  static async restoreDefaultChannel(uri: string): Promise<void> {
    try {
      const removedDefaultsStr = await SecureStore.getItemAsync(this.REMOVED_DEFAULTS_KEY);
      const removedDefaults: string[] = removedDefaultsStr ? JSON.parse(removedDefaultsStr) : [];
      
      const updatedRemovedDefaults = removedDefaults.filter(removedUri => removedUri !== uri);
      await SecureStore.setItemAsync(this.REMOVED_DEFAULTS_KEY, JSON.stringify(updatedRemovedDefaults));
    } catch (error) {
      console.error('Error restoring default channel:', error);
      throw error;
    }
  }

  /**
   * Get available default channels that can be restored
   */
  static async getAvailableDefaultChannels(): Promise<SubscribedChannel[]> {
    try {
      const removedDefaultsStr = await SecureStore.getItemAsync(this.REMOVED_DEFAULTS_KEY);
      const removedDefaults: string[] = removedDefaultsStr ? JSON.parse(removedDefaultsStr) : [];
      
      return this.DEFAULT_CHANNELS.filter(ch => removedDefaults.includes(ch.uri));
    } catch (error) {
      console.error('Error getting available default channels:', error);
      return [];
    }
  }

  /**
   * Clear all subscribed channels (except defaults)
   */
  static async clearAllSubscriptions(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(this.SUBSCRIBED_CHANNELS_KEY);
      await SecureStore.deleteItemAsync(this.REMOVED_DEFAULTS_KEY);
    } catch (error) {
      console.error('Error clearing subscriptions:', error);
      throw error;
    }
  }
}

export default ChannelSubscriptionManager; 