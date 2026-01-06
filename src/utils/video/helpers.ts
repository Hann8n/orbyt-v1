/**
 * Video Utilities - Lean helpers for video playback
 * Uses native expo-video caching (1GB LRU default)
 */

import { Platform } from 'react-native';
import type { VideoSource } from 'expo-video';

/**
 * Creates a properly configured VideoSource object for HLS streaming.
 * Automatically detects HLS streams and sets appropriate contentType.
 * Enables caching on Android (iOS doesn't support HLS caching per expo-video docs).
 * Adaptive bitrate is handled automatically by the native HLS player.
 */
export function createVideoSource(videoUrl: string | null): VideoSource | null {
  if (!videoUrl) return null;

  // Enforce HLS-only playback
  const isHLS =
    videoUrl.includes('.m3u8') ||
    /[?&]format=m3u8/i.test(videoUrl) ||
    /playlist|hls|video\.bsky\.app/i.test(videoUrl);

  if (!isHLS) return null;

  return {
    uri: videoUrl,
    contentType: 'hls',
    // Enable caching on Android for better performance (iOS limitation: can't cache HLS)
    // Per expo-video docs: "Due to platform limitations, the cache cannot be used with HLS video sources on iOS"
    useCaching: Platform.OS === 'android',
  };
}

export interface VideoEmbed {
  $type: string;
  playlist?: string | string[];
  media?: VideoEmbed;
  aspectRatio?: {
    width: number;
    height: number;
  };
}

/**
 * Helper function to get the actual video embed object from any embed type
 */
function getActualVideoEmbed(embed: any): any | null {
  if (!embed) return null;

  if (embed.$type === 'app.bsky.embed.recordWithMedia#view') {
    const recordEmbed = embed as VideoEmbed;
    if (recordEmbed.media?.$type?.includes('video')) {
      return recordEmbed.media;
    }
    return null;
  }

  if (embed.$type?.includes('video')) {
    return embed;
  }

  return null;
}

/**
 * Extracts the video URL from a post embed object.
 * Prefers HLS (.m3u8) for best iOS streaming support.
 */
export function extractVideoUrl(embed: any): string | null {
  const videoEmbed = getActualVideoEmbed(embed);
  if (!videoEmbed) return null;

  // Handle array of playlists - prefer HLS
  if (Array.isArray(videoEmbed.playlist)) {
    const entries = videoEmbed.playlist.filter(Boolean) as string[];
    if (entries.length === 0) return null;

    // HLS-only: require .m3u8 entry
    const hls = entries.find(u => u.toLowerCase().includes('.m3u8') || /[?&]format=m3u8/i.test(u));
    if (hls) return hls;

    // No HLS available
    return null;
  }

  // Single value playlist: only accept HLS-like URLs
  const single = videoEmbed.playlist as string | null;
  if (!single) return null;
  const isHlsSingle = single.toLowerCase().includes('.m3u8') || /[?&]format=m3u8/i.test(single);
  return isHlsSingle ? single : null;
}

/**
 * Extracts the video thumbnail URL from a post embed object.
 */
export function extractVideoThumbnail(embed: any): string | null {
  const videoEmbed = getActualVideoEmbed(embed);
  return videoEmbed?.thumbnail || null;
}

/**
 * Extract video embed and URL from a post in a single operation
 */
export function extractVideoEmbedAndUrl(post: any): { videoEmbed: any; videoUrl: string | null } {
  const videoEmbed = post?.embed ? getActualVideoEmbed(post.embed) : null;
  const videoUrl = extractVideoUrl(videoEmbed);
  return { videoEmbed, videoUrl };
}
