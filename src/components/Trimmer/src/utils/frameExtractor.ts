import { Platform } from 'react-native';
import { File, Directory, Paths } from 'expo-file-system';
import { logger } from '../../../../utils/logger';

// Lazy import FFmpegKit to avoid errors when native module isn't linked yet
let FFmpegKit: any = null;
let ReturnCode: any = null;
try {
  const ffmpegModule = require('ffmpeg-kit-react-native');
  FFmpegKit = ffmpegModule.FFmpegKit;
  ReturnCode = ffmpegModule.ReturnCode;
} catch (error) {
  logger.warn('FFmpegKit not available - native module not linked', { component: 'frameExtractor' });
}

export interface FrameInfo {
  time: number; // Time in seconds
  uri: string; // File URI for the frame image
}

/**
 * Normalizes a file path for FFmpeg usage
 */
function normalizePath(path: string): string {
  if (!path) {
    throw new Error('Path cannot be empty');
  }
  
  let normalized = path.replace(/^file:\/\//, '');
  
  if (Platform.OS === 'ios') {
    if (normalized && !normalized.startsWith('/')) {
      normalized = '/' + normalized;
    }
  }
  
  return normalized;
}

/**
 * Extracts frames from a video at regular intervals
 * @param videoPath - Path to input video file
 * @param duration - Video duration in seconds
 * @param frameCount - Number of frames to extract (default: 10)
 * @returns Promise resolving to array of frame info with time and URI
 */
export async function extractFrames(
  videoPath: string,
  duration: number,
  frameCount: number = 10
): Promise<FrameInfo[]> {
  try {
    if (!FFmpegKit || !ReturnCode) {
      logger.warn('FFmpegKit not available, skipping frame extraction', { component: 'frameExtractor' });
      return [];
    }

    if (!videoPath || duration <= 0) {
      return [];
    }

    // Create temporary directory for frames
    const timestamp = Date.now();
    const tempDir = new Directory(Paths.cache, `video_frames_${timestamp}`);
    await tempDir.create({ intermediates: true });

    // Normalize input path
    const normalizedInput = normalizePath(videoPath);

    // Calculate frame interval - distribute frames evenly across duration
    const interval = duration / (frameCount + 1); // +1 to avoid extracting at the very end

    const frames: FrameInfo[] = [];
    const MAX_CONCURRENT = 2; // Limit concurrent extractions for faster overall processing
    const extractPromises: Promise<void>[] = [];

    // Extract frames with limited concurrency
    for (let i = 0; i < frameCount; i++) {
      const time = interval * (i + 1);
      const frameFile = new File(tempDir, `frame_${i}.jpg`);
      const framePath = frameFile.uri.replace(/^file:\/\//, '');
      
      // Ensure absolute path for iOS
      const normalizedFramePath = Platform.OS === 'ios' && !framePath.startsWith('/')
        ? '/' + framePath
        : framePath;

      // Build FFmpeg command to extract frame at specific time
      // -ss: seek to time (before -i for faster seeking)
      // -i: input video
      // -frames:v 1: extract only 1 frame
      // -update 1: write single image (fixes image2 warning)
      // -q:v 6: lower quality JPEG for faster processing (6 is still acceptable for thumbnails)
      // -vf: video filter to scale to smaller size for faster processing (width 120, maintain aspect ratio)
      //      format=yuv420p ensures proper pixel format conversion
      // -pix_fmt yuvj420p: specify full-range pixel format for JPEG (prevents deprecated format warning)
      // -y: overwrite output file
      const escapedInput = normalizedInput.replace(/"/g, '\\"').replace(/\\/g, '\\\\');
      const escapedOutput = normalizedFramePath.replace(/"/g, '\\"').replace(/\\/g, '\\\\');
      // Use format filter to ensure proper pixel format conversion
      const cmd = `-ss ${time.toFixed(2)} -i "${escapedInput}" -frames:v 1 -update 1 -vf "format=yuv420p,scale=120:-1" -pix_fmt yuvj420p -q:v 6 -y "${escapedOutput}"`;

      extractPromises.push(
        (async () => {
          try {
            const session = await FFmpegKit.execute(cmd);
            const returnCode = await session.getReturnCode();

            if (ReturnCode.isSuccess(returnCode)) {
              // Verify file exists
              const file = new File(normalizedFramePath);
              if (file.exists) {
                frames.push({
                  time,
                  uri: frameFile.uri.startsWith('file://') ? frameFile.uri : `file://${frameFile.uri}`,
                });
              } else {
                logger.warn(`Frame file not created at ${normalizedFramePath}`, { component: 'frameExtractor' });
              }
            } else {
              const output = await session.getOutput();
              const failStackTrace = await session.getFailStackTrace();
              logger.warn(`Frame extraction failed at ${time}s`, { 
                component: 'frameExtractor',
                returnCode,
                output: output?.substring(0, 200), // Limit output length
                stackTrace: failStackTrace?.substring(0, 200)
              });
            }
          } catch (error) {
            logger.warn(`Error extracting frame at ${time}s`, { 
              component: 'frameExtractor', 
              error: error instanceof Error ? error.message : String(error)
            });
          }
        })()
      );

      // Limit concurrent extractions
      if (extractPromises.length >= MAX_CONCURRENT || i === frameCount - 1) {
        await Promise.all(extractPromises);
        extractPromises.length = 0; // Clear array for next batch
      }
    }

    // Sort frames by time
    frames.sort((a, b) => a.time - b.time);

    logger.info(`Extracted ${frames.length} frames from video`, {
      component: 'frameExtractor',
      requested: frameCount,
      extracted: frames.length,
    });

    return frames;
  } catch (error) {
    logger.error('Error extracting frames', error, { component: 'frameExtractor' });
    return [];
  }
}
