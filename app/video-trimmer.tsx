import React, { useEffect, useRef, useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { NativeEventEmitter, NativeModules } from 'react-native';
import { showEditor, isValidFile, type Spec } from 'react-native-video-trim';
import { resolveVideoPath } from '../src/utils/videoPath';
import { useVideoTrimStore } from '../src/stores/videoTrimStore';
import VideoProcessingService from '../src/services/VideoProcessingService';
import { Colors } from '../src/components/ui/UI';

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
    onFinishTrimming?: import('react-native').EmitterSubscription | (() => void) | { remove: () => void };
    onError?: import('react-native').EmitterSubscription | (() => void) | { remove: () => void };
  }>({});
  const hasOpenedEditor = useRef(false);
  const setPendingTrim = useVideoTrimStore(state => state.setPendingTrim);

  const handleTrimmingComplete = useCallback(async ({ outputPath, duration }: { outputPath: string; startTime: number; endTime: number; duration: number }) => {
    try {
      // Convert milliseconds to seconds
      const trimmedDuration = duration / 1000;
      
      // Get video info to ensure we have accurate duration
      let finalDuration = trimmedDuration;
      try {
        const videoInfo = await VideoProcessingService.getVideoInfo(outputPath);
        finalDuration = videoInfo.duration;
      } catch (error) {
        console.warn('Failed to get video info, using duration from trimmer:', error);
      }

      // Save to videoTrimStore for create.tsx to pick up
      setPendingTrim({
        videoPath: outputPath.startsWith('file://') ? outputPath : `file://${outputPath}`,
        duration: finalDuration,
      });

      // Navigate back to create screen
      router.back();
    } catch (error: any) {
      console.error('Error handling trim completion:', error);
      Alert.alert('Error', error.message || 'Failed to process trimmed video');
      router.back();
    }
  }, [setPendingTrim, router]);

  // Set up event listeners for react-native-video-trim using Spec API
  useEffect(() => {
    const NativeVideoTrim = NativeModules.VideoTrim as unknown as Spec & Partial<import('react-native').NativeModule>;
    
    // Use the new Spec API if available, otherwise fall back to old architecture
    if (NativeVideoTrim && typeof NativeVideoTrim.onFinishTrimming === 'function') {
      listeners.current.onFinishTrimming = NativeVideoTrim.onFinishTrimming(handleTrimmingComplete);
      listeners.current.onError = NativeVideoTrim.onError(({ message, errorCode }: { message?: string; errorCode?: string }) => {
        console.error('Trimming error:', message, errorCode);
        Alert.alert('Error', message || 'Failed to trim video');
        router.back();
      });
    } else {
      // Fallback to old architecture
      const eventEmitter = new NativeEventEmitter(NativeVideoTrim as import('react-native').NativeModule);
      listeners.current.onFinishTrimming = eventEmitter.addListener(
        'VideoTrim',
        (event: { name?: string; [key: string]: unknown }) => {
          if (event.name === 'onFinishTrimming') {
            // Extract data from event (old architecture includes name property)
            const { name, ...data } = event;
            handleTrimmingComplete(data as Parameters<typeof handleTrimmingComplete>[0]);
          }
        }
      );
      listeners.current.onError = eventEmitter.addListener(
        'VideoTrim',
        (event: { name?: string; message?: string; errorCode?: string }) => {
          if (event.name === 'onError') {
            console.error('Trimming error:', event.message, event.errorCode);
            Alert.alert('Error', event.message || 'Failed to trim video');
            router.back();
          }
        }
      );
    }

    return () => {
      if (listeners.current.onFinishTrimming && 'remove' in listeners.current.onFinishTrimming) {
        listeners.current.onFinishTrimming.remove();
      } else if (typeof listeners.current.onFinishTrimming === 'function') {
        listeners.current.onFinishTrimming();
      }
      if (listeners.current.onError && 'remove' in listeners.current.onError) {
        listeners.current.onError.remove();
      } else if (typeof listeners.current.onError === 'function') {
        listeners.current.onError();
      }
    };
  }, [handleTrimmingComplete, router]);

  // Open the trimmer when component mounts
  useEffect(() => {
    if (params.videoPath && !hasOpenedEditor.current) {
      hasOpenedEditor.current = true;
      openTrimmer();
    }
  }, [params.videoPath]);

  const openTrimmer = async () => {
    if (!params.videoPath) {
      Alert.alert('Error', 'No video path provided');
      router.back();
      return;
    }

    try {
      // Resolve video path (handles iCloud downloads, path normalization)
      const pathInfo = await resolveVideoPath(params.videoPath, params.assetId || null);
      const normalizedUri = pathInfo.localPath; // Remove file:// prefix for react-native-video-trim

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
      const maxDurationMs = params.maxDuration 
        ? parseFloat(params.maxDuration) * 1000 
        : undefined;
      const currentDuration = params.currentDuration 
        ? parseFloat(params.currentDuration) 
        : 0;
      const remainingDurationMs = maxDurationMs && currentDuration 
        ? (maxDurationMs - (currentDuration * 1000))
        : maxDurationMs;

      // Use the minimum of remaining duration and actual video duration
      // This ensures the trimmer works correctly even if video is shorter than remaining time
      // If no constraint, use actual video duration; otherwise use the minimum
      // NOTE: iOS has a bug where it treats maxDuration/minDuration as seconds instead of milliseconds
      // Android expects milliseconds, so we need to pass seconds for iOS, milliseconds for Android
      const effectiveMaxDuration = remainingDurationMs 
        ? Math.min(remainingDurationMs, actualVideoDurationMs)
        : actualVideoDurationMs;
      
      const effectiveMinDuration = 500; // 0.5 seconds minimum in milliseconds

      // Show the video trimmer editor
      showEditor(normalizedUri, {
        maxDuration: Platform.OS === 'ios' ? effectiveMaxDuration / 1000 : effectiveMaxDuration,
        minDuration: Platform.OS === 'ios' ? effectiveMinDuration / 1000 : effectiveMinDuration,
        saveToPhoto: false,
        openShareSheetOnFinish: false,
        removeAfterSavedToPhoto: false,
        headerText: 'Trim Video',
        cancelButtonText: 'Cancel',
        saveButtonText: 'Done',
        trimmerColor: Colors.blurple,
        enableCancelTrimming: true,
        closeWhenFinish: true,
        autoplay: true,
        fullScreenModalIOS: true, // Use fullscreen modal on iOS to prevent view issues
      });
    } catch (error) {
      console.error('Error opening trimmer:', error);
      Alert.alert('Error', 'Failed to open video trimmer');
      router.back();
    }
  };


  // Since react-native-video-trim shows a native full-screen editor,
  // we don't render any UI. The editor handles its own UI.
  return null;
};

export default VideoTrimmerScreen;
