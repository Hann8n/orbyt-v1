import { storage } from '../../utils/storage/storage';
import AtprotoService from '../api/AtprotoService';
import { extractColorsFromImage, darkenColor } from '../../utils/formatting/colors';
import { useQuery, useMutation, useQueryClient, UseQueryResult } from '@tanstack/react-query';
import { useCallback } from 'react';
import { Colors } from '../../theme';
import {
  isOrbytChannel,
  getChannelByUri,
  getChannelBySlug,
  extractFeedSlug,
  hashtagToChannelSlug,
} from '../../utils/channels/orbyt';
// Image.resolveAssetSource replaced with expo-asset

export interface CachedChannel {
  uri: string;
  cid: string;
  did: string;
  creator: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  displayName: string;
  description?: string;
  avatar?: string;
  likeCount?: number;
  subscriberCount?: number;
  indexedAt: string;
  isOrbytChannel?: boolean; // True if this is an orbyt-managed channel (getorbyt.com feed)
  channelColors?: {
    backgroundColor: string;
    foregroundColor: string;
    accentColor?: string; // Add accent color for vibrant UI elements
    statusBarStyle: 'light' | 'dark';
  };
  lastUpdated: number; // timestamp
}

// Type for channel colors returned by the hook
export interface ChannelColorScheme {
  backgroundColor: string;
  foregroundColor: string;
  textColor: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string; // Add accent color for vibrant UI elements
  statusBarStyle: 'light' | 'dark';
}

// Query keys for React Query
export const channelKeys = {
  all: ['channels'] as const,
  detail: (uri: string) => [...channelKeys.all, 'detail', uri] as const,
  colors: (uri: string) => [...channelKeys.all, 'colors', uri] as const,
};

class ChannelService {
  private static getChannelColorsKey(uri: string): string {
    return `channelColors_${uri.toLowerCase()}`;
  }

  private static readPersistedColors(uri: string): CachedChannel['channelColors'] | undefined {
    try {
      const raw = storage.getString(this.getChannelColorsKey(uri));
      if (!raw) return undefined;
      const parsed = JSON.parse(raw) as CachedChannel['channelColors'];
      if (!parsed?.backgroundColor) return undefined;
      return {
        backgroundColor: parsed.backgroundColor,
        foregroundColor: '#FFFFFF',
        accentColor: parsed.accentColor || '#000000',
        statusBarStyle: 'light',
      };
    } catch {
      return undefined;
    }
  }

  private static writePersistedColors(
    uri: string,
    colors: { backgroundColor: string; accentColor?: string }
  ): void {
    try {
      storage.set(
        this.getChannelColorsKey(uri),
        JSON.stringify({
          backgroundColor: colors.backgroundColor,
          accentColor: colors.accentColor,
          statusBarStyle: 'light',
        })
      );
    } catch {
      // ignore
    }
  }

  /**
   * Fetch and cache a channel/feed
   * Accepts local channel URIs (at://local.orbyt.channel/{slug}), hashtag feeds (e.g., "hashtag:orbyt-channel-art"), and feed generator URIs
   */
  static async getChannel(uriOrFeed: string): Promise<CachedChannel | null> {
    if (!uriOrFeed) return null;

    // Handle local channel URIs (at://local.orbyt.channel/{slug})
    if (uriOrFeed.startsWith('at://local.orbyt.channel/')) {
      const slug = extractFeedSlug(uriOrFeed);
      if (!slug) return null;

      // Look up orbyt channel by slug
      const orbytChannel = getChannelBySlug(slug);
      if (!orbytChannel) return null;

      // Create channel object from orbyt channel config
      return await this.createOrbytChannelCache(orbytChannel);
    }

    // Handle hashtag feeds (legacy support for normalized orbyt channels)
    if (uriOrFeed.startsWith('hashtag:')) {
      const slug = hashtagToChannelSlug(uriOrFeed);
      if (!slug) return null;

      // Look up orbyt channel by slug
      const orbytChannel = getChannelBySlug(slug);
      if (!orbytChannel) return null;

      return await this.createOrbytChannelCache(orbytChannel);
    }

    // Handle feed generator URIs (both orbyt and external)
    if (!uriOrFeed.startsWith('at://')) {
      return null;
    }

    // Fetch from API or orbyt channel config
    return this.fetchAndCacheChannel(uriOrFeed);
  }

