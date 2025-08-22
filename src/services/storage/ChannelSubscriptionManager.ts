import * as SecureStore from 'expo-secure-store';
import { FEED_CONFIG } from '../FeedService';
import AccountManager from '../storage/AccountManager';

export interface SubscribedChannel {
  uri: string;
  displayName: string;
  description?: string;
  avatar?: string;
  memberCount?: number;
  isDefault?: boolean;
  order: number;
  subscribedAt: number;
}

class ChannelSubscriptionManager {
  private static SUBSCRIBED_CHANNELS_KEY = 'subscribed_channels_v1';
  private static DEFAULT_CHANNELS = [
    { uri: 'following', displayName: 'Following', isDefault: true, order: 0, subscribedAt: Date.now() },
    { uri: 'yourMix', displayName: 'Your Mix', isDefault: true, order: 1, subscribedAt: Date.now() },
  ];

  private static REMOVED_DEFAULTS_KEY = 'removed_default_channels_v1';

  /**
   * Build a user-scoped key by appending the active DID.
   * Falls back to the base key if no DID is available.
   */
  private static async getUserScopedKey(baseKey: string): Promise<string> {
    try {
      const activeAccount = await AccountManager.getActiveAccount();
      if (activeAccount?.id) {
        return `${baseKey}_${activeAccount.id}`;
      }

      const did = activeAccount?.did;
      if (did) {
        const sanitizedDid = did.replace(/[^a-zA-Z0-9._-]/g, '_');
        return `${baseKey}_${sanitizedDid}`;
      }

      // Fallback: try session if AccountManager not set
      const sessionStr = await SecureStore.getItemAsync('session');
      const session = sessionStr ? JSON.parse(sessionStr) : null;
      if (session?.did) {
        const sanitizedDid = String(session.did).replace(/[^a-zA-Z0-9._-]/g, '_');
        return `${baseKey}_${sanitizedDid}`;
      }
    } catch {
      // ignore and fallback
    }
    return baseKey;
  }

  /**
   * Get all subscribed channels including defaults
   */
  static async getSubscribedChannels(): Promise<SubscribedChannel[]> {
    try {
      const scopedKey = await this.getUserScopedKey(this.SUBSCRIBED_CHANNELS_KEY);
      let channelsStr = await SecureStore.getItemAsync(scopedKey);

      // One-time migration from legacy global key to user-scoped key
      if (!channelsStr) {
        const legacyStr = await SecureStore.getItemAsync(this.SUBSCRIBED_CHANNELS_KEY);
        if (legacyStr) {
          await SecureStore.setItemAsync(scopedKey, legacyStr);
          await SecureStore.deleteItemAsync(this.SUBSCRIBED_CHANNELS_KEY);
          channelsStr = legacyStr;
        }
      }
      
      const savedChannels: SubscribedChannel[] = channelsStr ? JSON.parse(channelsStr) : [];
      
      // Get removed default channels
      const removedDefaultsStr = await SecureStore.getItemAsync(
        await this.getUserScopedKey(this.REMOVED_DEFAULTS_KEY)
      );
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
      
      // Sort by order
      const finalChannels = allChannels.sort((a, b) => a.order - b.order);
      
      return finalChannels;
    } catch (error) {
      console.error('Error getting subscribed channels:', error);
      return [...this.DEFAULT_CHANNELS];
    }
  }

  /**
   * Get channels that are included in the mix (all subscribed channels)
   */
  static async getChannelsInMix(): Promise<SubscribedChannel[]> {
    try {
      const channels = await this.getSubscribedChannels();
      // All subscribed channels are in the mix
      return channels;
    } catch (error) {
      console.error('Error getting channels in mix:', error);
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
      await SecureStore.setItemAsync(
        await this.getUserScopedKey(this.SUBSCRIBED_CHANNELS_KEY),
        JSON.stringify(savedChannels)
      );
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
        const removedDefaultsStr = await SecureStore.getItemAsync(
          await this.getUserScopedKey(this.REMOVED_DEFAULTS_KEY)
        );
        const removedDefaults: string[] = removedDefaultsStr ? JSON.parse(removedDefaultsStr) : [];
        
        if (!removedDefaults.includes(uri)) {
          removedDefaults.push(uri);
          await SecureStore.setItemAsync(
            await this.getUserScopedKey(this.REMOVED_DEFAULTS_KEY),
            JSON.stringify(removedDefaults)
          );
        }
      } else {
        // For non-default channels, remove from saved channels
        const filteredChannels = channels.filter(ch => ch.uri !== uri);
        const savedChannels = filteredChannels.filter(ch => !ch.isDefault);
        await SecureStore.setItemAsync(
          await this.getUserScopedKey(this.SUBSCRIBED_CHANNELS_KEY),
          JSON.stringify(savedChannels)
        );
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
      const removedDefaultsStr = await SecureStore.getItemAsync(
        await this.getUserScopedKey(this.REMOVED_DEFAULTS_KEY)
      );
      const removedDefaults: string[] = removedDefaultsStr ? JSON.parse(removedDefaultsStr) : [];
      
      const updatedRemovedDefaults = removedDefaults.filter(removedUri => removedUri !== uri);
      await SecureStore.setItemAsync(
        await this.getUserScopedKey(this.REMOVED_DEFAULTS_KEY),
        JSON.stringify(updatedRemovedDefaults)
      );
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
      const removedDefaultsStr = await SecureStore.getItemAsync(
        await this.getUserScopedKey(this.REMOVED_DEFAULTS_KEY)
      );
      const removedDefaults: string[] = removedDefaultsStr ? JSON.parse(removedDefaultsStr) : [];
      
      return this.DEFAULT_CHANNELS.filter(ch => removedDefaults.includes(ch.uri));
    } catch (error) {
      console.error('Error getting available default channels:', error);
      return [];
    }
  }

  /**
   * Clear all subscriptions
   */
  static async clearAllSubscriptions(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(
        await this.getUserScopedKey(this.SUBSCRIBED_CHANNELS_KEY)
      );
      await SecureStore.deleteItemAsync(
        await this.getUserScopedKey(this.REMOVED_DEFAULTS_KEY)
      );
    } catch (error) {
      console.error('Error clearing subscriptions:', error);
      throw error;
    }
  }
}

export default ChannelSubscriptionManager; 