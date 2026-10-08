import { AtprotoFeedService } from '../api/feed/FeedService';
import { useQuery, skipToken, UseQueryResult } from '@tanstack/react-query';
import { Colors } from '../../theme';
import { isOrbytChannel } from '../../utils/channels/orbyt';
import {
  communityQueryOptions,
  hydrateOrbytChannels,
  migrateLegacyChannelUri,
} from '../OrbytChannelsService';
import { isCommunityUri, type CommunityView } from '../orbyt/communities';
import { queryKeys } from '@/utils/query/queryKeys';
import { queryClient } from '@/utils/query/queryClient';
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

    let uri = uriOrFeed;
    if (!isCommunityUri(uri)) {
      // Only a pre-Communities reference needs the directory, to resolve its name.
      await this.ensureChannelsHydrated();
      uri = migrateLegacyChannelUri(uri);
    }

    if (isCommunityUri(uri)) {
      // The directory entry when cached; otherwise `getCommunity`, so Communities
      // beyond the cached pages open too.
      try {
        return this.createOrbytChannelCache(
          await queryClient.fetchQuery(communityQueryOptions(uri))
        );
      } catch {
        return null;
      }
    }

    if (uri.startsWith('hashtag:') || !isValidAtUri(uri)) {
      return null;
    }

    return this.fetchAndCacheChannel(uri);
  }

  private static async fetchAndCacheChannel(uri: string): Promise<CachedChannel | null> {
    if (!uri) return null;

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

  private static createOrbytChannelCache(community: CommunityView): CachedChannel {
    return {
      uri: community.uri,
      cid: community.cid,
      did: community.ownerDid,
      creator: undefined,
      displayName: community.name,
      description: community.description || '',
      avatar: community.avatar || community.avatarFallback,
      likeCount: 0,
      subscriberCount: community.memberCount ?? 0,
      indexedAt: community.updatedAt || community.createdAt,
      isOrbytChannel: true,
      channelColors: {
        backgroundColor: Colors.black,
        foregroundColor: '#FFFFFF',
        accentColor: community.accentColor || Colors.black,
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
    (!uriOrFeed.startsWith('hashtag:') && !isValidAtUri(uriOrFeed) && !isOrbytChannel(uriOrFeed))
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
