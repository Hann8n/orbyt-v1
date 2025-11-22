/**
 * Centralized configuration for Orbyt channels
 * Add new channels here to make them available for posting
 */

import { Image } from 'react-native';

export interface OrbytChannel {
  uri: string;
  slug: string;
  displayName: string;
  description?: string; // Channel description (stored locally since we're not loading from server)
  channelColor: string; // Color for the channel display name
  channelGIF?: any; // Local GIF asset (require() result) for channel avatar/background
  showSlash?: boolean; // Whether to show the "/" prefix (default: true)
  isPostable?: boolean; // Whether users can post to this channel (default: true)
}

// Import channel GIFs
const ArtChannelGIF = require('../assets/channelGIFs/art.gif');
const ChillChannelGIF = require('../assets/channelGIFs/chill.gif');
const HorrorChannelGIF = require('../assets/channelGIFs/horror.gif');
const WeirdChannelGIF = require('../assets/channelGIFs/weird.gif');
const PopularNowChannelGIF = require('../assets/channelGIFs/popular-now.gif');
const LatestChannelGIF = require('../assets/channelGIFs/latest.gif');
const EditsChannelGIF = require('../assets/channelGIFs/edits.gif');
const ArchiveChannelGIF = require('../assets/channelGIFs/archive.gif');

/**
 * Orbyt channel definitions
 * Add new channels here - they will automatically appear in the channel selector
 */
export const ORBYT_CHANNELS: OrbytChannel[] = [
  {
    uri: 'at://did:plc:2xrqztnmzlckb3xfuuukupso/app.bsky.feed.generator/popular-now',
    slug: 'popular-now',
    displayName: 'popular now',
    channelColor: '#FF69B4', // Pink color for popular now channel
    channelGIF: PopularNowChannelGIF,
    showSlash: false, // Don't show slash for popular now
    isPostable: false, // Users cannot post to popular now
  },
  {
    uri: 'at://did:plc:2xrqztnmzlckb3xfuuukupso/app.bsky.feed.generator/latest',
    slug: 'latest',
    displayName: 'latest',
    channelColor: '#0094ea', // Blue color for latest channel
    channelGIF: LatestChannelGIF,
    showSlash: false, // Don't show slash for latest
    isPostable: false, // Users cannot post to latest
  },
  {
    uri: 'at://local.orbyt.channel/art',
    slug: 'art',
    displayName: 'art',
    description: 'i like it ... Picasso',
    channelColor: '#FFD700', // Yellow color for art channel
    channelGIF: ArtChannelGIF,
  },
  {
    uri: 'at://local.orbyt.channel/chill',
    slug: 'chill',
    displayName: 'chill',
    description: 'just vibes',
    channelColor: '#4c7db9', // Blue color for chill channel
    channelGIF: ChillChannelGIF,
  },
  {
    uri: 'at://local.orbyt.channel/horror',
    slug: 'horror',
    displayName: 'horror',
    description: '💨 what was that? I\'m scared',
    channelColor: '#666', // Horror channel color
    channelGIF: HorrorChannelGIF,
  },
  {
    uri: 'at://local.orbyt.channel/weird',
    slug: 'weird',
    displayName: 'weird',
    description: 'well ... that\'s new',
    channelColor: '#78a779', // Weird channel color
    channelGIF: WeirdChannelGIF,
  },
  {
    uri: 'at://local.orbyt.channel/edits',
    slug: 'edits',
    displayName: 'edits',
    description: 'GET HYPED!',
    channelColor: '#8d53b9', // Purple color for edits channel
    channelGIF: EditsChannelGIF,
  },
  {
    uri: 'at://local.orbyt.channel/archive',
    slug: 'archive',
    displayName: 'archive',
    description: 'from the platforms of yesteryear',
    channelColor: '#ab4979', // Archive channel color
    channelGIF: ArchiveChannelGIF,
  },
  // Add more channels here as needed
];

/**
 * Extract feed slug from a feed generator URI or local channel URI
 * @param uri - Feed generator URI (e.g., "at://did:plc:.../app.bsky.feed.generator/art") or local URI (e.g., "at://local.orbyt.channel/art")
 * @returns The slug (e.g., "art") or null if invalid
 */
