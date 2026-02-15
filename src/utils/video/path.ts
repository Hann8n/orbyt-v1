/**
 * Video Path Utilities
 * Handles path normalization and validation for video files across the app.
 * Uses MediaLibrary for iCloud downloads and copies to sandbox when needed.
 */

import { Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { File, Directory, Paths } from 'expo-file-system';
import { logger } from '../logger';

const DEBUG = __DEV__;

/**
 * Video path info returned from resolution
 */
export interface VideoPathInfo {
  uri: string; // Final URI ready for use (always has file:// prefix)
  localPath: string; // Path without file:// prefix
  exists: boolean; // Whether the file exists
  size: number; // File size in bytes (0 if unknown)
  source: 'local' | 'icloud' | 'sandbox' | 'processed'; // Where the file came from
}

/**
 * Checks if a path is in the iOS Photos library (needs to be copied to sandbox)
 */
function isPhotosLibraryPath(path: string): boolean {
  if (Platform.OS !== 'ios') return false;
  const normalized = path.replace('file://', '');
  return (
    normalized.includes('/Media/PhotoData/') ||
    normalized.includes('/Media/DCIM/') ||
    normalized.includes('/PhotoData/CPLAssets/')
  );
}

/**
 * Strips fragment identifiers (#...) from file paths
 * iOS asset URIs may include fragment identifiers that need to be removed
 */
function stripFragment(path: string): string {
  const fragmentIndex = path.indexOf('#');
  return fragmentIndex >= 0 ? path.substring(0, fragmentIndex) : path;
}

/**
 * Normalizes a path to have proper format
 * - Removes file:// prefix for file operations
 * - Strips fragment identifiers
 * - Ensures absolute path on iOS
 */
function normalizePath(path: string): string {
  if (!path) return '';

  // Remove file:// prefix
  let normalized = path.replace(/^file:\/\//, '');

  // Strip fragment identifiers (iOS asset URIs)
  normalized = stripFragment(normalized);

  // Ensure absolute path on iOS
  if (Platform.OS === 'ios' && normalized && !normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }

  return normalized;
}

/**
 * Adds file:// prefix if not present
 */
function toFileUri(path: string): string {
  if (!path) return '';
  const normalized = normalizePath(path);
  return normalized.startsWith('file://') ? normalized : `file://${normalized}`;
}

/**
 * Copies a video from Photos library to app sandbox for playback
 * iOS doesn't allow direct video playback from Photos library paths
 * Uses expo-file-system Directory/File and Paths per https://docs.expo.dev/versions/latest/sdk/filesystem/
 */
async function copyToSandboxIfNeeded(path: string): Promise<{ path: string; copied: boolean }> {
  if (!isPhotosLibraryPath(path)) {
    return { path, copied: false };
  }

  const logPrefix = '[VideoPath]';

  try {
    const sandboxDir = new Directory(Paths.cache, 'video_sandbox');
    sandboxDir.create({ intermediates: true, idempotent: true });

    const ext = Paths.extname(path).toLowerCase() || '.mp4';
    const extWithoutDot = ext.startsWith('.') ? ext.slice(1) : ext;
    const destFile = new File(sandboxDir, `video_${Date.now()}.${extWithoutDot}`);

    const sourceFile = new File(path);
    if (sourceFile.exists) {
      sourceFile.copy(destFile);
      if (destFile.exists) {
        if (DEBUG) {
          logger.info(`${logPrefix} Copied to sandbox`, {
            component: 'videoPath',
            dest: destFile.uri.substring(destFile.uri.length - 50),
          });
        }
        const destPath = destFile.uri.replace(/^file:\/\//, '');
        return { path: destPath, copied: true };
      }
    }
  } catch (error) {
    logger.warn(`${logPrefix} Failed to copy to sandbox`, {
      component: 'videoPath',
      error,
    });
  }

  return { path, copied: false };
}

/**
 * Resolves a video path to a local, playable URI
 * Handles iCloud downloads using MediaLibrary and copies Photos library files to sandbox
 *
 * @param videoPath - The video path (may be file://, ph://, or raw path)
 * @param assetId - Optional MediaLibrary asset ID for iCloud videos
 * @returns VideoPathInfo with resolved path and metadata
 */
export async function resolveVideoPath(
  videoPath: string,
  assetId?: string | null
): Promise<VideoPathInfo> {
  const logPrefix = '[VideoPath]';

  if (DEBUG) {
    logger.info(`${logPrefix} Resolving path`, {
      component: 'videoPath',
      input: videoPath?.substring(0, 100),
      hasAssetId: !!assetId,
    });
  }

  if (!videoPath) {
    logger.warn(`${logPrefix} Empty video path provided`, { component: 'videoPath' });
    return {
      uri: '',
      localPath: '',
      exists: false,
      size: 0,
      source: 'local',
    };
  }

  let localPath = normalizePath(videoPath);
  let source: 'local' | 'icloud' | 'sandbox' | 'processed' = 'local';

  // Try to resolve via MediaLibrary if we have an assetId (handles iCloud downloads)
  if (assetId && Platform.OS === 'ios') {
    try {
      if (DEBUG) {
        logger.info(`${logPrefix} Attempting MediaLibrary lookup for assetId`, {
          component: 'videoPath',
          assetId,
        });
      }

      const assetInfo = await MediaLibrary.getAssetInfoAsync(assetId, {
        shouldDownloadFromNetwork: true, // Download from iCloud if needed
      });

      if (assetInfo.localUri) {
        localPath = normalizePath(assetInfo.localUri);
        source = 'icloud';

        if (DEBUG) {
          logger.info(`${logPrefix} Got localUri from MediaLibrary`, {
            component: 'videoPath',
            localUri: localPath.substring(0, 100),
          });
        }
      }
    } catch (mediaError) {
      logger.warn(`${logPrefix} MediaLibrary lookup failed, using original path`, {
        component: 'videoPath',
        error: mediaError,
      });
      // Continue with original path
    }
  }

  // Copy Photos library files to sandbox for playback
  if (isPhotosLibraryPath(localPath)) {
    const { path: sandboxPath, copied } = await copyToSandboxIfNeeded(localPath);
    if (copied) {
      localPath = sandboxPath;
      source = 'sandbox';
    }
  }

  // Validate file exists
  // Use full URI (with file:// prefix) for File constructor to avoid "URI is not absolute" errors on Android
  let exists = false;
  let size = 0;

  try {
    const fileUri = toFileUri(localPath);
    const file = new File(fileUri);
    exists = file.exists;
    size = file.size || 0;

    if (DEBUG) {
      logger.info(`${logPrefix} File validation`, {
        component: 'videoPath',
        exists,
        size,
        path: localPath.substring(0, 100),
      });
    }
  } catch (error) {
    logger.warn(`${logPrefix} File validation failed`, {
      component: 'videoPath',
      error,
      path: localPath.substring(0, 50),
    });
  }

  // If this looks like a processed video path (contains cache or temp dirs)
  if (source === 'local' && (localPath.includes('/Caches/') || localPath.includes('/tmp/'))) {
    source = 'processed';
  }

  const result: VideoPathInfo = {
    uri: toFileUri(localPath),
    localPath,
    exists,
    size,
    source,
  };

  if (DEBUG) {
    logger.info(`${logPrefix} Resolution complete`, {
      component: 'videoPath',
      uri: result.uri.substring(0, 100),
      exists: result.exists,
      source: result.source,
    });
  }

  return result;
}

/**
 * Quick check if a video path is valid (exists and is non-empty)
 */
export async function isValidVideoPath(
  videoPath: string,
  assetId?: string | null
): Promise<boolean> {
  const info = await resolveVideoPath(videoPath, assetId);
  return info.exists && info.uri.length > 0;
}

/** Asset shape from expo-image-picker (assetId) or expo-media-library (id) */
type AssetLike = { assetId?: string; id?: string } | null | undefined;

/**
 * Extract assetId from an ImagePickerAsset or similar object
 */
export function extractAssetId(asset: AssetLike): string | null {
  if (!asset) return null;

  // ImagePickerAsset has assetId
  if (typeof asset.assetId === 'string') {
    return asset.assetId;
  }

  // MediaLibrary Asset has id
  if (typeof asset.id === 'string') {
    return asset.id;
  }

  return null;
}

/**
 * Debug: Log all relevant info about a video path
 */
export function debugVideoPath(label: string, path: string, asset?: AssetLike): void {
  if (!DEBUG) return;

  logger.debug(`VideoPath Debug: ${label}`, {
    component: 'videoPath',
    path: path?.substring(0, 100) || 'null',
    hasFilePrefix: path?.startsWith('file://'),
    hasFragment: path?.includes('#'),
    assetId: extractAssetId(asset) || 'none',
    assetType: asset ? typeof asset : undefined,
    assetKeys: asset ? Object.keys(asset).join(', ') : undefined,
  });
}
