import { AtprotoFeedService } from '../api/feed/FeedService';
import { useQuery, skipToken, UseQueryResult } from '@tanstack/react-query';
import { Colors } from '../../theme';
import {
  isOrbytChannel,
  getChannelByUri,
  getChannelBySlug,
  extractFeedSlug,
  hashtagToChannelSlug,
} from '../../utils/channels/orbyt';
import { hydrateOrbytChannels } from '../OrbytChannelsService';
import { resolveLocalizedText } from '@/i18n/resolveLocalizedText';
import { queryKeys } from '@/utils/query/queryKeys';
import { isValidAtUri } from '../../utils/atproto/uriValidation';

export interface CachedChannel {
  uri: string;
  cid: string;
  did: string;
  creator?: {
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
  isOrbytChannel?: boolean;
  channelColors?: {
    backgroundColor: string;
    foregroundColor: string;
    accentColor?: string;
    statusBarStyle: 'light' | 'dark';
  };
  lastUpdated: number;
}

export interface ChannelColorScheme {
  backgroundColor: string;
  foregroundColor: string;
  textColor: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  statusBarStyle: 'light' | 'dark';
}

class ChannelService {
  private static channelsHydrationPromise: Promise<unknown> | null = null;

  private static async ensureChannelsHydrated(): Promise<void> {
    if (!this.channelsHydrationPromise) {
      this.channelsHydrationPromise = hydrateOrbytChannels().finally(() => {
        this.channelsHydrationPromise = null;
      });
    }
    await this.channelsHydrationPromise;
  }

  static async getChannel(uriOrFeed: string): Promise<CachedChannel | null> {
    if (!uriOrFeed) return null;
    await this.ensureChannelsHydrated();

    if (isOrbytChannel(uriOrFeed)) {
      const slug = extractFeedSlug(uriOrFeed);
      if (!slug) return null;

      const orbytChannel = getChannelBySlug(slug);
      if (!orbytChannel) return null;

      return this.createOrbytChannelCache(orbytChannel);
    }

    if (uriOrFeed.startsWith('hashtag:')) {
      const slug = hashtagToChannelSlug(uriOrFeed);
      if (!slug) return null;

      const orbytChannel = getChannelBySlug(slug);
      if (!orbytChannel) return null;

      return this.createOrbytChannelCache(orbytChannel);
    }

    if (!isValidAtUri(uriOrFeed)) {
      return null;
    }

    return this.fetchAndCacheChannel(uriOrFeed);
  }

  private static async fetchAndCacheChannel(uri: string): Promise<CachedChannel | null> {
    if (!uri) return null;

    const orbytChannel = getChannelByUri(uri);
    if (orbytChannel) {
      return this.createOrbytChannelCache(orbytChannel);
    }

    if (!isValidAtUri(uri)) {
      return null;
    }

    try {
      const channel = await AtprotoFeedService.getFeedGenerator(uri);
      if (!channel) {
        return null;
      }

      const channelUri = channel.view?.uri;
      if (!channelUri) {
        return null;
      }

      const avatarUrl = channel.view?.avatar || channel.view?.creator?.avatar || undefined;
      const subscriberCount = channel.view?.likeCount || 0;

      const cacheObject: CachedChannel = {
        uri: channelUri,
        cid: channel.view?.cid,
        did: channel.view?.did,
        creator: channel.view?.creator,
        displayName: channel.view?.displayName,
        description: channel.view?.description,
        avatar: avatarUrl,
        likeCount: channel.view?.likeCount,
        subscriberCount,
        indexedAt: channel.view?.indexedAt,
        isOrbytChannel: isOrbytChannel(channelUri),
        channelColors: {
          backgroundColor: Colors.black,
          foregroundColor: '#FFFFFF',
          accentColor: Colors.black,
          statusBarStyle: 'light' as const,
        },
        lastUpdated: Date.now(),
      };

      return cacheObject;
    } catch (_error) {
      return null;
    }
  }


  private static createOrbytChannelCache(
    orbytChannel: import('../../utils/channels/orbyt').OrbytChannel
  ): CachedChannel {
    return {
      uri: orbytChannel.uri,
      cid: '',
      did: 'did:plc:2xrqztnmzlckb3xfuuukupso',
      creator: undefined,
      displayName:
        resolveLocalizedText(orbytChannel.displayName, orbytChannel.displayNameTranslations) ||
        orbytChannel.displayName,
      description:
        resolveLocalizedText(
          orbytChannel.description || '',
          orbytChannel.descriptionTranslations
        ) || '',
      avatar: orbytChannel.mediaUrl,
      likeCount: 0,
      subscriberCount: 0,
      indexedAt: new Date().toISOString(),
      isOrbytChannel: true,
      channelColors: {
        backgroundColor: Colors.black,
        foregroundColor: '#FFFFFF',
        accentColor: Colors.black,
        statusBarStyle: 'light' as const,
      },
      lastUpdated: Date.now(),
    };
  }
}

export function useChannel(uri: string | null | undefined): UseQueryResult<CachedChannel | null> {
  return useQuery({
    queryKey: queryKeys.channels.detail(uri || ''),
    queryFn: uri ? () => ChannelService.getChannel(uri) : skipToken,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    networkMode: 'offlineFirst',
  });
}

export function useChannelColors(uriOrFeed: string | null | undefined) {
  const { data: channel } = useChannel(uriOrFeed);

  if (
    !uriOrFeed ||
    (!uriOrFeed.startsWith('hashtag:') &&
      !isValidAtUri(uriOrFeed) &&
      !isOrbytChannel(uriOrFeed))
  ) {
    return {
      colors: {
        backgroundColor: Colors.black,
        foregroundColor: '#FFFFFF',
        textColor: Colors.neutral[50],
        primaryColor: Colors.black,
        secondaryColor: Colors.neutral[50],
        accentColor: Colors.black,
        statusBarStyle: 'light' as const,
      },
      isLoading: false,
      getColorWithOpacity: (_colorKey: keyof ChannelColorScheme, opacity: number): string => {
        const hex = Colors.black;
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
    backgroundColor: channel?.channelColors?.backgroundColor || Colors.black,
    foregroundColor: '#FFFFFF',
    textColor: Colors.neutral[50],
    primaryColor: channel?.channelColors?.backgroundColor || Colors.black,
    secondaryColor: Colors.neutral[50],
    accentColor: channel?.channelColors?.accentColor || Colors.black,
    statusBarStyle: 'light',
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



export default ChannelService;
