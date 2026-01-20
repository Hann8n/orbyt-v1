/**
 * useVideoUpload Hook
 * Simplified upload state using MMKV for persistence
 * Optimized to use single store subscription
 */

import { useMemo, useCallback } from 'react';
import { useUIStore } from '../stores/uiStore';
import { storage } from '../utils/storage/storage';

const UPLOAD_KEY = 'video-upload';
const THUMBNAIL_KEY = 'video-upload-thumbnail';

export type UploadStatus = 'idle' | 'uploading' | 'processing' | 'complete' | 'error';

/**
 * Hook for video upload state - optimized with single store subscription
 */
export function useVideoUpload() {
  const progress = useUIStore(state => state.getProgress(UPLOAD_KEY));
  const isUploading = useUIStore(state => state.getLoading(UPLOAD_KEY));
  const setProgressFn = useUIStore(state => state.setProgress);
  const setLoadingFn = useUIStore(state => state.setLoading);
  const clearProgressFn = useUIStore(state => state.clearProgress);

  const thumbnailUri = storage.getString(THUMBNAIL_KEY) || null;

  const status: UploadStatus = useMemo(() => {
    if (!isUploading && progress === 0) {
      return 'idle';
    }
    if (progress >= 100) {
      return 'complete';
    }
    // Upload stage: 10-40%, Processing stage: 40-90%, Post creation: 90-100%
    if (isUploading && progress < 40) {
      return 'uploading';
    }
    if (isUploading && progress >= 40 && progress < 100) {
      return 'processing';
    }
    return 'error';
  }, [isUploading, progress]);

  const setProgress = useCallback(
    (p: number) => {
      setProgressFn(UPLOAD_KEY, Math.max(0, Math.min(100, p)));
    },
    [setProgressFn]
  );

  const setLoading = useCallback(
    (loading: boolean) => {
      setLoadingFn(UPLOAD_KEY, loading);
    },
    [setLoadingFn]
  );

  const setThumbnail = useCallback((uri: string | null) => {
    if (uri) {
      storage.set(THUMBNAIL_KEY, uri);
    } else {
      storage.delete(THUMBNAIL_KEY);
    }
  }, []);

  const reset = useCallback(() => {
    setLoadingFn(UPLOAD_KEY, false);
    clearProgressFn(UPLOAD_KEY);
    storage.delete(THUMBNAIL_KEY);
  }, [setLoadingFn, clearProgressFn]);

  return {
    progress,
    status,
    thumbnailUri,
    isUploading,
    setProgress,
    setLoading,
    setThumbnail,
    reset,
  };
}