export function extractFeedSlug(uri: string): string | null {
  if (!uri || typeof uri !== 'string') {
    return null;
  }

  // Handle local channel URIs (at://local.orbyt.channel/{slug})
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

  // Check if URI contains the feed generator pattern
  if (!uri.includes('/app.bsky.feed.generator/')) {
    return null;
  }

  // Split on the feed generator pattern and take the last part
  const parts = uri.split('/app.bsky.feed.generator/');
  if (parts.length < 2) {
    return null;
  }

  // Extract slug, removing any trailing slashes, query parameters, or fragments
  let slug = parts[1].trim();
  
  // Remove trailing slashes
  slug = slug.replace(/\/+$/, '');
  
  // Remove query parameters and fragments (everything after ? or #)
  slug = slug.split('?')[0].split('#')[0];
  
  // Final trim to ensure no leading/trailing whitespace
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
  return ORBYT_CHANNELS.find(channel => channel.slug === slug);
}

/**
 * Get all available channels
 * @returns Array of all channel definitions
 */
export function getAllChannels(): OrbytChannel[] {
  return [...ORBYT_CHANNELS];
}

/**
 * Get channels that users can post to
 * @returns Array of postable channel definitions
 */
export function getPostableChannels(): OrbytChannel[] {
  return ORBYT_CHANNELS.filter(channel => channel.isPostable !== false);
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
  return ORBYT_CHANNELS.find(channel => channel.uri === uri);
}

/**
 * Check if a feed URI belongs to getorbyt.com (is an Orbyt channel)
 * @param uri - Feed generator URI or local channel URI to check
 * @returns true if the URI belongs to getorbyt.com
 */
export function isOrbytChannel(uri: string): boolean {
  if (!uri) return false;
  // Check exact match first
  if (ORBYT_CHANNELS.some(channel => channel.uri === uri)) {
    return true;
  }
  // Also check if it's a local channel URI format
  if (uri.startsWith('at://local.orbyt.channel/')) {
    return true;
  }
  return false;
}

/**
 * Get the feed type based on URI
 * @param uri - Feed generator URI
 * @returns 'channel' if it's an Orbyt channel, 'feed' if it's an external feed
 */
export function getFeedType(uri: string): 'channel' | 'feed' {
  return isOrbytChannel(uri) ? 'channel' : 'feed';
}

/**
 * Get the channel avatar URI, prioritizing channelGIF for Orbyt channels
 * @param uri - Channel URI
 * @param fallbackAvatar - Fallback avatar URI from channel data
 * @returns Avatar URI string or undefined
 */
export function getChannelAvatarUri(uri: string, fallbackAvatar?: string): string | undefined {
  if (!uri) return fallbackAvatar;
  
  const orbytChannel = getChannelByUri(uri);
  if (orbytChannel?.channelGIF) {
    const resolvedAsset = Image.resolveAssetSource(orbytChannel.channelGIF);
    return resolvedAsset?.uri;
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

  // If it's already a hashtag format, return as-is
  if (uriOrSlug.startsWith('hashtag:')) {
    return uriOrSlug;
  }

  // Try to extract slug from URI
  let slug: string | null = null;
  
  if (uriOrSlug.startsWith('at://')) {
    // It's a URI (local or feed generator), extract slug
    slug = extractFeedSlug(uriOrSlug);
  } else {
    // It's already a slug, use it directly
    slug = uriOrSlug.trim();
  }

  if (!slug) {
    return null;
  }

  // Return hashtag format matching the tag format used in posts: orbyt-channel-{slug}
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
  
  // Handle orbyt-channel- prefix (the actual format used in posts)
  if (hashtag.startsWith('orbyt-channel-')) {
    return hashtag.substring(15); // Remove 'orbyt-channel-' prefix (15 chars) to get the slug
  }
  
  // Fallback for legacy orbyt- format
  if (hashtag.startsWith('orbyt-')) {
    return hashtag.substring(7); // Remove 'orbyt-' prefix to get the slug
  }
  
  return hashtag || null;
}

