import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { BORDER_RADIUS } from '@/utils/constants';
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
  type GestureResponderEvent,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Camera,
  useVideoOutput,
  useCameraPermission,
  useMicrophonePermission,
  useCameraDevice,
  type CameraRef,
  type Recorder,
} from 'react-native-vision-camera';
import { useRouter, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useDerivedValue,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Icon, { CloseFillIcon, ArrowRightFillIcon } from '@/components/ui/Icon';
import { NativePressable } from '@/components/ui/NativePressable';
import { SquircleNativePressable } from '@/components/ui/Squircle';
import BottomToolBar from '@/components/ui/BottomToolBar';
import * as Device from 'expo-device';
import { getBottomNavBarHeight } from '@/utils/device/screen';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
import { logger } from '@/utils/logger';
import { Colors } from '@/theme';
import { hexToRGBA } from '@/utils/formatting/colors';
import * as Haptics from 'expo-haptics';
import VideoTrim, { showEditor, closeEditor, isValidFile, type Spec } from 'react-native-clip-trim';
import { SegmentManager, type Segment } from '@/utils/video/segmentManager';
import { extractAssetId } from '@/utils/video/path';
import VideoProcessingService, {
  getVideoSegmentSourceUri,
} from '@/services/video/VideoProcessingService';
import { usePendingVideoPostStore } from '@/stores/pendingVideoPostStore';
import { ErrorHandler } from '@/utils/errors/errorHandler';
import { useVideoPlayer, VideoView } from 'expo-video';
import { DEFAULT_BUFFER_OPTIONS } from '@/utils/video/helpers';
import { FontFamily, Typography, fontSizeFor } from '@/utils/components/typography';

// Duration options in seconds - labels resolved via t() in component
const DURATION_OPTION_KEYS = [
  { value: 6, labelKey: 'create.duration6s' as const },
  { value: 16, labelKey: 'create.duration16s' as const },
  { value: 60, labelKey: 'create.duration1m' as const },
  { value: 180, labelKey: 'create.duration3m' as const },
] as const;

const CAPTURE_BUTTON_INNER_BG = hexToRGBA(Colors.neutral[500], 0.4);
const CAPTURE_BUTTON_INNER_DISABLED_BG = hexToRGBA(Colors.neutral[500], 0.2);

/** Upper cap for zoom factor; Vision Camera docs suggest clamping very large native maxZoom (~128). */
const CAMERA_ZOOM_MAX_CLAMP = 16;

/** Vision Camera example: pinch scale range mapped before interpolating to zoom. */
const SCALE_FULL_ZOOM = 3;

function toFileUri(path: string): string {
  if (path.startsWith('file://')) {
    return path;
  }
  return `file://${path}`;
}

const deletePreviewVideoStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 11,
  },
});

/** Last-segment playback for delete confirmation; mounted only while delete preview is active. */
const DeletePreviewSegmentVideo: React.FC<{ uri: string }> = ({ uri }) => {
  const player = useVideoPlayer({ uri }, p => {
    p.loop = true;
    p.muted = true;
    p.bufferOptions = DEFAULT_BUFFER_OPTIONS;
  });

  // Do not call player.pause() on unmount: native shared object may already be released
  // (NativeSharedObjectNotFoundException). useVideoPlayer tears down playback on unmount.
  useEffect(() => {
    player?.play();
  }, [player, uri]);

  if (!player) return null;

  return (
    <View style={deletePreviewVideoStyles.overlay} pointerEvents="none">
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        surfaceType={Platform.OS === 'android' ? 'textureView' : undefined}
      />
    </View>
  );
};

interface DeletePreviewState {
  segmentCount: number;
  segmentStartTime: number;
  segmentEndTime: number;
}

