import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { File, Directory, Paths } from 'expo-file-system';
import {
  ensureFileUri,
  normalizePathForNative,
  resolveVideoPath,
  stripPathFragment,
} from '../../utils/video/path';
import { compress as compressVideoHardware } from 'expo-image-and-video-compressor';
import { logger } from '../../utils/logger';

// Expo Camera video result type
type ExpoCameraVideo = { uri: string };

// Lazy import FFmpegKit to avoid errors when native module isn't linked yet
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- FFmpegKit types from native module
let FFmpegKit: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ReturnCode from native module
let ReturnCode: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- FFprobeKit types from native module
let FFprobeKit: any = null;
type FastMergeInput = string | { path: string };
type FastMergeFn = (recordedVideos: FastMergeInput[]) => Promise<string | null>;
let processAndMergeVideos: FastMergeFn | null = null;
try {
  const ffmpegModule = require('ffmpeg-kit-react-native');
  FFmpegKit = ffmpegModule.FFmpegKit;
  ReturnCode = ffmpegModule.ReturnCode;
  // FFprobeKit may not be available in all versions, so it's optional
  FFprobeKit = ffmpegModule.FFprobeKit || null;
} catch (_error) {
  logger.warn('FFmpegKit not available - native module not linked', {
    component: 'VideoProcessingService',
  });
}
try {
  const fastMergeModule = require('react-native-fast-video-merge') as {
    processAndMergeVideos?: FastMergeFn;
  };
  processAndMergeVideos = fastMergeModule.processAndMergeVideos ?? null;
} catch (_error) {
  logger.info('Fast merge SDK not available - using FFmpeg merge path', {
    component: 'VideoProcessingService',
  });
}

export interface VideoProperties {
  width: number;
  height: number;
  frameRate: number;
  codec: string;
  duration: number;
  // Optional color metadata (when available from FFprobe)
  colorSpace?: string;
  colorTransfer?: string;
  colorPrimaries?: string;
  // Flag to indicate if the source appears to be HDR (PQ/HLG/BT.2020, etc.)
  isHdr?: boolean;
  bitrate?: number;
}

export interface VideoSegment {
  startTime: number;
  duration: number;
  video: ImagePicker.ImagePickerAsset | ExpoCameraVideo;
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

// Video merge settings for complex filter approach
// These values provide a good balance between quality and compatibility
const MERGE_TARGET_FPS = 30; // Standard frame rate for mobile video

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

/** Reuse in-flight / completed expo-video-thumbnails results per segment (onion skin). */
const extractLastFrameByKey = new Map<string, Promise<string>>();

class VideoProcessingService {
  /**
   * Gets the actual video duration from the video file path
   * Uses FFprobe for accurate duration, falls back to 0 if unavailable
   */
  static async getVideoDurationFromFile(videoPath: string): Promise<number> {
    try {
      // Normalize path for FFprobe
      const normalizedPath = normalizePathForNative(videoPath);

      // Try FFprobe first if available
      if (FFprobeKit) {
        try {
          if (typeof FFprobeKit.getMediaInformation === 'function') {
            const mediaInfo = await FFprobeKit.getMediaInformation(normalizedPath);
            if (mediaInfo) {
              const duration = (mediaInfo.getDuration?.() || mediaInfo.duration || 0) / 1000;
              if (duration > 0) return duration;
            }
          } else if (typeof FFprobeKit.execute === 'function') {
            const probeCommand = `-v error -show_entries format=duration -of json "${normalizedPath}"`;
            const session = await FFprobeKit.execute(probeCommand);
            const returnCode = await session.getReturnCode();

            if (ReturnCode && ReturnCode.isSuccess(returnCode)) {
              const output = await session.getOutput();
              const jsonOutput = JSON.parse(output);
              const format = jsonOutput.format || {};
              const duration = parseFloat(format.duration || '0');
              if (duration > 0) return duration;
            }
          }
        } catch (ffprobeError) {
          logger.warn('FFprobe duration extraction failed', {
            component: 'VideoProcessingService',
            error: ffprobeError,
          });
        }
      }
    } catch (error) {
      logger.warn('Failed to get video duration from file', {
        component: 'VideoProcessingService',
        error,
      });
    }
    // Fallback: return 0 if we can't determine duration
    return 0;
  }

