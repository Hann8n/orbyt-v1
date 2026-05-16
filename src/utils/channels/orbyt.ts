import i18n from '../../i18n';
import { Colors } from '@/theme';
import type { RemoteOrbytChannel } from '@/services/OrbytChannelsService';
import type { TranslationMap } from '@/i18n/resolveLocalizedText';
import {
  getActiveRemoteChannels,
  getRemoteChannelBySlug,
  getRemoteChannelByUri,
  isKnownOrbytChannelUri,
} from '@/services/OrbytChannelsService';
import { isValidAtUri } from '../atproto/uriValidation';

export interface OrbytChannel {
  uri: string;
  slug: string;
  displayName: string;
  displayNameTranslations?: TranslationMap;
  description?: string;
  descriptionTranslations?: TranslationMap;
  channelColor: string;
  mediaUrl: string;
  showSlash?: boolean;
  isPostable?: boolean;
  isActive?: boolean;
}
const DEFAULT_CHANNEL_COLOR = Colors.pink[300];

function mapRemoteChannel(channel: RemoteOrbytChannel): OrbytChannel {
  return {
    uri: channel.uri,
    slug: channel.slug,
    displayName: channel.displayName,
    displayNameTranslations: channel.displayNameTranslations,
    description: channel.description || undefined,
    descriptionTranslations: channel.descriptionTranslations,
    channelColor: channel.channelColor || DEFAULT_CHANNEL_COLOR,
    mediaUrl: channel.mediaUrl,
    showSlash: channel.showSlash,
    isPostable: channel.isPostable,
    isActive: channel.active,
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
  return i18n.t(`channels.orbyt.${slug}.displayName`, { defaultValue: fallback ?? slug });
}

/**
 * Get localized display name from a channel slug (e.g. from post tags).
 * Use when you have the slug but not the URI, e.g. when displaying channel on video cards.
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
 * Extract feed slug from a feed generator URI or local channel URI
 * @param uri - Feed generator URI (e.g., "at://did:plc:.../app.bsky.feed.generator/art") or local URI (e.g., "at://local.orbyt.channel/art")
 * @returns The slug (e.g., "art") or null if invalid
 */
export function extractFeedSlug(uri: string): string | null {
  if (!uri || typeof uri !== 'string') {
    return null;
  }

  if (uri.startsWith('at://local.orbyt.channel/')) {
    const parts = uri.split('/');
    if (parts.length >= 4) {
      let slug = parts[3].trim();
      // Remove query parameters and fragments
      slug = slug.split('?')[0].split('#')[0];
      return slug || null;
    }
    return null;
  }

  if (!uri.includes('/app.bsky.feed.generator/')) {
    return null;
  }

  const parts = uri.split('/app.bsky.feed.generator/');
  if (parts.length < 2) {
    return null;
  }

  let slug = parts[1].trim();
  slug = slug.replace(/\/+$/, '');
  slug = slug.split('?')[0].split('#')[0];
  slug = slug.trim();

  return slug || null;
}

/**
 * Get a channel by its slug
 * @param slug - Channel slug (e.g., "art")
 * @returns Channel object or undefined if not found
 */
export function getChannelBySlug(slug: string): OrbytChannel | undefined {
  if (!slug) {
    return undefined;
  }
  const channel = getRemoteChannelBySlug(slug);
  return channel ? mapRemoteChannel(channel) : undefined;
}

/**
 * Get only active channels (for display in explore and channel selection)
 * @returns Array of active channel definitions
 */
function getActiveChannels(): OrbytChannel[] {
  return getActiveRemoteChannels().map(mapRemoteChannel);
}

/**
 * Get channels that users can post to
 * @returns Array of postable channel definitions
 */
export function getPostableChannels(): OrbytChannel[] {
  return getActiveChannels().filter(channel => channel.isPostable !== false);
}

/**
 * Check if a channel should show the slash indicator
 * @param uri - Channel URI
 * @returns true if the channel should show the slash
 */
export function shouldShowChannelSlash(uri: string): boolean {
  const channel = getChannelByUri(uri);
  return channel?.showSlash !== false; // Default to true if not specified
}

/**
 * Get channel by URI
 * @param uri - Channel URI
 * @returns Channel object or undefined if not found
 */
export function getChannelByUri(uri: string): OrbytChannel | undefined {
  if (!uri) {
    return undefined;
  }
  const channel = getRemoteChannelByUri(uri);
  return channel ? mapRemoteChannel(channel) : undefined;
}

/**
 * Check if a feed URI belongs to getorbyt.com (is an orbyt channel)
 * @param uri - Feed generator URI or local channel URI to check
 * @returns true if the URI belongs to getorbyt.com
 */
export function isOrbytChannel(uri: string): boolean {
  if (!uri) return false;
  return isKnownOrbytChannelUri(uri);
}

/**
 * Get the channel avatar URI from API-managed channel metadata.
 * @param uri - Channel URI
 * @param fallbackAvatar - Fallback avatar URI from channel data
 * @returns Avatar URI string or undefined
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
 * Convert a channel URI or slug to hashtag format for feed loading
 * @param uriOrSlug - Channel URI (local or feed generator) or slug (e.g., "at://local.orbyt.channel/art", "at://did:plc:.../app.bsky.feed.generator/art", or "art")
 * @returns Hashtag feed option (e.g., "hashtag:orbyt-channel-art") or null if invalid
 */
export function channelToHashtag(uriOrSlug: string): string | null {
  if (!uriOrSlug || typeof uriOrSlug !== 'string') {
    return null;
  }

  if (uriOrSlug.startsWith('hashtag:')) {
    return uriOrSlug;
  }

  let slug: string | null = null;

  if (isValidAtUri(uriOrSlug)) {
    // It's a URI (local or feed generator), extract slug
    slug = extractFeedSlug(uriOrSlug);
  } else {
    // It's already a slug, use it directly
    slug = uriOrSlug.trim();
  }

  if (!slug) {
    return null;
  }

  return `hashtag:orbyt-channel-${slug}`;
}

/**
 * Convert a hashtag feed option back to channel slug
 * @param hashtagFeedOption - Hashtag feed option (e.g., "hashtag:orbyt-channel-art")
 * @returns Channel slug (e.g., "art") or null if invalid
 */
export function hashtagToChannelSlug(hashtagFeedOption: string): string | null {
  if (!hashtagFeedOption || typeof hashtagFeedOption !== 'string') {
    return null;
  }

  if (!hashtagFeedOption.startsWith('hashtag:')) {
    return null;
  }

  const hashtag = hashtagFeedOption.substring(8).trim(); // Remove 'hashtag:' prefix

  if (hashtag.startsWith('orbyt-channel-')) {
    return hashtag.substring(15); // Remove 'orbyt-channel-' prefix (15 chars) to get the slug
  }

  if (hashtag.startsWith('orbyt-')) {
    return hashtag.substring(7); // Remove 'orbyt-' prefix to get the slug
  }

  return hashtag || null;
}
