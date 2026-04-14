/**
 * Video Utilities - Lean helpers for video playback
 * Uses native expo-video caching (1GB LRU default)
 *
 * Video dimensions: All video sizing uses DEFAULT_VIDEO_ASPECT_RATIO (9:16 portrait)
 * and getVideoAspectRatio* helpers so list, grid, placeholder, and post screen stay consistent.
 */

import { Platform } from 'react-native';
import type { VideoSource, BufferOptions, SeekTolerance } from 'expo-video';
import type {
  ExtendedPostView,
  ExtendedFeedViewPost,
  PostView,
  VideoView,
  RecordWithMediaView,
} from '../../services/api/types';
import { isVideoEmbed, isVideoEmbedInMedia } from '../../services/api/types';

/**
 * Feed/preview playback: keep startup and memory pressure low for many concurrent players.
 *
 * - Android: 3s forward buffer
 * - iOS: 0s (system-managed)
 * - waitsToMinimizeStalling: false (fast start)
 */
export const FEED_BUFFER_OPTIONS: BufferOptions = {
  preferredForwardBufferDuration: Platform.OS === 'android' ? 3 : 0,
  waitsToMinimizeStalling: false,
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

  if (isVideoEmbed(embed)) {
    return embed;
  }

  if (isVideoEmbedInMedia(embed)) {
    return (embed as RecordWithMediaView).media as VideoView;
  }

  return null;
}

/** Default video aspect ratio (width / height). 9:16 portrait used everywhere for consistent sizing. */
export const DEFAULT_VIDEO_ASPECT_RATIO = 9 / 16;

/**
 * Standard card height for a video in the list feed: screen width / aspect ratio,
 * capped by screen height. Uses default 9:16 portrait when aspect ratio not provided.
 */
export function getVideoCardHeight(
  screenWidth: number,
  screenHeight: number,
  aspectRatio: number = DEFAULT_VIDEO_ASPECT_RATIO
): number {
  const idealHeight = screenWidth / aspectRatio;
  return Math.min(idealHeight, screenHeight);
}
