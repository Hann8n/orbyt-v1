import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { createVideoPlayer } from 'expo-video';
import type { VideoPlayer } from 'expo-video';
import { File } from 'expo-file-system';
import {
  ensureFileUri,
  isValidVideoPath,
  normalizePathForNative,
  resolveVideoPath,
  stripPathFragment,
} from '../../utils/video/path';
import { logger } from '../../utils/logger';

export type VideoSegmentSource = ImagePicker.ImagePickerAsset | { uri: string };

export function getVideoSegmentSourceUri(video: VideoSegmentSource): string {
  if ('uri' in video && typeof video.uri === 'string') {
    return video.uri;
  }
  return '';
}

type FastMergeInput = string | { path: string };
type FastMergeFn = (recordedVideos: FastMergeInput[]) => Promise<string | null>;
let processAndMergeVideos: FastMergeFn | null = null;
try {
  const fastMergeModule = require('react-native-fast-video-merge') as {
    processAndMergeVideos?: FastMergeFn;
  };
  processAndMergeVideos = fastMergeModule.processAndMergeVideos ?? null;
} catch (_error) {
  logger.info('Fast merge SDK not available', { component: 'VideoProcessingService' });
}

interface VideoProperties {
  width: number;
  height: number;
  frameRate: number;
  codec: string;
  duration: number;
}

export interface VideoSegment {
  startTime: number;
  duration: number;
  video: VideoSegmentSource;
  sourceType?: 'camera' | 'gallery';
}

export interface ProcessedVideo {
  path: string;
  duration: number;
  width: number;
  height: number;
}

// Video quality standards and their typical bitrates
// Note: Quality is determined by the shorter dimension to properly handle different aspect ratios
export const VIDEO_QUALITY_STANDARDS = {
  '480p': { minDimension: 480, bitrate: 1000000, quality: 0.6, label: 'SD (480p)' },
  '720p': { minDimension: 720, bitrate: 2000000, quality: 0.7, label: 'HD (720p)' },
  '1080p': { minDimension: 1080, bitrate: 4000000, quality: 0.8, label: 'Full HD (1080p)' },
  '1440p': { minDimension: 1440, bitrate: 8000000, quality: 0.9, label: '2K (1440p)' },
  '4K': { minDimension: 2160, bitrate: 16000000, quality: 0.95, label: '4K (2160p)' },
} as const;

export interface VideoInfo {
  path: string;
  size: number;
  sizeFormatted: string;
  duration: number;
  durationFormatted: string;
  width: number;
  height: number;
  resolution: string;
  qualityStandard: keyof typeof VIDEO_QUALITY_STANDARDS | 'custom';
  aspectRatio: string;
  bitrate: number;
  bitrateFormatted: string;
  frameRate: number;
  codec: string;
}

const extractLastFrameByKey = new Map<string, Promise<string>>();

const EXPO_VIDEO_PROBE_TIMEOUT_MS = 20_000;

class VideoProcessingService {
  private static pickerDurationMsToSeconds(durationMs: number): number {
    if (!Number.isFinite(durationMs) || durationMs <= 0) return 0;
    return durationMs / 1000;
  }

  private static codecFromMimeType(mime: string | null | undefined): string {
    if (!mime) return 'h264';
    const m = mime.toLowerCase();
    if (m.includes('hevc') || m.includes('h265')) return 'hevc';
    if (m.includes('avc') || m.includes('h264')) return 'h264';
    if (m.includes('vp9')) return 'vp9';
    if (m.includes('vp8')) return 'vp8';
    return 'h264';
  }

