import { Platform, InteractionManager } from 'react-native';
import { logger } from '../utils/logger';

// Lazy import FFmpegKit to avoid errors when native module isn't linked yet
let FFmpegKit: any = null;
let ReturnCode: any = null;
try {
  const ffmpegModule = require('ffmpeg-kit-react-native');
  FFmpegKit = ffmpegModule.FFmpegKit;
  ReturnCode = ffmpegModule.ReturnCode;
} catch (error) {
  logger.warn('FFmpegKit not available - native module not linked', { component: 'VideoEditingService' });
}

// Audio volume constants
const MIN_VOLUME = 0.0;
const MAX_VOLUME = 2.0; // Allow boosting up to 200% for quiet audio
const DEFAULT_VOLUME = 1.0;

export interface TextOverlayOptions {
  x: string; // e.g., '(w-text_w)/2' for center, '10' for absolute position
  y: string; // e.g., '(h-text_h)/2' for center, '10' for absolute position
  size: number; // Font size in pixels
  color: string; // Hex color like 'white', 'black', or '#FFFFFF'
  fontFile?: string; // Optional path to custom font file
}

export interface BackgroundMusicOptions {
  videoVolume: number; // Volume of original video audio (0.0 to 2.0)
  musicVolume: number; // Volume of background music (0.0 to 2.0)
}

/**
 * VideoEditingService provides advanced video editing capabilities
 * including text overlays, audio mixing, and complex filter operations
 */
