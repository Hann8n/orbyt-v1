import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { BORDER_RADIUS } from '../src/utils/constants';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Alert,
  Platform,
  StatusBar,
  AppState,
  NativeEventEmitter,
  NativeModules,
  type EventSubscription,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CameraView,
  useCameraPermissions,
  useMicrophonePermissions,
  CameraRecordingOptions,
} from 'expo-camera';
import { useRouter, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  useFrameCallback,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Icon, {
  CloseFillIcon,
  Loading3FillIcon,
  ArrowRightFillIcon,
} from '../src/components/ui/Icon';
import BottomToolBar from '../src/components/ui/BottomToolBar';
import { useWindowDimensions } from 'react-native';
import * as Device from 'expo-device';
import { getBottomNavBarHeight } from '../src/utils/device/screen';
import { Colors } from '../src/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { showEditor, isValidFile, type Spec } from 'react-native-clip-trim';
import { SegmentManager, type Segment } from '../src/utils/video/segmentManager';

// Duration options in seconds
const DURATION_OPTIONS = [
  { value: 6, label: '6s' },
  { value: 16, label: '16s' },
  { value: 60, label: '1m' },
  { value: 180, label: '3m' },
] as const;

const CAPTURE_BUTTON_INNER_BG = 'rgba(129, 136, 150, 0.4)';
const CAPTURE_BUTTON_INNER_DISABLED_BG = 'rgba(129, 136, 150, 0.2)';

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
  const [isDurationSelectorExpanded, setIsDurationSelectorExpanded] = useState(false);
  const [isTrimmerActive, setIsTrimmerActive] = useState(false);

  // Segment manager - single source of truth
  const segmentManagerRef = useRef<SegmentManager | null>(null);
  const [segmentUpdateTrigger, setSegmentUpdateTrigger] = useState(0);

  // Recording state
  const segmentStartTime = useRef<number>(0);
  const cameraRef = useRef<CameraView>(null);
  const recordingPromiseRef = useRef<Promise<{ uri: string } | undefined> | null>(null);
  const isMountedRef = useRef(true);
  const isRecordingRef = useRef(false);
  const lastTapRef = useRef<number>(0);
  const tapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Animated values
  const totalDurationShared = useSharedValue(0); // Total duration from segments (updated when segments change)
  const recordingStartTime = useSharedValue<number | null>(null); // Start time of current recording (milliseconds)
  const recordingElapsed = useSharedValue(0); // Elapsed time during current recording (seconds) - updated continuously
  const buttonOpacity = useSharedValue(1);
  const zoomScale = useSharedValue(1);
  const baseZoom = useSharedValue(0);
  const startZoom = useSharedValue(0);

  // Use useFocusEffect from expo-router instead of useIsFocused from react-navigation
  // This ensures compatibility with Expo Router's navigation system
  const [isFocused, setIsFocused] = React.useState(false);
  useFocusEffect(
    React.useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
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

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomNavBarHeight = getBottomNavBarHeight(insets);
  const listenerSubscription = useRef<Record<string, EventSubscription>>({});

  // Track screen dimensions for camera updates on orientation change
  const [screenDims, setScreenDims] = useState(() => Dimensions.get('window'));

  useEffect(() => {
    const onChange = ({
      window,
    }: {
      window: { width: number; height: number; scale: number; fontScale: number };
    }) => {
      setScreenDims(window);
    };
    const subscription = Dimensions.addEventListener('change', onChange);
    return () => subscription?.remove();
  }, []);

  // Calculate dimensions from tracked state
  const screenWidth = screenDims.width;
  const screenHeight = screenDims.height;

  // Device detection
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isTabletDevice =
    Device.deviceType === Device.DeviceType.TABLET || Math.min(windowWidth, windowHeight) >= 600;
  const isSmallDevice = windowWidth <= 375 || windowHeight <= 667;

  // Camera key changes on dimension/orientation change to fix camera preview
  const cameraKey = `${Math.round(screenWidth)}x${Math.round(screenHeight)}-${isFrontCamera ? 'front' : 'back'}`;

  // For small screens and tablets, use full screen; otherwise use available space between safe areas
  const availableHeight =
    isSmallDevice || isTabletDevice ? screenHeight : screenHeight - insets.top - bottomNavBarHeight;

  // If small screen or tablet, use full screen; otherwise maintain 9:16 aspect ratio
  const cameraHeight =
    isSmallDevice || isTabletDevice
      ? screenHeight
      : Math.min((screenWidth * 16) / 9, availableHeight);
  const cameraWidth = screenWidth; // Use full width

  // Derived values from segment manager
  const maxDuration = selectedDuration;
  const availableTime = segmentManagerRef.current?.getAvailableTime() ?? 0;

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

  // Set up event listeners for react-native-clip-trim using Spec API
  useEffect(() => {
    const VideoTrimModule = NativeModules.VideoTrim as Spec;

    // Use the new Spec API if available, otherwise fall back to old architecture
    if (VideoTrimModule && typeof VideoTrimModule.onFinishTrimming === 'function') {
      // New Architecture - use Spec API
      listenerSubscription.current.onLoad = VideoTrimModule.onLoad(() => {});

      listenerSubscription.current.onStartTrimming = VideoTrimModule.onStartTrimming(() => {});

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

      listenerSubscription.current.onLog = VideoTrimModule.onLog(() => {});

      listenerSubscription.current.onStatistics = VideoTrimModule.onStatistics(() => {});

      listenerSubscription.current.onError = VideoTrimModule.onError(({ message }) => {
        Alert.alert('Error', message || 'Failed to trim video');
        setIsLoadingFromGallery(false);
        setIsProcessing(false);
        setIsTrimmerActive(false);
      });
    } else {
      // Fallback to old architecture
      const eventEmitter = new NativeEventEmitter(NativeModules.VideoTrim);
      listenerSubscription.current.onFinishTrimming = eventEmitter.addListener(
        'VideoTrim',
        (event: { name?: string; message?: string } & Record<string, unknown>) => {
          if (event.name === 'onFinishTrimming') {
            // Extract data from event (old architecture includes name property)
            const { name: _name, ...data } = event;
            handleTrimmingComplete(
              data as { outputPath: string; startTime: number; endTime: number }
            );
          } else if (event.name === 'onError') {
            Alert.alert('Error', event.message || 'Failed to trim video');
            setIsLoadingFromGallery(false);
            setIsProcessing(false);
            setIsTrimmerActive(false);
          } else if (event.name === 'onCancel') {
            setIsLoadingFromGallery(false);
            setIsProcessing(false);
            setIsTrimmerActive(false);
          } else if (event.name === 'onShow') {
            stopRecordingImmediate();
            setIsTrimmerActive(true);
          } else if (event.name === 'onHide') {
            setIsTrimmerActive(false);
          }
        }
      );
    }

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

  // Cleanup: reset processing state when component unmounts or user navigates away
  useEffect(() => {
    isMountedRef.current = true;
    const camera = cameraRef.current;
    return () => {
      isMountedRef.current = false;
      if (isRecordingRef.current && camera) {
        camera.stopRecording();
        recordingStartTime.value = null;
        isRecordingRef.current = false;
        setIsRecording(false);
      }
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
        tapTimeoutRef.current = null;
      }
      setIsProcessing(false);
    };
  }, [recordingStartTime]);

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
      isMountedRef.current = true;
      const camera = cameraRef.current;
      return () => {
        if (isRecordingRef.current && camera) {
          camera.stopRecording();
          recordingStartTime.value = null;
          isRecordingRef.current = false;
          setIsRecording(false);
        }
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

  // Reset zoom when switching cameras - CameraView respects the controlled zoom prop
  useEffect(() => {
    setZoom(0);
    zoomScale.value = 1;
    baseZoom.value = 0;
    startZoom.value = 0;
  }, [isFrontCamera, baseZoom, startZoom, zoomScale]);

  // Pinch gesture handler for zoom
  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      'worklet';
      // Store the current zoom as the starting point for this gesture
      startZoom.value = baseZoom.value;
    })
    .onUpdate(event => {
      'worklet';
      // Calculate new zoom: clamp between 0 and 1
      // Scale factor: 1.0 = no zoom, higher = zoom in
      // We use a multiplier for more natural feel (0.3 = slower, more controlled zoom)
      const scaleChange = (event.scale - 1) * 0.3;
      const newZoom = Math.max(0, Math.min(1, startZoom.value + scaleChange));
      baseZoom.value = newZoom;
      zoomScale.value = event.scale;
      scheduleOnRN(setZoom, newZoom);
    })
    .onEnd(() => {
      'worklet';
      zoomScale.value = 1;
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

      cameraRef.current.stopRecording();

      if (recordingPromiseRef.current) {
        const video = await recordingPromiseRef.current;
        if (video && segmentManagerRef.current && elapsedDuration > 0) {
          // Clamp elapsed duration to available time to prevent exceeding maxDuration
          const availableTime = segmentManagerRef.current.getAvailableTime();
          const clampedDuration = Math.min(elapsedDuration, availableTime);

          // Use the clamped duration for the segment
          const newSegment: Segment = {
            duration: clampedDuration,
            video,
            sourceType: 'camera',
          };

          if (clampedDuration > 0 && segmentManagerRef.current.addSegment(newSegment)) {
            // Update with actual total from segment manager (should match optimistic update)
            totalDurationShared.value = segmentManagerRef.current.getTotalDuration();
            setSegmentUpdateTrigger(prev => prev + 1);
          } else {
            // If segment couldn't be added, revert optimistic update
            totalDurationShared.value = segmentManagerRef.current.getTotalDuration();
          }
        } else if (elapsedDuration > 0 && segmentManagerRef.current) {
          // If video failed but we had elapsed time, revert optimistic update
          totalDurationShared.value = segmentManagerRef.current.getTotalDuration();
        }
      }

      recordingPromiseRef.current = null;
    } catch (_e) {
      // Reset recording timer shared values on error
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
      segmentStartTime.current = startTime;
      recordingStartTime.value = startTime; // Set shared value for UI-thread timer
      recordingElapsed.value = 0; // Reset elapsed time

      try {
        const availableTime = segmentManagerRef.current?.getAvailableTime() ?? 0;
        const recordingOptions: CameraRecordingOptions = {
          maxDuration: availableTime * 1000,
        };

        recordingPromiseRef.current = cameraRef.current.recordAsync(recordingOptions);
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
  const handlePressIn = useCallback(() => {
    const currentTotal = segmentManagerRef.current?.getTotalDuration() ?? 0;
    const availableTime = segmentManagerRef.current?.getAvailableTime() ?? 0;
    if (
      !isRecordingRef.current &&
      !isProcessing &&
      currentTotal < maxDuration &&
      availableTime > 0
    ) {
      startRecording();
    }
  }, [isProcessing, startRecording, maxDuration]);

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
        mediaTypes: 'videos',
        allowsMultipleSelection: false,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.High,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
        videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const videoUri = result.assets[0].uri;

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
    // Stop any active recording before switching cameras
    if (isRecordingRef.current && cameraRef.current) {
      await stopRecording();
    }
    // Reset zoom synchronously before switching cameras to ensure CameraView receives the update
    setZoom(0);
    zoomScale.value = 1;
    baseZoom.value = 0;
    startZoom.value = 0;
    setIsFrontCamera(prev => !prev);
  }, [stopRecording, baseZoom, startZoom, zoomScale]);

  const handleDoubleTap = useCallback(() => {
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
  }, [flipCamera]);
  const toggleFlash = useCallback(() => {
    // Only allow flash on back camera
    if (!isFrontCamera) {
      setFlash(prev => (prev === 'off' ? 'on' : 'off'));
    }
  }, [isFrontCamera]);

  const deleteLastSegment = useCallback(() => {
    if (!segmentManagerRef.current) return;

    const removedSegment = segmentManagerRef.current.removeLastSegment();
    if (removedSegment) {
      totalDurationShared.value = segmentManagerRef.current.getTotalDuration();
      setSegmentUpdateTrigger(prev => prev + 1);
    }
  }, [totalDurationShared]);

  const handleToolAction = useCallback(
    (action: string) => {
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
          deleteLastSegment();
          break;
        default:
          break;
      }
    },
    [pickFromGallery, flipCamera, toggleFlash, deleteLastSegment]
  );

  const handleBackPress = async () => {
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
    if (!segmentManagerRef.current || isProcessing) {
      return;
    }

    // Wait for any active recording to finish
    if (isRecordingRef.current) {
      await stopRecording();
    }

    const finalSegments = segmentManagerRef.current.getSegments();

    if (finalSegments.length === 0) {
      return;
    }

    // Convert to VideoSegment format
    const videoSegments = segmentManagerRef.current.toVideoSegments();

    // Only navigate if component is still mounted
    if (isMountedRef.current) {
      // In development, route to video editor for faster iteration; otherwise go straight to post.
      if (__DEV__) {
        if (videoSegments.length === 1) {
          router.navigate({
            pathname: '/video-editor',
            params: {
              videoPath: videoSegments[0].video.uri,
            },
          });
        } else {
          router.navigate({
            pathname: '/video-editor',
            params: {
              segments: JSON.stringify(videoSegments),
            },
          });
        }
      } else {
        if (videoSegments.length === 1) {
          router.navigate({
            pathname: '/post/[id]',
            params: {
              id: 'new',
              videoPath: videoSegments[0].video.uri,
            },
          });
        } else {
          router.navigate({
            pathname: '/post/[id]',
            params: {
              id: 'new',
              segments: JSON.stringify(videoSegments),
            },
          });
        }
      }
    }
  }, [router, isProcessing, stopRecording]);

  const cameraContainerLayout = useMemo(
    () => ({
      justifyContent: isTabletDevice
        ? 'center'
        : ((Platform.OS === 'ios' ? 'flex-start' : 'center') as const),
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
      marginTop: isTabletDevice ? 0 : Platform.OS === 'ios' ? (isSmallDevice ? 0 : insets.top) : 0,
    }),
    [cameraWidth, cameraHeight, isTabletDevice, isSmallDevice, insets.top]
  );
  const backButtonPosition = useMemo(
    () => ({ top: isSmallDevice ? 5 : insets.top + 4, left: 4 }),
    [isSmallDevice, insets.top]
  );
  const durationSelectorTop = useMemo(
    () => ({ top: isSmallDevice ? 5 : insets.top + 4 }),
    [isSmallDevice, insets.top]
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

    return (
      <>
        {/* Camera View - only render when screen is focused and trimmer is not active */}
        <View style={[styles.cameraContainer, cameraContainerLayout]}>
          {isFocused && !isTrimmerActive && (
            <GestureDetector gesture={pinchGesture}>
              <Animated.View style={[styles.cameraPressable, cameraAndroidLayout]}>
                <Pressable
                  onPress={handleDoubleTap}
                  style={[styles.cameraPressable, cameraAndroidLayout]}
                >
                  <CameraView
                    key={cameraKey}
                    ref={cameraRef}
                    style={[styles.camera, cameraLayout]}
                    facing={isFrontCamera ? 'front' : 'back'}
                    mode="video"
                    enableTorch={flash === 'on' && !isFrontCamera}
                    mute={!microphonePermission?.granted}
                    videoQuality="1080p"
                    zoom={zoom}
                  />
                </Pressable>
              </Animated.View>
            </GestureDetector>
          )}

          {/* Progress Bar - overlays on top of camera */}
          <View
            style={[
              styles.progressBarOverlay,
              {
                height:
                  isSmallDevice || isTabletDevice
                    ? isSmallDevice
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
            </View>
          </View>

          {/* Controls */}
          <View
            style={[
              styles.centerButtonContainer,
              { bottom: bottomNavBarHeight + (isSmallDevice ? 40 : 50) },
            ]}
          >
            <Pressable
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              disabled={availableTime <= 0}
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
                  <Loading3FillIcon size={32} color="white" />
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
          </View>
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

      {/* Duration Selector */}
      {!isRecording && (!segmentManagerRef.current || !segmentManagerRef.current.hasSegments()) && (
        <View style={[styles.durationSelector, durationSelectorTop]}>
          {isDurationSelectorExpanded ? (
            <>
              {DURATION_OPTIONS.map(option => {
                const useGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();
                const isSelected = selectedDuration === option.value;
                return (
                  <Pressable
                    key={option.value}
                    style={[
                      styles.durationOption,
                      useGlass && styles.durationOptionGlass,
                      isSelected &&
                        (useGlass
                          ? styles.durationOptionSelectedGlass
                          : styles.durationOptionSelected),
                    ]}
                    onPress={() => {
                      // Only allow changing duration if not recording and no segments exist
                      const hasSegments = segmentManagerRef.current?.hasSegments() ?? false;
                      if (!isRecording && !hasSegments) {
                        setSelectedDuration(option.value);
                        setIsDurationSelectorExpanded(false);
                      }
                    }}
                    disabled={isRecording || (segmentManagerRef.current?.hasSegments() ?? false)}
                  >
                    {useGlass && (
                      <GlassView
                        style={styles.glassBackground}
                        glassEffectStyle="clear"
                        tintColor="rgba(255, 255, 255, 0)"
                        isInteractive
                      />
                    )}
                    <Text
                      style={[
                        styles.durationOptionText,
                        isSelected && styles.durationOptionTextSelected,
                        (isRecording || (segmentManagerRef.current?.hasSegments() ?? false)) &&
                          styles.durationOptionTextDisabled,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </>
          ) : (
            <Pressable
              style={[
                styles.durationOption,
                Platform.OS === 'ios' && isLiquidGlassAvailable() && styles.durationOptionGlass,
              ]}
              onPress={() => setIsDurationSelectorExpanded(true)}
            >
              {Platform.OS === 'ios' && isLiquidGlassAvailable() && (
                <GlassView
                  style={styles.glassBackground}
                  glassEffectStyle="clear"
                  tintColor="rgba(255, 255, 255, 0)"
                  isInteractive
                />
              )}
              <Text style={styles.durationOptionText}>
                {DURATION_OPTIONS.find(opt => opt.value === selectedDuration)?.label || '16s'}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {segmentManagerRef.current?.hasSegments() && (
        <Pressable
          style={({ pressed }) => [
            styles.doneButton,
            {
              top: isSmallDevice ? 5 : insets.top + 4,
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
        isFrontCamera={isFrontCamera}
        disableGalleryUpload={Platform.OS === 'android' || availableTime <= 0}
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
  camera: {
    // Dimensions will be set dynamically via inline style
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
  backButton: {
    position: 'absolute',
    left: 10,
    zIndex: 1000,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationSelector: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 10,
    height: 44,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  durationOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    backgroundColor: Colors.overlay.white10,
    overflow: 'hidden',
  },
  durationOptionGlass: {
    backgroundColor: Colors.transparent,
  },
  glassBackground: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 15,
  },
  durationOptionSelected: {
    backgroundColor: Colors.neutral[50],
  },
  durationOptionSelectedGlass: {
    backgroundColor: Colors.overlay.white30,
  },
  durationOptionText: {
    color: Colors.neutral[50],
    fontSize: 14,
    fontFamily: 'Figtree-Medium',
  },
  durationOptionTextSelected: {
    color: Colors.neutral[50],
    fontFamily: 'Figtree-SemiBold',
  },
  durationOptionTextDisabled: {
    opacity: 0.5,
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
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
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