  private static frameRateFromExif(exif: unknown): number | null {
    if (exif == null || typeof exif !== 'object') return null;
    const o = exif as Record<string, unknown>;
    const raw = o['VideoFrameRate'] ?? o['FrameRate'];
    if (raw == null) return null;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
    if (typeof raw === 'string') {
      const parsed = parseFloat(raw);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return null;
  }

  private static async waitForExpoPlayerReady(player: VideoPlayer): Promise<void> {
    if (player.status === 'readyToPlay') return;
    if (player.status === 'error') {
      throw new Error('expo-video probe error');
    }
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        sub.remove();
        reject(new Error('expo-video metadata probe timeout'));
      }, EXPO_VIDEO_PROBE_TIMEOUT_MS);
      const sub = player.addListener('statusChange', ({ status, error }) => {
        if (status === 'readyToPlay') {
          clearTimeout(timeout);
          sub.remove();
          resolve();
        } else if (status === 'error') {
          clearTimeout(timeout);
          sub.remove();
          reject(error ?? new Error('expo-video probe error'));
        }
      });
    });
  }

  /**
   * Reads duration / dimensions / frame rate from a local file using expo-video's native player.
   */
  private static async probeLocalVideoWithExpoPlayer(
    fileUri: string
  ): Promise<VideoProperties | null> {
    if (!fileUri) return null;
    let player: VideoPlayer | null = null;
    try {
      player = createVideoPlayer({ uri: fileUri });
      await this.waitForExpoPlayerReady(player);
      const duration = player.duration;
      if (!duration || duration <= 0) return null;
      let width = 0;
      let height = 0;
      let frameRate = 30;
      let codec = 'h264';
      try {
        const track = player.videoTrack;
        width = track?.size.width ?? 0;
        height = track?.size.height ?? 0;
        frameRate =
          track?.frameRate != null && track.frameRate > 0 ? Math.round(track.frameRate) : 30;
        codec = this.codecFromMimeType(track?.mimeType);
      } catch (err) {
        logger.debug('VideoProcessingService: videoTrack read threw', {
          component: 'VideoProcessingService',
          action: 'probeLocalVideoWithExpoPlayer',
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return {
        width,
        height,
        frameRate,
        codec,
        duration,
      };
    } catch (error) {
      logger.debug('expo-video local probe failed', {
        component: 'VideoProcessingService',
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    } finally {
      player?.release();
    }
  }

  /**
   * Returns video metadata (dimensions, duration, codec, etc.) for a local file.
   */
  static async getVideoInfo(
    videoPath: string,
    asset?: ImagePicker.ImagePickerAsset
  ): Promise<VideoInfo> {
    const resolved = await resolveVideoPath(videoPath, asset?.assetId ?? null);
    if (!resolved.exists || !resolved.uri) {
      throw new Error('Video file does not exist');
    }
    const localUri = resolved.uri;

    let fileSize = asset?.fileSize || 0;

    if (!fileSize && asset?.assetId && Platform.OS === 'ios') {
      try {
        const assetInfo = await MediaLibrary.getAssetInfoAsync(asset.assetId, {
          shouldDownloadFromNetwork: true,
        });
        if (assetInfo.localUri) {
          const mlFile = new File(ensureFileUri(assetInfo.localUri));
          fileSize = mlFile.size || 0;
        }
      } catch (_mediaError) {
        // Ignore error, use provided fileSize
      }
    }

    const file = new File(localUri);
    if (!file.exists) {
      throw new Error('Video file does not exist');
    }

    const size = fileSize || file.size || resolved.size || 0;

    let duration =
      asset?.duration != null && asset.duration > 0
        ? this.pickerDurationMsToSeconds(asset.duration)
        : 0;
    let width = asset?.width && asset.width > 0 ? asset.width : 0;
    let height = asset?.height && asset.height > 0 ? asset.height : 0;
    let frameRate = 30;
    let codec = asset?.mimeType ? this.codecFromMimeType(asset.mimeType) : 'h264';

    const fromExif = asset?.exif != null ? this.frameRateFromExif(asset.exif) : null;
    if (fromExif != null) {
      frameRate = fromExif;
    }

    if (duration <= 0 || width <= 0 || height <= 0) {
      const probed = await this.probeLocalVideoWithExpoPlayer(localUri);
      if (probed && probed.duration > 0) {
        duration = probed.duration;
        if (probed.width > 0) width = probed.width;
        if (probed.height > 0) height = probed.height;
        if (probed.frameRate > 0) frameRate = probed.frameRate;
        if (probed.codec) codec = probed.codec;
      }
    }

    if (!duration || duration <= 0) {
      throw new Error('Could not determine video duration');
    }
    if (width <= 0 || height <= 0) {
      throw new Error('Could not determine video dimensions');
    }

    // Determine quality standard based on resolution
    const qualityStandard = this.getQualityStandard(width, height);

    // Calculate aspect ratio
    const aspectRatio = this.calculateAspectRatio(width, height);

    // Estimate bitrate based on file size and duration
    const bitrate = size > 0 && duration > 0 ? (size * 8) / duration : 0;

    const videoInfo = {
      path: localUri,
      size,
      sizeFormatted: this.formatFileSize(size),
      duration,
      durationFormatted: this.formatDuration(duration),
      width,
      height,
      resolution: `${width}x${height}`,
      qualityStandard,
      aspectRatio,
      bitrate,
      bitrateFormatted: this.formatBitrate(bitrate),
      frameRate,
      codec,
    };

    // Removed debug log statement for production
    return videoInfo;
  }

  /**
   * Determines quality standard based on resolution
   * Uses the shorter dimension to properly classify quality for different aspect ratios
   */
  private static getQualityStandard(
    width: number,
    height: number
  ): keyof typeof VIDEO_QUALITY_STANDARDS | 'custom' {
    // For quality standards, use the shorter dimension to properly classify videos
    // This ensures portrait videos (like 1080x1792) are classified by their width (1080p)
    // and landscape videos are classified by their height
    const shorterDimension = Math.min(width, height);

    if (shorterDimension >= 2160) return '4K';
    if (shorterDimension >= 1440) return '1440p';
    if (shorterDimension >= 1080) return '1080p';
    if (shorterDimension >= 720) return '720p';
    if (shorterDimension >= 480) return '480p';
    return 'custom';
  }

  /**
   * Calculates aspect ratio as a string
   */
  private static calculateAspectRatio(width: number, height: number): string {
    // Handle edge cases
    if (width <= 0 || height <= 0) {
      return 'Unknown';
    }

    // Calculate the actual aspect ratio as a decimal
    const aspectRatio = width / height;

    // Define common aspect ratios with tolerance
    const commonRatios = [
      { ratio: 16 / 9, name: '16:9', tolerance: 0.1 },
      { ratio: 9 / 16, name: '9:16', tolerance: 0.1 },
      { ratio: 4 / 3, name: '4:3', tolerance: 0.1 },
      { ratio: 3 / 4, name: '3:4', tolerance: 0.1 },
      { ratio: 1 / 1, name: '1:1', tolerance: 0.05 },
      { ratio: 21 / 9, name: '21:9', tolerance: 0.1 },
      { ratio: 18 / 9, name: '2:1', tolerance: 0.1 },
      { ratio: 3 / 2, name: '3:2', tolerance: 0.1 },
      { ratio: 5 / 4, name: '5:4', tolerance: 0.1 },
    ];

    // Check if the aspect ratio matches any common ratio within tolerance
    for (const commonRatio of commonRatios) {
      if (Math.abs(aspectRatio - commonRatio.ratio) <= commonRatio.tolerance) {
        return commonRatio.name;
      }
    }

    // If no common ratio matches, calculate the simplified ratio
    const gcd = (a: number, b: number): number => {
      a = Math.abs(a);
      b = Math.abs(b);
      while (b !== 0) {
        const temp = b;
        b = a % b;
        a = temp;
      }
      return a;
    };

    const divisor = gcd(width, height);
    const ratioWidth = Math.round(width / divisor);
    const ratioHeight = Math.round(height / divisor);

    // Limit the ratio to reasonable numbers to avoid extremely large ratios
    if (ratioWidth > 100 || ratioHeight > 100) {
      // For very large ratios, round to 1 decimal place
      return `${(width / height).toFixed(1)}:1`;
    }

    return `${ratioWidth}:${ratioHeight}`;
  }

  /**
   * Formats duration in MM:SS format
   */
  private static formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  /**
   * Formats bitrate in human-readable format
   */
  private static formatBitrate(bitsPerSecond: number): string {
    if (bitsPerSecond >= 1000000) {
      return `${(bitsPerSecond / 1000000).toFixed(1)} Mbps`;
    } else if (bitsPerSecond >= 1000) {
      return `${(bitsPerSecond / 1000).toFixed(0)} Kbps`;
    } else {
      return `${bitsPerSecond.toFixed(0)} bps`;
    }
  }

  private static pickerDimensions(video: VideoSegmentSource): { width: number; height: number } {
    if (
      'width' in video &&
      'height' in video &&
      typeof video.width === 'number' &&
      typeof video.height === 'number' &&
      video.width > 0 &&
      video.height > 0
    ) {
      return { width: video.width, height: video.height };
    }
    return { width: 0, height: 0 };
  }

  /**
   * Helper to extract video duration from picker asset or camera `{ uri }` ref.
   */
  private static getVideoDuration(video: VideoSegmentSource): number {
    if (!('uri' in video)) return 0;
    if (
      'duration' in video &&
      typeof video.duration === 'number' &&
      Number.isFinite(video.duration) &&
      video.duration > 0
    ) {
      return this.pickerDurationMsToSeconds(video.duration);
    }
    return 0;
  }

  /**
   * Merges multiple video segments via `react-native-fast-video-merge` (native AVAssetExportSession).
   */
  static async mergeSegments(segments: VideoSegment[]): Promise<ProcessedVideo> {
    if (segments.length === 0) {
      throw new Error('No segments to merge');
    }

    if (segments.length === 1) {
      return await this.prepareSingleSegment(segments[0]);
    }

    const fastMerged = await this.tryMergeSegmentsWithFastSdk(segments);
    if (fastMerged) {
      return fastMerged;
    }
    throw new Error('Fast merge failed.');
  }

  /**
   * Keeps single-segment posts on the native camera/gallery output path.
   * This avoids unnecessary client-side transcode work before posting.
   */
  private static async prepareSingleSegment(segment: VideoSegment): Promise<ProcessedVideo> {
    const originalVideoPath = getVideoSegmentSourceUri(segment.video);
    const assetId = 'assetId' in segment.video ? segment.video.assetId : null;
    const pathInfo = await resolveVideoPath(originalVideoPath, assetId);
    if (!pathInfo.exists || !pathInfo.uri) {
      throw new Error('Single segment video file does not exist');
    }
    const outputPath = pathInfo.uri;

    const picked = this.pickerDimensions(segment.video);
    const fallbackDuration = this.getVideoDuration(segment.video);
    let duration = segment.duration > 0 ? segment.duration : fallbackDuration;

    const probed = await this.probeLocalVideoWithExpoPlayer(outputPath);
    if (duration <= 0 && probed && probed.duration > 0) {
      duration = probed.duration;
    }

    const width = probed && probed.width > 0 ? probed.width : picked.width;
    const height = probed && probed.height > 0 ? probed.height : picked.height;

    if (width <= 0 || height <= 0) {
      throw new Error('Could not determine video dimensions');
    }
    if (duration <= 0) {
      throw new Error('Could not determine video duration');
    }

    return {
      path: outputPath,
      duration,
      width,
      height,
    };
  }

  /**
   * Attempts to merge segments with react-native-fast-video-merge.
   * Returns null when SDK is unavailable or merge fails.
   */
  private static async tryMergeSegmentsWithFastSdk(
    segments: VideoSegment[]
  ): Promise<ProcessedVideo | null> {
    if (!processAndMergeVideos || segments.length < 2) {
      return null;
    }

    try {
      const segmentPaths: string[] = [];
      for (const segment of segments) {
        const originalVideoPath = getVideoSegmentSourceUri(segment.video);
        const assetId = 'assetId' in segment.video ? segment.video.assetId : null;
        const pathInfo = await resolveVideoPath(originalVideoPath, assetId);
        if (!pathInfo.exists || !pathInfo.localPath) {
          logger.warn('Fast merge: segment path could not be resolved', {
            component: 'VideoProcessingService',
          });
          return null;
        }
        segmentPaths.push(normalizePathForNative(stripPathFragment(pathInfo.localPath)));
      }

      let mergedPath = await processAndMergeVideos(segmentPaths.map(path => ({ path })));
      if (!mergedPath) {
        mergedPath = await processAndMergeVideos(segmentPaths);
      }
      if (!mergedPath) {
        return null;
      }

      const outputPath = ensureFileUri(mergedPath);
      const outputFile = new File(normalizePathForNative(outputPath));
      if (!outputFile.exists) {
        logger.warn('Fast merge SDK returned non-existent output file', {
          component: 'VideoProcessingService',
          outputPath,
        });
        return null;
      }

      const fallbackDuration = segments.reduce((sum, segment) => {
        return (
          sum + (Number.isFinite(segment.duration) && segment.duration > 0 ? segment.duration : 0)
        );
      }, 0);
      const fallbackDimensions = this.pickerDimensions(segments[0]?.video);

      const probed = await this.probeLocalVideoWithExpoPlayer(outputPath);
      if (!probed || probed.duration <= 0 || probed.width <= 0 || probed.height <= 0) {
        logger.warn('Fast merge: could not probe merged output', {
          component: 'VideoProcessingService',
          outputPath,
        });
      }

      const duration =
        probed && probed.duration > 0 ? probed.duration : Math.max(fallbackDuration, 0.001);
      const width =
        probed && probed.width > 0
          ? probed.width
          : fallbackDimensions.width > 0
            ? fallbackDimensions.width
            : 1080;
      const height =
        probed && probed.height > 0
          ? probed.height
          : fallbackDimensions.height > 0
            ? fallbackDimensions.height
            : 1920;

      logger.info('Merged segments with fast merge SDK', {
        component: 'VideoProcessingService',
        segmentCount: segments.length,
        outputPath,
      });
      return {
        path: outputPath,
        duration,
        width,
        height,
      };
    } catch (error: unknown) {
      logger.warn('Fast merge SDK failed', {
        component: 'VideoProcessingService',
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Validates video file using MediaLibrary or FileSystem
   */
  static async validateVideoFile(videoPath: string, assetId?: string | null): Promise<boolean> {
    try {
      return await isValidVideoPath(videoPath, assetId ?? null);
    } catch (error) {
      logger.error('Error validating video file', error, { component: 'VideoProcessingService' });
      return false;
    }
  }

  /**
   * Gets human-readable file size string
   * @param bytes - File size in bytes
   * @returns Formatted size string (e.g., "2.5 MB")
   */
  static formatFileSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'] as const;
    const i = Math.min(sizes.length - 1, Math.max(0, Math.floor(Math.log(bytes) / Math.log(k))));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Extracts the first frame from a video as a thumbnail image.
   * Uses expo-video-thumbnails (native AVAssetImageGenerator/MediaMetadataRetriever) for fast extraction.
   * @param videoPath - Path to the video file (should already be standardized)
   * @param assetId - Optional asset ID for MediaLibrary lookup (iCloud videos) - only needed if videoPath is not standardized
   * @param options - Optional: quality 0-1 (0.5 for fast preview, 0.8 for upload banner)
   * @returns Path to the extracted thumbnail image
   */
  static async extractFirstFrame(
    videoPath: string,
    assetId?: string | null,
    options?: { quality?: number }
  ): Promise<string> {
    try {
      const pathInfo = await resolveVideoPath(videoPath, assetId ?? null);
      if (!pathInfo.exists || !pathInfo.uri) {
        throw new Error('Video file does not exist');
      }
      const videoUri = pathInfo.uri;

      const quality = options?.quality ?? 0.8;
      // Extract the very first frame (0ms). Lower quality (e.g. 0.5) for fast preview background.
      const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, {
        time: 0,
        quality,
      });
      return ensureFileUri(uri);
    } catch (error) {
      logger.error('Error extracting first frame', error, { component: 'VideoProcessingService' });
      throw error;
    }
  }

  /**
   * Extracts the last frame from a video as a thumbnail image (for onion skinning).
   * Uses expo-video-thumbnails (native AVAssetImageGenerator/MediaMetadataRetriever) for fast extraction.
   * @param videoPath - Path to the video file (should already be standardized)
   * @param durationSeconds - Video duration in seconds (from segment)
   * @param assetId - Optional asset ID for MediaLibrary lookup (iCloud videos)
   * @returns Path to the extracted thumbnail image
   */
  static async extractLastFrame(
    videoPath: string,
    durationSeconds: number,
    assetId?: string | null
  ): Promise<string> {
    const cacheKey = `${videoPath}\u0000${durationSeconds}\u0000${assetId ?? ''}`;
    const hit = extractLastFrameByKey.get(cacheKey);
    if (hit) {
      return hit;
    }

    const pending = (async (): Promise<string> => {
      try {
        const pathInfo = await resolveVideoPath(videoPath, assetId ?? null);
        if (!pathInfo.exists || !pathInfo.uri) {
          throw new Error('Video file does not exist');
        }
        const videoUri = pathInfo.uri;

        const timeMs = Math.max(0, Math.round((durationSeconds - 0.001) * 1000));

        const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, {
          time: timeMs,
          quality: 0.5,
        });
        return ensureFileUri(uri);
      } catch (error) {
        extractLastFrameByKey.delete(cacheKey);
        logger.error('Error extracting last frame', error, { component: 'VideoProcessingService' });
        throw error;
      }
    })();

    extractLastFrameByKey.set(cacheKey, pending);
    return pending;
  }
}

export default VideoProcessingService;
