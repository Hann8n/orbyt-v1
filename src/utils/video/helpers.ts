/**
 * Video Utilities - Lean helpers for video playback
 * Uses native expo-video caching (1GB LRU default)
 *
 * Video dimensions: All video sizing uses DEFAULT_VIDEO_ASPECT_RATIO (9:16 portrait)
 * and getVideoAspectRatio* helpers so list, grid, placeholder, and post screen stay consistent.
 */

import { Platform } from 'react-native';
import type { VideoSource, BufferOptions, SeekTolerance } from 'expo-video';
import { AppBskyEmbedVideo, AppBskyEmbedRecordWithMedia } from '@atproto/api';
import type {
  ExtendedPostView,
  ExtendedFeedViewPost,
  PostView,
  VideoView,
} from '../../services/api/types';

/**
 * Feed/preview playback: balance startup speed with smooth multi-player experience.
 *
 * - Android: 20s forward buffer (reduces rebuffering across concurrent players)
 * - iOS: 0s (system-managed)
 * - waitsToMinimizeStalling: true (avoids visible stall events that trigger status churn)
 */
export const FEED_BUFFER_OPTIONS: BufferOptions = {
  preferredForwardBufferDuration: Platform.OS === 'android' ? 20 : 0,
  waitsToMinimizeStalling: true,
};

/**
 * Full-screen playback: prefer continuity over instant start.
 *
 * - Android: larger forward buffer for reduced rebuffering on poor networks
 * - iOS: 0s (system-managed)
 * - waitsToMinimizeStalling: true
 */
export const FULLSCREEN_BUFFER_OPTIONS: BufferOptions = {
  preferredForwardBufferDuration: Platform.OS === 'android' ? 10 : 0,
  waitsToMinimizeStalling: true,
};

/**
 * Default seek tolerance for scrubber-enabled video players.
 * Used only by VideoCard (feed player with VideoScrubber).
 * Larger tolerance (0.5s) allows faster seeking at the cost of precision.
 */
export const DEFAULT_SEEK_TOLERANCE_SCRUBBER: SeekTolerance = {
  toleranceBefore: 0.5,
  toleranceAfter: 0.5,
};

/**
 * Creates a properly configured VideoSource object for HLS streaming.
 * Automatically detects HLS streams and sets appropriate contentType.
 * Enables caching on Android (iOS doesn't support HLS caching per expo-video docs).
 * Adaptive bitrate is handled automatically by the native HLS player.
 *
 * @param videoUrl - The video URL to create a source for, may be null
 * @returns VideoSource object configured for HLS playback, or null if URL is invalid or not HLS
 *
 * @example
 * ```typescript
 * const source = createVideoSource(videoView.playlist);
 * if (source) {
 *   <Video source={source} />
 * }
 * ```
 */
export function createVideoSource(videoUrl: string | null): VideoSource | null {
  if (!videoUrl) return null;

  const isHLS =
    videoUrl.includes('.m3u8') ||
    /[?&]format=m3u8/i.test(videoUrl) ||
    /playlist|hls|video\.bsky\.app/i.test(videoUrl);

  if (!isHLS) return null;

  return {
    uri: videoUrl,
    contentType: 'hls',
    useCaching: Platform.OS === 'android',
  };
}

/**
 * Normalizes ExtendedPostView | ExtendedFeedViewPost to ExtendedPostView.
 * The API returns both formats - this helper ensures consistent access to post data.
 *
 * @param post - Post data that may be in ExtendedPostView or ExtendedFeedViewPost format
 * @returns Normalized ExtendedPostView (extracts post property if needed)
 *
 * @example
 * ```typescript
 * const normalized = normalizePostView(feedItem);
 * const author = normalized.author;
 * ```
 */
export function normalizePostView(post: ExtendedPostView | ExtendedFeedViewPost): ExtendedPostView {
  return 'post' in post ? post.post : post;
}

/**
 * Extracts VideoView from embed when we know it's a video embed.
 * Returns null if not a video embed.
 * This eliminates duplication of type guard + extraction pattern across components.
 *
 * @param embed - Post embed that may contain video, may be null or undefined
 * @returns VideoView if embed contains video, null otherwise
 *
 * @example
 * ```typescript
 * const videoView = getVideoView(post.embed);
 * if (videoView) {
 *   const playlist = videoView.playlist;
 *   const thumbnail = videoView.thumbnail;
 * }
 * ```
 */
export function getVideoView(embed: PostView['embed'] | null | undefined): VideoView | null {
  if (!embed) return null;

  if (AppBskyEmbedVideo.isView(embed)) {
    return embed;
  }

  if (AppBskyEmbedRecordWithMedia.isView(embed) && AppBskyEmbedVideo.isView(embed.media)) {
    return embed.media;
  }

  return null;
}

/** Default video aspect ratio (width / height). 9:16 portrait used everywhere for consistent sizing. */
export const DEFAULT_VIDEO_ASPECT_RATIO = 9 / 16;
