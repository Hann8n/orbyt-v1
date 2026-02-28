import { logger } from '../../utils/logger';
import { ensureFileUri, normalizePathForNative } from '../../utils/video/path';

// Lazy import FFmpegKit to avoid errors when native module isn't linked yet
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- FFmpegKit types from native module
let FFmpegKit: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ReturnCode from native module
let ReturnCode: any = null;
try {
  const ffmpegModule = require('ffmpeg-kit-react-native');
  FFmpegKit = ffmpegModule.FFmpegKit;
  ReturnCode = ffmpegModule.ReturnCode;
} catch (_error) {
  logger.warn('FFmpegKit not available - native module not linked', {
    component: 'VideoEditingService',
  });
}

// Audio volume constants
const MIN_VOLUME = 0.0;
const MAX_VOLUME = 2.0; // Allow boosting up to 200% for quiet audio

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
   * Escapes special characters in text for FFmpeg drawtext filter
   * FFmpeg requires escaping of colons, single quotes, backslashes, etc.
   */
  private static escapeText(text: string): string {
    return text
      .replace(/\\/g, '\\\\') // Escape backslashes first
      .replace(/:/g, '\\:') // Escape colons
      .replace(/'/g, "\\'"); // Escape single quotes
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
      const normalizedInput = normalizePathForNative(videoPath);
      const normalizedOutput = normalizePathForNative(outputPath);

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
        const normalizedFontPath = normalizePathForNative(options.fontFile);
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
      if (ReturnCode.isCancel(returnCode)) throw new Error('FFmpeg operation cancelled');
      if (ReturnCode.isSuccess(returnCode)) {
        logger.info('Text overlay added successfully', { component: 'VideoEditingService' });
        return ensureFileUri(outputPath);
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
      const normalizedInput = normalizePathForNative(videoPath);
      const normalizedMusic = normalizePathForNative(musicPath);
      const normalizedOutput = normalizePathForNative(outputPath);

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
      if (ReturnCode.isCancel(returnCode)) throw new Error('FFmpeg operation cancelled');
      if (ReturnCode.isSuccess(returnCode)) {
        logger.info('Background music added successfully', { component: 'VideoEditingService' });
        return ensureFileUri(outputPath);
      } else {
        const failStackTrace = await session.getFailStackTrace();
        const output = await session.getOutput();
        logger.error('Background music addition failed', {
          component: 'VideoEditingService',
          returnCode,
          failStackTrace,
          output,
        });
        throw new Error(
          `Background music addition failed: ${failStackTrace || output || 'Unknown error'}`
        );
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
      const normalizedInput = normalizePathForNative(videoPath);
      const normalizedOutput = normalizePathForNative(outputPath);

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
      if (ReturnCode.isCancel(returnCode)) throw new Error('FFmpeg operation cancelled');
      if (ReturnCode.isSuccess(returnCode)) {
        logger.info('Volume adjusted successfully', { component: 'VideoEditingService' });
        return ensureFileUri(outputPath);
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
        throw new Error(
          'Invalid trim times: startTime must be >= 0 and endTime must be > startTime'
        );
      }

      // Normalize paths
      const normalizedInput = normalizePathForNative(videoPath);
      const normalizedOutput = normalizePathForNative(outputPath);

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
      if (ReturnCode.isCancel(returnCode)) throw new Error('FFmpeg operation cancelled');
      if (ReturnCode.isSuccess(returnCode)) {
        const finalPath = ensureFileUri(outputPath);
        // Brief delay to ensure file is flushed
        await new Promise(resolve => setTimeout(resolve, 100));
        logger.info('Video trimmed successfully', { component: 'VideoEditingService' });
        return finalPath;
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
   * Simplified crop with correct pan offset calculation
   *
   * @param videoPath - Path to input video file
   * @param outputPath - Path where the output video will be saved
   * @param panOffsetX - Normalized horizontal pan offset (-1 to 1, 0 = centered)
   * @param panOffsetY - Normalized vertical pan offset (-1 to 1, 0 = centered)
   * @returns Promise resolving to the output path
   */
  static async cropVideoTo9x16(
    videoPath: string,
    outputPath: string,
    panOffsetX: number = 0,
    panOffsetY: number = 0
  ): Promise<string> {
    try {
      if (!FFmpegKit || !ReturnCode) {
        throw new Error('FFmpegKit is not available');
      }

      const normalizedInput = normalizePathForNative(videoPath);
      const normalizedOutput = normalizePathForNative(outputPath);

      // Clamp pan offsets
      const panX = Math.max(-1, Math.min(1, panOffsetX || 0));
      const panY = Math.max(-1, Math.min(1, panOffsetY || 0));

      // Simple crop: calculate dimensions (ensure even), then position with pan offset
      // When panX is positive (user panned right), show more right side (decrease x)
      // When panY is positive (user panned down), show more bottom (decrease y)
      const cropFilter = `crop='floor(min(iw,ih*9/16)/2)*2':'floor(min(ih,iw*16/9)/2)*2':(iw-ow)/2-${panX}*(iw-ow)/2:(ih-oh)/2-${panY}*(ih-oh)/2`;

      const cmd = `-i "${normalizedInput}" -vf "${cropFilter}" -c:v libx264 -preset medium -c:a copy "${normalizedOutput}"`;

      logger.info('Cropping video to 9:16', { component: 'VideoEditingService', panX, panY });

      const session = await FFmpegKit.execute(cmd);
      const returnCode = await session.getReturnCode();
      if (ReturnCode.isCancel(returnCode)) throw new Error('FFmpeg operation cancelled');
      if (ReturnCode.isSuccess(returnCode)) {
        const finalPath = ensureFileUri(outputPath);
        // Brief delay to ensure file is flushed
        await new Promise(resolve => setTimeout(resolve, 100));
        logger.info('Video cropped successfully', { component: 'VideoEditingService' });
        return finalPath;
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
