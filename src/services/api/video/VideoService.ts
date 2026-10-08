/**
 * Video Service - app.bsky.video.* namespace operations
 * Handles all video-related API operations
 */

import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import { logger } from '../../../utils/logger';
import { AtprotoCore } from '../core';
import { resolvePdsEndpointForDid } from '../pdsEndpointResolver';
import type { UploadLimitsResponse } from '../types';
import { Agent } from '@atproto/api';
import type { BlobRef } from '@atproto/api';

export interface VideoUploadJobStatus {
  jobId: string;
  state: string; // Can be 'JOB_STATE_COMPLETED', 'JOB_STATE_FAILED', or other processing states
  progress?: number; // 0-100 for current processing state
  blob?: BlobRef;
  error?: string;
}

/** Abort an upload that has sent no bytes for this long. */
const UPLOAD_STALL_TIMEOUT_MS = 60_000;

// Shared video agent instance to avoid recreating
let videoAgentInstance: Agent | null = null;

function getVideoAgent(): Agent {
  if (!videoAgentInstance) {
    videoAgentInstance = new Agent({ service: 'https://video.bsky.app' });
  }
  return videoAgentInstance;
}

export class VideoService {
  /**
   * Ensures the current user may upload a video of this size per Bluesky's
   * app.bsky.video.getUploadLimits response (daily quota and canUpload).
   */
  static async assertVideoUploadAllowed(videoSizeBytes: number): Promise<void> {
    const limits = await this.getUploadLimits();

    if (!limits.canUpload) {
      throw new Error(
        limits.message ||
          limits.error ||
          'Video uploads are not available for your account right now.'
      );
    }

    if (limits.remainingDailyVideos === 0) {
      throw new Error(limits.message || 'Daily video upload limit reached. Try again tomorrow.');
    }

    if (
      typeof limits.remainingDailyBytes === 'number' &&
      limits.remainingDailyBytes >= 0 &&
      videoSizeBytes > limits.remainingDailyBytes
    ) {
      throw new Error(
        limits.message ||
          'This video is larger than your remaining daily upload allowance on Bluesky.'
      );
    }
  }

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

