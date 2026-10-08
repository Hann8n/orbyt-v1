import i18n from '../../i18n';
import { Colors } from '@/theme';
import {
  getActiveRemoteChannels,
  getRemoteChannelBySlug,
  getRemoteChannelByUri,
} from '@/services/OrbytChannelsService';
import {
  COMMUNITY_FEED_PREFIX,
  isCommunityUri,
  type CommunityView,
} from '@/services/orbyt/communities';

/** An Orbyt Community, in the shape the channel UI renders. */
export interface OrbytChannel {
  uri: string;
  /** The Community's unique lowercase name. */
  slug: string;
  displayName: string;
  description?: string;
  channelColor: string;
  mediaUrl: string;
  showSlash?: boolean;
  isPostable?: boolean;
  isActive?: boolean;
  memberCount?: number;
}
const DEFAULT_CHANNEL_COLOR = Colors.pink[300];

function mapCommunity(community: CommunityView): OrbytChannel {
  return {
    uri: community.uri,
    slug: community.name,
    displayName: community.name,
    description: community.description || undefined,
    channelColor: community.accentColor || DEFAULT_CHANNEL_COLOR,
    mediaUrl: community.avatar || community.avatarFallback || '',
    showSlash: true,
    // `members` and `moderators` Communities refuse posts from most viewers;
    // only open Communities are offered as composer destinations.
    isPostable: (community.postPolicy ?? 'anyone') === 'anyone',
    isActive: true,
    memberCount: community.memberCount,
  };
}

/**
 * Get localized display name for an orbyt channel.
 * Use in components that display channel names to ensure correct locale.
 */
export function getLocalizedChannelDisplayName(uri: string, fallback?: string): string {
  if (!uri || !isOrbytChannel(uri)) return fallback ?? '';
  const slug = extractFeedSlug(uri);
  if (!slug) return fallback ?? '';
  return i18n.t(`channels.orbyt.${slug}.displayName`, { defaultValue: fallback || slug });
}

/**
 * Get localized display name from a channel slug (Community name).
 */
export function getLocalizedChannelDisplayNameFromSlug(slug: string, fallback?: string): string {
  if (!slug || typeof slug !== 'string') return fallback ?? '';
  return i18n.t(`channels.orbyt.${slug}.displayName`, { defaultValue: fallback ?? slug });
}

/**
 * Get localized description for an orbyt channel.
 * Use in components that display channel descriptions to ensure correct locale.
 */
export function getLocalizedChannelDescription(uri: string, fallback?: string): string {
  if (!uri || !isOrbytChannel(uri)) return fallback ?? '';
  const slug = extractFeedSlug(uri);
  if (!slug) return fallback ?? '';
  return i18n.t(`channels.orbyt.${slug}.description`, { defaultValue: fallback ?? '' });
}

/**
 * The short name of a channel URI: a Community's name, or the record key of a
 * feed generator URI.
 */
export function extractFeedSlug(uri: string): string | null {
  if (!uri || typeof uri !== 'string') {
    return null;
  }

  const community = getRemoteChannelByUri(uri);
  if (community) {
    return community.name;
  }

  if (!uri.includes('/app.bsky.feed.generator/')) {
    return null;
  }

  const slug = uri
    .split('/app.bsky.feed.generator/')[1]
    ?.replace(/\/+$/, '')
    .split('?')[0]
    .split('#')[0]
    .trim();

  return slug || null;
}

/**
 * Get a channel by its slug (Community name)
 */
export function getChannelBySlug(slug: string): OrbytChannel | undefined {
  if (!slug) {
    return undefined;
  }
  const community = getRemoteChannelBySlug(slug);
  return community ? mapCommunity(community) : undefined;
}

/**
 * Get channels that users can post to
 */
export function getPostableChannels(): OrbytChannel[] {
  return getActiveRemoteChannels()
    .map(mapCommunity)
    .filter(channel => channel.isPostable !== false);
}

/**
 * Check if a channel should show the slash indicator
 */
export function shouldShowChannelSlash(uri: string): boolean {
  const channel = getChannelByUri(uri);
  return channel?.showSlash !== false; // Default to true if not specified
}

/**
 * A Community's cached metadata (directory or `getCommunity`); undefined until
 * fetched. Use `useCommunity` to fetch it.
 */
export function getChannelByUri(uri: string): OrbytChannel | undefined {
  if (!uri) {
    return undefined;
  }
  const community = getRemoteChannelByUri(uri);
  return community ? mapCommunity(community) : undefined;
}

/**
 * Whether a URI is an Orbyt Community, cached or not.
 */
export function isOrbytChannel(uri: string): boolean {
  return isCommunityUri(uri);
}

/**
 * The channel avatar from the Community's artwork.
 */
export function getChannelAvatarUri(uri: string, fallbackAvatar?: string): string | undefined {
  if (!uri) return fallbackAvatar;

  const orbytChannel = getChannelByUri(uri);
  if (orbytChannel?.mediaUrl) {
    return orbytChannel.mediaUrl;
  }

  return fallbackAvatar;
}

/**
 * The feed option that loads a Community's feed from the Orbyt AppView.
 * @returns `community:<at-uri>`, or null when the URI is not a Community
 */
export function channelToFeedOption(uri: string): string | null {
  if (!isCommunityUri(uri)) {
    return null;
  }
  return `${COMMUNITY_FEED_PREFIX}${uri}`;
}
