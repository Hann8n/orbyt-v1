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
 * Default buffer options for video players.
 * Used by VideoCard, VideoPostScreen, and video-editor to ensure consistent buffering behavior.
 *
 * - Android: 20s forward buffer (explicit)
 * - iOS: 0s (auto-determined by system)
 * - iOS: waitsToMinimizeStalling enabled for smoother playback
 */
export const DEFAULT_BUFFER_OPTIONS: BufferOptions = {
  preferredForwardBufferDuration: Platform.OS === 'android' ? 20 : 0,
  waitsToMinimizeStalling: true,
  // Android-only fields omitted to use platform defaults
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

/**
 * Extracts all metadata from a VideoView in a single call.
 * Returns null if the embed is not a video embed.
 *
 * @param embed - Post embed that may contain video
 * @returns Object with playlist URL, thumbnail URL, and aspect ratio, or null if not a video embed
 *
 * @example
 * ```typescript
 * const metadata = getVideoMetadata(post.embed);
 * if (metadata) {
 *   const { playlist, thumbnail, aspectRatio } = metadata;
 *   // Use video metadata
 * }
 * ```
 */
export function getVideoMetadata(embed: PostView['embed'] | null | undefined): {
  playlist: string | null;
  thumbnail: string | null;
  aspectRatio: { width: number; height: number } | null;
} | null {
  const videoView = getVideoView(embed);
  if (!videoView) return null;

  return {
    playlist: videoView.playlist || null,
    thumbnail: videoView.thumbnail || null,
    aspectRatio: videoView.aspectRatio
      ? {
          width: videoView.aspectRatio.width,
          height: videoView.aspectRatio.height,
        }
      : null,
  };
}

/** Default video aspect ratio (width / height). 9:16 portrait used everywhere for consistent sizing. */
export const DEFAULT_VIDEO_ASPECT_RATIO = 9 / 16;

/**
 * Returns video aspect ratio (width / height) from embed, or default 9:16 portrait.
 * Use for layout: cardHeight = viewportWidth / aspectRatio (capped by viewportHeight).
 */
export function getVideoAspectRatioFromEmbed(embed: PostView['embed'] | null | undefined): number {
  const meta = getVideoMetadata(embed);
  if (meta?.aspectRatio && meta.aspectRatio.width > 0 && meta.aspectRatio.height > 0) {
    return meta.aspectRatio.width / meta.aspectRatio.height;
  }
  return DEFAULT_VIDEO_ASPECT_RATIO;
}

/**
 * Returns video aspect ratio (width / height) from a post, or default 9:16 portrait.
 */
export function getVideoAspectRatioFromPost(
  post: { embed?: PostView['embed'] } | { post?: { embed?: PostView['embed'] } }
): number {
  const embed =
    (post as { embed?: PostView['embed'] }).embed ??
    (post as { post?: { embed?: PostView['embed'] } }).post?.embed;
  return getVideoAspectRatioFromEmbed(embed ?? null);
}

/**
 * Standard card height for a video in the list feed: viewport width / aspect ratio,
 * capped by viewport height. Uses default 9:16 portrait when aspect ratio not provided.
 */
export function getVideoCardHeight(
  viewportWidth: number,
  viewportHeight: number,
  aspectRatio: number = DEFAULT_VIDEO_ASPECT_RATIO
): number {
  const idealHeight = viewportWidth / aspectRatio;
  return Math.min(idealHeight, viewportHeight);
}
