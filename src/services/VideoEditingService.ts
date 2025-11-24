import { Platform } from 'react-native';
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

export interface TextOverlayOptions {
  x: string; // e.g., '(w-text_w)/2' for center, '10' for absolute position
  y: string; // e.g., '(h-text_h)/2' for center, '10' for absolute position
  size: number; // Font size in pixels
  color: string; // Hex color like 'white', 'black', or '#FFFFFF'
  fontFile?: string; // Optional path to custom font file
}

export interface BackgroundMusicOptions {
  videoVolume: number; // Volume of original video audio (0.0 to 1.0)
  musicVolume: number; // Volume of background music (0.0 to 1.0)
}

/**
 * VideoEditingService provides advanced video editing capabilities
 * including text overlays, audio mixing, and complex filter operations
 */
class VideoEditingService {
  /**
   * Normalizes a file path for FFmpeg usage
   * - Removes file:// prefix
   * - Adds leading slash for iOS if needed
   */
  private static normalizePath(path: string): string {
    let normalized = path.replace('file://', '');
    if (Platform.OS === 'ios' && !normalized.startsWith('/')) {
      normalized = '/' + normalized;
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
      const cmd = `-i "${normalizedInput}" -vf "${drawTextFilter}" -c:v libx264 -preset medium -c:a copy "${normalizedOutput}"`;

      logger.info('Adding text overlay to video', {
        component: 'VideoEditingService',
        text: text,
        options,
      });

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

      // Normalize paths
      const normalizedInput = this.normalizePath(videoPath);
      const normalizedMusic = this.normalizePath(musicPath);
      const normalizedOutput = this.normalizePath(outputPath);

      // Build filter for audio mixing
      // [0:a] is video audio, [1:a] is music
      // Apply volume to each input separately, then mix them together
      // duration=first: end when video ends (don't extend beyond video duration)
      const filter = `[0:a]volume=${options.videoVolume}[a0];[1:a]volume=${options.musicVolume}[a1];[a0][a1]amix=inputs=2:duration=first[outa]`;

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
        options,
      });

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

      // Clamp volume to reasonable range
      const clampedVolume = Math.max(0, Math.min(2, volume));

      // Build FFmpeg command with volume filter
      const cmd = `-i "${normalizedInput}" -af "volume=${clampedVolume}" -c:v copy -c:a aac "${normalizedOutput}"`;

      logger.info('Adjusting video volume', {
        component: 'VideoEditingService',
        volume: clampedVolume,
      });

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
}

export default VideoEditingService;
