import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { BORDER_RADIUS } from '../src/utils/constants';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  Platform,
  StatusBar,
  AppState,
  type EventSubscription,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CameraView,
  useCameraPermissions,
  useMicrophonePermissions,
  CameraRecordingOptions,
} from 'expo-camera';
import { useRouter, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  useFrameCallback,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Icon, { CloseFillIcon, ArrowRightFillIcon } from '../src/components/ui/Icon';
import BottomToolBar from '../src/components/ui/BottomToolBar';
import * as Device from 'expo-device';
import { getBottomNavBarHeight } from '@/utils/device/screen';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
import { logger } from '@/utils/logger';
import { Colors } from '../src/theme';
import { hexToRGBA } from '../src/utils/formatting/colors';
import * as Haptics from 'expo-haptics';
import VideoTrim, { showEditor, isValidFile, type Spec } from 'react-native-clip-trim';
import { SegmentManager, type Segment } from '../src/utils/video/segmentManager';
import VideoProcessingService from '../src/services/video/VideoProcessingService';
import { usePendingVideoPostStore } from '../src/stores/pendingVideoPostStore';

// Duration options in seconds
const DURATION_OPTIONS = [
  { value: 6, label: '6s' },
  { value: 16, label: '16s' },
  { value: 60, label: '1m' },
  { value: 180, label: '3m' },
] as const;

const CAPTURE_BUTTON_INNER_BG = 'rgba(129, 136, 150, 0.4)';
const CAPTURE_BUTTON_INNER_DISABLED_BG = 'rgba(129, 136, 150, 0.2)';
const DIGITAL_ZOOM_PRESETS = [0.5, 1, 2, 3, 5, 10] as const;
/** Minimum segment duration (seconds). Shorter clips often have invalid timestamps after camera switch. */
const MIN_RECORDING_DURATION = 0.4;

function lensToLabel(lens: string): string {
  const n = lens.toLowerCase();
  if (n.includes('ultra wide') || n.includes('ultra-wide') || n.includes('ultrawide')) return '.5x';
  if (n.includes('telephoto')) return '2x';
  return '1x';
}

interface DeletePreviewState {
  segmentUri: string;
  segmentDuration: number;
  segmentStartTime: number;
  segmentEndTime: number;
}

const CreateScreen: React.FC = () => {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();
  const [isRecording, setIsRecording] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(false);
  const [flash, setFlash] = useState<'off' | 'on'>('off');
  const [zoom, setZoom] = useState(0); // Zoom level: 0-1 (0 = no zoom, 1 = max zoom)
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingFromGallery, setIsLoadingFromGallery] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState(16); // Default to 16 seconds
  const [isZoomExpanded, setIsZoomExpanded] = useState(false);
  const [availableLenses, setAvailableLenses] = useState<string[]>([]);
  const [lensDataReceived, setLensDataReceived] = useState(false);
  const [selectedLens, setSelectedLens] = useState<string | null>(null);
  const [selectedPresetLabel, setSelectedPresetLabel] = useState('1x');
  const [isTrimmerActive, setIsTrimmerActive] = useState(false);
  const [lastReadyCameraKey, setLastReadyCameraKey] = useState<string | null>(null);
  const [isOnionSkinningEnabled, setIsOnionSkinningEnabled] = useState(false);
  const [lastFrameThumbnail, setLastFrameThumbnail] = useState<string | null>(null);
  const [deletePreview, setDeletePreview] = useState<DeletePreviewState | null>(null);
  const setPendingVideoPost = usePendingVideoPostStore(s => s.setPayload);

  // Segment manager - single source of truth
  const segmentManagerRef = useRef<SegmentManager | null>(null);
  const [segmentUpdateTrigger, setSegmentUpdateTrigger] = useState(0);

  // Recording state
  const cameraRef = useRef<CameraView>(null);
  const recordingPromiseRef = useRef<Promise<{ uri: string } | undefined> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isRecordingRef = useRef(false);
  const lastTapRef = useRef<number>(0);
  const tapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Animated values
  const totalDurationShared = useSharedValue(0); // Total duration from segments (updated when segments change)
  const recordingStartTime = useSharedValue<number | null>(null); // Start time of current recording (milliseconds)
  const recordingElapsed = useSharedValue(0); // Elapsed time during current recording (seconds) - updated continuously
  const buttonOpacity = useSharedValue(1);
  const zoomStartRef = useRef(0);

  // Use useFocusEffect from expo-router instead of useIsFocused from react-navigation
  // This ensures compatibility with Expo Router's navigation system
  const [isFocused, setIsFocused] = React.useState(false);
  useFocusEffect(
    React.useCallback(() => {
      setIsFocused(true);
      return () => {
        setIsFocused(false);
        setLastReadyCameraKey(null);
        setDeletePreview(null);
      };
    }, [])
  );

  // Initialize segment manager
  useEffect(() => {
    if (!segmentManagerRef.current) {
      segmentManagerRef.current = new SegmentManager(selectedDuration);
    }
  }, [selectedDuration]);

  // Update max duration when selected duration changes
  useEffect(() => {
    if (segmentManagerRef.current) {
      segmentManagerRef.current.setMaxDuration(selectedDuration);
      // Update UI to reflect changes
      totalDurationShared.value = segmentManagerRef.current.getTotalDuration();
      setSegmentUpdateTrigger(prev => prev + 1);
    }
  }, [selectedDuration, totalDurationShared]);

  const getSegmentUri = useCallback((segment: Segment): string => {
    if (!segment.video || typeof segment.video !== 'object') {
      return '';
    }
    if ('uri' in segment.video && typeof segment.video.uri === 'string') {
      return segment.video.uri;
    }
    return '';
  }, []);

  // Extract only the last segment's frame for onion skinning (single source, no re-extraction of older clips)
  useEffect(() => {
    const ac = new AbortController();
    const segments = segmentManagerRef.current?.getSegments() ?? [];
    if (segments.length === 0) {
      setLastFrameThumbnail(null);
      return () => ac.abort();
    }

    const lastSeg = segments[segments.length - 1];
    const videoUri = getSegmentUri(lastSeg);
    if (!videoUri || lastSeg.duration <= 0) {
      setLastFrameThumbnail(null);
      return () => ac.abort();
    }

    VideoProcessingService.extractLastFrame(videoUri, lastSeg.duration)
      .then(thumbUri => {
        if (!ac.signal.aborted) setLastFrameThumbnail(thumbUri);
      })
      .catch(() => {
        if (!ac.signal.aborted) setLastFrameThumbnail(null);
      });
    return () => ac.abort();
  }, [getSegmentUri, segmentUpdateTrigger]);

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    screenWidth,
    screenHeight,
    isTablet: isTabletDevice,
    isSmallPhone: isSmallDevice,
    fitsNative16x9,
    cameraHeightFor16x9,
  } = useDeviceLayout();
  const bottomNavBarHeight = getBottomNavBarHeight(insets, isSmallDevice);
  const listenerSubscription = useRef<Record<string, EventSubscription>>({});

  // Ready once onCameraReady has fired for this dimensions. Facing changes in-place (no remount).
  const cameraReadyKey = `${Math.round(screenWidth)}x${Math.round(screenHeight)}`;
  const isCameraReady = lastReadyCameraKey === cameraReadyKey;

  const handleCameraReady = useCallback(() => {
    setLastReadyCameraKey(cameraReadyKey);
  }, [cameraReadyKey]);

  // Small phones (e.g. iPhone SE) no longer special-cased: they use the same 16:9 crop as other
  // portrait phones, which may leave a small bottom gap. Full screenHeight only for tablets or
  // devices that don't fit native 16:9.
  const cameraHeight = fitsNative16x9 && !isTabletDevice ? cameraHeightFor16x9 : screenHeight;
  const cameraWidth = screenWidth;

  // Derived values from segment manager
  const maxDuration = selectedDuration;
  const availableTime = segmentManagerRef.current?.getAvailableTime() ?? 0;
  const isDeletePreviewActive = deletePreview !== null;
  const deletePreviewUri = deletePreview?.segmentUri ?? '';

  const deletePreviewPlayer = useVideoPlayer(
    deletePreviewUri ? { uri: deletePreviewUri } : null,
    p => {
      p.loop = true;
      p.volume = 1;
    }
  );

  useEffect(() => {
    if (!deletePreviewPlayer) return;
    let isCancelled = false;
    let subscription: { remove: () => void } | null = null;

    const updateDeletePreviewPlayback = async () => {
      if (!isDeletePreviewActive || !deletePreviewUri) {
        deletePreviewPlayer.pause();
        deletePreviewPlayer.currentTime = 0;
        return;
      }

      // Keep playback resilient while the source transitions to ready.
      subscription = deletePreviewPlayer.addListener('statusChange', ({ status }) => {
        if (status === 'readyToPlay' && isDeletePreviewActive && !isCancelled) {
          deletePreviewPlayer.play();
        }
      });

      await deletePreviewPlayer.replaceAsync({ uri: deletePreviewUri });
      if (isCancelled) return;
      deletePreviewPlayer.currentTime = 0;
      deletePreviewPlayer.play();
    };

    updateDeletePreviewPlayback().catch(() => {
      // Source replacement failures are non-fatal; preview can be retried by user action.
    });

    return () => {
      isCancelled = true;
      subscription?.remove();
    };
  }, [deletePreviewPlayer, deletePreviewUri, isDeletePreviewActive]);

  const cancelDeletePreview = useCallback(() => {
    setDeletePreview(null);
  }, []);

  const startDeletePreview = useCallback(() => {
    const manager = segmentManagerRef.current;
    if (!manager) return;
    const segments = manager.getSegments();
    if (segments.length === 0) {
      setDeletePreview(null);
      return;
    }
    const lastSegment = segments[segments.length - 1];
    const segmentUri = getSegmentUri(lastSegment);
    if (!segmentUri) {
      setDeletePreview(null);
      return;
    }
    const totalDuration = manager.getTotalDuration();
    const segmentDuration = Math.max(lastSegment.duration, 0);
    const segmentStartTime = Math.max(totalDuration - segmentDuration, 0);
    setDeletePreview({
      segmentUri,
      segmentDuration,
      segmentStartTime,
      segmentEndTime: totalDuration,
    });
  }, [getSegmentUri]);

  const isSamePreviewAsLastSegment = useCallback(
    (preview: DeletePreviewState | null): boolean => {
      if (!preview) return false;
      const manager = segmentManagerRef.current;
      if (!manager) return false;
      const segments = manager.getSegments();
      const lastSegment = segments[segments.length - 1];
      const lastSegmentUri = lastSegment ? getSegmentUri(lastSegment) : '';
      return (
        !!lastSegment &&
        lastSegmentUri === preview.segmentUri &&
        Math.abs(lastSegment.duration - preview.segmentDuration) < 0.01
      );
    },
    [getSegmentUri]
  );

  const confirmDeletePreview = useCallback(() => {
    const manager = segmentManagerRef.current;
    if (!manager || !deletePreview) return;
    if (isSamePreviewAsLastSegment(deletePreview)) {
      const removedSegment = manager.removeLastSegment();
      if (removedSegment) {
        totalDurationShared.value = manager.getTotalDuration();
        setSegmentUpdateTrigger(prev => prev + 1);
      }
    }

    setDeletePreview(null);
  }, [deletePreview, isSamePreviewAsLastSegment, totalDurationShared]);

  useEffect(() => {
    if (!deletePreview) return;
    if (!isSamePreviewAsLastSegment(deletePreview)) {
      setDeletePreview(null);
    }
  }, [deletePreview, isSamePreviewAsLastSegment, segmentUpdateTrigger]);

  const deletePreviewProgressStyle = useMemo(() => {
    if (!deletePreview) return null;
    const safeMax = maxDuration || 1;
    const startPercent =
      (Math.min(Math.max(deletePreview.segmentStartTime, 0), safeMax) / safeMax) * 100;
    const endPercent =
      (Math.min(Math.max(deletePreview.segmentEndTime, 0), safeMax) / safeMax) * 100;
    return {
      left: `${startPercent}%` as const,
      width: `${Math.max(endPercent - startPercent, 0)}%` as const,
    };
  }, [deletePreview, maxDuration]);

  // Handle trimmed video from gallery
  const handleTrimmingComplete = useCallback(
    ({
      outputPath,
      startTime,
      endTime,
    }: {
      outputPath: string;
      startTime: number;
      endTime: number;
    }) => {
      if (!segmentManagerRef.current) return;

      // Calculate trimmed duration (all times in milliseconds, convert to seconds)
      // Use precise values (no rounding) for validation - display is rounded separately
      const trimmedDurationSeconds = (endTime - startTime) / 1000;

      // Validate trimmed duration doesn't exceed available time
      // Round both to milliseconds (0.001s) for comparison to handle floating point precision
      // All actual values remain precise - rounding only for this comparison
      const availableTime = segmentManagerRef.current.getAvailableTime();
      const trimmedRounded = Math.round(trimmedDurationSeconds * 1000) / 1000;
      const availableRounded = Math.round(availableTime * 1000) / 1000;
      if (trimmedRounded > availableRounded) {
        Alert.alert(
          'Error',
          `Trimmed video (${trimmedDurationSeconds.toFixed(1)}s) exceeds available time (${availableTime.toFixed(1)}s). Please trim to a shorter duration.`
        );
        setIsLoadingFromGallery(false);
        setIsProcessing(false);
        return;
      }

      // Add segment
      const videoUri = outputPath.startsWith('file://') ? outputPath : `file://${outputPath}`;
      const newSegment: Segment = {
        duration: trimmedDurationSeconds,
        video: { uri: videoUri },
        sourceType: 'gallery',
      };

      if (!segmentManagerRef.current.addSegment(newSegment)) {
        Alert.alert('Error', 'Adding this video would exceed the maximum duration');
        setIsLoadingFromGallery(false);
        setIsProcessing(false);
        return;
      }

      // Update UI
      totalDurationShared.value = segmentManagerRef.current.getTotalDuration();
      setSegmentUpdateTrigger(prev => prev + 1);
      setIsLoadingFromGallery(false);
      setIsProcessing(false);
      setIsTrimmerActive(false);
    },
    [totalDurationShared]
  );

  // Helper to stop recording without processing (for when trimmer opens)
  const stopRecordingImmediate = useCallback(() => {
    if (isRecordingRef.current && cameraRef.current) {
      cameraRef.current.stopRecording();
      recordingStartTime.value = null;
      recordingElapsed.value = 0;
      isRecordingRef.current = false;
      setIsRecording(false);
      recordingPromiseRef.current = null;
    }
  }, [recordingStartTime, recordingElapsed]);

  // Set up event listeners for react-native-clip-trim (TurboModule API).
  useEffect(() => {
    const VideoTrimModule = VideoTrim as Spec;
    listenerSubscription.current.onCancelTrimming = VideoTrimModule.onCancelTrimming(() => {
      setIsLoadingFromGallery(false);
      setIsProcessing(false);
      setIsTrimmerActive(false);
    });

    listenerSubscription.current.onCancel = VideoTrimModule.onCancel(() => {
      setIsLoadingFromGallery(false);
      setIsProcessing(false);
      setIsTrimmerActive(false);
    });

    listenerSubscription.current.onHide = VideoTrimModule.onHide(() => {
      setIsTrimmerActive(false);
    });

    listenerSubscription.current.onShow = VideoTrimModule.onShow(() => {
      stopRecordingImmediate();
      setIsTrimmerActive(true);
    });

    listenerSubscription.current.onFinishTrimming =
      VideoTrimModule.onFinishTrimming(handleTrimmingComplete);

    listenerSubscription.current.onError = VideoTrimModule.onError(({ message }) => {
      Alert.alert('Error', message || 'Failed to trim video');
      setIsLoadingFromGallery(false);
      setIsProcessing(false);
      setIsTrimmerActive(false);
    });

    return () => {
      Object.values(listenerSubscription.current).forEach(listener => listener?.remove());
      listenerSubscription.current = {};
    };
  }, [handleTrimmingComplete, stopRecordingImmediate]);

  // Request camera permissions on mount
  useEffect(() => {
    const checkPermissions = async () => {
      if (!cameraPermission?.granted) await requestCameraPermission();
      if (!microphonePermission?.granted) await requestMicrophonePermission();
    };
    checkPermissions();
  }, [
    cameraPermission,
    requestCameraPermission,
    microphonePermission,
    requestMicrophonePermission,
  ]);

  // AbortController for async work (e.g. finishRecording) so we don't setState after unmount
  useEffect(() => {
    abortControllerRef.current = new AbortController();
    return () => abortControllerRef.current?.abort();
  }, []);

  // Keep status bar hidden even when app returns from background
  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active') {
        // Ensure status bar is hidden when app becomes active
        StatusBar.setHidden(true, 'none');
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
      // Re-enable StatusBar when component unmounts
      StatusBar.setHidden(false, 'fade');
    };
  }, []);

  // Reset processing state when screen comes back into focus (user navigated back)
  useFocusEffect(
    useCallback(() => {
      setIsProcessing(false);
      return () => {
        if (isRecordingRef.current && cameraRef.current) {
          cameraRef.current.stopRecording();
          recordingStartTime.value = null;
          isRecordingRef.current = false;
          setIsRecording(false);
        }
        if (tapTimeoutRef.current) {
          clearTimeout(tapTimeoutRef.current);
          tapTimeoutRef.current = null;
        }
        setIsProcessing(false);
        setFlash('off');
      };
    }, [recordingStartTime])
  );

  // Disable flash when switching to front camera
  useEffect(() => {
    if (isFrontCamera && flash === 'on') {
      setFlash('off');
    }
  }, [isFrontCamera, flash]);

  useEffect(() => {
    if (isRecording) setIsZoomExpanded(false);
  }, [isRecording]);

  // Pre-request microphone when camera is ready so first press doesn't block on permission
  useEffect(() => {
    if (isCameraReady && !microphonePermission?.granted) {
      requestMicrophonePermission();
    }
  }, [isCameraReady, microphonePermission?.granted, requestMicrophonePermission]);

  // Android: onAvailableLensesChanged may not fire; treat as digital-zoom mode after brief delay
  useEffect(() => {
    if (isFrontCamera || !isCameraReady || lensDataReceived) return;
    const id = setTimeout(() => setLensDataReceived(true), 200);
    return () => clearTimeout(id);
  }, [isFrontCamera, isCameraReady, lensDataReceived]);

  // Pinch gesture: map full pinch range (scale ~0.2–4) to full camera zoom 0–1
  const captureZoomStart = useCallback(() => {
    zoomStartRef.current = zoom;
  }, [zoom]);
  const applyZoomFromPinch = useCallback((scale: number) => {
    // Sensitivity so one full pinch-out reaches 1 and one full pinch-in reaches 0
    const sensitivity = 1.25;
    const scaleChange = (scale - 1) * sensitivity;
    const newZoom = Math.max(0, Math.min(1, zoomStartRef.current + scaleChange));
    setZoom(newZoom);
  }, []);
  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      'worklet';
      runOnJS(captureZoomStart)();
    })
    .onUpdate(event => {
      'worklet';
      runOnJS(applyZoomFromPinch)(event.scale);
    });

  // Update shared value when segments change
  useEffect(() => {
    totalDurationShared.value = segmentManagerRef.current?.getTotalDuration() ?? 0;
  }, [segmentUpdateTrigger, totalDurationShared]);

  // Continuously update elapsed time on UI thread every frame
  useFrameCallback(() => {
    'worklet';
    if (recordingStartTime.value !== null) {
      const now = Date.now();
      recordingElapsed.value = (now - recordingStartTime.value) / 1000;
    } else {
      recordingElapsed.value = 0;
    }
  });

  // Progress bar: completed segments + current recording elapsed
  const animatedProgressStyle = useAnimatedStyle(() => {
    'worklet';
    const currentTotal = totalDurationShared.value + recordingElapsed.value;
    const safeMax = maxDuration || 1;
    const clamped = Math.min(Math.max(currentTotal, 0), safeMax);
    const progress = (clamped / safeMax) * 100;
    return {
      width: `${progress}%`,
    };
  }, [maxDuration]);

  const animatedButtonOpacityStyle = useAnimatedStyle(
    () => ({
      opacity: buttonOpacity.value,
    }),
    []
  );

  // Animate button opacity when recording state or max duration changes
  useEffect(() => {
    const isMaxReached = availableTime <= 0;
    buttonOpacity.value = withTiming(isRecording || isMaxReached ? 0.5 : 1, { duration: 100 });
  }, [isRecording, availableTime, buttonOpacity]);

  const stopRecording = useCallback(async () => {
    // Prevent duplicate calls - set recording ref to false immediately
    if (!cameraRef.current || !isRecordingRef.current) {
      return;
    }

    // Mark as not recording immediately to prevent re-entry
    isRecordingRef.current = false;
    setIsRecording(false);

    try {
      setIsProcessing(true);

      // Capture elapsed time before resetting (use recording time directly)
      const elapsedDuration = recordingElapsed.value;

      // Optimistically update total duration immediately to prevent flash
      if (elapsedDuration > 0 && segmentManagerRef.current) {
        totalDurationShared.value = segmentManagerRef.current.getTotalDuration() + elapsedDuration;
      }

      // Reset recording timer shared values (after optimistic update)
      recordingStartTime.value = null;
      recordingElapsed.value = 0;

      // Type guard: ensure camera ref is still valid before stopping
      const camera = cameraRef.current;
      if (camera) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        camera.stopRecording();
      }

      // Await recording result; promise may reject e.g. after camera flip or very short record
      if (recordingPromiseRef.current) {
        let video: { uri: string } | undefined;
        try {
          video = await recordingPromiseRef.current;
        } catch {
          video = undefined;
        }
        const manager = segmentManagerRef.current;

        if (video && manager && elapsedDuration >= MIN_RECORDING_DURATION) {
          const availableTime = manager.getAvailableTime();
          const clampedDuration = Math.min(elapsedDuration, availableTime);

          if (clampedDuration > 0) {
            const newSegment: Segment = {
              duration: clampedDuration,
              video,
              sourceType: 'camera',
            };

            if (manager.addSegment(newSegment)) {
              totalDurationShared.value = manager.getTotalDuration();
              setSegmentUpdateTrigger(prev => prev + 1);
            } else {
              totalDurationShared.value = manager.getTotalDuration();
            }
          } else {
            totalDurationShared.value = manager.getTotalDuration();
          }
        } else if (elapsedDuration > 0 && manager) {
          totalDurationShared.value = manager.getTotalDuration();
        }
      }

      recordingPromiseRef.current = null;
    } catch (_e) {
      const manager = segmentManagerRef.current;
      if (manager) totalDurationShared.value = manager.getTotalDuration();
      recordingStartTime.value = null;
      recordingElapsed.value = 0;
      recordingPromiseRef.current = null;
    } finally {
      setIsProcessing(false);
    }
  }, [totalDurationShared, recordingStartTime, recordingElapsed]);

  const startRecording = useCallback(async () => {
    const currentTotal = segmentManagerRef.current?.getTotalDuration() ?? 0;
    if (cameraRef.current && !isRecordingRef.current && currentTotal < maxDuration) {
      if (!microphonePermission?.granted) {
        const result = await requestMicrophonePermission();
        if (!result.granted) {
          Alert.alert(
            'Microphone Permission',
            'Please enable microphone access to record video with sound.'
          );
          return;
        }
      }

      isRecordingRef.current = true;
      setIsRecording(true);
      const startTime = Date.now();
      recordingStartTime.value = startTime; // Set shared value for UI-thread timer
      recordingElapsed.value = 0; // Reset elapsed time

      try {
        const manager = segmentManagerRef.current;
        const availableTime = manager?.getAvailableTime() ?? 0;
        const recordingOptions: CameraRecordingOptions = {
          maxDuration: availableTime,
          maxFileSize: 512 * 1024 * 1024,
        };

        const camera = cameraRef.current;
        if (camera) {
          recordingPromiseRef.current = camera.recordAsync(recordingOptions);
        } else {
          // Camera became unavailable, reset state
          isRecordingRef.current = false;
          setIsRecording(false);
          recordingStartTime.value = null;
        }
      } catch (_e) {
        // Reset recording timer shared values on error
        recordingStartTime.value = null;
        isRecordingRef.current = false;
        setIsRecording(false);
        recordingPromiseRef.current = null;
      }
    }
  }, [
    microphonePermission,
    requestMicrophonePermission,
    maxDuration,
    recordingStartTime,
    recordingElapsed,
  ]);

  // Handle press start - begin recording (press in to start)
  // Wait for onCameraReady before recording – expo-camera requires this
  const handlePressIn = useCallback(() => {
    const currentTotal = segmentManagerRef.current?.getTotalDuration() ?? 0;
    const availableTime = segmentManagerRef.current?.getAvailableTime() ?? 0;
    if (
      isCameraReady &&
      !isRecordingRef.current &&
      !isProcessing &&
      currentTotal < maxDuration &&
      availableTime > 0
    ) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      startRecording();
    }
  }, [isCameraReady, isProcessing, startRecording, maxDuration]);

  // Handle press end - stop recording (press out to stop)
  const handlePressOut = useCallback(() => {
    if (isRecordingRef.current) {
      stopRecording();
    }
  }, [stopRecording]);

  const pickFromGallery = useCallback(async () => {
    try {
      setIsLoadingFromGallery(true);
      setIsProcessing(true);

      // Request media library permissions before opening picker (required for videos on iOS SDK 54+)
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        setIsLoadingFromGallery(false);
        setIsProcessing(false);
        Alert.alert(
          'Permission required',
          'Permission to access the media library is required to select videos.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsMultipleSelection: false,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.High,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
        videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (asset.type != null && asset.type !== 'video') {
          Alert.alert('Invalid selection', 'Please select a video. This screen is for video only.');
          setIsLoadingFromGallery(false);
          setIsProcessing(false);
          return;
        }
        const videoUri = asset.uri;

        try {
          // Validate file using library's API and get actual video duration
          const validationResult = await isValidFile(videoUri);
          if (!validationResult.isValid) {
            Alert.alert('Invalid Video', 'The selected video file cannot be accessed.');
            setIsLoadingFromGallery(false);
            setIsProcessing(false);
            return;
          }

          // Check if there's available time
          const availableTime = segmentManagerRef.current?.getAvailableTime() ?? 0;
          if (availableTime <= 0) {
            Alert.alert('Error', 'No time remaining. Maximum duration reached.');
            setIsLoadingFromGallery(false);
            setIsProcessing(false);
            return;
          }

          setIsLoadingFromGallery(false);
          setIsProcessing(false);

          // Show editor with dynamic maxDuration constraint
          // Pass precise value (no rounding) - only display rounds in trimmer UI
          // NOTE: iOS has a bug where it treats maxDuration/minDuration as seconds instead of milliseconds
          // Android expects milliseconds, so we need to pass seconds for iOS, milliseconds for Android
          const maxDurationSeconds = availableTime;
          const maxDurationMs = availableTime * 1000;

          showEditor(videoUri, {
            maxDuration: Platform.OS === 'ios' ? maxDurationSeconds : maxDurationMs,
            saveToPhoto: false,
            openShareSheetOnFinish: false,
            removeAfterSavedToPhoto: false,
            cancelButtonText: 'Cancel',
            saveButtonText: 'Done',
            trimmerColor: Colors.purple[500],
            enableCancelTrimming: true,
            closeWhenFinish: true,
            autoplay: true,
            fullScreenModalIOS: true,
          });
        } catch (_error) {
          Alert.alert('Error', 'Failed to open video trimmer');
          setIsLoadingFromGallery(false);
          setIsProcessing(false);
        }
      } else {
        setIsLoadingFromGallery(false);
        setIsProcessing(false);
      }
    } catch (_e) {
      Alert.alert('Error', 'Failed to access gallery. Please try again.');
      setIsLoadingFromGallery(false);
      setIsProcessing(false);
    }
  }, []);

  const flipCamera = useCallback(async () => {
    if (isRecordingRef.current && cameraRef.current) {
      await stopRecording();
    }
    // Batch all flip-related state in one tick to avoid multiple re-renders and jank
    setZoom(0);
    setIsZoomExpanded(false);
    setLensDataReceived(false);
    setSelectedLens(null);
    setSelectedPresetLabel('1x');
    setIsFrontCamera(prev => !prev);
  }, [stopRecording]);

  const handleDoubleTap = useCallback(() => {
    if (isDeletePreviewActive) {
      cancelDeletePreview();
      return;
    }
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300; // milliseconds

    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      // Double tap detected
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
        tapTimeoutRef.current = null;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      flipCamera();
    } else {
      // First tap - wait to see if there's a second tap
      lastTapRef.current = now;
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
      }
      tapTimeoutRef.current = setTimeout(() => {
        lastTapRef.current = 0;
        tapTimeoutRef.current = null;
      }, DOUBLE_TAP_DELAY);
    }
  }, [cancelDeletePreview, flipCamera, isDeletePreviewActive]);
  const toggleFlash = useCallback(() => {
    // Only allow flash on back camera
    if (!isFrontCamera) {
      setFlash(prev => (prev === 'off' ? 'on' : 'off'));
    }
  }, [isFrontCamera]);

  const handleToolAction = useCallback(
    (action: string) => {
      if (action !== 'delete' && isDeletePreviewActive) {
        cancelDeletePreview();
      }
      switch (action) {
        case 'gallery':
          pickFromGallery();
          break;
        case 'flip':
          flipCamera();
          break;
        case 'flash':
          toggleFlash();
          break;
        case 'delete':
          if (isDeletePreviewActive) {
            confirmDeletePreview();
          } else {
            startDeletePreview();
          }
          break;
        case 'onion-skin':
          setIsOnionSkinningEnabled(prev => !prev);
          break;
        default:
          break;
      }
    },
    [
      cancelDeletePreview,
      confirmDeletePreview,
      flipCamera,
      isDeletePreviewActive,
      pickFromGallery,
      startDeletePreview,
      toggleFlash,
    ]
  );

  const handleBackPress = async () => {
    if (isDeletePreviewActive) {
      cancelDeletePreview();
      return;
    }
    if (isRecordingRef.current) {
      await stopRecording();
    }

    // Show warning if there are recordings
    const hasSegments = segmentManagerRef.current?.hasSegments() ?? false;
    const currentTotal = segmentManagerRef.current?.getTotalDuration() ?? 0;

    if (hasSegments || currentTotal > 0) {
      Alert.alert(
        'Discard Recordings?',
        'Closing will discard all your recordings. Are you sure you want to continue?',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              segmentManagerRef.current?.clear();
              totalDurationShared.value = 0;
              setSegmentUpdateTrigger(prev => prev + 1);
              router.back();
            },
          },
        ]
      );
    } else {
      // No recordings, just navigate back
      router.back();
    }
  };

  const finishRecording = useCallback(async () => {
    if (isDeletePreviewActive) {
      cancelDeletePreview();
    }
    const manager = segmentManagerRef.current;
    if (!manager || isProcessing) {
      return;
    }

    // Wait for any active recording to finish
    if (isRecordingRef.current) {
      await stopRecording();
    }

    const finalSegments = manager.getSegments();

    if (finalSegments.length === 0) {
      return;
    }

    // Convert to VideoSegment format
    const videoSegments = manager.toVideoSegments();
    const firstSegment = videoSegments[0];
    const firstVideoUri = firstSegment?.video?.uri ?? '';

    const thumbnailPath = firstVideoUri
      ? await VideoProcessingService.extractFirstFrame(firstVideoUri, null, { quality: 0.5 }).catch(
          () => undefined
        )
      : undefined;

    if (abortControllerRef.current?.signal.aborted) return;

    if (videoSegments.length === 1 && firstSegment) {
      const videoUri = firstSegment.video?.uri;
      if (videoUri) {
        setPendingVideoPost({
          videoPath: videoUri,
          thumbnailPath: thumbnailPath ?? undefined,
          textOverlays: [],
        });
        router.navigate({ pathname: '/post/[id]', params: { id: 'new' } });
      }
    } else {
      setPendingVideoPost({
        segments: videoSegments.map(s => ({
          startTime: s.startTime,
          duration: s.duration,
          video: s.video as { uri: string; assetId?: string; [k: string]: unknown },
          sourceType: s.sourceType,
        })),
        thumbnailPath: thumbnailPath ?? undefined,
        textOverlays: [],
      });
      router.navigate({ pathname: '/post/[id]', params: { id: 'new' } });
    }
  }, [
    cancelDeletePreview,
    isDeletePreviewActive,
    router,
    isProcessing,
    setPendingVideoPost,
    stopRecording,
  ]);

  const cameraContainerLayout = useMemo(
    () => ({
      justifyContent: isTabletDevice
        ? ('center' as const)
        : Platform.OS === 'ios'
          ? ('flex-start' as const)
          : ('center' as const),
    }),
    [isTabletDevice]
  );
  const cameraAndroidLayout = useMemo(
    () => (Platform.OS === 'android' ? { flex: 0, height: 'auto' as const } : null),
    []
  );
  const cameraLayout = useMemo(
    () => ({
      width: cameraWidth,
      height: cameraHeight,
      marginTop: isTabletDevice
        ? 0
        : Platform.OS === 'ios'
          ? isSmallDevice || !fitsNative16x9
            ? 0
            : insets.top
          : 0,
    }),
    [cameraWidth, cameraHeight, isTabletDevice, isSmallDevice, fitsNative16x9, insets.top]
  );
  const backButtonPosition = useMemo(
    () => ({ top: isSmallDevice || !fitsNative16x9 ? 5 : insets.top + 4, left: 4 }),
    [isSmallDevice, fitsNative16x9, insets.top]
  );
  // Render content based on the state of permissions and device availability
  const renderContent = () => {
    if (!cameraPermission) {
      return <View style={styles.warningContainer} />;
    }

    if (!cameraPermission.granted) {
      return (
        <View style={styles.warningContainer}>
          <Icon name="videocam" size={64} color={Colors.neutral[200]} style={styles.errorIcon} />
          <Text style={styles.warningText}>Please enable camera permissions</Text>
          <Pressable
            style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}
            onPress={requestCameraPermission}
          >
            <Text style={styles.buttonText}>Grant Permission</Text>
          </Pressable>
        </View>
      );
    }

    const cameraSurface = (
      <Animated.View style={[styles.cameraPressable, cameraAndroidLayout]}>
        <Pressable
          onPress={isDeletePreviewActive ? cancelDeletePreview : handleDoubleTap}
          style={[styles.cameraPressable, cameraAndroidLayout]}
        >
          {/* Wrapper matches camera dimensions so overlay aligns pixel-perfect */}
          <View style={[styles.cameraWrapper, cameraLayout]}>
            {isDeletePreviewActive && deletePreviewUri && deletePreviewPlayer ? (
              <VideoView
                player={deletePreviewPlayer}
                style={styles.cameraFill}
                contentFit="cover"
                nativeControls={false}
                surfaceType={Platform.OS === 'android' ? 'textureView' : undefined}
              />
            ) : (
              <CameraView
                ref={cameraRef}
                style={styles.cameraFill}
                active={isFocused && !isTrimmerActive && !isDeletePreviewActive}
                facing={isFrontCamera ? 'front' : 'back'}
                mode="video"
                flash="off"
                enableTorch={flash === 'on' && !isFrontCamera}
                mute={!microphonePermission?.granted}
                mirror={isFrontCamera}
                videoQuality={isFrontCamera ? '1080p' : '2160p'}
                videoStabilizationMode="off"
                animateShutter={false}
                zoom={zoom}
                selectedLens={selectedLens ?? undefined}
                onCameraReady={handleCameraReady}
                onMountError={e => {
                  if (__DEV__)
                    logger.warn('[Camera] Mount error:', {
                      component: 'Camera',
                      message: e?.message,
                    });
                }}
                onAvailableLensesChanged={event => {
                  const raw = event?.lenses ?? [];
                  const n = (s: string) => s.toLowerCase();
                  const physical = raw.filter(
                    l => !n(l).includes('dual') && !n(l).includes('triple')
                  );
                  setAvailableLenses(physical);
                  setLensDataReceived(true);
                  if (physical.length > 0) {
                    setSelectedLens(prev => {
                      const valid = physical.includes(prev ?? '');
                      if (valid) return prev;
                      const wide = physical.find(
                        l => n(l).includes('wide') && !n(l).includes('ultra')
                      );
                      return wide ?? physical[0];
                    });
                  }
                }}
              />
            )}
            {!isDeletePreviewActive && isOnionSkinningEnabled && lastFrameThumbnail && (
              <Image
                source={{ uri: lastFrameThumbnail }}
                style={styles.onionSkinOverlay}
                contentFit="cover"
                cachePolicy="memory-disk"
                pointerEvents="none"
              />
            )}
          </View>
        </Pressable>
      </Animated.View>
    );

    return (
      <>
        {/* Camera View - only render when screen is focused and trimmer is not active */}
        <View style={[styles.cameraContainer, cameraContainerLayout]}>
          {isFocused &&
            !isTrimmerActive &&
            (isDeletePreviewActive ? (
              cameraSurface
            ) : (
              <GestureDetector gesture={pinchGesture}>{cameraSurface}</GestureDetector>
            ))}

          {/* Progress Bar - overlays on top of camera */}
          <View
            style={[
              styles.progressBarOverlay,
              {
                height:
                  isSmallDevice || isTabletDevice || !fitsNative16x9
                    ? isSmallDevice || !fitsNative16x9
                      ? 49
                      : insets.top + 48 // Extends to bottom of header (5px top + 44px button for small, or insets.top + 4px + 44px for others)
                    : insets.top, // iOS: extend to top of video, Android: just status bar
              },
            ]}
          >
            <View style={styles.combinedProgressBarContainer}>
              <Animated.View
                style={[
                  styles.progressBarFill,
                  {
                    backgroundColor: selectedDuration === 6 ? Colors.teal[500] : Colors.purple[500],
                  },
                  animatedProgressStyle,
                ]}
              />
              {deletePreviewProgressStyle && (
                <View style={[styles.pendingDeleteSegmentFill, deletePreviewProgressStyle]} />
              )}
            </View>
          </View>

          {/* Controls */}
          {!isDeletePreviewActive && (
            <View
              style={[
                styles.centerButtonContainer,
                {
                  bottom: bottomNavBarHeight + (isSmallDevice ? 40 : 50),
                },
              ]}
            >
              {!isRecording &&
                !isFrontCamera &&
                isCameraReady &&
                lensDataReceived &&
                availableLenses.length !== 1 && (
                  <View style={styles.zoomSelectorContainer}>
                    {isZoomExpanded ? (
                      <View style={styles.zoomPicker}>
                        {availableLenses.length > 0
                          ? availableLenses.map(lens => {
                              const isSelected = selectedLens === lens;
                              const label = lensToLabel(lens);
                              return (
                                <Pressable
                                  key={lens}
                                  style={[
                                    styles.zoomSegment,
                                    isSelected && styles.zoomSegmentSelected,
                                  ]}
                                  onPress={() => {
                                    Haptics.selectionAsync();
                                    setSelectedLens(lens);
                                    setZoom(0);
                                    setIsZoomExpanded(false);
                                  }}
                                >
                                  <Text
                                    style={[
                                      styles.zoomSegmentText,
                                      isSelected && styles.zoomSegmentTextSelected,
                                    ]}
                                  >
                                    {label}
                                  </Text>
                                </Pressable>
                              );
                            })
                          : DIGITAL_ZOOM_PRESETS.map(factor => {
                              const optZoom = Math.log(Math.max(0.5, factor) / 0.5) / Math.log(20);
                              const isSelected = Math.abs(optZoom - zoom) < 0.03;
                              const label = factor === 0.5 ? '.5x' : `${factor}x`;
                              return (
                                <Pressable
                                  key={factor}
                                  style={[
                                    styles.zoomSegment,
                                    isSelected && styles.zoomSegmentSelected,
                                  ]}
                                  onPress={() => {
                                    Haptics.selectionAsync();
                                    setZoom(optZoom);
                                    setSelectedPresetLabel(label);
                                    setIsZoomExpanded(false);
                                  }}
                                >
                                  <Text
                                    style={[
                                      styles.zoomSegmentText,
                                      isSelected && styles.zoomSegmentTextSelected,
                                    ]}
                                  >
                                    {label}
                                  </Text>
                                </Pressable>
                              );
                            })}
                      </View>
                    ) : (
                      <Pressable
                        style={styles.zoomCollapsed}
                        onPress={() => setIsZoomExpanded(true)}
                      >
                        <Text style={styles.zoomCollapsedText}>
                          {availableLenses.length > 0 && selectedLens
                            ? lensToLabel(selectedLens)
                            : selectedPresetLabel}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                )}
              <View style={styles.recordButtonArea}>
                <View style={styles.recordButtonAreaSpacer} />
                <Pressable
                  onPressIn={handlePressIn}
                  onPressOut={handlePressOut}
                  disabled={availableTime <= 0 || !isCameraReady}
                  style={styles.recordButtonContainer}
                >
                  <Animated.View
                    style={[
                      styles.recordButton,
                      animatedButtonOpacityStyle,
                      availableTime <= 0 && styles.recordButtonDisabled,
                    ]}
                  >
                    {isLoadingFromGallery ? (
                      <ActivityIndicator size="large" color="white" />
                    ) : (
                      <View
                        style={[
                          styles.captureButtonInner,
                          availableTime <= 0 && styles.captureButtonInnerDisabled,
                        ]}
                      />
                    )}
                  </Animated.View>
                </Pressable>
                <View style={styles.recordButtonAreaSpacer}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.durationSelectorCollapsed,
                      pressed && { opacity: 0.7 },
                    ]}
                    onPress={() => {
                      const currentTotal = segmentManagerRef.current?.getTotalDuration() ?? 0;
                      const availableOptions = DURATION_OPTIONS.filter(
                        opt => opt.value >= currentTotal
                      );
                      Haptics.selectionAsync();
                      Alert.alert('Max duration', 'Select maximum recording length', [
                        ...availableOptions.map(opt => ({
                          text: opt.label,
                          onPress: () => setSelectedDuration(opt.value),
                        })),
                        { text: 'Cancel', style: 'cancel' as const },
                      ]);
                    }}
                  >
                    <Text style={styles.durationSelectorCollapsedText}>
                      {DURATION_OPTIONS.find(opt => opt.value === selectedDuration)?.label || '16s'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        </View>
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <StatusBar hidden={true} />
      <Pressable style={[styles.backButton, backButtonPosition]} onPress={handleBackPress}>
        <CloseFillIcon size={26} color="white" />
      </Pressable>

      {segmentManagerRef.current?.hasSegments() && (
        <Pressable
          style={({ pressed }) => [
            styles.doneButton,
            {
              top: isSmallDevice || !fitsNative16x9 ? 5 : insets.top + 4,
              right: 4,
            },
            pressed && { opacity: 0.7 },
          ]}
          onPress={finishRecording}
          disabled={isProcessing}
        >
          <ArrowRightFillIcon size={30} color="white" />
        </Pressable>
      )}
      {renderContent()}
      <BottomToolBar
        mode="create"
        onToolPress={handleToolAction}
        flashActive={flash === 'on'}
        hasSegments={(segmentManagerRef.current?.getTotalDuration() ?? 0) > 0}
        isDeletePreviewActive={isDeletePreviewActive}
        isFrontCamera={isFrontCamera}
        disableGalleryUpload={
          Platform.OS === 'android' ||
          (Platform.OS === 'ios' && parseInt(Device.osVersion || '0', 10) < 17) ||
          availableTime <= 0
        }
        onionSkinningActive={isOnionSkinningEnabled}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  warningContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: Colors.black,
  },
  warningText: {
    color: Colors.neutral[200],
    fontSize: 18,
    fontFamily: 'Figtree-SemiBold',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  errorIcon: {
    marginBottom: 20,
    opacity: 0.9,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.neutral[50],
    borderRadius: BORDER_RADIUS.LARGE,
    paddingVertical: 14,
    paddingHorizontal: 24,
    marginTop: 20,
    minWidth: 120,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  buttonText: {
    color: Colors.black,
    fontSize: 16,
    fontFamily: 'Figtree-SemiBold',
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
    alignItems: 'center',
  },
  cameraPressable: {
    width: '100%',
    height: '100%',
    flex: 1,
  },
  cameraWrapper: {
    position: 'relative',
    overflow: 'hidden',
  },
  cameraFill: {
    ...StyleSheet.absoluteFillObject,
  },
  onionSkinOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.3,
    zIndex: 10,
  },
  progressBarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
  },
  combinedProgressBarContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.transparent,
    position: 'relative',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.purple[500],
    borderRadius: 0,
    minHeight: 4, // Ensure minimum visible height on tablets
  },
  pendingDeleteSegmentFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: Colors.coral[500],
    minHeight: 4,
  },
  backButton: {
    position: 'absolute',
    left: 10,
    zIndex: 1000,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordButtonArea: {
    flexDirection: 'row',
    width: '100%',
    minHeight: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordButtonAreaSpacer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationSelectorCollapsed: {
    paddingHorizontal: 14,
    minWidth: 48,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  durationSelectorCollapsedText: {
    color: Colors.neutral[50],
    fontSize: 17,
    fontFamily: 'Figtree-Bold',
  },
  doneButton: {
    position: 'absolute',
    right: 10,
    zIndex: 1000,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerButtonContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  zoomSelectorContainer: {
    marginBottom: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomCollapsed: {
    backgroundColor: hexToRGBA(Colors.neutral[500], 0.36),
    borderRadius: 9,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  zoomCollapsedText: {
    color: Colors.neutral[50],
    fontSize: 13,
    fontFamily: 'Figtree-SemiBold',
  },
  zoomPicker: {
    flexDirection: 'row',
    backgroundColor: hexToRGBA(Colors.neutral[500], 0.36),
    borderRadius: 9,
    padding: 4,
    maxWidth: 180,
    alignSelf: 'center',
  },
  zoomSegment: {
    flex: 1,
    height: 28,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
  },
  zoomSegmentSelected: {
    backgroundColor: Colors.neutral[50],
  },
  zoomSegmentText: {
    color: hexToRGBA(Colors.neutral[50], 0.85),
    fontSize: 13,
    fontFamily: 'Figtree-Medium',
  },
  zoomSegmentTextSelected: {
    color: Colors.black,
    fontFamily: 'Figtree-SemiBold',
  },
  recordButtonContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordButton: {
    width: 90,
    height: 90,
    borderRadius: 47.5,
    borderWidth: 5,
    borderColor: Colors.neutral[50],
    backgroundColor: Colors.transparent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordButtonDisabled: {
    borderColor: Colors.neutral[200],
  },
  captureButtonInner: {
    width: 74,
    height: 74,
    borderRadius: 38,
    backgroundColor: CAPTURE_BUTTON_INNER_BG,
  },
  captureButtonInnerDisabled: {
    backgroundColor: CAPTURE_BUTTON_INNER_DISABLED_BG,
  },
});

export default CreateScreen;