  /**
   * Fetch a channel from the API and cache it
   */
  private static async fetchAndCacheChannel(uri: string): Promise<CachedChannel | null> {
    if (!uri) return null;

    // Check if this is an orbyt channel - if so, get data from orbytChannels.ts
    const orbytChannel = getChannelByUri(uri);
    if (orbytChannel) {
      return await this.createOrbytChannelCache(orbytChannel);
    }

    // Validate URI format - must be a valid at-uri for feed generators
    if (!uri.startsWith('at://')) {
      return null;
    }

    // Async operations already run off the main thread - no delay needed
    try {
      const channel = await AtprotoService.getFeedGenerator(uri);
      if (!channel) {
        return null;
      }

      let channelColors = undefined;
      // Robust avatar extraction - all properties are on channel.view
      const avatarUrl = channel.view?.avatar || channel.view?.creator?.avatar || undefined;
      if (avatarUrl) {
        try {
          // Use the improved extractColorsFromImage function for better color extraction
          const extractedColors = await extractColorsFromImage(avatarUrl);
          // Darken the background color to ensure it's always darker
          const darkenedBackground = darkenColor(extractedColors.backgroundColor, 0.5);
          channelColors = {
            backgroundColor: darkenedBackground,
            foregroundColor: '#FFFFFF', // Always use white text for channels
            accentColor: extractedColors.accentColor || '#000000', // Accent to black
            statusBarStyle: 'light' as const,
          };
        } catch (_e) {
          // Set fallback colors if extraction fails
          channelColors = {
            backgroundColor: Colors.black,
            foregroundColor: '#FFFFFF',
            accentColor: '#000000', // Accent to black
            statusBarStyle: 'light' as const,
          };
        }
      } else {
        // Set fallback colors if no avatar
        channelColors = {
          backgroundColor: Colors.black,
          foregroundColor: '#FFFFFF',
          accentColor: '#000000', // Accent to black
          statusBarStyle: 'light' as const,
        };
      }

      // Get subscriber count (number of likes on the feed generator post)
      const subscriberCount = channel.view?.likeCount || 0;

      const channelUri = channel.view?.uri;
      if (!channelUri) {
        return null;
      }
      const cacheObject: CachedChannel = {
        uri: channelUri,
        cid: channel.view?.cid,
        did: channel.view?.did,
        creator: channel.view?.creator,
        displayName: channel.view?.displayName,
        description: channel.view?.description,
        avatar: avatarUrl, // Use the avatarUrl variable directly
        likeCount: channel.view?.likeCount,
        subscriberCount,
        indexedAt: channel.view?.indexedAt,
        isOrbytChannel: isOrbytChannel(channelUri), // Check if this is an orbyt channel
        channelColors:
          this.readPersistedColors(channelUri) ||
          (channelColors
            ? {
                backgroundColor: channelColors.backgroundColor,
                foregroundColor: channelColors.foregroundColor,
                accentColor: channelColors.accentColor,
                statusBarStyle:
                  channelColors.statusBarStyle === 'light' ||
                  channelColors.statusBarStyle === 'dark'
                    ? channelColors.statusBarStyle
                    : 'light',
              }
            : {
                backgroundColor: Colors.black,
                foregroundColor: '#FFFFFF',
                accentColor: '#00D4FF',
                statusBarStyle: 'light' as const,
              }),
        lastUpdated: Date.now(),
      };

      return cacheObject;
    } catch (_error) {
      return null;
    }
  }

  /**
   * Update the channel colors
   */
  static async updateChannelColors(
    uri: string,
    backgroundColor: string,
    _foregroundColor: string,
    accentColor?: string
  ): Promise<void> {
    if (!uri) return;

    // Persist only user-selected colors; React Query will refetch/rehydrate.
    this.writePersistedColors(uri, { backgroundColor, accentColor });
  }

  /**
   * Create a cached channel object from orbyt channel definition
   * This allows us to use hashtag feeds instead of feed generators
   */
  private static async createOrbytChannelCache(
    orbytChannel: import('../../utils/channels/orbyt').OrbytChannel
  ): Promise<CachedChannel> {
    // Extract avatar from channelGIF
    let avatarUrl: string | undefined = undefined;
    if (orbytChannel.channelGIF) {
      try {
        const { Asset } = require('expo-asset');
        const asset = Asset.fromModule(orbytChannel.channelGIF);
        avatarUrl = asset.localUri || asset.uri;
      } catch (_e) {
        // Fallback if image resolution fails
      }
    }

    // Extract colors from avatar if available
    let channelColors = undefined;
    if (avatarUrl) {
      try {
        const extractedColors = await extractColorsFromImage(avatarUrl);
        const darkenedBackground = darkenColor(extractedColors.backgroundColor, 0.5);
        channelColors = {
          backgroundColor: darkenedBackground,
          foregroundColor: '#FFFFFF',
          accentColor: extractedColors.accentColor || '#000000',
          statusBarStyle: 'light' as const,
        };
      } catch (_e) {
        // Fallback colors
        channelColors = {
          backgroundColor: Colors.black,
          foregroundColor: '#FFFFFF',
          accentColor: '#000000',
          statusBarStyle: 'light' as const,
        };
      }
    } else {
      // Default colors if no avatar
      channelColors = {
        backgroundColor: Colors.black,
        foregroundColor: '#FFFFFF',
        accentColor: '#000000',
        statusBarStyle: 'light' as const,
      };
    }

    // Create cache object - use URI for compatibility, but we'll use hashtag for feeds
    const cacheObject: CachedChannel = {
      uri: orbytChannel.uri,
      cid: '', // Not needed for orbyt channels
      did: 'did:plc:2xrqztnmzlckb3xfuuukupso', // Default orbyt DID
      creator: {
        did: 'did:plc:2xrqztnmzlckb3xfuuukupso',
        handle: 'getorbyt.com',
        displayName: 'orbyt',
        avatar: undefined,
      },
      displayName: orbytChannel.displayName,
      description: orbytChannel.description || '', // Use description from orbytChannels
      avatar: avatarUrl,
      likeCount: 0, // Not applicable for hashtag channels
      subscriberCount: 0, // Not applicable for hashtag channels
      indexedAt: new Date().toISOString(),
      isOrbytChannel: true,
      channelColors: this.readPersistedColors(orbytChannel.uri) || channelColors,
      lastUpdated: Date.now(),
    };

    return cacheObject;
  }
}