const CreateScreen: React.FC = () => {
  const { t } = useTranslation();
  const cameraPermission = useCameraPermission();
  const microphonePermission = useMicrophonePermission();
  const [isRecording, setIsRecording] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(false);
  const [flash, setFlash] = useState<'off' | 'on'>('off');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingFromGallery, setIsLoadingFromGallery] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState(16); // Default to 16 seconds
  const [isTrimmerActive, setIsTrimmerActive] = useState(false);
  const isTrimmerActiveRef = useRef(false);
  useEffect(() => {
    isTrimmerActiveRef.current = isTrimmerActive;
  }, [isTrimmerActive]);
  const [isOnionSkinningEnabled, setIsOnionSkinningEnabled] = useState(false);
  const [lastFrameThumbnail, setLastFrameThumbnail] = useState<string | null>(null);
  const [deletePreview, setDeletePreview] = useState<DeletePreviewState | null>(null);
  const setPendingVideoPost = usePendingVideoPostStore(s => s.setPayload);

  // Segment manager - single source of truth
  const segmentManagerRef = useRef<SegmentManager | null>(null);
  const [segmentUpdateTrigger, setSegmentUpdateTrigger] = useState(0);

  // Recording state
  const cameraRef = useRef<CameraRef>(null);
  const recorderRef = useRef<Recorder | null>(null);
  const recordingPromiseRef = useRef<Promise<{ uri: string } | undefined> | null>(null);
  const recordingPromiseResolverRef = useRef<((value: { uri: string } | undefined) => void) | null>(
    null
  );
  const recordingStartAtRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isRecordingRef = useRef(false);
  const recordingStateRef = useRef<'idle' | 'starting' | 'recording' | 'stopping'>('idle');
  const recordingCommittedBaseRef = useRef(0);
  const forcedStopDurationRef = useRef<number | null>(null);
  const finishRecordingRef = useRef<((options?: { force?: boolean }) => Promise<void>) | null>(
    null
  );
  const recordingAutoStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const discardGenerationRef = useRef(0);
  const activeRecordingDiscardGenRef = useRef<number | null>(null);
  // Animated values
  const totalDurationShared = useSharedValue(0); // Total duration from segments (updated when segments change)
  const currentSegmentDurationShared = useSharedValue(0);
  const progressBarDurationShared = useSharedValue(0);
  const buttonOpacity = useSharedValue(1);
  const zoomShared = useSharedValue(1);
  const deviceMinZoomSV = useSharedValue(1);
  const deviceMaxZoomSV = useSharedValue(CAMERA_ZOOM_MAX_CLAMP);
  const pinchStartZoom = useSharedValue(1);
  const captureZoomPanStartY = useSharedValue(0);
  const captureZoomPanOffsetY = useSharedValue(0);

  const focusEpochRef = useRef(0);
  // Await recorder stop before isFocused false so Camera is not torn down while still bound to videoOutput.
  const [isFocused, setIsFocused] = React.useState(false);

  // Initialize segment manager
  useEffect(() => {
    if (!segmentManagerRef.current) {
      segmentManagerRef.current = new SegmentManager(selectedDuration);
    }
  }, []);

  // Update max duration when selected duration changes (segment list unchanged; no segmentUpdateTrigger)
  useEffect(() => {
    if (segmentManagerRef.current) {
      segmentManagerRef.current.setMaxDuration(selectedDuration);
      totalDurationShared.value = segmentManagerRef.current.getTotalDuration();
      if (!isRecordingRef.current) {
        progressBarDurationShared.value = segmentManagerRef.current.getTotalDuration();
      }
    }
  }, [progressBarDurationShared, selectedDuration, totalDurationShared]);

  const getSegmentUri = useCallback((segment: Segment): string => {
    if (!segment.video || typeof segment.video !== 'object') {
      return '';
    }
    return getVideoSegmentSourceUri(segment.video);
  }, []);

  const onionSkinRequestIdRef = useRef(0);

  const refreshOnionSkinThumbnail = useCallback(() => {
    const requestId = ++onionSkinRequestIdRef.current;
    const segments = segmentManagerRef.current?.getSegments() ?? [];
    if (segments.length === 0) {
      setLastFrameThumbnail(null);
      return;
    }
    const lastSeg = segments[segments.length - 1];
    const videoUri = getSegmentUri(lastSeg);
    if (!videoUri || lastSeg.duration <= 0) {
      setLastFrameThumbnail(null);
      return;
    }
    const segmentAssetId = extractAssetId(lastSeg.video) ?? undefined;

    VideoProcessingService.extractLastFrame(videoUri, lastSeg.duration, segmentAssetId)
      .then(thumbUri => {
        if (requestId === onionSkinRequestIdRef.current) {
          setLastFrameThumbnail(thumbUri);
        }
      })
      .catch(() => {
        if (requestId === onionSkinRequestIdRef.current) {
          setLastFrameThumbnail(null);
        }
      });
  }, [getSegmentUri]);

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

  const backDevice = useCameraDevice('back');
  const frontDevice = useCameraDevice('front');
  const videoOutput = useVideoOutput({
    enableAudio: microphonePermission.hasPermission,
  });

  const cameraDevice = isFrontCamera ? frontDevice : backDevice;

  useEffect(() => {
    if (!cameraDevice) return;
    const minZ = cameraDevice.minZoom;
    const maxZ = Math.min(cameraDevice.maxZoom, CAMERA_ZOOM_MAX_CLAMP);
    deviceMinZoomSV.value = minZ;
    deviceMaxZoomSV.value = maxZ;
    zoomShared.value = minZ;
  }, [cameraDevice?.id, cameraDevice?.maxZoom, cameraDevice?.minZoom]);

  // Small phones (e.g. iPhone SE) no longer special-cased: they use the same 16:9 crop as other
  // portrait phones, which may leave a small bottom gap. Full screenHeight only for tablets or
  // devices that don't fit native 16:9.
  const cameraHeight = fitsNative16x9 && !isTabletDevice ? cameraHeightFor16x9 : screenHeight;
  const cameraWidth = screenWidth;

  // Derived values from segment manager
  const maxDuration = selectedDuration;
  const availableTime = segmentManagerRef.current?.getAvailableTime() ?? 0;
  const isDeletePreviewActive = deletePreview !== null;

  const deletePreviewSegmentUri = useMemo(() => {
    if (!deletePreview) return null;
    const manager = segmentManagerRef.current;
    if (!manager) return null;
    const segments = manager.getSegments();
    if (segments.length === 0) return null;
    const uri = getSegmentUri(segments[segments.length - 1]);
    return uri.length > 0 ? uri : null;
  }, [deletePreview, getSegmentUri, segmentUpdateTrigger]);

  /**
   * Pinch on preview — matches Vision Camera example (exponential-ish feel via piecewise interpolate).
   * Native pinch cannot run alongside controlled `zoom`.
   */
  const cameraPinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .enabled(!isDeletePreviewActive)
        .onBegin(() => {
          'worklet';
          pinchStartZoom.value = zoomShared.value;
        })
        .onUpdate(e => {
          'worklet';
          const minZ = deviceMinZoomSV.value;
          const maxZ = deviceMaxZoomSV.value;
          const scale = interpolate(
            e.scale,
            [1 - 1 / SCALE_FULL_ZOOM, 1, SCALE_FULL_ZOOM],
            [-1, 0, 1],
            Extrapolation.CLAMP
          );
          zoomShared.value = interpolate(
            scale,
            [-1, 0, 1],
            [minZ, pinchStartZoom.value, maxZ],
            Extrapolation.CLAMP
          );
        }),
    [isDeletePreviewActive]
  );

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
    const totalDuration = manager.getTotalDuration();
    const segmentDuration = Math.max(lastSegment.duration, 0);
    const segmentStartTime = Math.max(totalDuration - segmentDuration, 0);
    setDeletePreview({
      segmentCount: segments.length,
      segmentStartTime,
      segmentEndTime: totalDuration,
    });
  }, []);

  const isSamePreviewAsLastSegment = useCallback((preview: DeletePreviewState | null): boolean => {
    if (!preview) return false;
    const manager = segmentManagerRef.current;
    if (!manager) return false;
    const segments = manager.getSegments();
    return segments.length > 0 && segments.length === preview.segmentCount;
  }, []);

  const confirmDeletePreview = useCallback(() => {
    const manager = segmentManagerRef.current;
    if (!manager || !deletePreview) return;
    if (isSamePreviewAsLastSegment(deletePreview)) {
      const removedSegment = manager.removeLastSegment();
      if (removedSegment) {
        totalDurationShared.value = manager.getTotalDuration();
        progressBarDurationShared.value = manager.getTotalDuration();
        setSegmentUpdateTrigger(prev => prev + 1);
        refreshOnionSkinThumbnail();
      }
    }

    setDeletePreview(null);
  }, [
    deletePreview,
    isSamePreviewAsLastSegment,
    progressBarDurationShared,
    refreshOnionSkinThumbnail,
    totalDurationShared,
  ]);

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
          t('common.error'),
          t('video.trimmedExceedsAvailable', {
            trimmed: trimmedDurationSeconds.toFixed(1),
            available: availableTime.toFixed(1),
          })
        );
        setIsLoadingFromGallery(false);
        setIsProcessing(false);
        return;
      }

      const manager = segmentManagerRef.current;
      // Import-only: empty timeline → post with single file (no segment merge).
      if (manager.getSegmentCount() === 0) {
        const videoUri = toFileUri(outputPath);
        setPendingVideoPost({
          videoPath: videoUri,
          textOverlays: [],
        });
        router.navigate({ pathname: '/post/[id]', params: { id: 'new' } });
        setIsLoadingFromGallery(false);
        setIsProcessing(false);
        setIsTrimmerActive(false);
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
        Alert.alert(t('common.error'), t('video.addingExceedsMaxDuration'));
        setIsLoadingFromGallery(false);
        setIsProcessing(false);
        return;
      }

      // Update UI
      totalDurationShared.value = segmentManagerRef.current.getTotalDuration();
      progressBarDurationShared.value = segmentManagerRef.current.getTotalDuration();
      setSegmentUpdateTrigger(prev => prev + 1);
      refreshOnionSkinThumbnail();
      setIsLoadingFromGallery(false);
      setIsProcessing(false);
      setIsTrimmerActive(false);
    },
    [
      progressBarDurationShared,
      refreshOnionSkinThumbnail,
      router,
      setPendingVideoPost,
      totalDurationShared,
      t,
    ]
  );

  const disposeActiveRecorderAsync = useCallback(async () => {
    if (recordingAutoStopTimeoutRef.current) {
      clearTimeout(recordingAutoStopTimeoutRef.current);
      recordingAutoStopTimeoutRef.current = null;
    }
    const rec = recorderRef.current;
    if (!rec) return;
    recordingStateRef.current = 'stopping';
    try {
      await rec.stopRecording();
    } catch (err) {
      logger.debug('[Create] stopRecording during dispose', { err });
    }
    if (recorderRef.current !== rec) return;
    recordingPromiseResolverRef.current?.(undefined);
    recordingPromiseResolverRef.current = null;
    activeRecordingDiscardGenRef.current = null;
    currentSegmentDurationShared.value = 0;
    isRecordingRef.current = false;
    setIsRecording(false);
    recordingStartAtRef.current = null;
    recorderRef.current = null;
    recordingPromiseRef.current = null;
    recordingStateRef.current = 'idle';
    forcedStopDurationRef.current = null;
  }, [currentSegmentDurationShared]);

  const endTrimmerLoading = useCallback(() => {
    setIsLoadingFromGallery(false);
    setIsProcessing(false);
    setIsTrimmerActive(false);
  }, []);

  // Set up event listeners for react-native-clip-trim (TurboModule API).
  useEffect(() => {
    const VideoTrimModule = VideoTrim as Spec;
    const subs: EventSubscription[] = [
      VideoTrimModule.onCancelTrimming(endTrimmerLoading),
      VideoTrimModule.onCancel(endTrimmerLoading),
      VideoTrimModule.onHide(() => setIsTrimmerActive(false)),
      VideoTrimModule.onShow(() => {
        void (async () => {
          await disposeActiveRecorderAsync();
          setIsTrimmerActive(true);
        })();
      }),
      VideoTrimModule.onFinishTrimming(handleTrimmingComplete),
      VideoTrimModule.onError(({ message }) => {
        Alert.alert(t('common.error'), message || t('video.failedToTrim'));
        endTrimmerLoading();
      }),
    ];
    return () => subs.forEach(s => s.remove());
  }, [disposeActiveRecorderAsync, endTrimmerLoading, handleTrimmingComplete, t]);

  // Request camera permissions on mount
  useEffect(() => {
    const checkPermissions = async () => {
      if (!cameraPermission.hasPermission) await cameraPermission.requestPermission();
      if (!microphonePermission.hasPermission) await microphonePermission.requestPermission();
    };
    checkPermissions();
  }, [cameraPermission, microphonePermission]);

  // AbortController for async work (e.g. finishRecording) so we don't setState after unmount
  useEffect(() => {
    abortControllerRef.current = new AbortController();
    return () => {
      onionSkinRequestIdRef.current += 1;
      discardGenerationRef.current += 1;
      abortControllerRef.current?.abort();
    };
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

  useFocusEffect(
    useCallback(() => {
      const epoch = ++focusEpochRef.current;
      setIsFocused(true);
      setIsProcessing(false);
      return () => {
        const captured = epoch;
        void (async () => {
          await disposeActiveRecorderAsync();
          if (captured !== focusEpochRef.current) return;
          setIsProcessing(false);
          setFlash('off');
          setDeletePreview(null);
          setIsFocused(false);
        })();
      };
    }, [disposeActiveRecorderAsync])
  );

  // Disable flash when switching to front camera
  useEffect(() => {
    if (isFrontCamera && flash === 'on') {
      setFlash('off');
    }
  }, [isFrontCamera, flash]);

  // Pre-request microphone so first hold doesn't block on permission
  useEffect(() => {
    if (!microphonePermission.hasPermission) {
      microphonePermission.requestPermission();
    }
  }, [microphonePermission]);

  // Update shared value when segments change
  useEffect(() => {
    totalDurationShared.value = segmentManagerRef.current?.getTotalDuration() ?? 0;
    if (!isRecordingRef.current) {
      progressBarDurationShared.value = totalDurationShared.value;
    }
  }, [progressBarDurationShared, segmentUpdateTrigger, totalDurationShared]);

  useEffect(() => {
    if (!isRecording) {
      currentSegmentDurationShared.value = 0;
      return;
    }
    const interval = setInterval(() => {
      const liveDuration = recorderRef.current?.recordedDuration ?? 0;
      const maxLiveDuration = Math.max(selectedDuration - recordingCommittedBaseRef.current, 0);
      const clampedLiveDuration = Math.min(liveDuration, maxLiveDuration);
      currentSegmentDurationShared.value = clampedLiveDuration;
      progressBarDurationShared.value = recordingCommittedBaseRef.current + clampedLiveDuration;
    }, 50);
    return () => clearInterval(interval);
  }, [currentSegmentDurationShared, isRecording, progressBarDurationShared, selectedDuration]);

  const smoothedProgressBarDuration = useDerivedValue(() => {
    'worklet';
    return withTiming(progressBarDurationShared.value, {
      duration: 140,
      easing: Easing.linear,
    });
  }, []);

  const animatedProgressStyle = useAnimatedStyle(() => {
    'worklet';
    const stableProgressTotal = smoothedProgressBarDuration.value;
    const safeMax = maxDuration || 1;
    const clamped = Math.min(Math.max(stableProgressTotal, 0), safeMax);
    const progress = (clamped / safeMax) * 100;
    return {
      width: `${progress}%`,
    };
  }, [maxDuration, smoothedProgressBarDuration]);

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

  const commitCameraSegment = useCallback(
    (elapsedDuration: number, uri?: string): boolean => {
      if (activeRecordingDiscardGenRef.current !== discardGenerationRef.current) {
        return false;
      }
      const manager = segmentManagerRef.current;
      if (!manager || !uri) return false;
      const available = manager.getAvailableTime();
      const clampedDuration = Math.min(elapsedDuration, available);
      if (clampedDuration <= 0) return false;

      const newSegment: Segment = {
        duration: clampedDuration,
        video: { uri },
        sourceType: 'camera',
      };
      if (!manager.addSegment(newSegment)) return false;
      totalDurationShared.value = manager.getTotalDuration();
      setSegmentUpdateTrigger(prev => prev + 1);
      refreshOnionSkinThumbnail();
      return true;
    },
    [refreshOnionSkinThumbnail, totalDurationShared]
  );

  const stopRecording = useCallback(async () => {
    if (!recorderRef.current || recordingStateRef.current === 'stopping') {
      return;
    }

    const _stopGenStart = discardGenerationRef.current;

    try {
      recordingStateRef.current = 'stopping';
      setIsProcessing(true);
      const recorder = recorderRef.current;
      const elapsedDuration = Math.max(
        forcedStopDurationRef.current ?? recorder.recordedDuration,
        0
      );
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await recorder.stopRecording();
      let segmentUri: string | undefined;
      if (recordingPromiseRef.current) {
        const result = await recordingPromiseRef.current.catch(() => undefined);
        segmentUri = result?.uri;
      }
      if (discardGenerationRef.current !== _stopGenStart) {
        isRecordingRef.current = false;
        recordingStartAtRef.current = null;
        if (recordingAutoStopTimeoutRef.current) {
          clearTimeout(recordingAutoStopTimeoutRef.current);
          recordingAutoStopTimeoutRef.current = null;
        }
        recordingPromiseRef.current = null;
        recorderRef.current = null;
        recordingStateRef.current = 'idle';
        forcedStopDurationRef.current = null;
        activeRecordingDiscardGenRef.current = null;
        currentSegmentDurationShared.value = 0;
        return;
      }
      const didCommit = commitCameraSegment(elapsedDuration, segmentUri);
      activeRecordingDiscardGenRef.current = null;
      isRecordingRef.current = false;
      setIsRecording(false);
      if (didCommit) {
        requestAnimationFrame(() => {
          currentSegmentDurationShared.value = 0;
        });
      } else {
        currentSegmentDurationShared.value = 0;
      }
      recordingStartAtRef.current = null;

      if (recordingAutoStopTimeoutRef.current) {
        clearTimeout(recordingAutoStopTimeoutRef.current);
        recordingAutoStopTimeoutRef.current = null;
      }
      recordingPromiseRef.current = null;
      recorderRef.current = null;
      recordingStateRef.current = 'idle';
      forcedStopDurationRef.current = null;
    } catch (_e) {
      const manager = segmentManagerRef.current;
      if (manager) totalDurationShared.value = manager.getTotalDuration();
      activeRecordingDiscardGenRef.current = null;
      isRecordingRef.current = false;
      if (discardGenerationRef.current === _stopGenStart) {
        setIsRecording(false);
      }
      currentSegmentDurationShared.value = 0;
      recordingStartAtRef.current = null;
      recordingPromiseRef.current = null;
      recorderRef.current = null;
      recordingStateRef.current = 'idle';
      forcedStopDurationRef.current = null;
    } finally {
      if (discardGenerationRef.current === _stopGenStart) {
        setIsProcessing(false);
      }
    }
  }, [commitCameraSegment, currentSegmentDurationShared, totalDurationShared]);

  const pauseCurrentSegment = useCallback(async () => {
    if (!isRecordingRef.current || !recorderRef.current || recordingStateRef.current === 'stopping')
      return;
    const pauseGenStart = discardGenerationRef.current;
    recordingStateRef.current = 'stopping';
    const elapsedDuration = Math.max(
      forcedStopDurationRef.current ?? recorderRef.current.recordedDuration,
      0
    );
    if (recordingAutoStopTimeoutRef.current) {
      clearTimeout(recordingAutoStopTimeoutRef.current);
      recordingAutoStopTimeoutRef.current = null;
    }
    await recorderRef.current.stopRecording();
    let segmentUri: string | undefined;
    if (recordingPromiseRef.current) {
      const result = await recordingPromiseRef.current.catch(() => undefined);
      segmentUri = result?.uri;
    }
    if (discardGenerationRef.current !== pauseGenStart) {
      isRecordingRef.current = false;
      recordingStartAtRef.current = null;
      recordingPromiseRef.current = null;
      recorderRef.current = null;
      recordingStateRef.current = 'idle';
      forcedStopDurationRef.current = null;
      activeRecordingDiscardGenRef.current = null;
      currentSegmentDurationShared.value = 0;
      return;
    }
    const didCommit = commitCameraSegment(elapsedDuration, segmentUri);
    activeRecordingDiscardGenRef.current = null;
    isRecordingRef.current = false;
    setIsRecording(false);
    if (didCommit) {
      requestAnimationFrame(() => {
        currentSegmentDurationShared.value = 0;
      });
    } else {
      currentSegmentDurationShared.value = 0;
    }
    recordingStartAtRef.current = null;
    recordingPromiseRef.current = null;
    recorderRef.current = null;
    recordingStateRef.current = 'idle';
    forcedStopDurationRef.current = null;
  }, [commitCameraSegment, currentSegmentDurationShared]);

  const startRecording = useCallback(async () => {
    const manager = segmentManagerRef.current;
    const currentTotal = manager?.getTotalDuration() ?? 0;
    const availableTime = manager?.getAvailableTime() ?? 0;

    // Guard: require some remaining time
    if (availableTime <= 0) {
      return;
    }

    if (
      cameraRef.current &&
      !isRecordingRef.current &&
      recordingStateRef.current === 'idle' &&
      currentTotal < maxDuration
    ) {
      if (!microphonePermission.hasPermission) {
        const result = await microphonePermission.requestPermission();
        if (!result) {
          Alert.alert(t('video.microphonePermission'), t('video.microphonePermissionMessage'));
          return;
        }
      }

      recordingStateRef.current = 'starting';
      isRecordingRef.current = true;
      setIsRecording(true);
      recordingCommittedBaseRef.current = segmentManagerRef.current?.getTotalDuration() ?? 0;
      progressBarDurationShared.value = recordingCommittedBaseRef.current;
      currentSegmentDurationShared.value = 0;
      recordingStartAtRef.current = Date.now();

      try {
        const managerForDuration = segmentManagerRef.current;
        const availableNow = managerForDuration?.getAvailableTime() ?? 0;
        if (cameraRef.current) {
          const localRecorder = await videoOutput.createRecorder({});
          recorderRef.current = localRecorder;
          recordingPromiseRef.current = new Promise(resolve => {
            recordingPromiseResolverRef.current = resolve;
          });
          await localRecorder.startRecording(
            (filePath: string) => {
              recordingPromiseResolverRef.current?.({ uri: toFileUri(filePath) });
              recordingPromiseResolverRef.current = null;
            },
            () => {
              recordingPromiseResolverRef.current?.(undefined);
              recordingPromiseResolverRef.current = null;
              activeRecordingDiscardGenRef.current = null;
              isRecordingRef.current = false;
              setIsRecording(false);
              currentSegmentDurationShared.value = 0;
              recordingStartAtRef.current = null;
              recordingPromiseRef.current = null;
              recorderRef.current = null;
              recordingStateRef.current = 'idle';
            }
          );
          recordingStateRef.current = 'recording';
          activeRecordingDiscardGenRef.current = discardGenerationRef.current;
        } else {
          isRecordingRef.current = false;
          setIsRecording(false);
          recordingStartAtRef.current = null;
          recordingStateRef.current = 'idle';
        }
        if (recordingAutoStopTimeoutRef.current) {
          clearTimeout(recordingAutoStopTimeoutRef.current);
        }
        recordingAutoStopTimeoutRef.current = setTimeout(() => {
          // At auto-stop, recorder duration can lag slightly behind the configured max.
          // Use the exact remaining window as authoritative segment duration.
          forcedStopDurationRef.current = availableNow;
          progressBarDurationShared.value = Math.min(
            recordingCommittedBaseRef.current + availableNow,
            maxDuration
          );

          stopRecording()
            .then(() => finishRecordingRef.current?.({ force: true }))
            .catch(() => {
              // Automatic max-duration completion failed.
            });
        }, availableNow * 1000);
      } catch (_e) {
        activeRecordingDiscardGenRef.current = null;
        isRecordingRef.current = false;
        setIsRecording(false);
        currentSegmentDurationShared.value = 0;
        recordingStartAtRef.current = null;
        recordingPromiseRef.current = null;
        recorderRef.current = null;
        recordingStateRef.current = 'idle';
        forcedStopDurationRef.current = null;
      }
    }
  }, [
    microphonePermission,
    maxDuration,
    currentSegmentDurationShared,
    progressBarDurationShared,
    stopRecording,
    t,
    videoOutput,
  ]);

  // Handle press start - begin recording (press in to start)
  const handlePressIn = useCallback(() => {
    const currentTotal = segmentManagerRef.current?.getTotalDuration() ?? 0;
    const availableTime = segmentManagerRef.current?.getAvailableTime() ?? 0;
    if (
      !isRecordingRef.current &&
      recordingStateRef.current === 'idle' &&
      !isProcessing &&
      currentTotal < maxDuration &&
      availableTime > 0
    ) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      startRecording();
    }
  }, [isProcessing, startRecording, maxDuration]);

  // Handle press end - stop recording (press out to stop)
  const handlePressOut = useCallback(() => {
    if (isRecordingRef.current) {
      pauseCurrentSegment().catch(() => {
        // Segment pause failures are non-fatal; user can retry recording.
      });
    }
  }, [pauseCurrentSegment]);

  /**
   * Shutter-area vertical pan → zoom (same interpolate curve as VisionCamera CaptureButton).
   * @see https://github.com/mrousavy/react-native-vision-camera/blob/main/example/src/views/CaptureButton.tsx
   */
  const captureZoomPanGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!isDeletePreviewActive)
        .minDistance(6)
        .onStart(e => {
          'worklet';
          const startY = e.absoluteY;
          const yForFullZoom = startY * 0.7;
          const offsetYForFullZoom = startY - yForFullZoom;
          captureZoomPanStartY.value = startY;
          captureZoomPanOffsetY.value = interpolate(
            zoomShared.value,
            [deviceMinZoomSV.value, deviceMaxZoomSV.value],
            [0, offsetYForFullZoom],
            Extrapolation.CLAMP
          );
        })
        .onUpdate(e => {
          'worklet';
          const startY = captureZoomPanStartY.value;
          const offset = captureZoomPanOffsetY.value;
          const yForFullZoom = startY * 0.7;
          const minZ = deviceMinZoomSV.value;
          const maxZ = deviceMaxZoomSV.value;
          zoomShared.value = interpolate(
            e.absoluteY - offset,
            [yForFullZoom, startY],
            [maxZ, minZ],
            Extrapolation.CLAMP
          );
        }),
    [isDeletePreviewActive]
  );

  /**
   * Hold-to-record must survive vertical sliding for zoom. `Pressable` + `Gesture.Native()` loses
   * the press as soon as the simultaneous `Pan` activates (~6px). `LongPress` defaults to ~10pt
   * max movement before fail — raise it and disable cancel-when-outside so lift ends the segment.
   */
  const shutterHoldGesture = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(0)
        .maxDistance(Math.max(screenWidth, screenHeight) * 2)
        .shouldCancelWhenOutside(false)
        .enabled(
          !isDeletePreviewActive && availableTime > 0 && !isLoadingFromGallery && !isProcessing
        )
        .onStart(() => {
          'worklet';
          runOnJS(handlePressIn)();
        })
        .onFinalize(() => {
          'worklet';
          runOnJS(handlePressOut)();
        }),
    [
      availableTime,
      handlePressIn,
      handlePressOut,
      isDeletePreviewActive,
      isLoadingFromGallery,
      isProcessing,
      screenHeight,
      screenWidth,
    ]
  );

  const shutterZoomGesture = useMemo(
    () => Gesture.Simultaneous(captureZoomPanGesture, shutterHoldGesture),
    [captureZoomPanGesture, shutterHoldGesture]
  );

  const pickFromGallery = useCallback(async () => {
    try {
      setIsLoadingFromGallery(true);
      setIsProcessing(true);

      // Request media library permissions before opening picker (required for videos on iOS SDK 54+)
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        setIsLoadingFromGallery(false);
        setIsProcessing(false);
        Alert.alert(t('video.permissionRequired'), t('video.mediaLibraryPermissionRequired'));
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
          Alert.alert(t('video.invalidSelection'), t('video.selectVideoOnly'));
          setIsLoadingFromGallery(false);
          setIsProcessing(false);
          return;
        }
        const videoUri = asset.uri;

        try {
          // Validate file using library's API and get actual video duration
          const validationResult = await isValidFile(videoUri);
          if (!validationResult.isValid) {
            Alert.alert(t('video.invalidVideo'), t('video.invalidVideoFile'));
            setIsLoadingFromGallery(false);
            setIsProcessing(false);
            return;
          }

          // Check if there's available time
          const availableTime = segmentManagerRef.current?.getAvailableTime() ?? 0;
          if (availableTime <= 0) {
            Alert.alert(t('common.error'), t('video.noTimeRemaining'));
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
            cancelButtonText: t('common.cancel'),
            saveButtonText: t('common.done'),
            trimmerColor: Colors.purple[500],
            enableCancelTrimming: true,
            closeWhenFinish: true,
            autoplay: true,
            fullScreenModalIOS: true,
          });
        } catch (_error) {
          Alert.alert(t('common.error'), t('video.failedToOpenTrimmer'));
          setIsLoadingFromGallery(false);
          setIsProcessing(false);
        }
      } else {
        setIsLoadingFromGallery(false);
        setIsProcessing(false);
      }
    } catch (_e) {
      Alert.alert(t('common.error'), t('video.failedToAccessGallery'));
      setIsLoadingFromGallery(false);
      setIsProcessing(false);
    }
  }, [t]);

  const flipCamera = useCallback(() => {
    setIsFrontCamera(prev => !prev);
  }, []);

  /**
   * Tap-to-focus like Vision Camera's CameraPage (wrapper `onTouchEnd`), adapted to v4 `focusTo`.
   * @see https://github.com/mrousavy/react-native-vision-camera/blob/b1d5a62def410bad56df2773ce994311e16cc21c/example/src/CameraPage.tsx
   */
  const onFocusTap = useCallback(
    (event: GestureResponderEvent) => {
      if (isDeletePreviewActive) return;
      if (!cameraDevice?.supportsFocusMetering || isFrontCamera) return;

      const { locationX, locationY } = event.nativeEvent;
      void ErrorHandler.safeAsync(async () => {
        await cameraRef.current?.focusTo({ x: locationX, y: locationY });
      }, 'CreateScreen.camera.focusTo');
    },
    [cameraDevice?.supportsFocusMetering, isDeletePreviewActive, isFrontCamera]
  );

  const onCameraDoubleTapFlip = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    flipCamera();
  }, [flipCamera]);

  /** Matches example: TapGestureHandler with numberOfTaps={2} around the preview. */
  const cameraDoubleTapGesture = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .enabled(!isDeletePreviewActive)
        .onEnd(() => {
          'worklet';
          runOnJS(onCameraDoubleTapFlip)();
        }),
    [isDeletePreviewActive, onCameraDoubleTapFlip]
  );
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

  const leaveCreateScreen = useCallback(() => {
    if (isTrimmerActiveRef.current) {
      closeEditor();
    }
    router.back();
  }, [router]);

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
      Alert.alert(t('video.discardRecordings'), t('video.discardRecordingsMessage'), [
        {
          text: t('common.cancel'),
          style: 'cancel',
        },
        {
          text: t('common.discard'),
          style: 'destructive',
          onPress: () => {
            discardGenerationRef.current += 1;
            segmentManagerRef.current?.clear();
            totalDurationShared.value = 0;
            progressBarDurationShared.value = 0;
            setLastFrameThumbnail(null);
            setSegmentUpdateTrigger(prev => prev + 1);
            leaveCreateScreen();
          },
        },
      ]);
    } else {
      leaveCreateScreen();
    }
  };

  const finishRecording = useCallback(
    async (options?: { force?: boolean }) => {
      if (isDeletePreviewActive) {
        cancelDeletePreview();
      }
      const manager = segmentManagerRef.current;
      if (!manager || (isProcessing && !options?.force)) {
        return;
      }

      // Wait for any active recording to finish
      if (isRecordingRef.current) {
        await stopRecording();
      }

      if (abortControllerRef.current?.signal.aborted) return;

      const finalSegments = manager.getSegments();

      if (finalSegments.length === 0) {
        return;
      }

      // Convert to VideoSegment format
      const videoSegments = manager.toVideoSegments();
      const firstSegment = videoSegments[0];

      if (abortControllerRef.current?.signal.aborted) return;

      if (videoSegments.length === 1 && firstSegment) {
        const videoUri = firstSegment.video?.uri;
        if (videoUri) {
          setPendingVideoPost({
            videoPath: videoUri,
            textOverlays: [],
          });
          router.navigate({ pathname: '/post/[id]', params: { id: 'new' } });
        }
      } else {
        setPendingVideoPost({
          segments: videoSegments,
          textOverlays: [],
        });
        router.navigate({ pathname: '/post/[id]', params: { id: 'new' } });
      }
    },
    [
      cancelDeletePreview,
      isDeletePreviewActive,
      router,
      isProcessing,
      setPendingVideoPost,
      stopRecording,
    ]
  );

  useEffect(() => {
    finishRecordingRef.current = finishRecording;
  }, [finishRecording]);

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

    if (!cameraPermission.hasPermission) {
      return (
        <View style={styles.warningContainer}>
          <Icon
            name="video_camera_2"
            size={64}
            color={Colors.neutral[200]}
            style={styles.errorIcon}
          />
          <Text style={styles.warningText}>{t('video.pleaseEnableCamera')}</Text>
          <SquircleNativePressable
            style={styles.button}
            onPress={cameraPermission.requestPermission}
          >
            <Text style={styles.buttonText}>{t('video.grantPermission')}</Text>
          </SquircleNativePressable>
        </View>
      );
    }

    if (!cameraDevice) {
      return <View style={styles.warningContainer} />;
    }

    /** Same layering as Vision Camera example: pinch wraps a view with tap-to-focus, double-tap inside. */
    const cameraPreviewBody = (
      <View style={[styles.cameraWrapper, cameraLayout]}>
        <Camera
          ref={cameraRef}
          style={styles.cameraFill}
          device={cameraDevice}
          isActive={isFocused && !isTrimmerActive && !isDeletePreviewActive}
          outputs={[videoOutput]}
          torchMode={flash === 'on' && !isFrontCamera ? 'on' : 'off'}
          zoom={zoomShared}
          enableNativeTapToFocusGesture={false}
          onError={e => {
            if (__DEV__)
              logger.warn('[Camera] Mount error:', {
                component: 'Camera',
                message: e?.message ?? 'Unknown camera mount error',
              });
          }}
        />
        {isDeletePreviewActive && deletePreviewSegmentUri ? (
          <DeletePreviewSegmentVideo uri={deletePreviewSegmentUri} />
        ) : (
          isOnionSkinningEnabled &&
          lastFrameThumbnail && (
            <Image
              source={{ uri: lastFrameThumbnail }}
              style={styles.onionSkinOverlay}
              contentFit="cover"
              cachePolicy="memory-disk"
              pointerEvents="none"
            />
          )
        )}
      </View>
    );

    const cameraSurface = isDeletePreviewActive ? (
      <Pressable
        onPress={cancelDeletePreview}
        style={[styles.cameraPressable, cameraAndroidLayout]}
      >
        {cameraPreviewBody}
      </Pressable>
    ) : (
      <Animated.View style={[styles.cameraPressable, cameraAndroidLayout]} onTouchEnd={onFocusTap}>
        <GestureDetector gesture={cameraDoubleTapGesture}>
          <View style={[styles.cameraPressable, cameraAndroidLayout]} collapsable={false}>
            {cameraPreviewBody}
          </View>
        </GestureDetector>
      </Animated.View>
    );

    return (
      <>
        {/* Camera View - only render when screen is focused and trimmer is not active */}
        <View style={[styles.cameraContainer, cameraContainerLayout]}>
          {isFocused && !isTrimmerActive && (
            <GestureDetector gesture={cameraPinchGesture}>{cameraSurface}</GestureDetector>
          )}

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
              <View style={styles.recordButtonArea}>
                <View style={styles.recordButtonAreaSpacer} />
                <GestureDetector gesture={shutterZoomGesture}>
                  <Animated.View collapsable={false} style={styles.recordButtonContainer}>
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
                  </Animated.View>
                </GestureDetector>
                <View style={styles.recordButtonAreaSpacer}>
                  <NativePressable
                    style={styles.durationSelectorCollapsed}
                    onPress={() => {
                      const currentTotal = segmentManagerRef.current?.getTotalDuration() ?? 0;
                      const availableOptions = DURATION_OPTION_KEYS.filter(
                        opt => opt.value >= currentTotal
                      );
                      Haptics.selectionAsync();
                      Alert.alert(t('video.maxDuration'), t('video.selectMaxLength'), [
                        ...availableOptions.map(opt => ({
                          text: t(opt.labelKey),
                          onPress: () => setSelectedDuration(opt.value),
                        })),
                        { text: t('common.cancel'), style: 'cancel' as const },
                      ]);
                    }}
                  >
                    <Text style={styles.durationSelectorCollapsedText}>
                      {t(
                        DURATION_OPTION_KEYS.find(opt => opt.value === selectedDuration)
                          ?.labelKey ?? 'create.duration16s'
                      )}
                    </Text>
                  </NativePressable>
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
      <NativePressable
        style={[styles.backButton, backButtonPosition]}
        onPress={handleBackPress}
        androidRippleBorderless
      >
        <CloseFillIcon size={26} color="white" />
      </NativePressable>

      {segmentManagerRef.current?.hasSegments() && (
        <NativePressable
          style={[
            styles.doneButton,
            {
              top: isSmallDevice || !fitsNative16x9 ? 5 : insets.top + 4,
              right: 4,
            },
          ]}
          onPress={() => {
            finishRecording().catch(() => {
              // Manual completion failed.
            });
          }}
          disabled={isProcessing}
          androidRippleBorderless
        >
          <ArrowRightFillIcon size={30} color="white" />
        </NativePressable>
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
          availableTime <= 0 ||
          (segmentManagerRef.current?.hasSegments() ?? false)
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
    fontSize: Typography.sizes.title,
    fontFamily: FontFamily.semibold,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: Typography.lineHeights.title,
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
    fontSize: Typography.sizes.subtitle,
    fontFamily: FontFamily.semibold,
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
    fontSize: fontSizeFor(17),
    fontFamily: FontFamily.bold,
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