  /**
   * Returns video metadata (dimensions, duration, codec, etc.) for a local file.
   */
  static async getVideoInfo(
    videoPath: string,
    asset?: ImagePicker.ImagePickerAsset
  ): Promise<VideoInfo> {
    // Get local URI from MediaLibrary if we have assetId (for iCloud videos)
    const localUri = await this.getLocalVideoPath(videoPath, asset?.assetId);
    let fileSize = asset?.fileSize || 0;

    // Use fileSize from MediaLibrary if available
    if (!fileSize && asset?.assetId && Platform.OS === 'ios') {
      try {
        const assetInfo = await MediaLibrary.getAssetInfoAsync(asset.assetId, {
          shouldDownloadFromNetwork: true,
        });
        if (assetInfo.localUri) {
          const file = new File(assetInfo.localUri);
          fileSize = file.size || 0;
        }
      } catch (_mediaError) {
        // Ignore error, use provided fileSize
      }
    }

    // Verify file exists
    const file = await this.validateVideoFileExists(localUri);

    // Use fileSize from MediaLibrary/FileSystem if not from ImagePickerAsset
    const size = fileSize || file.size || 0;

    // Extract metadata from ImagePickerAsset if available
    let duration = asset?.duration
      ? asset.duration > 1000
        ? asset.duration / 1000
        : asset.duration
      : 10;
    let width = asset?.width || 1080;
    let height = asset?.height || 1920;
    let frameRate = 30;
    let codec = 'h264';

    // Extract codec from mimeType if available
    if (asset?.mimeType) {
      if (asset.mimeType.includes('h264') || asset.mimeType.includes('avc')) {
        codec = 'h264';
      } else if (asset.mimeType.includes('h265') || asset.mimeType.includes('hevc')) {
        codec = 'hevc';
      } else if (asset.mimeType.includes('vp9')) {
        codec = 'vp9';
      } else if (asset.mimeType.includes('vp8')) {
        codec = 'vp8';
      }
    }

    // Extract frame rate from EXIF if available
    if (asset?.exif) {
      const exifFrameRate = asset.exif['VideoFrameRate'] || asset.exif['FrameRate'];
      if (exifFrameRate) {
        frameRate =
          typeof exifFrameRate === 'number'
            ? exifFrameRate
            : parseFloat(String(exifFrameRate)) || 30;
      }
    }

    // Note: VideoManager only supports merge functionality, not getVideoInfo
    // We'll rely on asset info and fallback values for metadata

    // Determine quality standard based on resolution
    const qualityStandard = this.getQualityStandard(width, height);

    // Calculate aspect ratio
    const aspectRatio = this.calculateAspectRatio(width, height);

    // Estimate bitrate based on file size and duration
    const bitrate = size > 0 && duration > 0 ? (size * 8) / duration : 1000000; // bits per second

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
   * Standardizes a video path so the app can safely use it (adds file://, copies from Photos, etc.)
   */
  static async standardizeVideoPath(
    videoPath: string,
    asset?: ImagePicker.ImagePickerAsset
  ): Promise<string> {
    const resolved = await resolveVideoPath(
      videoPath,
      asset?.assetId || (asset as { assetId?: string; id?: string })?.id || null
    );
    if (!resolved.uri) {
      throw new Error('Failed to standardize video path');
    }
    return resolved.uri;
  }

  /**
   * Standardizes and normalizes a video path for in-app editing (trimmer, etc.)
   * - Resolves iCloud / Photos URIs into a local sandbox path
   * - Detects HDR / non-H.264 / out-of-range formats
   * - Re-encodes to SDR BT.709 H.264 when needed
   *
   * Returns a path that is safe to pass through the rest of the pipeline as SDR.
   */
  static async normalizeVideoPathForEditing(
    videoPath: string,
    assetId?: string | null
  ): Promise<string> {
    // First, standardize the path (handles iCloud downloads, sandbox copies, file:// prefix)
    const standardizedPath = await this.standardizeVideoPath(
      videoPath,
      assetId ? ({ assetId } as ImagePicker.ImagePickerAsset) : undefined
    );
    const localPath = normalizePathForNative(standardizedPath);

    // Analyze properties from the standardized file
    const props = await this.analyzeVideoProperties(localPath);

    const isHdr = !!props.isHdr;

    // If it's not HDR, keep the standardized path as-is (no extra transcode)
    if (!isHdr) {
      return standardizedPath;
    }

    // For HDR sources, normalize once into an SDR, BT.709, H.264 MP4 for the rest of the flow
    const targetWidth = props.width > 0 ? props.width : 1080;
    const targetHeight = props.height > 0 ? props.height : 1920;

    const tempDir = new Directory(Paths.cache, `video_edit_normalize_${Date.now()}`);
    tempDir.create({ intermediates: true, idempotent: true });
    const outputFile = new File(tempDir, `normalized_edit_${Date.now()}.mp4`);

    const normalizedPath = await this.normalizeVideoFormat(
      standardizedPath,
      outputFile.uri,
      targetWidth,
      targetHeight,
      MERGE_TARGET_FPS
    );

    return ensureFileUri(normalizedPath);
  }

  /**
   * Quick compatibility check to skip unnecessary normalization work
   */
  static async isVideoCompatible(
    videoPath: string,
    asset?: ImagePicker.ImagePickerAsset
  ): Promise<boolean> {
    try {
      const standardized = await this.standardizeVideoPath(videoPath, asset);
      const localPath = normalizePathForNative(standardized);
      const props = await this.analyzeVideoProperties(localPath, asset);

      const codec = (props.codec || '').toLowerCase();
      const codecOk = codec.includes('264') || codec.includes('avc');
      const frameRateOk = props.frameRate <= 60;
      const resolutionOk = Math.max(props.width, props.height) <= 1920;

      return codecOk && frameRateOk && resolutionOk;
    } catch (_error) {
      logger.warn('Failed to check video compatibility', { component: 'VideoProcessingService' });
      return false;
    }
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

  /**
   * Gets local video path from MediaLibrary if assetId is provided (for iCloud videos on iOS)
   * Falls back to provided videoPath if MediaLibrary lookup fails
   */
  private static async getLocalVideoPath(
    videoPath: string,
    assetId?: string | null
  ): Promise<string> {
    let localVideoPath = videoPath;

    if (assetId && Platform.OS === 'ios') {
      try {
        const assetInfo = await MediaLibrary.getAssetInfoAsync(assetId, {
          shouldDownloadFromNetwork: true,
        });
        if (assetInfo.localUri) {
          localVideoPath = assetInfo.localUri;
        }
      } catch (_mediaError) {
        logger.warn('Failed to get asset from MediaLibrary, using provided path', {
          component: 'VideoProcessingService',
        });
      }
    }

    return localVideoPath;
  }

  /**
   * Validates that a video file exists and returns the File object
   */
  private static async validateVideoFileExists(videoPath: string): Promise<File> {
    const file = new File(videoPath);
    if (!file.exists) {
      throw new Error('Video file does not exist');
    }
    return file;
  }

  /**
   * Helper to extract video path from ImagePickerAsset or ExpoCameraVideo
   */
  private static getVideoPath(video: ImagePicker.ImagePickerAsset | ExpoCameraVideo): string {
    if ('uri' in video) {
      return video.uri;
    }
    // Fallback (shouldn't happen)
    return '';
  }

  /**
   * Helper to extract video duration from ImagePickerAsset or ExpoCameraVideo
   */
  private static getVideoDuration(video: ImagePicker.ImagePickerAsset | ExpoCameraVideo): number {
    if ('uri' in video) {
      // Check if it's ImagePickerAsset (has duration property)
      if ('duration' in video && video.duration) {
        // ImagePickerAsset duration is in milliseconds
        return video.duration > 1000 ? video.duration / 1000 : video.duration;
      }
      // ExpoCameraVideo doesn't have duration, return 0 (will be calculated from video file)
      return 0;
    }
    return 0;
  }

  /**
   * Analyzes video properties using FFprobe with fallback to metadata extraction
   * Returns actual codec, resolution, frame rate, and other properties
   */
  private static async analyzeVideoProperties(
    videoPath: string,
    asset?: ImagePicker.ImagePickerAsset
  ): Promise<VideoProperties> {
    try {
      // Helper to determine if a stream is HDR based on common FFmpeg color fields
      const detectHdr = (colorPrimaries?: string, colorTransfer?: string): boolean => {
        const prim = (colorPrimaries || '').toLowerCase();
        const trans = (colorTransfer || '').toLowerCase();
        // Common HDR indicators:
        // - BT.2020 primaries
        // - PQ (SMPTE 2084) transfer
        // - HLG (ARIB STD-B67) transfer
        const isBt2020 = prim.includes('2020');
        const isPQ = trans.includes('2084') || trans.includes('pq');
        const isHLG = trans.includes('hlg') || trans.includes('arib-std-b67');
        return isBt2020 || isPQ || isHLG;
      };

      // Normalize path for FFprobe
      const normalizedPath = normalizePathForNative(videoPath);

      // Try FFprobe first if available
      if (FFprobeKit) {
        try {
          // Use FFprobe to get media information
          // Try getMediaInformation method (if available in the API)
          type MediaInfo = {
            getStreams?: () => unknown[];
            streams?: unknown[];
            getDuration?: () => number;
            duration?: number;
          };
          let mediaInfo: MediaInfo | null = null;

          if (typeof FFprobeKit.getMediaInformation === 'function') {
            // FFprobe operations are already async and run in background threads
            mediaInfo = await FFprobeKit.getMediaInformation(normalizedPath);
          } else if (typeof FFprobeKit.execute === 'function') {
            // Alternative: use FFprobe execute with JSON output
            const probeCommand = `-v error -select_streams v:0 -show_entries stream=width,height,codec_name,r_frame_rate,duration,color_space,color_transfer,color_primaries -show_entries format=duration -of json "${normalizedPath}"`;
            // FFprobe operations are already async and run in background threads
            const session = await FFprobeKit.execute(probeCommand);
            const returnCode = await session.getReturnCode();

            if (ReturnCode && ReturnCode.isSuccess(returnCode)) {
              const output = await session.getOutput();
              try {
                const jsonOutput = JSON.parse(output);
                if (jsonOutput.streams && jsonOutput.streams.length > 0) {
                  const stream = jsonOutput.streams[0];
                  const format = jsonOutput.format || {};

                  const width = stream.width || 0;
                  const height = stream.height || 0;
                  const codec = (stream.codec_name || 'h264').toLowerCase();
                  const rFrameRate = stream.r_frame_rate || '30/1';
                  const duration = parseFloat(format.duration || stream.duration || '0');
                  const colorSpace = stream.color_space || undefined;
                  const colorTransfer = stream.color_transfer || undefined;
                  const colorPrimaries = stream.color_primaries || undefined;

                  // Parse frame rate (format: "30/1" or "29.97")
                  let frameRate = 30;
                  if (rFrameRate.includes('/')) {
                    const [num, den] = rFrameRate.split('/').map(Number);
                    frameRate = den > 0 ? num / den : 30;
                  } else {
                    frameRate = parseFloat(rFrameRate) || 30;
                  }

                  return {
                    width,
                    height,
                    frameRate: Math.round(frameRate),
                    codec,
                    duration: duration || 0,
                    colorSpace,
                    colorTransfer,
                    colorPrimaries,
                    isHdr: detectHdr(colorPrimaries, colorTransfer),
                  };
                }
              } catch (_parseError) {
                // JSON parse failed, fall through to metadata extraction
              }
            }
          }

          // Try direct media info access if available
          if (mediaInfo) {
            const streams = mediaInfo.getStreams?.() || mediaInfo.streams || [];
            type StreamLike = {
              getCodecType?: () => string;
              codec_type?: string;
              getWidth?: () => number;
              width?: number;
              getHeight?: () => number;
              height?: number;
              getCodec?: () => string;
              codec?: string;
              getRealFrameRate?: () => string;
              r_frame_rate?: string;
              getColorSpace?: () => string;
              color_space?: string;
              getColorTransfer?: () => string;
              color_transfer?: string;
              getColorPrimaries?: () => string;
              color_primaries?: string;
            };
            const videoStream = streams.find(
              (s: unknown) =>
                (s as StreamLike).getCodecType?.() === 'video' ||
                (s as StreamLike).codec_type === 'video'
            ) as StreamLike | undefined;

            if (videoStream) {
              const width = videoStream.getWidth?.() || videoStream.width || 0;
              const height = videoStream.getHeight?.() || videoStream.height || 0;
              const codec = (videoStream.getCodec?.() || videoStream.codec || 'h264').toLowerCase();
              const rFrameRate =
                videoStream.getRealFrameRate?.() || videoStream.r_frame_rate || '30/1';
              const duration = (mediaInfo.getDuration?.() || mediaInfo.duration || 0) / 1000;
              const colorSpace =
                videoStream.getColorSpace?.() || videoStream.color_space || undefined;
              const colorTransfer =
                videoStream.getColorTransfer?.() || videoStream.color_transfer || undefined;
              const colorPrimaries =
                videoStream.getColorPrimaries?.() || videoStream.color_primaries || undefined;

              // Parse frame rate (format: "30/1" or "29.97")
              let frameRate = 30;
              if (rFrameRate.includes('/')) {
                const [num, den] = rFrameRate.split('/').map(Number);
                frameRate = den > 0 ? num / den : 30;
              } else {
                frameRate = parseFloat(rFrameRate) || 30;
              }

              return {
                width,
                height,
                frameRate: Math.round(frameRate),
                codec,
                duration: duration || 0,
                colorSpace,
                colorTransfer,
                colorPrimaries,
                isHdr: detectHdr(colorPrimaries, colorTransfer),
              };
            }
          }
        } catch (ffprobeError) {
          logger.warn('FFprobe analysis failed, falling back to metadata', {
            component: 'VideoProcessingService',
            error: ffprobeError,
          });
        }
      }

      // Fallback to existing metadata extraction
      const videoInfo = await this.getVideoInfo(videoPath, asset);
      return {
        width: videoInfo.width,
        height: videoInfo.height,
        frameRate: videoInfo.frameRate,
        codec: videoInfo.codec,
        duration: videoInfo.duration,
        bitrate: videoInfo.bitrate,
        isHdr: false,
      };
    } catch (error) {
      logger.error('Error analyzing video properties', error, {
        component: 'VideoProcessingService',
      });

      // Final fallback with defaults
      return {
        width: asset?.width || 1080,
        height: asset?.height || 1920,
        frameRate: 30,
        codec: 'h264',
        duration: asset?.duration
          ? asset.duration > 1000
            ? asset.duration / 1000
            : asset.duration
          : 10,
      };
    }
  }

  /**
   * Normalizes a video to target format (H.264, target resolution, ~30fps)
   * Prefers hardware-accelerated encoding (expo-image-and-video-compressor) for SDR sources;
   * HDR→SDR and hardware failures fall back to FFmpeg.
   */
  private static async normalizeVideoFormat(
    inputPath: string,
    outputPath: string,
    targetWidth: number,
    targetHeight: number,
    targetFrameRate: number = 30
  ): Promise<string> {
    try {
      const normalizedInput = normalizePathForNative(inputPath);
      const normalizedOutput = normalizePathForNative(outputPath);
      const inputProps = await this.analyzeVideoProperties(inputPath);

      const isMp4Container = normalizedInput.toLowerCase().endsWith('.mp4');
      const needsNormalization =
        !isMp4Container ||
        inputProps.codec !== 'h264' ||
        inputProps.width !== targetWidth ||
        inputProps.height !== targetHeight ||
        Math.abs(inputProps.frameRate - targetFrameRate) > 0.5;

      if (!needsNormalization) {
        const inputFile = new File(normalizedInput);
        const outputFile = new File(normalizedOutput);
        inputFile.copy(outputFile);
        return ensureFileUri(outputPath);
      }

      const isHdr = !!inputProps.isHdr;

      if (!isHdr) {
        try {
          const qualityKey = this.getQualityStandard(targetWidth, targetHeight);
          const standard =
            qualityKey === 'custom'
              ? VIDEO_QUALITY_STANDARDS['1080p']
              : VIDEO_QUALITY_STANDARDS[qualityKey];
          const compressedUri = await compressVideoHardware(ensureFileUri(normalizedInput), {
            maxSize: Math.max(targetWidth, targetHeight, 1),
            bitrate: standard.bitrate,
            codec: 'h264',
            speed: 'fast',
            minimumFileSizeForCompress: 0,
          });
          const compressedFile = new File(normalizePathForNative(compressedUri));
          const outputFile = new File(normalizedOutput);
          compressedFile.copy(outputFile);
          if (!outputFile.exists) {
            throw new Error('Hardware compression output missing after copy');
          }
          return ensureFileUri(normalizedOutput);
        } catch (hwError) {
          logger.warn('Hardware-accelerated video normalization failed, falling back to FFmpeg', {
            component: 'VideoProcessingService',
            error: hwError,
          });
        }
      }

      if (!FFmpegKit || !ReturnCode) {
        throw new Error('FFmpegKit is not available');
      }

      const scaleAndPadFilter =
        `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,` +
        `pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2`;

      const hdrTonemapFilter =
        'zscale=t=linear:npl=100,' +
        'format=gbrpf32le,' +
        'tonemap=tonemap=gamma:param=1.2:desat=0:peak=15,' +
        'zscale=primaries=bt709:transfer=bt709:matrix=bt709:range=limited,' +
        `${scaleAndPadFilter},` +
        'format=yuv420p';

      const videoFilter = isHdr ? hdrTonemapFilter : `${scaleAndPadFilter},format=yuv420p`;

      const ffmpegCommand =
        `-i "${normalizedInput}" ` +
        `-vf "${videoFilter}" ` +
        `-r ${targetFrameRate} -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 128k -movflags +faststart "${normalizedOutput}"`;

      const session = await FFmpegKit.execute(ffmpegCommand);
      const returnCode = await session.getReturnCode();
      if (ReturnCode.isCancel(returnCode)) throw new Error('FFmpeg operation cancelled');
      if (ReturnCode.isSuccess(returnCode)) {
        const outputFile = new File(normalizedOutput);
        if (!outputFile.exists) {
          throw new Error('Normalization completed but output file not found');
        }

        return ensureFileUri(normalizedOutput);
      } else {
        const failStackTrace = await session.getFailStackTrace();
        const output = await session.getOutput();
        logger.error('Video normalization failed', {
          component: 'VideoProcessingService',
          returnCode,
          failStackTrace,
          output,
        });
        throw new Error(
          `Video normalization failed: ${failStackTrace || output || 'Unknown error'}`
        );
      }
    } catch (error) {
      logger.error('Error normalizing video format', error, {
        component: 'VideoProcessingService',
      });
      throw error;
    }
  }

  /**
   * Normalizes a single video to standard format (MP4, H.264)
   * Handles all video types (camera, gallery, etc.) and ensures consistent format
   *
   * @param video - Video from ImagePickerAsset or ExpoCameraVideo
   * @returns Promise resolving to normalized video with standard format
   */
  static async normalizeVideo(
    video: ImagePicker.ImagePickerAsset | ExpoCameraVideo
  ): Promise<ProcessedVideo> {
    const videoPath = this.getVideoPath(video);

    // Handle iCloud videos on iOS
    const assetId = 'assetId' in video ? video.assetId : null;
    let localVideoPath = await this.getLocalVideoPath(videoPath, assetId);

    // Strip fragment identifier from path (iOS asset URIs may include #...)
    localVideoPath = stripPathFragment(localVideoPath);

    // Analyze video to determine target resolution
    const asset = 'assetId' in video ? (video as ImagePicker.ImagePickerAsset) : undefined;
    const videoProps = await this.analyzeVideoProperties(localVideoPath, asset);
    const targetWidth = videoProps.width > 0 ? videoProps.width : 1080;
    const targetHeight = videoProps.height > 0 ? videoProps.height : 1920;

    const tempDir = new Directory(Paths.cache, `video_normalize_${Date.now()}`);
    tempDir.create({ intermediates: true, idempotent: true });
    const outputFile = new File(tempDir, `normalized_${Date.now()}.mp4`);

    const normalizedPath = await this.normalizeVideoFormat(
      localVideoPath,
      outputFile.uri,
      targetWidth,
      targetHeight,
      MERGE_TARGET_FPS
    );

    const finalPath = ensureFileUri(normalizedPath);

    // Verify normalized file exists
    const normalizedFile = new File(normalizePathForNative(finalPath));
    if (!normalizedFile.exists) {
      throw new Error('Normalized video file was not created');
    }

    return {
      path: finalPath,
      duration: this.getVideoDuration(video),
      width: targetWidth,
      height: targetHeight,
    };
  }

  /**
   * Merges multiple video segments into a single video file
   * Uses FFmpeg complex filter for clean merging without audio/video sync glitches
   * from mixing different clip formats (camera vs uploaded, variable vs fixed frame rates)
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
    throw new Error(
      'Fast merge failed or is unavailable. Install and link react-native-fast-video-merge.'
    );
  }

  /**
   * Keeps single-segment posts on the native camera/gallery output path.
   * This avoids unnecessary client-side transcode work before posting.
   */
  private static async prepareSingleSegment(segment: VideoSegment): Promise<ProcessedVideo> {
    const originalVideoPath = this.getVideoPath(segment.video);
    const assetId = 'assetId' in segment.video ? segment.video.assetId : null;
    const localPath = await this.getLocalVideoPath(originalVideoPath, assetId);
    const outputPath = ensureFileUri(stripPathFragment(localPath));
    const outputFile = new File(normalizePathForNative(outputPath));

    if (!outputFile.exists) {
      throw new Error('Single segment video file does not exist');
    }

    const fallbackDuration = this.getVideoDuration(segment.video);
    const duration = segment.duration > 0 ? segment.duration : fallbackDuration;
    return {
      path: outputPath,
      duration: duration > 0 ? duration : 0,
      width: 1080,
      height: 1920,
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
        const originalVideoPath = this.getVideoPath(segment.video);
        const assetId = 'assetId' in segment.video ? segment.video.assetId : null;
        const localPath = await this.getLocalVideoPath(originalVideoPath, assetId);
        const normalizedPath = normalizePathForNative(stripPathFragment(localPath));
        segmentPaths.push(normalizedPath);
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

      const totalDuration = segments.reduce((sum, segment) => sum + segment.duration, 0);
      logger.info('Merged segments with fast merge SDK', {
        component: 'VideoProcessingService',
        segmentCount: segments.length,
        outputPath,
      });
      return {
        path: outputPath,
        duration: totalDuration,
        width: 1080,
        height: 1920,
      };
    } catch (error) {
      logger.warn('Fast merge SDK failed', {
        component: 'VideoProcessingService',
        error,
      });
      return null;
    }
  }

  /**
   * Validates video file using MediaLibrary or FileSystem
   */
  static async validateVideoFile(videoPath: string, assetId?: string | null): Promise<boolean> {
    try {
      const localVideoPath = await this.getLocalVideoPath(videoPath, assetId);
      const file = new File(localVideoPath);
      return file.exists;
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
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

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
      let localVideoPath: string;
      if (videoPath.includes('video_sandbox') || videoPath.includes('Library/Caches')) {
        localVideoPath = videoPath;
      } else {
        localVideoPath = await this.getLocalVideoPath(videoPath, assetId);
      }
      const videoUri = ensureFileUri(localVideoPath);

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
        let localVideoPath: string;
        if (videoPath.includes('video_sandbox') || videoPath.includes('Library/Caches')) {
          localVideoPath = videoPath;
        } else {
          localVideoPath = await VideoProcessingService.getLocalVideoPath(videoPath, assetId);
        }
        const videoUri = ensureFileUri(localVideoPath);

        const timeMs = Math.max(0, Math.round((durationSeconds - 0.001) * 1000));

        const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, {
          time: timeMs,
          quality: 0.5,
        });
        return uri;
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
