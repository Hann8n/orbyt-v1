/**
 * Video Service - app.bsky.video.* namespace operations
 * Handles all video-related API operations
 */

import { logger } from '../../../utils/logger';
import { AtprotoCore } from '../core';
import type {
  UploadLimitsResponse,
} from '../types';

export class VideoService {
  /**
   * Get video upload limits for the authenticated user
   * @returns Upload limits including remainingDailyVideos, remainingDailyBytes, and canUpload flag
   */
  static async getUploadLimits(): Promise<UploadLimitsResponse> {
    try {
      await AtprotoCore.ensureSession();
      const { api } = await AtprotoCore.getApiClient();
      
      const response = await api.app.bsky.video.getUploadLimits();
      
      return {
        canUpload: response.data.canUpload ?? true,
        remainingDailyVideos: response.data.remainingDailyVideos,
        remainingDailyBytes: response.data.remainingDailyBytes,
        message: response.data.message,
        error: response.data.error,
      };
    } catch (error: unknown) {
      logger.error('Error getting upload limits', error, { component: 'VideoService' });
      // Return default values if API call fails
      return {
        canUpload: true,
        remainingDailyVideos: undefined,
        remainingDailyBytes: undefined,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
