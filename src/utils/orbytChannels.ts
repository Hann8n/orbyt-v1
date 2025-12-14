/**
 * Centralized configuration for Orbyt channels
 * Add new channels here to make them available for posting
 */

// Image.resolveAssetSource replaced with expo-asset
import { extractColorsFromImage } from './formatting/colorUtils';

/**
 * App color palette - colors that match the app's aesthetic
 * These are vibrant, saturated colors that work well for channel display
 */
const APP_COLOR_PALETTE = [
  '#FF93CB', // Pastel pink
  '#00BFFF', // Electric blue
  '#FFD700', // Gold
  '#00E6CC', // Vibrant teal
  '#39FF14', // Neon green
  '#ce3bff', // Neon purple
  '#FF6B35', // Warm orange
  '#9D4EDD', // Cosmic purple
  '#FF0080', // Hot pink
  '#FF6B9D', // Light red
  '#D07EA2', // Pastel maroon (AA on dark)
  '#8ECFFF', // Pastel blue (AA on dark)
  '#FFEB3B', // Bright yellow
  '#00D4AA', // Green/Teal
  '#6366F1', // Purple-blue
  '#8B5CF6', // Purple
  '#FF4500', // Sunset orange
];

/**
 * Simple deterministic hash for fallback color selection
 */
