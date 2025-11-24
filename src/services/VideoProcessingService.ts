import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { File, Directory, Paths } from 'expo-file-system';
import Compressor from 'react-native-compressor';
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
      let localUri = videoPath;
      let fileSize = asset?.fileSize || 0;
      
      if (asset?.assetId && Platform.OS === 'ios') {
        try {
          const assetInfo = await MediaLibrary.getAssetInfoAsync(asset.assetId, {
            shouldDownloadFromNetwork: true,
          });
          if (assetInfo.localUri) {
            localUri = assetInfo.localUri;
            // Use fileSize from MediaLibrary if available
            if (!fileSize && assetInfo.localUri) {
              const file = new File(assetInfo.localUri);
              fileSize = file.size || 0;
            }
          }
        } catch (mediaError) {
          logger.warn('Failed to get asset from MediaLibrary, using provided path', { component: 'VideoProcessingService' });
        }
      }
      
      // Verify file exists
      const file = new File(localUri);
      if (!file.exists) {
        throw new Error('Video file does not exist');
      }

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
   * Compresses video with variable quality to meet file size requirements
   */
  static async compressVideoWithSizeLimit(
    videoPath: string,
    maxSizeBytes: number = MAX_FILE_SIZE,
    assetId?: string | null
  ): Promise<ProcessedVideo> {
    try {
      // Get local URI from MediaLibrary if we have assetId (for iCloud videos)
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
          logger.warn('Failed to get asset from MediaLibrary, using provided path', { component: 'VideoProcessingService' });
        }
      }
      
      // Get original video info
      const file = new File(localVideoPath);
      if (!file.exists) {
        throw new Error('Video file does not exist');
      }

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

      // Create temp directory for processing
      const tempDir = new Directory(Paths.cache, `video_compress_${Date.now()}`);
      tempDir.create({ intermediates: true });

      // Try compression levels progressively
      for (const level of COMPRESSION_LEVELS) {
        
        const outputFile = new File(tempDir, `compressed_${level.name}.mp4`);
        
        try {
          // Compress with current level
          const compressedPath = await Compressor.Video.compress(localVideoPath, {
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
            const finalPath = outputFile.uri.startsWith('file://') ? outputFile.uri : `file://${outputFile.uri}`;
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
        const compressedPath = await Compressor.Video.compress(localVideoPath, {
          bitrate: COMPRESSION_LEVELS[3].bitrate,
        });

        new File(compressedPath).copy(minimalFile);

        const finalSize = await this.getFileSize(minimalFile.uri);

        // Clean up temp directory
        this.cleanupTempFiles(tempDir);
        
        const finalPath = minimalFile.uri.startsWith('file://') ? minimalFile.uri : `file://${minimalFile.uri}`;
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
            mediaInfo = await FFprobeKit.getMediaInformation(normalizedPath);
          } else if (typeof FFprobeKit.execute === 'function') {
            // Alternative: use FFprobe execute with JSON output
            const probeCommand = `-v error -select_streams v:0 -show_entries stream=width,height,codec_name,r_frame_rate,duration -show_entries format=duration -of json "${normalizedPath}"`;
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

      // Analyze input video properties
      const inputProps = await this.analyzeVideoProperties(inputPath);
      
      // Check if normalization is needed
      const needsNormalization = 
        inputProps.codec !== 'h264' ||
        inputProps.width !== targetWidth ||
        inputProps.height !== targetHeight ||
        Math.abs(inputProps.frameRate - targetFrameRate) > 0.5;

      if (!needsNormalization) {
        // Video already matches target format, just copy it
        const inputFile = new File(normalizedInput);
        const outputFile = new File(normalizedOutput);
        inputFile.copy(outputFile);
        return outputPath;
      }

      // Calculate bitrate based on resolution (use quality standard)
      const qualityStandard = this.getQualityStandard(targetWidth, targetHeight);
      const targetBitrate = VIDEO_QUALITY_STANDARDS[qualityStandard]?.bitrate || 4000000;

      // Build FFmpeg command for normalization
      // -vf scale: resize to target resolution, maintain aspect ratio with padding if needed
      // -r: set frame rate
      // -c:v libx264: use H.264 codec
      // -preset medium: balance between speed and quality
      // -crf 23: constant rate factor for quality (alternative to bitrate)
      // -c:a aac: encode audio to AAC
      // -movflags +faststart: optimize for streaming
      const scaleFilter = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2`;
      const ffmpegCommand = `-i "${normalizedInput}" -vf "${scaleFilter}" -r ${targetFrameRate} -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 128k -movflags +faststart "${normalizedOutput}"`;

      logger.info('Normalizing video format', {
        component: 'VideoProcessingService',
        input: normalizedInput,
        output: normalizedOutput,
        targetResolution: `${targetWidth}x${targetHeight}`,
        targetFrameRate,
      });

      const session = await FFmpegKit.execute(ffmpegCommand);
      const returnCode = await session.getReturnCode();

      if (ReturnCode.isSuccess(returnCode)) {
        // Verify output file exists
        const outputFile = new File(normalizedOutput);
        if (!outputFile.exists) {
          throw new Error('Normalization completed but output file not found');
        }

        return normalizedOutput.startsWith('file://') ? normalizedOutput : `file://${normalizedOutput}`;
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
   * Merges multiple video segments into a single video file
   * Uses FFmpeg complex filter for clean merging without audio/video sync glitches
   * from mixing different clip formats (camera vs uploaded, variable vs fixed frame rates)
   */
  static async mergeSegments(segments: VideoSegment[]): Promise<ProcessedVideo> {
    if (segments.length === 0) {
      throw new Error('No segments to merge');
    }

    if (segments.length === 1) {
      // For single segment, just return the video as-is
      const segment = segments[0];
      return {
        path: this.getVideoPath(segment.video),
        duration: this.getVideoDuration(segment.video),
        width: this.getVideoWidth(segment.video),
        height: this.getVideoHeight(segment.video),
      };
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

      // Verify merged file exists
      const mergedFile = new File(mergedVideoPath.replace('file://', ''));
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
      const mergedPath = mergedVideoPath.startsWith('file://') ? mergedVideoPath : `file://${mergedVideoPath}`;
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
        let videoPath = this.getVideoPath(segment.video);

        // Handle iCloud videos on iOS
        const assetId = 'assetId' in segment.video ? segment.video.assetId : null;
        if (assetId && Platform.OS === 'ios') {
          try {
            const assetInfo = await MediaLibrary.getAssetInfoAsync(assetId, {
              shouldDownloadFromNetwork: true,
            });
            if (assetInfo.localUri) {
              videoPath = assetInfo.localUri;
            }
          } catch (mediaError) {
            logger.warn('Failed to get asset from MediaLibrary, using provided path', { 
              component: 'VideoProcessingService' 
            });
          }
        }

        // Normalize path for FFmpeg
        // Remove fragment identifier (#...) that iOS gallery URIs may contain
        let normalizedPath = videoPath.replace('file://', '').split('#')[0];
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

      const session = await FFmpegKit.execute(cmd);
      const returnCode = await session.getReturnCode();

      if (ReturnCode.isSuccess(returnCode)) {
        // Verify output file exists
        const outputFile = new File(normalizedOutput);
        if (!outputFile.exists) {
          throw new Error('Complex filter merge completed but output file not found');
        }

        logger.info('Complex filter merge completed successfully', { 
          component: 'VideoProcessingService' 
        });

        return normalizedOutput.startsWith('file://') ? normalizedOutput : `file://${normalizedOutput}`;
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
   * Merge multiple videos using FFmpeg concat demuxer
   * Normalizes all videos to a common format (H.264, highest resolution, 30fps) before concatenating
   */
  private static async mergeVideosWithCompressor(
    videoPaths: string[],
    outputPath: string,
    segments?: VideoSegment[]
  ): Promise<string> {
    try {
      if (videoPaths.length === 1) {
        // Single video - return as-is
        return videoPaths[0];
      }

      // Check if FFmpegKit is available
      if (!FFmpegKit || !ReturnCode) {
        throw new Error('FFmpegKit is not available. Please rebuild the app with native modules linked.');
      }

      // Create temporary directory for normalization and concat file
      const tempDir = new Directory(Paths.cache, `video_merge_${Date.now()}`);
      tempDir.create({ intermediates: true });

      // Phase 1: Analyze all videos to determine target format
      logger.info('Analyzing video properties for normalization', {
        component: 'VideoProcessingService',
        videoCount: videoPaths.length,
      });

      const videoProperties: VideoProperties[] = [];
      for (const videoPath of videoPaths) {
        // Try to get asset info from segments if available
        let asset: ImagePicker.ImagePickerAsset | undefined;
        if (segments) {
          const segment = segments.find(s => {
            const segPath = this.getVideoPath(s.video);
            return segPath === videoPath || segPath.replace('file://', '') === videoPath.replace('file://', '');
          });
          if (segment && 'uri' in segment.video) {
            asset = segment.video as ImagePicker.ImagePickerAsset;
          }
        }

        const props = await this.analyzeVideoProperties(videoPath, asset);
        videoProperties.push(props);
      }

      // Determine target format: highest resolution, 30fps, H.264
      let targetWidth = 0;
      let targetHeight = 0;
      const targetFrameRate = 30;

      for (const props of videoProperties) {
        const totalPixels = props.width * props.height;
        const currentTotalPixels = targetWidth * targetHeight;
        if (totalPixels > currentTotalPixels) {
          targetWidth = props.width;
          targetHeight = props.height;
        }
      }

      // Fallback to first video's resolution if no valid resolution found
      if (targetWidth === 0 || targetHeight === 0) {
        targetWidth = videoProperties[0]?.width || 1080;
        targetHeight = videoProperties[0]?.height || 1920;
      }

      logger.info('Target format determined', {
        component: 'VideoProcessingService',
        resolution: `${targetWidth}x${targetHeight}`,
        frameRate: targetFrameRate,
        codec: 'h264',
      });

      // Phase 2: Normalize all videos to target format
      const normalizedPaths: string[] = [];
      for (let i = 0; i < videoPaths.length; i++) {
        const videoPath = videoPaths[i];
        const props = videoProperties[i];
        
        // Check if normalization is needed
        const needsNormalization = 
          props.codec !== 'h264' ||
          props.width !== targetWidth ||
          props.height !== targetHeight ||
          Math.abs(props.frameRate - targetFrameRate) > 0.5;

        if (needsNormalization) {
          // Normalize this video
          const normalizedOutput = new File(tempDir, `normalized_${i}.mp4`);
          const normalizedPath = await this.normalizeVideoFormat(
            videoPath,
            normalizedOutput.uri,
            targetWidth,
            targetHeight,
            targetFrameRate
          );
          normalizedPaths.push(normalizedPath.replace('file://', ''));
        } else {
          // Video already matches target format
          let normalized = videoPath.replace('file://', '');
          if (Platform.OS === 'ios' && !normalized.startsWith('/')) {
            normalized = '/' + normalized;
          }
          normalizedPaths.push(normalized);
        }
      }

      // Phase 3: Concatenate normalized videos
      // Normalize output path
      let normalizedOutput = outputPath.replace('file://', '');
      if (Platform.OS === 'ios' && !normalizedOutput.startsWith('/')) {
        normalizedOutput = '/' + normalizedOutput;
      }

      // Create concat file list for FFmpeg
      const concatFile = new File(tempDir, 'concat.txt');
      const concatContent = normalizedPaths
        .map(path => {
          // Escape single quotes in paths
          const escapedPath = path.replace(/'/g, "'\\''");
          return `file '${escapedPath}'`;
        })
        .join('\n');

      concatFile.write(concatContent);

      let concatFilePath = concatFile.uri.replace('file://', '');
      if (Platform.OS === 'ios' && !concatFilePath.startsWith('/')) {
        concatFilePath = '/' + concatFilePath;
      }

      // Execute FFmpeg concat command
      // -f concat: use concat demuxer
      // -safe 0: allow unsafe file names
      // -i: input file (concat list)
      // -c copy: copy streams without re-encoding (now safe since all videos are normalized)
      const ffmpegCommand = `-f concat -safe 0 -i "${concatFilePath}" -c copy "${normalizedOutput}"`;
      
      logger.info('Executing FFmpeg merge command', { 
        component: 'VideoProcessingService',
        command: ffmpegCommand,
        videoCount: normalizedPaths.length,
        normalized: true,
      });

      const session = await FFmpegKit.execute(ffmpegCommand);
      const returnCode = await session.getReturnCode();

      if (ReturnCode.isSuccess(returnCode)) {
        // Verify output file exists
        const outputFile = new File(normalizedOutput);
        if (!outputFile.exists) {
          throw new Error('FFmpeg merge completed but output file not found');
        }

        // Clean up temporary normalized files and concat file
        try {
          for (let i = 0; i < normalizedPaths.length; i++) {
            const normalizedFile = new File(tempDir, `normalized_${i}.mp4`);
            if (normalizedFile.exists) {
              normalizedFile.delete();
            }
          }
          if (concatFile.exists) {
            concatFile.delete();
          }
        } catch (cleanupError) {
          logger.warn('Failed to cleanup temp files', { component: 'VideoProcessingService' });
        }

        // Return path with file:// prefix for React Native
        return normalizedOutput.startsWith('file://') ? normalizedOutput : `file://${normalizedOutput}`;
      } else {
        const failStackTrace = await session.getFailStackTrace();
        const output = await session.getOutput();
        logger.error('FFmpeg merge failed', {
          component: 'VideoProcessingService',
          returnCode,
          failStackTrace,
          output
        });
        throw new Error(`FFmpeg merge failed: ${failStackTrace || output || 'Unknown error'}`);
      }
    } catch (error) {
      logger.error('FFmpeg merge error', error, { component: 'VideoProcessingService' });
      
      // Fallback: use the first video if merging fails
      if (videoPaths.length > 0) {
        logger.warn('Falling back to first video segment', { component: 'VideoProcessingService' });
        return videoPaths[0];
      }
      
      throw new Error(`Failed to merge videos: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      // Try MediaLibrary first if we have assetId (for iCloud videos)
      if (assetId && Platform.OS === 'ios') {
        try {
          const assetInfo = await MediaLibrary.getAssetInfoAsync(assetId, {
            shouldDownloadFromNetwork: true,
          });
          if (assetInfo.localUri) {
            const file = new File(assetInfo.localUri);
            return file.exists;
          }
        } catch (mediaError) {
          // Fall through to FileSystem
        }
      }
      
      const file = new File(videoPath);
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
      let sizeBytes = 0;
      let localPath = videoPath;
      
      // Get local URI from MediaLibrary if we have assetId (for iCloud videos)
      if (assetId && Platform.OS === 'ios') {
        try {
          const assetInfo = await MediaLibrary.getAssetInfoAsync(assetId, {
            shouldDownloadFromNetwork: true,
          });
          if (assetInfo.localUri) {
            localPath = assetInfo.localUri;
            const file = new File(localPath);
            if (file.exists) {
              sizeBytes = file.size || 0;
            }
          }
        } catch (mediaError) {
          // Fall through to FileSystem
        }
      }
      
      if (sizeBytes === 0) {
        const file = new File(localPath);
        if (!file.exists) {
          return {
            isValid: false,
            sizeMB: 0,
            maxSizeMB: MAX_FILE_SIZE / 1024 / 1024,
            needsCompression: false,
          };
        }
        sizeBytes = file.size || 0;
      }
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
}

export default VideoProcessingService; 