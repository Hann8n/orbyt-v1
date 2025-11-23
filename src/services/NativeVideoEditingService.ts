import { Platform } from 'react-native';
import { File, Directory, Paths } from 'expo-file-system';
import { VideoFile } from 'react-native-vision-camera';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { logger } from '../utils/logger';
import NativeVideoProcessor from '../../modules/native-video-processor';
import type { VideoMetadata } from '../../modules/native-video-processor';

export interface VideoSegment {
  id: string;
  startTime: number;
  duration: number;
  video: VideoFile | ImagePicker.ImagePickerAsset;
  sourceType?: 'camera' | 'gallery';
  trimStart?: number; // Trim start time in seconds
  trimEnd?: number; // Trim end time in seconds
}

export interface ProcessedVideo {
  path: string;
  duration: number;
  width: number;
  height: number;
}

class NativeVideoEditingService {
  /**
   * Extracts video path from VideoFile or ImagePickerAsset
   */
  private static getVideoPath(video: VideoFile | ImagePicker.ImagePickerAsset): string {
    if ('uri' in video) {
      return video.uri;
    }
    return video.path;
  }

  /**
   * Gets local video path, downloading from iCloud if necessary
   */
  private static async getLocalVideoPath(
    video: VideoFile | ImagePicker.ImagePickerAsset
  ): Promise<string> {
    const videoPath = this.getVideoPath(video);
    const assetId = 'assetId' in video ? video.assetId : null;

    // Try to get local URI from MediaLibrary if we have assetId (for iCloud videos)
    if (assetId && Platform.OS === 'ios') {
      try {
        const assetInfo = await MediaLibrary.getAssetInfoAsync(assetId, {
          shouldDownloadFromNetwork: true,
        });
        if (assetInfo.localUri) {
          return assetInfo.localUri;
        }
      } catch (error) {
        logger.warn('Failed to get local URI from MediaLibrary', { component: 'NativeVideoEditingService' });
      }
    }

    return videoPath;
  }

  /**
   * Gets video metadata using native module
   */
  static async getVideoMetadata(videoPath: string): Promise<VideoMetadata> {
    try {
      // Ensure video file exists
      const file = new File(videoPath);
      if (!file.exists) {
        throw new Error('Video file does not exist');
      }

      const metadata = await NativeVideoProcessor.getVideoMetadata(videoPath);
      return metadata;
    } catch (error) {
      logger.error('Error getting video metadata', error, { component: 'NativeVideoEditingService' });
      
      // Return default metadata
      return {
        path: videoPath,
        duration: 10,
        width: 1080,
        height: 1920,
        size: 0,
        bitrate: 1000000,
        frameRate: 30,
      };
    }
  }

  /**
   * Trims a video to a specific time range using native module
   */
  static async trimVideo(
    videoPath: string,
    startTime: number,
    endTime: number
  ): Promise<string> {
    try {
      // Ensure video file exists
      const file = new File(videoPath);
      if (!file.exists) {
        throw new Error('Video file does not exist');
      }

      // Create temp directory for processing
      const tempDir = new Directory(Paths.cache, `video_trim_${Date.now()}`);
      tempDir.create({ intermediates: true });

      const outputFile = new File(tempDir, 'trimmed.mp4');
      
      logger.info('Trimming video with native module', { 
        component: 'NativeVideoEditingService',
        startTime,
        endTime 
      });

      const result = await NativeVideoProcessor.trimVideo(
        videoPath,
        startTime,
        endTime,
        outputFile.uri
      );

      return result.path;
    } catch (error) {
      logger.error('Error trimming video', error, { component: 'NativeVideoEditingService' });
      throw error;
    }
  }

  /**
   * Concatenates multiple videos into a single video using native module
   */
  static async concatenateVideos(videoPaths: string[]): Promise<string> {
    try {
      if (videoPaths.length === 0) {
        throw new Error('No videos to concatenate');
      }

      if (videoPaths.length === 1) {
        return videoPaths[0];
      }

      // Create temp directory for processing
      const tempDir = new Directory(Paths.cache, `video_concat_${Date.now()}`);
      tempDir.create({ intermediates: true });

      const outputFile = new File(tempDir, 'concatenated.mp4');
      
      logger.info('Concatenating videos with native module', { 
        component: 'NativeVideoEditingService',
        count: videoPaths.length 
      });

      const result = await NativeVideoProcessor.mergeVideos(
        videoPaths,
        outputFile.uri
      );

      return result.path;
    } catch (error) {
      logger.error('Error concatenating videos', error, { component: 'NativeVideoEditingService' });
      throw error;
    }
  }

