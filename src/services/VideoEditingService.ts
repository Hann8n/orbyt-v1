import { Platform } from 'react-native';
import { FFmpegKit, FFmpegKitConfig, ReturnCode } from 'ffmpeg-kit-react-native';
import { File, Directory, Paths } from 'expo-file-system';
import { VideoFile } from 'react-native-vision-camera';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { logger } from '../utils/logger';

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

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  bitrate: number;
  fps: number;
  codec: string;
  size: number;
}

class VideoEditingService {
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
        logger.warn('Failed to get local URI from MediaLibrary', { component: 'VideoEditingService' });
      }
    }

    return videoPath;
  }

  /**
   * Gets video metadata using FFprobe
   */
  static async getVideoMetadata(videoPath: string): Promise<VideoMetadata> {
    try {
      // Ensure video file exists
      const file = new File(videoPath);
      if (!file.exists) {
        throw new Error('Video file does not exist');
      }

      // Use FFprobe to get video information
      const command = `-v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,bit_rate,codec_name -show_entries format=duration,size -of json "${videoPath}"`;
      
      const session = await FFmpegKit.execute(command);
      const returnCode = await session.getReturnCode();
      
      if (!ReturnCode.isSuccess(returnCode)) {
        throw new Error('Failed to get video metadata');
      }

      const output = await session.getOutput();
      const metadata = JSON.parse(output);

      const stream = metadata.streams?.[0] || {};
      const format = metadata.format || {};

      // Parse frame rate (can be in format "30/1")
      let fps = 30;
      if (stream.r_frame_rate) {
        const [num, den] = stream.r_frame_rate.split('/').map(Number);
        fps = den ? num / den : num;
      }

      return {
        duration: parseFloat(format.duration) || 0,
        width: parseInt(stream.width) || 1080,
        height: parseInt(stream.height) || 1920,
        bitrate: parseInt(stream.bit_rate) || parseInt(format.bit_rate) || 1000000,
        fps: Math.round(fps),
        codec: stream.codec_name || 'h264',
        size: parseInt(format.size) || file.size || 0,
      };
    } catch (error) {
      logger.error('Error getting video metadata', error, { component: 'VideoEditingService' });
      
      // Return default metadata
      return {
        duration: 10,
        width: 1080,
        height: 1920,
        bitrate: 1000000,
        fps: 30,
        codec: 'h264',
        size: 0,
      };
    }
  }

  /**
   * Trims a video to a specific time range
   * @param videoPath Path to the video file
   * @param startTime Start time in seconds
   * @param endTime End time in seconds
   * @returns Path to the trimmed video
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
      const duration = endTime - startTime;

      // Use FFmpeg to trim the video
      // -ss: start time, -t: duration, -c copy: copy without re-encoding (fast)
      const command = `-y -i "${videoPath}" -ss ${startTime} -t ${duration} -c copy "${outputFile.uri}"`;
      
      logger.info('Trimming video', { 
        component: 'VideoEditingService',
        startTime,
        endTime,
        duration 
      });

      const session = await FFmpegKit.execute(command);
      const returnCode = await session.getReturnCode();

      if (!ReturnCode.isSuccess(returnCode)) {
        const output = await session.getOutput();
        logger.error('FFmpeg trim failed', output, { component: 'VideoEditingService' });
        
        // Try with re-encoding if copy fails
        const reencodeCommand = `-y -i "${videoPath}" -ss ${startTime} -t ${duration} -c:v libx264 -preset fast -c:a aac "${outputFile.uri}"`;
        const reencodeSession = await FFmpegKit.execute(reencodeCommand);
        const reencodeReturnCode = await reencodeSession.getReturnCode();
        
        if (!ReturnCode.isSuccess(reencodeReturnCode)) {
          throw new Error('Failed to trim video');
        }
      }

      // Verify output file exists
      if (!outputFile.exists) {
        throw new Error('Trimmed video file was not created');
      }

      return outputFile.uri;
    } catch (error) {
      logger.error('Error trimming video', error, { component: 'VideoEditingService' });
      throw error;
    }
  }

  /**
   * Concatenates multiple videos into a single video
   * @param videoPaths Array of video file paths
   * @returns Path to the concatenated video
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

      // Create a file list for FFmpeg concat demuxer
      const listFile = new File(tempDir, 'filelist.txt');
      const fileListContent = videoPaths
        .map(path => `file '${path.replace(/'/g, "'\\''")}'`)
        .join('\n');
      
      listFile.write(fileListContent);

      const outputFile = new File(tempDir, 'concatenated.mp4');

      // Use FFmpeg concat demuxer for fast concatenation without re-encoding
      const command = `-y -f concat -safe 0 -i "${listFile.uri}" -c copy "${outputFile.uri}"`;
      
      logger.info('Concatenating videos', { 
        component: 'VideoEditingService',
        count: videoPaths.length 
      });

      const session = await FFmpegKit.execute(command);
      const returnCode = await session.getReturnCode();

      if (!ReturnCode.isSuccess(returnCode)) {
        const output = await session.getOutput();
        logger.error('FFmpeg concat failed with copy, trying re-encode', output, { 
          component: 'VideoEditingService' 
        });
        
        // If copy fails, try with re-encoding to ensure compatibility
        const reencodeCommand = `-y -f concat -safe 0 -i "${listFile.uri}" -c:v libx264 -preset medium -c:a aac "${outputFile.uri}"`;
        const reencodeSession = await FFmpegKit.execute(reencodeCommand);
        const reencodeReturnCode = await reencodeSession.getReturnCode();
        
        if (!ReturnCode.isSuccess(reencodeReturnCode)) {
          throw new Error('Failed to concatenate videos');
        }
      }

      // Verify output file exists
      if (!outputFile.exists) {
        throw new Error('Concatenated video file was not created');
      }

      return outputFile.uri;
    } catch (error) {
      logger.error('Error concatenating videos', error, { component: 'VideoEditingService' });
      throw error;
    }
  }

  /**
   * Merges and processes multiple video segments with optional trimming
   * @param segments Array of video segments to merge
   * @returns Processed video information
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
        new File(processedPath).copy(tempFile);
        processedVideoPaths.push(tempFile.uri);
      }

      // Concatenate all processed segments
      const mergedPath = await this.concatenateVideos(processedVideoPaths);

      // Get metadata of the merged video
      const metadata = await this.getVideoMetadata(mergedPath);

      // Clean up temp files
      this.cleanupTempFiles(tempDir);

      return {
        path: mergedPath,
        duration: metadata.duration,
        width: metadata.width,
        height: metadata.height,
      };
    } catch (error) {
      logger.error('Error merging segments', error, { component: 'VideoEditingService' });
      throw error;
    }
  }

  /**
   * Compresses a video to reduce file size
   * @param videoPath Path to the video file
   * @param quality Quality level (0-1, where 1 is highest quality)
   * @returns Path to the compressed video
   */
  static async compressVideo(
    videoPath: string,
    quality: number = 0.8
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

      // Calculate CRF value (lower = better quality, higher = smaller file)
      // CRF range: 0-51, where 23 is default, 18 is visually lossless
      const crf = Math.round(51 - (quality * 33)); // Maps 0-1 to 51-18

      // Use FFmpeg to compress the video
      const command = `-y -i "${videoPath}" -c:v libx264 -crf ${crf} -preset medium -c:a aac -b:a 128k "${outputFile.uri}"`;
      
      logger.info('Compressing video', { 
        component: 'VideoEditingService',
        quality,
        crf 
      });

      const session = await FFmpegKit.execute(command);
      const returnCode = await session.getReturnCode();

      if (!ReturnCode.isSuccess(returnCode)) {
        const output = await session.getOutput();
        logger.error('FFmpeg compress failed', output, { component: 'VideoEditingService' });
        throw new Error('Failed to compress video');
      }

      // Verify output file exists
      if (!outputFile.exists) {
        throw new Error('Compressed video file was not created');
      }

      return outputFile.uri;
    } catch (error) {
      logger.error('Error compressing video', error, { component: 'VideoEditingService' });
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
      logger.warn('Failed to cleanup temp files', { component: 'VideoEditingService' });
    }
  }

  /**
   * Validates if FFmpeg is available and working
   */
  static async validateFFmpeg(): Promise<boolean> {
    try {
      const session = await FFmpegKit.execute('-version');
      const returnCode = await session.getReturnCode();
      return ReturnCode.isSuccess(returnCode);
    } catch (error) {
      logger.error('FFmpeg validation failed', error, { component: 'VideoEditingService' });
      return false;
    }
  }

  /**
   * Generates a thumbnail from a video at a specific time
   * @param videoPath Path to the video file
   * @param timeInSeconds Time in seconds to capture thumbnail
   * @returns Path to the thumbnail image
   */
  static async generateThumbnail(
    videoPath: string,
    timeInSeconds: number = 0
  ): Promise<string> {
    try {
      // Ensure video file exists
      const file = new File(videoPath);
      if (!file.exists) {
        throw new Error('Video file does not exist');
      }

      // Create temp directory for processing
      const tempDir = new Directory(Paths.cache, `video_thumb_${Date.now()}`);
      tempDir.create({ intermediates: true });

      const outputFile = new File(tempDir, 'thumbnail.jpg');

      // Use FFmpeg to extract a frame
      const command = `-y -ss ${timeInSeconds} -i "${videoPath}" -vframes 1 -q:v 2 "${outputFile.uri}"`;
      
      const session = await FFmpegKit.execute(command);
      const returnCode = await session.getReturnCode();

      if (!ReturnCode.isSuccess(returnCode)) {
        throw new Error('Failed to generate thumbnail');
      }

      // Verify output file exists
      if (!outputFile.exists) {
        throw new Error('Thumbnail file was not created');
      }

      return outputFile.uri;
    } catch (error) {
      logger.error('Error generating thumbnail', error, { component: 'VideoEditingService' });
      throw error;
    }
  }
}

export default VideoEditingService;