  /**
   * Upload video to Bluesky's video service for processing
   * This is the recommended method that pre-processes video before posting
   * @param videoPath - Path to the video file (file:// URI)
   * @param onProgress - Optional progress callback (0-100)
   * @returns Job status with jobId for tracking
   */
  static async uploadVideo(
    videoPath: string,
    onProgress?: (progress: number) => void
  ): Promise<VideoUploadJobStatus> {
    try {
      await AtprotoCore.ensureSession();
      const { api } = await AtprotoCore.getApiClient();
      // Get user DID and resolve PDS endpoint
      const did = AtprotoCore.getCurrentUserDid();
      if (!did) {
        throw new Error('No user DID available');
      }

      // Resolve PDS endpoint from DID for service auth
      const pdsEndpoint = (await resolvePdsEndpointForDid(did)) || 'https://bsky.social';
      const pdsHost = new URL(pdsEndpoint).host;

      // Create service auth with proper audience format
      const { data: serviceAuth } = await api.com.atproto.server.getServiceAuth({
        aud: `did:web:${pdsHost}`,
        lxm: 'com.atproto.repo.uploadBlob',
        exp: Math.floor(Date.now() / 1000) + 60 * 30, // 30 minutes
      });

      const token = serviceAuth.token;

      // Get video file: on Android fetch(file://) often fails; Blob from ArrayBuffer is not supported.
      // Send ArrayBuffer directly via XHR so server receives raw bytes and can detect content type.
      // On iOS/web, fetch works and we send a Blob.
      let uploadBody: Blob | ArrayBuffer;
      let videoSize: number;
      let videoName: string;

      if (Platform.OS === 'android') {
        const fileUri = videoPath.startsWith('file://') ? videoPath : `file://${videoPath}`;
        const file = new File(fileUri);
        if (!file.exists) {
          throw new Error(`Video file not found: ${videoPath}`);
        }
        videoSize = file.size ?? 0;
        videoName = file.name || videoPath.split('/').pop() || 'video.mp4';
        uploadBody = await file.arrayBuffer();
      } else {
        const videoResponse = await fetch(videoPath);
        if (!videoResponse.ok) {
          throw new Error(
            `Failed to fetch video: ${videoResponse.status} ${videoResponse.statusText}`
          );
        }
        const blob = await videoResponse.blob();
        videoSize = blob.size;
        videoName = videoPath.split('/').pop() || 'video.mp4';
        uploadBody = blob;
      }

      await this.assertVideoUploadAllowed(videoSize);

      // Upload to video service
      const uploadUrl = new URL('https://video.bsky.app/xrpc/app.bsky.video.uploadVideo');
      uploadUrl.searchParams.append('did', did);
      uploadUrl.searchParams.append('name', videoName);

      // Use XMLHttpRequest for upload progress tracking (fetch doesn't support progress)
      // XMLHttpRequest is available in React Native environment

      const jobStatus = await new Promise<VideoUploadJobStatus>((resolve, reject) => {
        // eslint-disable-next-line no-undef
        const xhr = new XMLHttpRequest();

        // Abort a stalled upload instead of hanging forever. Large files on slow links can take
        // minutes, so this is an inactivity limit that resets on every progress event.
        let stallTimer: ReturnType<typeof setTimeout> | null = null;
        const clearStallTimer = () => {
          if (stallTimer) clearTimeout(stallTimer);
          stallTimer = null;
        };
        const armStallTimer = () => {
          clearStallTimer();
          stallTimer = setTimeout(() => {
            xhr.abort();
            reject(new Error('Video upload stalled'));
          }, UPLOAD_STALL_TIMEOUT_MS);
        };
        xhr.addEventListener('loadend', clearStallTimer);

        // Track upload progress (10-40% for file upload)
        xhr.upload.addEventListener('progress', event => {
          armStallTimer();
          if (event.lengthComputable && onProgress) {
            // Map upload progress (0-100%) to overall progress (10-40%)
            // Formula: 10% (start) + (uploaded / total) * 30% (upload range)
            const uploadProgress = 10 + (event.loaded / event.total) * 30;
            onProgress(Math.min(40, uploadProgress));
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const result = JSON.parse(xhr.responseText) as VideoUploadJobStatus;
              resolve(result);
            } catch (error) {
              reject(
                new Error(
                  `Failed to parse upload response: ${error instanceof Error ? error.message : 'Unknown error'}`
                )
              );
            }
          } else {
            reject(new Error(`Video upload failed: ${xhr.status} ${xhr.responseText}`));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Video upload network error'));
        });

        xhr.addEventListener('abort', () => {
          reject(new Error('Video upload aborted'));
        });

        xhr.open('POST', uploadUrl.toString());
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.setRequestHeader('Content-Type', 'video/mp4');
        xhr.setRequestHeader('Content-Length', videoSize.toString());

        // Report initial progress (upload starting)
        if (onProgress) {
          onProgress(10);
        }

        armStallTimer();
        xhr.send(uploadBody);
      });

      // Upload complete - ensure we're at least at 40% to transition to processing stage
      // Don't set progress beyond 40% here - let waitForJob handle 40-90% range
      // This prevents progress from jumping back and forth
      if (onProgress) {
        onProgress(40); // Upload complete, processing will start
      }

      return jobStatus;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error uploading video', error, { component: 'VideoService', videoPath });
      throw new Error(`Video upload failed: ${errorMessage}`, { cause: error });
    }
  }