  /**
   * Merges and processes multiple video segments with optional trimming
   */
  static async mergeSegments(segments: VideoSegment[]): Promise<ProcessedVideo> {
    try {
      if (segments.length === 0) {
        throw new Error('No segments to merge');
      }

      // Create temp directory for processing
      const tempDir = new Directory(Paths.cache, `video_merge_${Date.now()}`);
      tempDir.create({ intermediates: true });

      const processedVideoPaths: string[] = [];

      // Process each segment (trim if needed, get local path)
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const videoPath = await this.getLocalVideoPath(segment.video);

        let processedPath = videoPath;

        // Trim the video if trim times are specified
        if (segment.trimStart !== undefined || segment.trimEnd !== undefined) {
          const metadata = await this.getVideoMetadata(videoPath);
          const startTime = segment.trimStart || 0;
          const endTime = segment.trimEnd || metadata.duration;
          
          processedPath = await this.trimVideo(videoPath, startTime, endTime);
        }

        // Copy to temp directory with sequential naming
        const tempFile = new File(tempDir, `segment_${i}.mp4`);
        try {
          await new Promise<void>((resolve, reject) => {
            try {
              new File(processedPath).copy(tempFile);
              resolve();
            } catch (error) {
              reject(error);
            }
          });
        } catch (copyError) {
          logger.error('Failed to copy segment file', copyError, { component: 'NativeVideoEditingService' });
          throw new Error(`Failed to copy segment ${i}`);
        }
        processedVideoPaths.push(tempFile.uri);
      }

      // Concatenate all processed segments using native module
      const mergedPath = await this.concatenateVideos(processedVideoPaths);

      // Get metadata of the merged video
      const metadata = await this.getVideoMetadata(mergedPath);

      // Return result (cleanup in finally block)
      const result: ProcessedVideo = {
        path: metadata.path,
        duration: metadata.duration,
        width: metadata.width,
        height: metadata.height,
      };

      // Clean up temp files after successful merge
      this.cleanupTempFiles(tempDir);

      return result;
    } catch (error) {
      logger.error('Error merging segments', error, { component: 'NativeVideoEditingService' });
      throw error;
    }
  }

  /**
   * Compresses a video to reduce file size using native module
   */
  static async compressVideo(
    videoPath: string,
    quality: 'low' | 'medium' | 'high' = 'medium'
  ): Promise<string> {
    try {
      // Ensure video file exists
      const file = new File(videoPath);
      if (!file.exists) {
        throw new Error('Video file does not exist');
      }

      // Create temp directory for processing
      const tempDir = new Directory(Paths.cache, `video_compress_${Date.now()}`);
      tempDir.create({ intermediates: true });

      const outputFile = new File(tempDir, 'compressed.mp4');
      
      logger.info('Compressing video with native module', { 
        component: 'NativeVideoEditingService',
        quality 
      });

      const result = await NativeVideoProcessor.compressVideo(
        videoPath,
        outputFile.uri,
        quality
      );

      return result.path;
    } catch (error) {
      logger.error('Error compressing video', error, { component: 'NativeVideoEditingService' });
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
      logger.warn('Failed to cleanup temp files', { component: 'NativeVideoEditingService' });
    }
  }

  /**
   * Validates if native video processor is available
   */
  static async validateNativeProcessor(): Promise<boolean> {
    try {
      // Try to get metadata of a dummy path to check if module is loaded
      // This will fail but we just want to check if the native module exists
      return !!NativeVideoProcessor;
    } catch (error) {
      logger.error('Native video processor validation failed', error, { component: 'NativeVideoEditingService' });
      return false;
    }
  }

  /**
   * Generates a thumbnail from a video at a specific time
   * Note: This would require additional native implementation
   * For now, returns a placeholder
   */
  static async generateThumbnail(
    videoPath: string,
    timeInSeconds: number = 0
  ): Promise<string> {
    logger.warn('Thumbnail generation not yet implemented in native module', { component: 'NativeVideoEditingService' });
    // Would need to add native thumbnail generation
    throw new Error('Thumbnail generation not yet implemented');
  }
}

export default NativeVideoEditingService;