/**
 * Hook to fetch channel data
 */
export function useChannel(uri: string | null | undefined): UseQueryResult<CachedChannel | null> {
  return useQuery({
    queryKey: channelKeys.detail(uri || ''),
    queryFn: () => ChannelService.getChannel(uri || ''),
    enabled: !!uri,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Hook to fetch just the channel colors
 */
export function useChannelColors(uriOrFeed: string | null | undefined) {
  const { data: channel } = useChannel(uriOrFeed);

  // Return default colors if URI/feed is not valid (accepts local channel URIs, hashtag feeds, and feed generator URIs)
  if (
    !uriOrFeed ||
    (!uriOrFeed.startsWith('hashtag:') &&
      (!uriOrFeed.startsWith('at://') ||
        (!uriOrFeed.includes('/app.bsky.feed.generator/') &&
          !uriOrFeed.startsWith('at://local.orbyt.channel/'))))
  ) {
    return {
      colors: {
        backgroundColor: Colors.black,
        foregroundColor: '#FFFFFF',
        textColor: Colors.neutral[50],
        primaryColor: '#000000',
        secondaryColor: Colors.neutral[50],
        accentColor: '#000000',
        statusBarStyle: 'light' as const,
      },
      isLoading: false,
      getColorWithOpacity: (_colorKey: keyof ChannelColorScheme, opacity: number): string => {
        const hex = '#000000';
        if (hex.startsWith('#')) {
          const r = parseInt(hex.slice(1, 3), 16);
          const g = parseInt(hex.slice(3, 5), 16);
          const b = parseInt(hex.slice(5, 7), 16);
          return `rgba(${r}, ${g}, ${b}, ${opacity})`;
        }
        return hex;
      },
    };
  }

  const colors: ChannelColorScheme = {
    backgroundColor: channel?.channelColors?.backgroundColor || '#000000',
    foregroundColor: '#FFFFFF', // Always use white text for channels
    textColor: Colors.neutral[50], // Always use white text for channels
    primaryColor: channel?.channelColors?.backgroundColor || '#000000',
    secondaryColor: Colors.neutral[50], // Always use white text for channels
    accentColor: channel?.channelColors?.accentColor || '#000000', // Accent to black
    statusBarStyle: 'light', // Always use light status bar for channels
  };

  return {
    colors,
    isLoading: !channel,
    getColorWithOpacity: (colorKey: keyof ChannelColorScheme, opacity: number): string => {
      const hex = colors[colorKey];
      if (hex.startsWith('#')) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
      }
      return hex;
    },
  };
}

/**
 * Hook to update channel colors with React Query integration
 */
export function useChannelColorsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      uri,
      backgroundColor,
      foregroundColor,
      accentColor,
    }: {
      uri: string;
      backgroundColor: string;
      foregroundColor: string;
      accentColor?: string;
    }) => {
      await ChannelService.updateChannelColors(uri, backgroundColor, foregroundColor, accentColor);
      return { uri, backgroundColor, foregroundColor, accentColor };
    },
    onSuccess: (_, { uri }) => {
      // Invalidate the specific channel query to refetch with new colors
      queryClient.invalidateQueries({ queryKey: channelKeys.detail(uri) });
    },
  });
}

/**
 * Hook to invalidate channel cache
 */
export function useChannelInvalidation() {
  const queryClient = useQueryClient();

  return useCallback(
    (uri: string) => {
      queryClient.invalidateQueries({ queryKey: channelKeys.detail(uri) });
    },
    [queryClient]
  );
}

export default ChannelService;
