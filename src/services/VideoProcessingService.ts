import { Platform, InteractionManager } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { File, Directory, Paths } from 'expo-file-system';
import { Video as VideoCompressor } from 'react-native-compressor';
import { resolveVideoPath } from '../utils/videoPath';
import { logger } from '../utils/logger';

// Expo Camera video result type
type ExpoCameraVideo = { uri: string };

// Lazy import FFmpegKit to avoid errors when native module isn't linked yet
let FFmpegKit: any = null;
let ReturnCode: any = null;
let FFprobeKit: any = null;
try {
  const ffmpegModule = require('ffmpeg-kit-react-native');
  FFmpegKit = ffmpegModule.FFmpegKit;
  ReturnCode = ffmpegModule.ReturnCode;
  // FFprobeKit may not be available in all versions, so it's optional
  FFprobeKit = ffmpegModule.FFprobeKit || null;
} catch (error) {
  logger.warn('FFmpegKit not available - native module not linked', { component: 'VideoProcessingService' });
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

// Compression quality levels for variable compression
const COMPRESSION_LEVELS = [
  { name: 'high', bitrate: 2000000, label: 'High Quality' },    // 2 Mbps
  { name: 'medium', bitrate: 1000000, label: 'Medium Quality' },  // 1 Mbps
  { name: 'low', bitrate: 500000, label: 'Low Quality' },      // 0.5 Mbps
  { name: 'minimal', bitrate: 250000, label: 'Minimal Quality' },  // 0.25 Mbps
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB in bytes

// Video merge settings for complex filter approach
// These values provide a good balance between quality and compatibility
const MERGE_TARGET_FPS = 30; // Standard frame rate for mobile video
const MERGE_TARGET_AUDIO_SAMPLE_RATE = 44100; // CD-quality audio (44.1kHz)
const MERGE_TARGET_AUDIO_CHANNELS = 'stereo'; // Stereo audio output

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

export interface CompressionResult {
  originalInfo: VideoInfo;
  compressedInfo: VideoInfo;
  compressionRatio: number;
  sizeReduction: string;
  qualityLevel: string;
  estimatedUploadTime: string;
}

class VideoProcessingService {
  /**
   * Gets comprehensive video information
   */
  static async getVideoInfo(
    videoPath: string, 
    asset?: ImagePicker.ImagePickerAsset
  ): Promise<VideoInfo> {
    try {
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
        } catch (mediaError) {
          // Ignore error, use provided fileSize
        }
      }
      
      // Verify file exists
      const file = await this.validateVideoFileExists(localUri);

      // Use fileSize from MediaLibrary/FileSystem if not from ImagePickerAsset
      const size = fileSize || file.size || 0;
      
      // Extract metadata from ImagePickerAsset if available
      let duration = asset?.duration ? (asset.duration > 1000 ? asset.duration / 1000 : asset.duration) : 10;
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
          frameRate = typeof exifFrameRate === 'number' ? exifFrameRate : parseFloat(String(exifFrameRate)) || 30;
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
    } catch (error) {
      throw error;
    }
  }

  /**
   * Standardizes a video path so the app can safely use it (adds file://, copies from Photos, etc.)
   */
  static async standardizeVideoPath(
    videoPath: string,
    asset?: ImagePicker.ImagePickerAsset
  ): Promise<string> {
    const assetId = asset?.assetId || (asset as any)?.id || null;
    const resolved = await resolveVideoPath(videoPath, assetId);
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
    const standardizedPath = await this.standardizeVideoPath(videoPath);
    const localPath = standardizedPath.replace('file://', '');

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
    tempDir.create({ intermediates: true });
    const outputFile = new File(tempDir, `normalized_edit_${Date.now()}.mp4`);

    const normalizedPath = await this.normalizeVideoFormat(
      standardizedPath,
      outputFile.uri,
      targetWidth,
      targetHeight,
      MERGE_TARGET_FPS
    );

    return this.ensureFileProtocol(normalizedPath);
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
      const localPath = standardized.replace('file://', '');
      const props = await this.analyzeVideoProperties(localPath, asset);

      const codec = (props.codec || '').toLowerCase();
      const codecOk = codec.includes('264') || codec.includes('avc');
      const frameRateOk = props.frameRate <= 60;
      const resolutionOk = Math.max(props.width, props.height) <= 1920;

      return codecOk && frameRateOk && resolutionOk;
    } catch (error) {
      logger.warn('Failed to check video compatibility', { component: 'VideoProcessingService' });
      return false;
    }
  }

  /**
   * Determines quality standard based on resolution
   * Uses the shorter dimension to properly classify quality for different aspect ratios
   */
  private static getQualityStandard(width: number, height: number): keyof typeof VIDEO_QUALITY_STANDARDS | 'custom' {
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
      { ratio: 16/9, name: '16:9', tolerance: 0.1 },
      { ratio: 9/16, name: '9:16', tolerance: 0.1 },
      { ratio: 4/3, name: '4:3', tolerance: 0.1 },
      { ratio: 3/4, name: '3:4', tolerance: 0.1 },
      { ratio: 1/1, name: '1:1', tolerance: 0.05 },
      { ratio: 21/9, name: '21:9', tolerance: 0.1 },
      { ratio: 18/9, name: '2:1', tolerance: 0.1 },
      { ratio: 3/2, name: '3:2', tolerance: 0.1 },
      { ratio: 5/4, name: '5:4', tolerance: 0.1 },
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
   * Estimates upload time based on file size and network speed
   */
  private static estimateUploadTime(fileSizeBytes: number, networkSpeedMbps: number = 10): string {
    const fileSizeMbps = (fileSizeBytes * 8) / 1000000; // Convert to megabits
    const uploadTimeSeconds = fileSizeMbps / networkSpeedMbps;
    
    if (uploadTimeSeconds < 60) {
      return `${Math.ceil(uploadTimeSeconds)} seconds`;
    } else if (uploadTimeSeconds < 3600) {
      const minutes = Math.ceil(uploadTimeSeconds / 60);
      return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    } else {
      const hours = Math.ceil(uploadTimeSeconds / 3600);
      return `${hours} hour${hours > 1 ? 's' : ''}`;
    }
  }

  /**
   * Gets detailed compression information for a video
   */
  static async getCompressionInfo(
    videoPath: string, 
    asset?: ImagePicker.ImagePickerAsset
  ): Promise<{
    originalInfo: VideoInfo;
    compressionOptions: Array<{
      level: string;
      label: string;
      estimatedSize: string;
      quality: string;
      uploadTime: string;
    }>;
    recommendedLevel: string;
  }> {
    const originalInfo = await this.getVideoInfo(videoPath, asset);
    
    const compressionOptions = COMPRESSION_LEVELS.map(level => {
      const estimatedSize = this.estimateFileSize(originalInfo.duration, originalInfo.width, originalInfo.height, level.bitrate);
      const uploadTime = this.estimateUploadTime(estimatedSize);
      
      return {
        level: level.name,
        label: level.label,
        estimatedSize: this.formatFileSize(estimatedSize),
        quality: `${Math.round((level.bitrate / 2000000) * 100)}%`, // Estimate quality based on bitrate
        uploadTime,
      };
    });

    // Determine recommended level based on file size
    const recommendedLevel = originalInfo.size <= MAX_FILE_SIZE ? 'original' : 
      originalInfo.size <= 25 * 1024 * 1024 ? 'high' :
      originalInfo.size <= 40 * 1024 * 1024 ? 'medium' : 'low';

    return {
      originalInfo,
      compressionOptions,
      recommendedLevel,
    };
  }

  /**
   * Estimates file size based on video properties and compression settings
   */
  private static estimateFileSize(
    duration: number,
    width: number,
    height: number,
    bitrate: number
  ): number {
    // Estimate file size: (bitrate * duration) / 8 (bits to bytes)
    const estimatedSize = (bitrate * duration) / 8;
    
    // Add 10% overhead for container format and metadata
    return estimatedSize * 1.1;
  }

  /**
   * Gets video file size in bytes using MediaLibrary or FileSystem
   */
  private static async getFileSize(filePath: string, assetId?: string | null): Promise<number> {
    try {
      // Try MediaLibrary first if we have assetId (for iCloud videos)
      if (assetId && Platform.OS === 'ios') {
        try {
          const assetInfo = await MediaLibrary.getAssetInfoAsync(assetId, {
            shouldDownloadFromNetwork: true,
          });
          if (assetInfo.localUri) {
            const file = new File(assetInfo.localUri);
            return file.size || 0;
          }
        } catch (mediaError) {
          // Fall through to FileSystem
        }
      }
      
      const file = new File(filePath);
      if (!file.exists) {
        return 0;
      }
      return file.size || 0;
    } catch (error) {
      logger.warn('Could not get file size', { component: 'VideoProcessingService' });
      return 0;
    }
  }

  /**
   * Compresses video automatically using WhatsApp-like compression (react-native-compressor auto mode)
   * This uses the same compression algorithm as WhatsApp for optimal quality/size balance
   */
  static async compressVideoAuto(
    videoPath: string,
    assetId?: string | null,
    onProgress?: (progress: number) => void
  ): Promise<ProcessedVideo> {
    try {
      // Get local URI from MediaLibrary if we have assetId (for iCloud videos)
      const localVideoPath = await this.getLocalVideoPath(videoPath, assetId);
      
      // Validate file exists
      await this.validateVideoFileExists(localVideoPath);

      // Activate background task for compression (allows compression when app is in background)
      await VideoCompressor.activateBackgroundTask();

      try {
        // Use automatic compression (WhatsApp-like) with progress callback
        const compressedPath = await VideoCompressor.compress(
          localVideoPath,
          {
            compressionMethod: 'auto', // WhatsApp-like automatic compression
          },
          onProgress || (() => {}) // Progress callback
        );

        // Get video info from compressed file
        const compressedFile = new File(compressedPath);
        if (!compressedFile.exists) {
          throw new Error('Compressed video file was not created');
        }

        // Get video metadata from original to preserve dimensions
        const originalInfo = await this.getVideoInfo(localVideoPath);
        
        // Ensure file:// prefix for local file
        const finalPath = this.ensureFileProtocol(compressedPath);
        
        return {
          path: finalPath,
          duration: originalInfo.duration,
          width: originalInfo.width,
          height: originalInfo.height,
        };
      } finally {
        // Deactivate background task after compression
        await VideoCompressor.deactivateBackgroundTask();
      }
    } catch (error) {
      logger.error('Error in automatic video compression', error, { component: 'VideoProcessingService' });
      throw error;
    }
  }

  /**
   * Compresses video with variable quality to meet file size requirements (manual mode)
   * Falls back to automatic compression if manual compression fails
   */
  static async compressVideoWithSizeLimit(
    videoPath: string,
    maxSizeBytes: number = MAX_FILE_SIZE,
    assetId?: string | null
  ): Promise<ProcessedVideo> {
    try {
      // Get local URI from MediaLibrary if we have assetId (for iCloud videos)
      const localVideoPath = await this.getLocalVideoPath(videoPath, assetId);
      
      // Validate file exists and get size
      const file = await this.validateVideoFileExists(localVideoPath);
      const originalSize = file.size || 0;

      // If original is already under limit, return as-is
      if (originalSize <= maxSizeBytes) {
        return {
          path: localVideoPath,
          duration: 10, // Default duration
          width: 1080,
          height: 1920,
        };
      }

      // Try automatic compression first (WhatsApp-like)
      try {
        const autoCompressed = await this.compressVideoAuto(localVideoPath, assetId);
        const compressedFile = new File(autoCompressed.path.replace('file://', ''));
        const compressedSize = compressedFile.exists ? (compressedFile.size || 0) : 0;
        
        if (compressedSize <= maxSizeBytes) {
          return autoCompressed;
        }
        
        // If auto compression still exceeds limit, try manual compression
        logger.info('Auto compression exceeded size limit, trying manual compression', {
          component: 'VideoProcessingService',
          compressedSize,
          maxSizeBytes,
        });
      } catch (autoError) {
        logger.warn('Automatic compression failed, falling back to manual', {
          component: 'VideoProcessingService',
          error: autoError,
        });
      }

      // Create temp directory for processing
      const tempDir = new Directory(Paths.cache, `video_compress_${Date.now()}`);
      tempDir.create({ intermediates: true });

      // Try compression levels progressively
      for (const level of COMPRESSION_LEVELS) {
        
        const outputFile = new File(tempDir, `compressed_${level.name}.mp4`);
        
        try {
          // Compress with current level using manual mode
          const compressedPath = await VideoCompressor.compress(localVideoPath, {
            compressionMethod: 'manual',
            bitrate: level.bitrate,
          });

          // Copy to our output path
          new File(compressedPath).copy(outputFile);

          // Check file size
          const compressedSize = await this.getFileSize(outputFile.uri);

          if (compressedSize <= maxSizeBytes) {
            
            // Clean up temp directory
            this.cleanupTempFiles(tempDir);
            
            // Ensure file:// prefix for local file
            const finalPath = this.ensureFileProtocol(outputFile.uri);
            return {
              path: finalPath,
              duration: 10, // Default duration
              width: 1080,
              height: 1920,
            };
          }
        } catch (error) {
          logger.warn(`Compression level ${level.name} failed`, { component: 'VideoProcessingService' });
          continue;
        }
      }

      // If all compression levels still exceed size limit, use the most compressed version
      const minimalFile = new File(tempDir, 'compressed_minimal.mp4');
      
      try {
        const compressedPath = await VideoCompressor.compress(localVideoPath, {
          compressionMethod: 'manual',
          bitrate: COMPRESSION_LEVELS[3].bitrate,
        });

        new File(compressedPath).copy(minimalFile);

        const finalSize = await this.getFileSize(minimalFile.uri);

        // Clean up temp directory
        this.cleanupTempFiles(tempDir);
        
        const finalPath = this.ensureFileProtocol(minimalFile.uri);
        return {
          path: finalPath,
          duration: 10,
          width: 1080,
          height: 1920,
        };
      } catch (error) {
        logger.error('Minimal compression also failed', error, { component: 'VideoProcessingService' });
        throw new Error('Video compression failed');
      }

    } catch (error) {
      logger.error('Error in variable compression', error, { component: 'VideoProcessingService' });
      throw error;
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
      } catch (mediaError) {
        logger.warn('Failed to get asset from MediaLibrary, using provided path', { 
          component: 'VideoProcessingService' 
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
   * Ensures file path has file:// prefix
   */
  private static ensureFileProtocol(path: string): string {
    return path.startsWith('file://') ? path : `file://${path}`;
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
   * Strips fragment identifiers (#...) from file paths
   * iOS asset URIs may include fragment identifiers that need to be removed
   */
  private static stripFragment(path: string): string {
    const fragmentIndex = path.indexOf('#');
    return fragmentIndex >= 0 ? path.substring(0, fragmentIndex) : path;
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
   * Helper to extract video width from ImagePickerAsset or ExpoCameraVideo
   */
  private static getVideoWidth(video: ImagePicker.ImagePickerAsset | ExpoCameraVideo): number {
    if ('uri' in video) {
      // Check if it's ImagePickerAsset (has width property)
      if ('width' in video) {
        return video.width || 0;
      }
      // ExpoCameraVideo doesn't have width, return 0 (will be calculated from video file)
      return 0;
    }
    return 0;
  }

  /**
   * Helper to extract video height from ImagePickerAsset or ExpoCameraVideo
   */
  private static getVideoHeight(video: ImagePicker.ImagePickerAsset | ExpoCameraVideo): number {
    if ('uri' in video) {
      // Check if it's ImagePickerAsset (has height property)
      if ('height' in video) {
        return video.height || 0;
      }
      // ExpoCameraVideo doesn't have height, return 0 (will be calculated from video file)
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
      let normalizedPath = videoPath.replace('file://', '');
      if (Platform.OS === 'ios' && !normalizedPath.startsWith('/')) {
        normalizedPath = '/' + normalizedPath;
      }

      // Try FFprobe first if available
      if (FFprobeKit) {
        try {
          // Use FFprobe to get media information
          // Try getMediaInformation method (if available in the API)
          let mediaInfo: any = null;
          
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
              } catch (parseError) {
                // JSON parse failed, fall through to metadata extraction
              }
            }
          }
          
          // Try direct media info access if available
          if (mediaInfo) {
            const streams = mediaInfo.getStreams?.() || mediaInfo.streams || [];
            const videoStream = streams.find((s: any) => 
              (s.getCodecType?.() === 'video') || (s.codec_type === 'video')
            );
            
            if (videoStream) {
              const width = videoStream.getWidth?.() || videoStream.width || 0;
              const height = videoStream.getHeight?.() || videoStream.height || 0;
              const codec = (videoStream.getCodec?.() || videoStream.codec || 'h264').toLowerCase();
              const rFrameRate = videoStream.getRealFrameRate?.() || videoStream.r_frame_rate || '30/1';
              const duration = (mediaInfo.getDuration?.() || mediaInfo.duration || 0) / 1000;
              const colorSpace =
                videoStream.getColorSpace?.() ||
                videoStream.color_space ||
                undefined;
              const colorTransfer =
                videoStream.getColorTransfer?.() ||
                videoStream.color_transfer ||
                undefined;
              const colorPrimaries =
                videoStream.getColorPrimaries?.() ||
                videoStream.color_primaries ||
                undefined;
              
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
            error: ffprobeError 
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
      logger.error('Error analyzing video properties', error, { component: 'VideoProcessingService' });
      
      // Final fallback with defaults
      return {
        width: asset?.width || 1080,
        height: asset?.height || 1920,
        frameRate: 30,
        codec: 'h264',
        duration: asset?.duration ? (asset.duration > 1000 ? asset.duration / 1000 : asset.duration) : 10,
      };
    }
  }

  /**
   * Normalizes a video to target format (H.264, target resolution, 30fps)
   * Re-encodes the video if it doesn't match the target format
   */
  private static async normalizeVideoFormat(
    inputPath: string,
    outputPath: string,
    targetWidth: number,
    targetHeight: number,
    targetFrameRate: number = 30
  ): Promise<string> {
    try {
      if (!FFmpegKit || !ReturnCode) {
        throw new Error('FFmpegKit is not available');
      }

      // Normalize paths
      let normalizedInput = inputPath.replace('file://', '');
      let normalizedOutput = outputPath.replace('file://', '');
      
      if (Platform.OS === 'ios') {
        if (!normalizedInput.startsWith('/')) normalizedInput = '/' + normalizedInput;
        if (!normalizedOutput.startsWith('/')) normalizedOutput = '/' + normalizedOutput;
      }

      // Analyze input video properties (including HDR metadata where available)
      const inputProps = await this.analyzeVideoProperties(inputPath);
      
      // Check if normalization is needed (skip if already matches target format)
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
        return outputPath;
      }

      // Calculate bitrate based on resolution (use quality standard)
      const qualityStandard = this.getQualityStandard(targetWidth, targetHeight);
      const targetBitrate = VIDEO_QUALITY_STANDARDS[qualityStandard]?.bitrate || 4000000;

      // Build FFmpeg filter chain
      // Always scale/pad to target dimensions; when the source appears to be HDR,
      // apply a safe HDR→SDR tonemap first so Bluesky gets a standard BT.709 SDR stream.
      const scaleAndPadFilter =
        `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,` +
        `pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2`;

      const isHdr = !!inputProps.isHdr;

      // Mild, well-tested HDR→SDR mapping: linearize, tonemap, then convert to BT.709 and 4:2:0
      // This is intentionally simpler than the very long custom chain to keep it robust on mobile.
      const hdrTonemapFilter =
        'zscale=t=linear:npl=100,' +
        'format=gbrpf32le,' +
        'tonemap=tonemap=gamma:param=1.2:desat=0:peak=15,' +
        'zscale=primaries=bt709:transfer=bt709:matrix=bt709:range=limited,' +
        `${scaleAndPadFilter},` +
        'format=yuv420p';

      const videoFilter = isHdr
        ? hdrTonemapFilter
        : `${scaleAndPadFilter},format=yuv420p`;

      // Build FFmpeg command for normalization (audio stays standard AAC)
      const ffmpegCommand =
        `-i "${normalizedInput}" ` +
        `-vf "${videoFilter}" ` +
        `-r ${targetFrameRate} -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 128k -movflags +faststart "${normalizedOutput}"`;

      // FFmpeg operations are already async and run in background threads
      // No need for InteractionManager wrapper - FFmpegKit handles threading internally
      const session = await FFmpegKit.execute(ffmpegCommand);
      const returnCode = await session.getReturnCode();

      if (ReturnCode.isSuccess(returnCode)) {
        // Verify output file exists
        const outputFile = new File(normalizedOutput);
        if (!outputFile.exists) {
          throw new Error('Normalization completed but output file not found');
        }

        return this.ensureFileProtocol(normalizedOutput);
      } else {
        const failStackTrace = await session.getFailStackTrace();
        const output = await session.getOutput();
        logger.error('Video normalization failed', {
          component: 'VideoProcessingService',
          returnCode,
          failStackTrace,
          output,
        });
        throw new Error(`Video normalization failed: ${failStackTrace || output || 'Unknown error'}`);
      }
    } catch (error) {
      logger.error('Error normalizing video format', error, { component: 'VideoProcessingService' });
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
    localVideoPath = VideoProcessingService.stripFragment(localVideoPath);
    
    // Analyze video to determine target resolution
    const asset = 'assetId' in video ? video as ImagePicker.ImagePickerAsset : undefined;
    const videoProps = await this.analyzeVideoProperties(localVideoPath, asset);
    const targetWidth = videoProps.width > 0 ? videoProps.width : 1080;
    const targetHeight = videoProps.height > 0 ? videoProps.height : 1920;
    
    // Normalize video to MP4 container with H.264 codec for compatibility
    const tempDir = new Directory(Paths.cache, `video_normalize_${Date.now()}`);
    tempDir.create({ intermediates: true });
    const outputFile = new File(tempDir, `normalized_${Date.now()}.mp4`);
    
    const normalizedPath = await this.normalizeVideoFormat(
      localVideoPath,
      outputFile.uri,
      targetWidth,
      targetHeight,
      MERGE_TARGET_FPS
    );
    
    const finalPath = this.ensureFileProtocol(normalizedPath);
    
    // Verify normalized file exists
    const normalizedFile = new File(finalPath.replace('file://', ''));
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
      // For single segment, use normalizeVideo
      return await this.normalizeVideo(segments[0].video);
    }

    try {
      // Create temporary directory for processing
      const tempDir = new Directory(Paths.cache, `video_merge_${Date.now()}`);
      tempDir.create({ intermediates: true });

      // Calculate total duration
      let totalDuration = 0;
      for (const segment of segments) {
        totalDuration += segment.duration;
      }

      // Generate output path
      const outputFile = new File(tempDir, `merged_video_${Date.now()}.mp4`);

      // Use complex filter approach for merging (prevents glitches from mixing different clip types)
      const mergedVideoPath = await this.mergeSegmentsComplex(segments, outputFile.uri);

      // Verify merged file exists (use mergedVideoPath with file:// prefix)
      const mergedFile = new File(mergedVideoPath);
      if (!mergedFile.exists) {
        throw new Error('Merged video file was not created');
      }

      // Analyze merged video to get actual dimensions
      let mergedWidth = this.getVideoWidth(segments[0].video);
      let mergedHeight = this.getVideoHeight(segments[0].video);
      
      try {
        // Try to get actual properties from merged video
        const mergedProps = await this.analyzeVideoProperties(mergedVideoPath);
        mergedWidth = mergedProps.width;
        mergedHeight = mergedProps.height;
      } catch (error) {
        // Fallback to finding highest resolution from segments
        for (const segment of segments) {
          const width = this.getVideoWidth(segment.video);
          const height = this.getVideoHeight(segment.video);
          if (width * height > mergedWidth * mergedHeight) {
            mergedWidth = width;
            mergedHeight = height;
          }
        }
      }

      // Ensure file:// prefix for local file
      const mergedPath = this.ensureFileProtocol(mergedVideoPath);
      return {
        path: mergedPath,
        duration: totalDuration,
        width: mergedWidth,
        height: mergedHeight,
      };

    } catch (error) {
      logger.error('Error merging video segments', error, { component: 'VideoProcessingService' });
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to merge video segments: ${errorMessage}`);
    }
  }

  /**
   * Merges multiple video segments using FFmpeg complex filter approach
   * This method uses a single-pass filter graph to scale, normalize, and concatenate
   * videos in one operation, avoiding glitches from mixing different clip types
   * 
   * @param segments - Array of video segments to merge
   * @param outputPath - Path where the merged video will be saved
   * @returns Promise resolving to the output path
   */
  private static async mergeSegmentsComplex(
    segments: VideoSegment[],
    outputPath: string
  ): Promise<string> {
    try {
      if (segments.length === 0) {
        throw new Error('No segments to merge');
      }

      if (segments.length === 1) {
        // Single segment - return path as-is
        const videoPath = this.getVideoPath(segments[0].video);
        return videoPath;
      }

      if (!FFmpegKit || !ReturnCode) {
        throw new Error('FFmpegKit is not available');
      }

      // Analyze all videos to determine target format
      logger.info('Analyzing videos for complex filter merge', {
        component: 'VideoProcessingService',
        segmentCount: segments.length,
      });

      // Determine target resolution from all segments
      let targetWidth = 0;
      let targetHeight = 0;

      for (const segment of segments) {
        const width = this.getVideoWidth(segment.video);
        const height = this.getVideoHeight(segment.video);
        const totalPixels = width * height;
        const currentTotalPixels = targetWidth * targetHeight;
        if (totalPixels > currentTotalPixels) {
          targetWidth = width;
          targetHeight = height;
        }
      }

      // Fallback to standard 9:16 aspect ratio if no valid resolution found
      if (targetWidth === 0 || targetHeight === 0) {
        targetWidth = 1080;
        targetHeight = 1920;
      }

      logger.info('Target format for complex filter merge', {
        component: 'VideoProcessingService',
        resolution: `${targetWidth}x${targetHeight}`,
      });

      // Normalize paths
      let normalizedOutput = outputPath.replace('file://', '');
      if (Platform.OS === 'ios' && !normalizedOutput.startsWith('/')) {
        normalizedOutput = '/' + normalizedOutput;
      }

      // Build FFmpeg complex filter command
      let inputCmd = '';
      let filterGraph = '';
      const videoLabels: string[] = [];
      const audioLabels: string[] = [];

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const originalVideoPath = this.getVideoPath(segment.video);

        // Handle iCloud videos on iOS
        const assetId = 'assetId' in segment.video ? segment.video.assetId : null;
        const videoPath = await this.getLocalVideoPath(originalVideoPath, assetId);

        // Normalize path for FFmpeg
        // Remove fragment identifier (#...) that iOS gallery URIs may contain
        let normalizedPath = VideoProcessingService.stripFragment(videoPath.replace('file://', ''));
        if (Platform.OS === 'ios' && !normalizedPath.startsWith('/')) {
          normalizedPath = '/' + normalizedPath;
        }

        // Add input to command
        inputCmd += `-i "${normalizedPath}" `;

        // Build filter chain for this input
        // Scale to fit target box with aspect ratio maintained, pad with black bars
        // setsar=1 ensures square pixel aspect ratio (SAR)
        // fps filter normalizes frame rate for consistent playback
        const videoFilter = `[${i}:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${MERGE_TARGET_FPS}[v${i}]`;
        filterGraph += videoFilter + ';';
        videoLabels.push(`[v${i}]`);

        // Force audio resampling to common format to prevent audio glitches
        // This standardizes sample rate and channel layout across all inputs
        const audioFilter = `[${i}:a]aformat=sample_rates=${MERGE_TARGET_AUDIO_SAMPLE_RATE}:channel_layouts=${MERGE_TARGET_AUDIO_CHANNELS}[a${i}]`;
        filterGraph += audioFilter + ';';
        audioLabels.push(`[a${i}]`);
      }

      // Add concat filter to merge all normalized streams
      // n=number of segments, v=1 video stream, a=1 audio stream
      // IMPORTANT: concat filter expects inputs interleaved: [v0][a0][v1][a1]...
      // NOT grouped: [v0][v1][a0][a1]
      // Each filter chain must be separated by semicolons
      // Remove trailing semicolon from filterGraph, then add semicolon before concat inputs
      filterGraph = filterGraph.replace(/;$/, '');
      const concatInputs = videoLabels.map((vLabel, idx) => vLabel + audioLabels[idx]).join('');
      // Add semicolon to separate previous filter chains from concat filter chain
      filterGraph += `;${concatInputs}concat=n=${segments.length}:v=1:a=1[outv][outa]`;

      // Build final FFmpeg command
      // -preset ultrafast for quick processing (can use 'medium' for better quality/size)
      // -c:v libx264: H.264 video codec
      // -c:a aac: AAC audio codec
      // -movflags +faststart: optimize for streaming/progressive download
      const cmd = `${inputCmd}-filter_complex "${filterGraph}" -map "[outv]" -map "[outa]" -c:v libx264 -preset ultrafast -crf 23 -c:a aac -b:a 128k -movflags +faststart "${normalizedOutput}"`;

      logger.info('Executing complex filter merge', {
        component: 'VideoProcessingService',
        segmentCount: segments.length,
        targetResolution: `${targetWidth}x${targetHeight}`,
        filterGraph: filterGraph.substring(0, 500), // Log first 500 chars of filter graph
        videoLabels: videoLabels.join(','),
        audioLabels: audioLabels.join(','),
      });

      // FFmpeg operations are already async and run in background threads
      // No need for InteractionManager wrapper - FFmpegKit handles threading internally
      const session = await FFmpegKit.execute(cmd);
      const returnCode = await session.getReturnCode();

      if (ReturnCode.isSuccess(returnCode)) {
        // Verify output file exists (use original outputPath URI, not normalized path)
        const outputFile = new File(outputPath);
        if (!outputFile.exists) {
          throw new Error('Complex filter merge completed but output file not found');
        }

        logger.info('Complex filter merge completed successfully', { 
          component: 'VideoProcessingService' 
        });

        return this.ensureFileProtocol(normalizedOutput);
      } else {
        const failStackTrace = await session.getFailStackTrace();
        const output = await session.getOutput();
        logger.error('Complex filter merge failed', {
          component: 'VideoProcessingService',
          returnCode,
          failStackTrace,
          output,
        });
        throw new Error(`Complex filter merge failed: ${failStackTrace || output || 'Unknown error'}`);
      }
    } catch (error) {
      logger.error('Error in complex filter merge', error, { 
        component: 'VideoProcessingService' 
      });
      throw error;
    }
  }


  /**
   * Cleans up temporary files
   */
  private static cleanupTempFiles(tempDir: Directory): void {
    try {
      tempDir.delete();
    } catch (error) {
      logger.warn('Failed to cleanup temp files', { component: 'VideoProcessingService' });
    }
  }

  /**
   * Checks video size and compresses automatically if over 50MB
   * Uses automatic WhatsApp-like compression in the background
   * @param videoPath - Path to the video file
   * @param assetId - Optional asset ID for MediaLibrary lookup
   * @param onProgress - Optional progress callback
   * @returns Processed video (compressed if needed)
   */
  static async checkAndCompressVideoForUpload(
    videoPath: string,
    assetId?: string | null,
    onProgress?: (progress: number) => void
  ): Promise<{
    processedVideo: ProcessedVideo;
    wasCompressed: boolean;
    originalSize: number;
    compressedSize: number;
  }> {
    try {
      // Get local URI from MediaLibrary if we have assetId (for iCloud videos)
      const localVideoPath = await this.getLocalVideoPath(videoPath, assetId);

      // Validate file exists and get size
      const file = await this.validateVideoFileExists(localVideoPath);
      const originalSize = file.size || 0;

      // Check if video exceeds 50MB limit
      const needsCompression = originalSize > MAX_FILE_SIZE;

      // If compression is needed, use automatic WhatsApp-like compression
      if (needsCompression) {
        logger.info('Video exceeds 50MB limit, starting automatic compression', {
          component: 'VideoProcessingService',
          originalSize,
          maxFileSize: MAX_FILE_SIZE,
        });

        const compressedVideo = await this.compressVideoAuto(localVideoPath, assetId, onProgress);
        
        // Get compressed file size
        const compressedFile = new File(compressedVideo.path.replace('file://', ''));
        const compressedSize = compressedFile.exists ? (compressedFile.size || 0) : 0;

        logger.info('Video compression completed', {
          component: 'VideoProcessingService',
          originalSize,
          compressedSize,
          reduction: `${((1 - compressedSize / originalSize) * 100).toFixed(1)}%`,
        });

        return {
          processedVideo: compressedVideo,
          wasCompressed: true,
          originalSize,
          compressedSize,
        };
      }

      // Video is within limits, return as-is
      const videoInfo = await this.getVideoInfo(localVideoPath);
      return {
        processedVideo: {
          path: localVideoPath,
          duration: videoInfo.duration,
          width: videoInfo.width,
          height: videoInfo.height,
        },
        wasCompressed: false,
        originalSize,
        compressedSize: originalSize,
      };
    } catch (error) {
      logger.error('Error checking and compressing video for upload', error, { component: 'VideoProcessingService' });
      throw error;
    }
  }

  /**
   * Optimizes a single video for posting with size limit enforcement
   */
  static async optimizeVideoForPosting(videoPath: string, assetId?: string | null): Promise<ProcessedVideo> {
    try {
      // Use the new variable compression method
      return await this.compressVideoWithSizeLimit(videoPath, MAX_FILE_SIZE, assetId);

    } catch (error) {
      logger.error('Error optimizing video', error, { component: 'VideoProcessingService' });
      // Return original video if optimization fails
      return {
        path: videoPath,
        duration: 10,
        width: 1080,
        height: 1920,
      };
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
   * Checks if video file size is acceptable for upload
   * @param videoPath - Path to the video file
   * @param assetId - Optional asset ID for MediaLibrary lookup (iCloud videos)
   * @returns Object with validation result and size information
   */
  static async checkVideoSize(videoPath: string, assetId?: string | null): Promise<{
    isValid: boolean;
    sizeMB: number;
    maxSizeMB: number;
    needsCompression: boolean;
  }> {
    try {
      // Get local URI from MediaLibrary if we have assetId (for iCloud videos)
      const localPath = await this.getLocalVideoPath(videoPath, assetId);
      const file = new File(localPath);
      
      if (!file.exists) {
        return {
          isValid: false,
          sizeMB: 0,
          maxSizeMB: MAX_FILE_SIZE / 1024 / 1024,
          needsCompression: false,
        };
      }
      
      const sizeBytes = file.size || 0;
      const sizeMB = sizeBytes / 1024 / 1024;
      const maxSizeMB = MAX_FILE_SIZE / 1024 / 1024;
      const isValid = sizeBytes <= MAX_FILE_SIZE;
      const needsCompression = sizeBytes > MAX_FILE_SIZE;

      return {
        isValid,
        sizeMB: Math.round(sizeMB * 100) / 100, // Round to 2 decimal places
        maxSizeMB: Math.round(maxSizeMB * 100) / 100,
        needsCompression,
      };
    } catch (error) {
      logger.error('Error checking video size', error, { component: 'VideoProcessingService' });
      return {
        isValid: false,
        sizeMB: 0,
        maxSizeMB: MAX_FILE_SIZE / 1024 / 1024,
        needsCompression: false,
      };
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
   * Gets compression statistics for a video file
   * @param originalPath - Path to original video
   * @param compressedPath - Path to compressed video
   * @returns Compression statistics
   */
  static async getCompressionStats(originalPath: string, compressedPath: string): Promise<{
    originalSize: string;
    compressedSize: string;
    compressionRatio: number;
    sizeReduction: string;
  }> {
    try {
      const originalFile = new File(originalPath);
      const compressedFile = new File(compressedPath);
      
      const originalBytes = originalFile.exists ? (originalFile.size || 0) : 0;
      const compressedBytes = compressedFile.exists ? (compressedFile.size || 0) : 0;
      
      const compressionRatio = originalBytes > 0 ? (compressedBytes / originalBytes) * 100 : 0;
      const sizeReduction = originalBytes > 0 ? originalBytes - compressedBytes : 0;
      
      return {
        originalSize: this.formatFileSize(originalBytes),
        compressedSize: this.formatFileSize(compressedBytes),
        compressionRatio: Math.round(compressionRatio * 100) / 100,
        sizeReduction: this.formatFileSize(sizeReduction),
      };
    } catch (error) {
      logger.error('Error getting compression stats', error, { component: 'VideoProcessingService' });
      return {
        originalSize: 'Unknown',
        compressedSize: 'Unknown',
        compressionRatio: 0,
        sizeReduction: 'Unknown',
      };
    }
  }

  /**
   * Extracts the first frame from a video as a thumbnail image
   * @param videoPath - Path to the video file (should already be standardized)
   * @param assetId - Optional asset ID for MediaLibrary lookup (iCloud videos) - only needed if videoPath is not standardized
   * @returns Path to the extracted thumbnail image
   */
  static async extractFirstFrame(videoPath: string, assetId?: string | null): Promise<string> {
    try {
      // If videoPath is already standardized (from sandbox), use it directly
      // Otherwise, get local URI from MediaLibrary if we have assetId (for iCloud videos)
      let localVideoPath: string;
      if (videoPath.includes('video_sandbox') || videoPath.includes('Library/Caches')) {
        // Already standardized, use as-is
        localVideoPath = videoPath;
      } else {
        // Need to get local path (handles iCloud videos)
        localVideoPath = await this.getLocalVideoPath(videoPath, assetId);
      }
      
      // Strip fragment identifier and normalize path for FFmpeg
      let normalizedPath = VideoProcessingService.stripFragment(localVideoPath.replace('file://', ''));
      if (Platform.OS === 'ios' && !normalizedPath.startsWith('/')) {
        normalizedPath = '/' + normalizedPath;
      }

      // Create temp directory for thumbnail
      const tempDir = new Directory(Paths.cache, `thumbnails_${Date.now()}`);
      tempDir.create({ intermediates: true });
      const thumbnailFile = new File(tempDir, `thumbnail_${Date.now()}.jpg`);
      let thumbnailPath = thumbnailFile.uri.replace('file://', '');
      
      if (Platform.OS === 'ios' && !thumbnailPath.startsWith('/')) {
        thumbnailPath = '/' + thumbnailPath;
      }

      if (!FFmpegKit || !ReturnCode) {
        throw new Error('FFmpegKit is not available');
      }

      // Extract first frame at 0.1 seconds (to avoid black frames)
      // -ss 0.1: seek to 0.1 seconds
      // -vframes 1: extract only 1 frame
      // -update 1: update the output file (required for single image output)
      // -q:v 2: high quality JPEG
      const cmd = `-i "${normalizedPath}" -ss 0.1 -vframes 1 -update 1 -q:v 2 "${thumbnailPath}"`;

      const session = await FFmpegKit.execute(cmd);
      const returnCode = await session.getReturnCode();

      if (ReturnCode.isSuccess(returnCode)) {
        // Verify thumbnail file exists (use thumbnailFile.uri, not normalized thumbnailPath)
        const thumbnail = new File(thumbnailFile.uri);
        if (!thumbnail.exists) {
          throw new Error('Thumbnail file was not created');
        }

        return this.ensureFileProtocol(thumbnailFile.uri);
      } else {
        const failStackTrace = await session.getFailStackTrace();
        const output = await session.getOutput();
        logger.error('Thumbnail extraction failed', {
          component: 'VideoProcessingService',
          returnCode,
          failStackTrace,
          output,
        });
        throw new Error(`Thumbnail extraction failed: ${failStackTrace || output || 'Unknown error'}`);
      }
    } catch (error) {
      logger.error('Error extracting first frame', error, { component: 'VideoProcessingService' });
      throw error;
    }
  }
}

export default VideoProcessingService; 