  /**
   * Get the status of a video processing job
   * @param jobId - The job ID from uploadVideo
   * @returns Current job status with progress and blob if complete
   */
  static async getJobStatus(jobId: string): Promise<VideoUploadJobStatus> {
    try {
      await AtprotoCore.ensureSession();
      const videoAgent = getVideoAgent();
      const { data: status } = await videoAgent.app.bsky.video.getJobStatus({ jobId });

      return {
        jobId: status.jobStatus.jobId,
        state: status.jobStatus.state,
        progress: status.jobStatus.progress,
        blob: status.jobStatus.blob,
        error: status.jobStatus.error,
      };
    } catch (error: unknown) {
      // Handle "already_exists" error - video was previously processed
      if (error && typeof error === 'object' && 'message' in error) {
        const errorObj = error as {
          message?: string;
          data?: { blob?: BlobRef };
          body?: { blob?: BlobRef };
        };
        const errorMessage = errorObj.message;
        if (errorMessage?.includes('already_exists')) {
          const errorData = errorObj.data || errorObj.body;
          if (errorData?.blob) {
            return { jobId, state: 'complete', blob: errorData.blob };
          }
        }
      }
      logger.error('Error getting job status', error, { component: 'VideoService', jobId });
      throw new Error(
        `Failed to get job status: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { cause: error }
      );
    }
  }

  /**
   * Poll for job completion - internal helper
   */
  private static async waitForJobCompletion(
    jobId: string,
    onProgress?: (progress: number) => void,
    maxAttempts: number = 600
  ): Promise<BlobRef> {
    let attempts = 0;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      try {
        const jobStatus = await this.getJobStatus(jobId);

        // Map jobStatus progress to overall progress (40-90% for processing)
        // Ensure progress only increases to prevent jumping backwards
        if (onProgress) {
          let newProgress: number;

          if (
            jobStatus.blob ||
            jobStatus.state === 'JOB_STATE_COMPLETED' ||
            jobStatus.state === 'complete'
          ) {
            newProgress = 90; // Processing complete
          } else if (typeof jobStatus.progress === 'number' && jobStatus.progress > 0) {
            // Use API progress directly: map 0-100 to 40-90%
            newProgress = 40 + (jobStatus.progress / 100) * 50;
          } else {
            // Estimate based on polling attempts when no progress available
            // Start from 40% and gradually increase
            newProgress = Math.min(90, 40 + (attempts / maxAttempts) * 50);
          }

          // Only call onProgress if we have a valid number
          // The store will handle ensuring progress only increases
          if (typeof newProgress === 'number' && !isNaN(newProgress)) {
            onProgress(newProgress);
          }
        }

        if (jobStatus.blob) return jobStatus.blob;
        if (jobStatus.state === 'JOB_STATE_FAILED' || jobStatus.state === 'failed') {
          throw new Error(jobStatus.error || 'Video processing failed');
        }
      } catch (error) {
        // getJobStatus already handles already_exists and returns blob, so if we get here it's a real error
        if (attempts === 0 || attempts % 10 === 0) {
          // Only log every 10 attempts to reduce noise
          logger.warn('Error polling job status', {
            component: 'VideoService',
            error,
            attempts,
            jobId,
          });
        }
      }

      attempts++;
    }

    throw new Error('Video processing timed out');
  }

  /**
   * Upload video and wait for processing to complete
   * @param videoPath - Path to the video file
   * @param onProgress - Optional progress callback (0-100)
   * @returns BlobRef of the processed video
   */
  static async uploadVideoAndWait(
    videoPath: string,
    onProgress?: (progress: number) => void
  ): Promise<BlobRef> {
    const uploadResult = await this.uploadVideo(videoPath, onProgress);

    if (uploadResult.blob) {
      return uploadResult.blob;
    }

    return await this.waitForJobCompletion(uploadResult.jobId, onProgress);
  }

  /**
   * Wait for an existing job to complete
   * @param jobId - The job ID to wait for
   * @param onProgress - Optional progress callback (50-90)
   * @returns BlobRef of the processed video
   */
  static async waitForJob(
    jobId: string,
    onProgress?: (progress: number) => void
  ): Promise<BlobRef> {
    return this.waitForJobCompletion(jobId, onProgress);
  }
}
