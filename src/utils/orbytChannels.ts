/**
 * Centralized configuration for Orbyt channels
 * Add new channels here to make them available for posting
 */

import { Image } from 'react-native';

export interface OrbytChannel {
  uri: string;
  slug: string;
  displayName: string;
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
    uri: 'at://did:plc:2xrqztnmzlckb3xfuuukupso/app.bsky.feed.generator/art',
    slug: 'art',
    displayName: 'art',
    channelColor: '#FFD700', // Yellow color for art channel
    channelGIF: ArtChannelGIF,
  },
  {
    uri: 'at://did:plc:2xrqztnmzlckb3xfuuukupso/app.bsky.feed.generator/chill',
    slug: 'chill',
    displayName: 'chill',
    channelColor: '#4c7db9', // Blue color for chill channel
    channelGIF: ChillChannelGIF,
  },
  {
    uri: 'at://did:plc:2xrqztnmzlckb3xfuuukupso/app.bsky.feed.generator/horror',
    slug: 'horror',
    displayName: 'horror',
    channelColor: '#837142', // Horror channel color
    channelGIF: HorrorChannelGIF,
  },
  {
    uri: 'at://did:plc:2xrqztnmzlckb3xfuuukupso/app.bsky.feed.generator/weird',
    slug: 'weird',
    displayName: 'weird',
    channelColor: '#525f57', // Weird channel color
    channelGIF: WeirdChannelGIF,
  },
  {
    uri: 'at://did:plc:2xrqztnmzlckb3xfuuukupso/app.bsky.feed.generator/edits',
    slug: 'edits',
    displayName: 'edits',
    channelColor: '#8d53b9', // Purple color for edits channel
    channelGIF: EditsChannelGIF,
  },
  // Add more channels here as needed
];

/**
 * Extract feed slug from a feed generator URI
 * @param uri - Feed generator URI (e.g., "at://did:plc:.../app.bsky.feed.generator/art")
 * @returns The slug (e.g., "art") or null if invalid
 */
export function extractFeedSlug(uri: string): string | null {
  if (!uri || typeof uri !== 'string') {
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

  const slug = parts[1].trim();
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
 * @param uri - Feed generator URI to check
 * @returns true if the URI belongs to getorbyt.com
 */
export function isOrbytChannel(uri: string): boolean {
  if (!uri) return false;
  return ORBYT_CHANNELS.some(channel => channel.uri === uri);
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