class VideoEditingService {
  /**
   * Normalizes a file path for FFmpeg usage
   * - Removes file:// prefix
   * - Ensures absolute path for iOS
   * - Preserves full directory structure
   */
  private static normalizePath(path: string): string {
    if (!path) {
      throw new Error('Path cannot be empty');
    }
    
    // Remove file:// prefix if present
    let normalized = path.replace(/^file:\/\//, '');
    
    // Ensure we have an absolute path for iOS
    // Only add leading slash if path doesn't already have one AND doesn't start with a valid absolute path
    if (Platform.OS === 'ios') {
      // If path doesn't start with /, it might be a relative path
      // But if it starts with /private or /var, it's already absolute
      if (normalized && !normalized.startsWith('/')) {
        normalized = '/' + normalized;
      }
    }
    
    // Validate that we have a proper path (not just a filename)
    if (normalized && !normalized.includes('/') && normalized.endsWith('.mp4')) {
      throw new Error(`Invalid path: ${normalized} - missing directory`);
    }
    
    return normalized;
  }

  /**
   * Escapes special characters in text for FFmpeg drawtext filter
   * FFmpeg requires escaping of colons, single quotes, backslashes, etc.
   */
  private static escapeText(text: string): string {
    return text
      .replace(/\\/g, '\\\\') // Escape backslashes first
      .replace(/:/g, '\\:')    // Escape colons
      .replace(/'/g, "\\'");   // Escape single quotes
  }

  /**
   * Adds text overlay to a video using FFmpeg drawtext filter
   * 
   * @param videoPath - Path to input video file
   * @param outputPath - Path where the output video will be saved
   * @param text - Text to display on the video
   * @param options - Text styling and positioning options
   * @returns Promise resolving to the output path
   */
  static async addTextOverlay(
    videoPath: string,
    outputPath: string,
    text: string,
    options: TextOverlayOptions
  ): Promise<string> {
    try {
      if (!FFmpegKit || !ReturnCode) {
        throw new Error('FFmpegKit is not available');
      }

      // Normalize paths
      const normalizedInput = this.normalizePath(videoPath);
      const normalizedOutput = this.normalizePath(outputPath);
      
      // Log paths for debugging
      logger.info('FFmpeg paths', {
        component: 'VideoEditingService',
        inputPath: videoPath,
        normalizedInput,
        outputPath,
        normalizedOutput,
      });

      // Escape text for FFmpeg
      const safeText = this.escapeText(text);

      // Build drawtext filter
      // Note: fontfile is optional - FFmpeg will use system default if not provided
      let drawTextFilter = `drawtext=text='${safeText}'`;
      drawTextFilter += `:fontsize=${options.size}`;
      drawTextFilter += `:fontcolor=${options.color}`;
      drawTextFilter += `:x=${options.x}`;
      drawTextFilter += `:y=${options.y}`;
      
      if (options.fontFile) {
        const normalizedFontPath = this.normalizePath(options.fontFile);
        drawTextFilter += `:fontfile=${normalizedFontPath}`;
      }

      // Build FFmpeg command
      // -i: input video
      // -vf: video filter (drawtext)
      // -c:a copy: copy audio without re-encoding
      // -c:v libx264: encode video with H.264
      // -preset medium: balance between speed and quality
      // Escape paths properly for FFmpeg (escape quotes and backslashes)
      const escapedInput = normalizedInput.replace(/"/g, '\\"').replace(/\\/g, '\\\\');
      const escapedOutput = normalizedOutput.replace(/"/g, '\\"').replace(/\\/g, '\\\\');
      const cmd = `-i "${escapedInput}" -vf "${drawTextFilter}" -c:v libx264 -preset medium -c:a copy "${escapedOutput}"`;

      logger.info('Adding text overlay to video', {
        component: 'VideoEditingService',
        text: text,
        options,
        cmd: cmd.substring(0, 200), // Log first 200 chars of command
        normalizedInput,
        normalizedOutput,
      });

      // FFmpeg operations are already async and run in background threads
      // No need for InteractionManager wrapper - FFmpegKit handles threading internally
      const session = await FFmpegKit.execute(cmd);
      const returnCode = await session.getReturnCode();

      if (ReturnCode.isSuccess(returnCode)) {
        logger.info('Text overlay added successfully', { component: 'VideoEditingService' });
        return outputPath.startsWith('file://') ? outputPath : `file://${outputPath}`;
      } else {
        const failStackTrace = await session.getFailStackTrace();
        const output = await session.getOutput();
        logger.error('Text overlay failed', {
          component: 'VideoEditingService',
          returnCode,
          failStackTrace,
          output,
        });
        throw new Error(`Text overlay failed: ${failStackTrace || output || 'Unknown error'}`);
      }
    } catch (error) {
      logger.error('Error adding text overlay', error, { component: 'VideoEditingService' });
      throw error;
    }
  }

  /**
   * Adds background music to a video with volume control
   * Mixes the original video audio with background music
   * 
   * @param videoPath - Path to input video file
   * @param musicPath - Path to background music file
   * @param outputPath - Path where the output video will be saved
   * @param options - Volume control options for video and music
   * @returns Promise resolving to the output path
   */
  static async addBackgroundMusic(
    videoPath: string,
    musicPath: string,
    outputPath: string,
    options: BackgroundMusicOptions
  ): Promise<string> {
    try {
      if (!FFmpegKit || !ReturnCode) {
        throw new Error('FFmpegKit is not available');
      }

      // Validate and clamp volume values to valid range
      const videoVolume = Math.max(MIN_VOLUME, Math.min(MAX_VOLUME, options.videoVolume));
      const musicVolume = Math.max(MIN_VOLUME, Math.min(MAX_VOLUME, options.musicVolume));

      if (videoVolume !== options.videoVolume || musicVolume !== options.musicVolume) {
        logger.warn('Volume values were clamped to valid range', {
          component: 'VideoEditingService',
          original: options,
          clamped: { videoVolume, musicVolume },
        });
      }

      // Normalize paths
      const normalizedInput = this.normalizePath(videoPath);
      const normalizedMusic = this.normalizePath(musicPath);
      const normalizedOutput = this.normalizePath(outputPath);

      // Build filter for audio mixing
      // [0:a] is video audio, [1:a] is music
      // Apply volume to each input separately, then mix them together
      // duration=first: end when video ends (don't extend beyond video duration)
      const filter = `[0:a]volume=${videoVolume}[a0];[1:a]volume=${musicVolume}[a1];[a0][a1]amix=inputs=2:duration=first[outa]`;

      // Build FFmpeg command
      // -i: first input (video)
      // -i: second input (music)
      // -filter_complex: complex filter for audio mixing
      // -map 0:v: use video stream from first input
      // -map "[outa]": use mixed audio output
      // -c:v copy: copy video without re-encoding
      // -c:a aac: encode audio to AAC
      // -shortest: end when shortest input ends
      const cmd = `-i "${normalizedInput}" -i "${normalizedMusic}" -filter_complex "${filter}" -map 0:v -map "[outa]" -c:v copy -c:a aac -shortest "${normalizedOutput}"`;

      logger.info('Adding background music to video', {
        component: 'VideoEditingService',
        videoVolume,
        musicVolume,
      });

      // FFmpeg operations are already async and run in background threads
      // No need for InteractionManager wrapper - FFmpegKit handles threading internally
      const session = await FFmpegKit.execute(cmd);
      const returnCode = await session.getReturnCode();

      if (ReturnCode.isSuccess(returnCode)) {
        logger.info('Background music added successfully', { component: 'VideoEditingService' });
        return outputPath.startsWith('file://') ? outputPath : `file://${outputPath}`;
      } else {
        const failStackTrace = await session.getFailStackTrace();
        const output = await session.getOutput();
        logger.error('Background music addition failed', {
          component: 'VideoEditingService',
          returnCode,
          failStackTrace,
          output,
        });
        throw new Error(`Background music addition failed: ${failStackTrace || output || 'Unknown error'}`);
      }
    } catch (error) {
      logger.error('Error adding background music', error, { component: 'VideoEditingService' });
      throw error;
    }
  }

  /**
   * Adjusts the volume of a video's audio
   * 
   * @param videoPath - Path to input video file
   * @param outputPath - Path where the output video will be saved
   * @param volume - Volume level (0.0 to 2.0, where 1.0 is original volume)
   * @returns Promise resolving to the output path
   */
  static async adjustVolume(
    videoPath: string,
    outputPath: string,
    volume: number
  ): Promise<string> {
    try {
      if (!FFmpegKit || !ReturnCode) {
        throw new Error('FFmpegKit is not available');
      }

      // Normalize paths
      const normalizedInput = this.normalizePath(videoPath);
      const normalizedOutput = this.normalizePath(outputPath);

      // Clamp volume to valid range
      const clampedVolume = Math.max(MIN_VOLUME, Math.min(MAX_VOLUME, volume));

      if (clampedVolume !== volume) {
        logger.warn('Volume value was clamped to valid range', {
          component: 'VideoEditingService',
          original: volume,
          clamped: clampedVolume,
        });
      }

      // Build FFmpeg command with volume filter
      const cmd = `-i "${normalizedInput}" -af "volume=${clampedVolume}" -c:v copy -c:a aac "${normalizedOutput}"`;

      logger.info('Adjusting video volume', {
        component: 'VideoEditingService',
        volume: clampedVolume,
      });

      // FFmpeg operations are already async and run in background threads
      // No need for InteractionManager wrapper - FFmpegKit handles threading internally
      const session = await FFmpegKit.execute(cmd);
      const returnCode = await session.getReturnCode();

      if (ReturnCode.isSuccess(returnCode)) {
        logger.info('Volume adjusted successfully', { component: 'VideoEditingService' });
        return outputPath.startsWith('file://') ? outputPath : `file://${outputPath}`;
      } else {
        const failStackTrace = await session.getFailStackTrace();
        const output = await session.getOutput();
        logger.error('Volume adjustment failed', {
          component: 'VideoEditingService',
          returnCode,
          failStackTrace,
          output,
        });
        throw new Error(`Volume adjustment failed: ${failStackTrace || output || 'Unknown error'}`);
      }
    } catch (error) {
      logger.error('Error adjusting volume', error, { component: 'VideoEditingService' });
      throw error;
    }
  }

  /**
   * Trims a video to a specific time range
   * 
   * @param videoPath - Path to input video file
   * @param outputPath - Path where the output video will be saved
   * @param startTime - Start time in seconds
   * @param endTime - End time in seconds
   * @returns Promise resolving to the output path
   */
  static async trimVideo(
    videoPath: string,
    outputPath: string,
    startTime: number,
    endTime: number
  ): Promise<string> {
    try {
      if (!FFmpegKit || !ReturnCode) {
        throw new Error('FFmpegKit is not available');
      }

      if (startTime < 0 || endTime <= startTime) {
        throw new Error('Invalid trim times: startTime must be >= 0 and endTime must be > startTime');
      }

      // Normalize paths
      const normalizedInput = this.normalizePath(videoPath);
      const normalizedOutput = this.normalizePath(outputPath);

      const duration = endTime - startTime;

      // Build FFmpeg command with trim filter
      // -ss: seek to start time
      // -t: duration to output
      // -c copy: copy streams without re-encoding (fast but may not be frame-accurate)
      // For frame-accurate trimming, use -c:v libx264 -c:a aac instead
      const cmd = `-i "${normalizedInput}" -ss ${startTime} -t ${duration} -c:v libx264 -preset medium -c:a aac "${normalizedOutput}"`;

      logger.info('Trimming video', {
        component: 'VideoEditingService',
        startTime,
        endTime,
        duration,
      });

      // FFmpeg operations are already async and run in background threads
      // No need for InteractionManager wrapper - FFmpegKit handles threading internally
      const session = await FFmpegKit.execute(cmd);
      const returnCode = await session.getReturnCode();

      if (ReturnCode.isSuccess(returnCode)) {
        logger.info('Video trimmed successfully', { component: 'VideoEditingService' });
        return outputPath.startsWith('file://') ? outputPath : `file://${outputPath}`;
      } else {
        const failStackTrace = await session.getFailStackTrace();
        const output = await session.getOutput();
        logger.error('Video trimming failed', {
          component: 'VideoEditingService',
          returnCode,
          failStackTrace,
          output,
        });
        throw new Error(`Video trimming failed: ${failStackTrace || output || 'Unknown error'}`);
      }
    } catch (error) {
      logger.error('Error trimming video', error, { component: 'VideoEditingService' });
      throw error;
    }
  }

  /**
   * Crops a video to 9:16 aspect ratio (portrait)
   * Uses normalized pan offset (-1 to 1) to position the crop area
   * 
   * @param videoPath - Path to input video file
   * @param outputPath - Path where the output video will be saved
   * @param width - Original video width
   * @param height - Original video height
   * @param panOffsetX - Normalized horizontal pan offset (-1 to 1, 0 = centered)
   * @param panOffsetY - Normalized vertical pan offset (-1 to 1, 0 = centered)
   * @returns Promise resolving to the output path
   */
  static async cropVideoTo9x16(
    videoPath: string,
    outputPath: string,
    width: number,
    height: number,
    panOffsetX: number = 0,
    panOffsetY: number = 0
  ): Promise<string> {
    try {
      if (!FFmpegKit || !ReturnCode) {
        throw new Error('FFmpegKit is not available');
      }

      const normalizedInput = this.normalizePath(videoPath);
      const normalizedOutput = this.normalizePath(outputPath);

      const TARGET_ASPECT = 9 / 16;
      const sourceAspect = width / height;

      // Calculate crop dimensions (9:16)
      let cropWidth: number;
      let cropHeight: number;
      
      if (sourceAspect > TARGET_ASPECT) {
        // Wider: crop width, keep full height
        cropHeight = height;
        cropWidth = Math.round(height * TARGET_ASPECT);
      } else {
        // Taller: crop height, keep full width
        cropWidth = width;
        cropHeight = Math.round(width / TARGET_ASPECT);
      }

      // Ensure even dimensions (FFmpeg requirement)
      cropWidth = cropWidth % 2 === 0 ? cropWidth : cropWidth - 1;
      cropHeight = cropHeight % 2 === 0 ? cropHeight : cropHeight - 1;

      // Calculate max pan range (how much we can shift from center)
      const maxPanX = sourceAspect > TARGET_ASPECT ? (width - cropWidth) / 2 : 0;
      const maxPanY = sourceAspect <= TARGET_ASPECT ? (height - cropHeight) / 2 : 0;

      // Calculate crop position: center - pan offset (inverted so drag direction matches crop)
      // When user drags right (positive panOffset), crop moves left (shows right side)
      const centerX = (width - cropWidth) / 2;
      const centerY = (height - cropHeight) / 2;
      let x = Math.round(centerX - panOffsetX * maxPanX);
      let y = Math.round(centerY - panOffsetY * maxPanY);

      // Clamp to valid range and ensure even (FFmpeg requirement)
      x = Math.max(0, Math.min(x, width - cropWidth));
      y = Math.max(0, Math.min(y, height - cropHeight));
      x = x % 2 === 0 ? x : x - 1;
      y = y % 2 === 0 ? y : y - 1;

      // FFmpeg crop filter: crop=width:height:x:y
      const cmd = `-i "${normalizedInput}" -vf "crop=${cropWidth}:${cropHeight}:${x}:${y}" -c:v libx264 -preset medium -c:a copy "${normalizedOutput}"`;

      logger.info('Cropping video to 9:16', {
        component: 'VideoEditingService',
        originalSize: `${width}x${height}`,
        cropSize: `${cropWidth}x${cropHeight}`,
        cropPosition: `x=${x}, y=${y}`,
        panOffset: `panX=${panOffsetX}, panY=${panOffsetY}`,
      });

      const session = await FFmpegKit.execute(cmd);
      const returnCode = await session.getReturnCode();

      if (ReturnCode.isSuccess(returnCode)) {
        logger.info('Video cropped successfully', { component: 'VideoEditingService' });
        return outputPath.startsWith('file://') ? outputPath : `file://${outputPath}`;
      } else {
        const failStackTrace = await session.getFailStackTrace();
        const output = await session.getOutput();
        logger.error('Video cropping failed', {
          component: 'VideoEditingService',
          returnCode,
          failStackTrace,
          output,
        });
        throw new Error(`Video cropping failed: ${failStackTrace || output || 'Unknown error'}`);
      }
    } catch (error) {
      logger.error('Error cropping video', error, { component: 'VideoEditingService' });
      throw error;
    }
  }
}

export default VideoEditingService;
