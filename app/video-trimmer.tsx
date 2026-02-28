import React, { useEffect, useRef, useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import VideoTrim, { showEditor, isValidFile, type Spec } from 'react-native-clip-trim';
import { resolveVideoPath } from '../src/utils/video/path';
import { useVideoTrimStore } from '../src/stores/videoTrimStore';
import VideoProcessingService from '../src/services/video/VideoProcessingService';
import { Colors } from '../src/theme';

const VideoTrimmerScreen: React.FC = () => {
  const params = useLocalSearchParams<{
    videoPath: string;
    assetId?: string;
    returnTo?: string;
    maxDuration?: string;
    currentDuration?: string;
  }>();
  const router = useRouter();
  const listeners = useRef<{
    onFinishTrimming?: { remove: () => void };
    onError?: { remove: () => void };
  }>({});
  const hasOpenedEditor = useRef(false);
  const didSucceed = useRef(false);
  const setPendingTrim = useVideoTrimStore(state => state.setPendingTrim);

  const handleTrimmingComplete = useCallback(
    async ({
      outputPath,
      duration,
    }: {
      outputPath: string;
      startTime: number;
      endTime: number;
      duration: number;
    }) => {
      try {
        didSucceed.current = true;
        const trimmedDuration = duration / 1000;

        let finalDuration = trimmedDuration;
        try {
          const videoInfo = await VideoProcessingService.getVideoInfo(outputPath);
          finalDuration = videoInfo.duration;
        } catch {
          // Use duration from trimmer if video info fetch fails
        }

        setPendingTrim({
          videoPath: outputPath.startsWith('file://') ? outputPath : `file://${outputPath}`,
          duration: finalDuration,
        });
        router.back();
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to process trimmed video';
        Alert.alert('Error', errorMessage);
        router.back();
      }
    },
    [setPendingTrim, router]
  );

  const handleTrimError = useCallback(
    (message?: string) => {
      if (didSucceed.current) return;
      if (message?.toLowerCase().includes('cancel')) {
        router.back();
        return;
      }
      Alert.alert('Error', message || 'Failed to trim video');
      router.back();
    },
    [router]
  );

  useEffect(() => {
    const NativeVideoTrim = VideoTrim as Spec;
    listeners.current.onFinishTrimming = NativeVideoTrim.onFinishTrimming(handleTrimmingComplete);
    listeners.current.onError = NativeVideoTrim.onError(({ message }: { message?: string }) =>
      handleTrimError(message)
    );
    const currentListeners = listeners.current;

    return () => {
      currentListeners.onFinishTrimming?.remove();
      currentListeners.onError?.remove();
    };
  }, [handleTrimmingComplete, handleTrimError]);

  const openTrimmer = useCallback(async () => {
    if (!params.videoPath) {
      Alert.alert('Error', 'No video path provided');
      router.back();
      return;
    }

    try {
      // Resolve video path (handles iCloud downloads, path normalization)
      const pathInfo = await resolveVideoPath(params.videoPath, params.assetId || null);
      const normalizedUri = pathInfo.localPath; // Remove file:// prefix for react-native-clip-trim

      // Validate file and get actual video duration
      const validationResult = await isValidFile(normalizedUri);
      if (!validationResult.isValid) {
        Alert.alert('Error', 'Invalid video file');
        router.back();
        return;
      }

      // Get actual video duration in milliseconds from validation result (already in ms)
      const actualVideoDurationMs = validationResult.duration;

      // Calculate max duration constraint in milliseconds (user's limit)
      const maxDurationMs = params.maxDuration ? parseFloat(params.maxDuration) * 1000 : undefined;
      const currentDuration = params.currentDuration ? parseFloat(params.currentDuration) : 0;
      const remainingDurationMs =
        maxDurationMs && currentDuration ? maxDurationMs - currentDuration * 1000 : maxDurationMs;

      // Use the minimum of remaining duration and actual video duration
      // This ensures the trimmer works correctly even if video is shorter than remaining time
      // If no constraint, use actual video duration; otherwise use the minimum
      // NOTE: iOS has a bug where it treats maxDuration/minDuration as seconds instead of milliseconds
      // Android expects milliseconds, so we need to pass seconds for iOS, milliseconds for Android
      const effectiveMaxDuration = remainingDurationMs
        ? Math.min(remainingDurationMs, actualVideoDurationMs)
        : actualVideoDurationMs;

      const effectiveMinDuration = 500; // 0.5 seconds minimum in milliseconds

      didSucceed.current = false;
      showEditor(normalizedUri, {
        maxDuration: Platform.OS === 'ios' ? effectiveMaxDuration / 1000 : effectiveMaxDuration,
        minDuration: Platform.OS === 'ios' ? effectiveMinDuration / 1000 : effectiveMinDuration,
        saveToPhoto: false,
        openShareSheetOnFinish: false,
        removeAfterSavedToPhoto: false,
        headerText: 'Trim Video',
        cancelButtonText: 'Cancel',
        saveButtonText: 'Done',
        trimmerColor: Colors.purple[500],
        enableCancelTrimming: true,
        closeWhenFinish: true,
        autoplay: true,
        fullScreenModalIOS: true, // Use fullscreen modal on iOS to prevent view issues
      });
    } catch {
      Alert.alert('Error', 'Failed to open video trimmer');
      router.back();
    }
  }, [params.videoPath, params.assetId, params.maxDuration, params.currentDuration, router]);

  // Open the trimmer when component mounts
  useEffect(() => {
    if (params.videoPath && !hasOpenedEditor.current) {
      hasOpenedEditor.current = true;
      openTrimmer();
    }
  }, [params.videoPath, openTrimmer]);

  // Since react-native-clip-trim shows a native full-screen editor,
  // we don't render any UI. The editor handles its own UI.
  return null;
};

export default VideoTrimmerScreen;