function hashSlug(slug: string): number {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = ((hash << 5) - hash) + slug.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Ensure channels get non-repeating, bright palette colors.
 * - Prefers the channel's requested color if unused.
 * - Otherwise assigns the next unused palette color.
 * - Falls back to hashed selection if palette is exhausted.
 */
function applyUniqueChannelColors(channels: OrbytChannel[], palette: string[]): OrbytChannel[] {
  const used = new Set<string>();
  let paletteIndex = 0;

  return channels.map((channel) => {
    const preferred = (channel.channelColor || '').toLowerCase();
    const isPreferredAvailable = preferred && !used.has(preferred);

    let selected = channel.channelColor;
    if (!selected || !isPreferredAvailable) {
      // Find next unused palette color
      while (paletteIndex < palette.length && used.has(palette[paletteIndex].toLowerCase())) {
        paletteIndex++;
      }

      if (paletteIndex < palette.length) {
        selected = palette[paletteIndex];
        paletteIndex++;
      } else {
        // Fallback: deterministic hash selection
        const baseIndex = hashSlug(channel.slug) % palette.length;
        for (let i = 0; i < palette.length; i++) {
          const candidate = palette[(baseIndex + i) % palette.length];
          if (!used.has(candidate.toLowerCase())) {
            selected = candidate;
            break;
          }
        }
        selected = selected || palette[baseIndex];
      }
    }

    used.add(selected.toLowerCase());
    return { ...channel, channelColor: selected };
  });
}

/**
 * Convert hex color to HSL
 */
function hexToHSL(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return { h: h * 360, s, l };
}

/**
 * Calculate color distance in HSL space
 * This gives better results than RGB for matching hues
 */
function colorDistance(color1: string, color2: string): number {
  const hsl1 = hexToHSL(color1);
  const hsl2 = hexToHSL(color2);
  
  // Weight hue more heavily, but also consider saturation and lightness
  const hueDiff = Math.min(Math.abs(hsl1.h - hsl2.h), 360 - Math.abs(hsl1.h - hsl2.h)) / 180;
  const satDiff = Math.abs(hsl1.s - hsl2.s);
  const lightDiff = Math.abs(hsl1.l - hsl2.l);
  
  // Weight hue at 60%, saturation at 25%, lightness at 15%
  return hueDiff * 0.6 + satDiff * 0.25 + lightDiff * 0.15;
}

/**
 * Automatically generate a channel color from a GIF
 * Extracts the dominant color and matches it to the closest color in the app's palette
 * This function can be used to update channel colors programmatically
 * @param channelGIF - The GIF asset (require() result)
 * @returns A hex color string that matches the app's aesthetic
 */
export async function generateChannelColorFromGIF(channelGIF: any): Promise<string> {
  try {
    // Resolve the GIF asset to get its URI using expo-asset
    const { Asset } = require('expo-asset');
    const asset = Asset.fromModule(channelGIF);
    const uri = asset.localUri || asset.uri;
    if (!uri) {
      return '#6366F1'; // Default purple-blue fallback
    }

    // Extract colors from the GIF
    const extractedColors = await extractColorsFromImage(resolvedAsset.uri);
    const dominantColor = extractedColors.backgroundColor || extractedColors.accentColor || '#6366F1';

    // Find the closest color in the app's palette
    let closestColor = APP_COLOR_PALETTE[0];
    let minDistance = colorDistance(dominantColor, closestColor);

    for (const paletteColor of APP_COLOR_PALETTE) {
      const distance = colorDistance(dominantColor, paletteColor);
      if (distance < minDistance) {
        minDistance = distance;
        closestColor = paletteColor;
      }
    }

    return closestColor;
  } catch (error) {
    // Fallback to a default color if extraction fails
    return '#6366F1'; // Default purple-blue
  }
}

/**
 * Initialize channel colors for all channels that have GIFs
 * This can be called on app startup to auto-generate colors
 * Note: This updates the channel definitions in memory, but changes are not persisted
 * For persistent updates, you would need to modify the channel definitions file
 */
export async function initializeChannelColors(): Promise<void> {
  for (const channel of ORBYT_CHANNELS) {
    if (channel.channelGIF) {
      try {
        const generatedColor = await generateChannelColorFromGIF(channel.channelGIF);
        // Update the channel color in memory
        channel.channelColor = generatedColor;
      } catch (error) {
        // Silently fail - keep existing color
        console.warn(`Failed to generate color for channel ${channel.slug}:`, error);
      }
    }
  }
}

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
const HolidaysChannelGIF = require('../assets/channelGIFs/holidays.gif');
const PetsChannelGIF = require('../assets/channelGIFs/pets.gif');
const FunnyChannelGIF = require('../assets/channelGIFs/funny.gif');

/**
 * Orbyt channel definitions
 * Add new channels here - they will automatically appear in the channel selector
 */
const BASE_ORBYT_CHANNELS: OrbytChannel[] = [
  {
    uri: 'at://local.orbyt.channel/archive',
    slug: 'archive',
    displayName: 'archive',
    description: 'from the platforms of yesteryear',
    channelColor: '#D07EA2', // Pastel maroon with AA contrast on dark
    channelGIF: ArchiveChannelGIF,
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
    channelColor: '#8ECFFF', // Pastel blue with AA contrast on dark
    channelGIF: ChillChannelGIF,
  },
  {
    uri: 'at://local.orbyt.channel/edits',
    slug: 'edits',
    displayName: 'edits',
    description: 'GET HYPED!',
    channelColor: '#ce3bff', // Bright neon purple for contrast
    channelGIF: EditsChannelGIF,
  },
  {
    uri: 'at://local.orbyt.channel/funny',
    slug: 'funny',
    displayName: 'funny',
    description: 'laugh out loud',
    channelColor: '#8B5CF6', // Bright purple for contrast
    channelGIF: FunnyChannelGIF,
  },
  {
    uri: 'at://local.orbyt.channel/holidays',
    slug: 'holidays',
    displayName: 'holidays',
    description: 'celebrate the moments',
    channelColor: '#FF6B35', // Warm orange for holidays (matches app palette)
    channelGIF: HolidaysChannelGIF,
  },
  {
    uri: 'at://local.orbyt.channel/horror',
    slug: 'horror',
    displayName: 'horror',
    description: '💨 what was that? I\'m scared',
    channelColor: '#FF6B9D', // Light red for dark backgrounds
    channelGIF: HorrorChannelGIF,
  },
  {
    uri: 'at://did:plc:2xrqztnmzlckb3xfuuukupso/app.bsky.feed.generator/latest',
    slug: 'latest',
    displayName: 'latest',
    channelColor: '#00BFFF', // Electric blue from palette
    channelGIF: LatestChannelGIF,
    showSlash: false, // Don't show slash for latest
    isPostable: false, // Users cannot post to latest
  },
  {
    uri: 'at://local.orbyt.channel/pets',
    slug: 'pets',
    displayName: 'pets',
    description: 'good boys and girls',
    channelColor: '#00D4AA', // Teal for pets (unique, bright)
    channelGIF: PetsChannelGIF,
  },
  {
    uri: 'at://did:plc:2xrqztnmzlckb3xfuuukupso/app.bsky.feed.generator/popular-now',
    slug: 'popular-now',
    displayName: 'popular now',
    channelColor: '#FF93CB', // Pastel pink (palette-aligned)
    channelGIF: PopularNowChannelGIF,
    showSlash: false, // Don't show slash for popular now
    isPostable: false, // Users cannot post to popular now
  },
  {
    uri: 'at://local.orbyt.channel/weird',
    slug: 'weird',
    displayName: 'weird',
    description: 'well ... that\'s new',
    channelColor: '#00BFFF', // Teal-blue for contrast on dark
    channelGIF: WeirdChannelGIF,
  },
  // Add more channels here as needed
];

export const ORBYT_CHANNELS: OrbytChannel[] = applyUniqueChannelColors(
  BASE_ORBYT_CHANNELS,
  APP_COLOR_PALETTE,
);

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
    const { Asset } = require('expo-asset');
    const asset = Asset.fromModule(orbytChannel.channelGIF);
    return asset.localUri || asset.uri;
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

