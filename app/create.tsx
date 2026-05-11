import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import * as Device from 'expo-device';
import * as Haptics from 'expo-haptics';
import {
  useCameraDevice,
  useCameraPermission,
  useMicrophonePermission,
  useVideoOutput,
} from 'react-native-vision-camera';

import BottomToolBar from '@/components/ui/BottomToolBar';
import CameraStage from '@/components/features/create/CameraStage';
import CreateTopBar from '@/components/features/create/CreateTopBar';
import DurationSelector from '@/components/features/create/DurationSelector';
import PermissionGate from '@/components/features/create/PermissionGate';
import RecordButton from '@/components/features/create/RecordButton';
import RecordingProgressBar from '@/components/features/create/RecordingProgressBar';

import { useDeviceLayout } from '@/hooks/useDeviceLayout';
import { useGalleryTrimImport } from '@/hooks/useGalleryTrimImport';
import { useRecordingProgress } from '@/hooks/useRecordingProgress';
import { useSegmentRecorder } from '@/hooks/useSegmentRecorder';
import { useVisionCameraScreenActive } from '@/hooks/useVisionCameraScreenActive';
import { useCreateSegmentsStore } from '@/stores/createSegmentsStore';
import { usePendingVideoPostStore } from '@/stores/pendingVideoPostStore';
import { Colors } from '@/theme';
import { posthog } from '@/config/posthog';
import { getBottomNavBarHeight } from '@/utils/device/screen';

const CreateScreen: React.FC = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { screenWidth, screenHeight, isTablet, isSmallPhone, fitsNative16x9, cameraHeightFor16x9 } =
    useDeviceLayout();

  const cameraPermission = useCameraPermission();
  const microphonePermission = useMicrophonePermission();
  const backDevice = useCameraDevice('back');
  const frontDevice = useCameraDevice('front');
  const videoOutput = useVideoOutput({ enableAudio: true });

  const [isFrontCamera, setIsFrontCamera] = useState(false);
  const [flash, setFlash] = useState<'off' | 'on'>('off');
  const [isOnionSkinningEnabled, setIsOnionSkinningEnabled] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [_isDeletePreviewActive, setIsDeletePreviewActive] = useState(false);

  const segments = useCreateSegmentsStore(s => s.segments);
  const isDeletePreviewActive = _isDeletePreviewActive && segments.length > 0;
  const maxDuration = useCreateSegmentsStore(s => s.maxDuration);
  const setMaxDuration = useCreateSegmentsStore(s => s.setMaxDuration);
  const totalDuration = useCreateSegmentsStore(s =>
    s.segments.reduce((sum, seg) => sum + seg.duration, 0)
  );
  const availableTime = Math.max(0, maxDuration - totalDuration);
  const hasSegments = segments.length > 0;

  useEffect(() => {
    return () => useCreateSegmentsStore.getState().clear();
  }, []);

  const setPendingVideoPost = usePendingVideoPostStore(s => s.setPayload);

  const recorder = useSegmentRecorder({
    videoOutput,
    onAutoStopReached: () => {
      void finishRecording({ force: true });
    },
  });
  const { activeProgressSec } = useRecordingProgress(recorder);

  const navigateToPost = useCallback(
    (videoUri: string) => {
      setPendingVideoPost({ videoPath: videoUri, textOverlays: [] });
      router.navigate({ pathname: '/post/[id]', params: { id: 'new' } });
    },
    [router, setPendingVideoPost]
  );

  const gallery = useGalleryTrimImport({
    onBeforeEditor: () => recorder.cancel(),
    onSingleSegmentReady: navigateToPost,
  });

  const isCameraScreenActive = useVisionCameraScreenActive({
    disposeBeforeInactive: recorder.cancel,
    onFocusEnter: () => setIsProcessing(false),
    onInactiveAfterDispose: () => {
      setIsProcessing(false);
      setFlash('off');
      setIsDeletePreviewActive(false);
    },
  });

  useEffect(() => {
    if (!cameraPermission.hasPermission) void cameraPermission.requestPermission();
    if (!microphonePermission.hasPermission) void microphonePermission.requestPermission();
  }, [cameraPermission, microphonePermission]);

  const bottomNavBarHeight = getBottomNavBarHeight(insets, isSmallPhone);
  const cameraHeight = fitsNative16x9 && !isTablet ? cameraHeightFor16x9 : screenHeight;
  const cameraLayout = useMemo(
    () => ({
      width: screenWidth,
      height: cameraHeight,
      marginTop:
        isTablet || Platform.OS === 'android'
          ? 0
          : isSmallPhone || !fitsNative16x9
            ? 0
            : insets.top,
    }),
    [cameraHeight, fitsNative16x9, insets.top, isSmallPhone, isTablet, screenWidth]
  );
  const cameraContainerStyle = useMemo<{ justifyContent: 'flex-start' | 'center' }>(
    () => ({
      justifyContent: isTablet || Platform.OS === 'android' ? 'center' : 'flex-start',
    }),
    [isTablet]
  );
  const progressBarHeight =
    isSmallPhone || isTablet || !fitsNative16x9
      ? isSmallPhone || !fitsNative16x9
        ? 49
        : insets.top + 48
      : insets.top;
  const topBarTop = isSmallPhone || !fitsNative16x9 ? 5 : insets.top + 4;

  const cameraDevice = isFrontCamera ? frontDevice : backDevice;

  const flipCamera = useCallback(() => {
    setIsFrontCamera(prev => {
      if (!prev) setFlash('off');
      return !prev;
    });
  }, []);

  const toggleFlash = useCallback(() => {
    if (!isFrontCamera) setFlash(prev => (prev === 'off' ? 'on' : 'off'));
  }, [isFrontCamera]);

  const cancelDeletePreview = useCallback(() => setIsDeletePreviewActive(false), []);

  const startDeletePreview = useCallback(() => {
    if (segments.length === 0) return;
    setIsDeletePreviewActive(true);
  }, [segments.length]);

  const confirmDeletePreview = useCallback(() => {
    useCreateSegmentsStore.getState().removeLastSegment();
    setIsDeletePreviewActive(false);
  }, []);

  const deletePreviewUri = useMemo(() => {
    if (!isDeletePreviewActive || segments.length === 0) return null;
    const last = segments[segments.length - 1];
    return 'uri' in last.video ? last.video.uri : null;
  }, [isDeletePreviewActive, segments]);

  const handleToolAction = useCallback(
    (action: string) => {
      if (action !== 'delete' && isDeletePreviewActive) cancelDeletePreview();
      switch (action) {
        case 'gallery':
          void gallery.pickFromGallery();
          break;
        case 'flip':
          flipCamera();
          break;
        case 'flash':
          toggleFlash();
          break;
        case 'delete':
          if (isDeletePreviewActive) confirmDeletePreview();
          else startDeletePreview();
          break;
        case 'onion-skin':
          setIsOnionSkinningEnabled(prev => !prev);
          break;
      }
    },
    [
      cancelDeletePreview,
      confirmDeletePreview,
      flipCamera,
      gallery,
      isDeletePreviewActive,
      startDeletePreview,
      toggleFlash,
    ]
  );

  const finishRecording = useCallback(
    async (options?: { force?: boolean }) => {
      if (isDeletePreviewActive) cancelDeletePreview();
      if (isProcessing && !options?.force) return;

      if (recorder.isRecording) {
        setIsProcessing(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await recorder.stop();
        setIsProcessing(false);
      }

      const store = useCreateSegmentsStore.getState();
      if (store.segments.length === 0) return;

      const videoSegments = store.toVideoSegments();
      posthog.capture('video_recorded', { segment_count: videoSegments.length });

      if (videoSegments.length === 1) {
        const uri =
          videoSegments[0].video && 'uri' in videoSegments[0].video
            ? videoSegments[0].video.uri
            : null;
        if (uri) {
          setPendingVideoPost({ videoPath: uri, textOverlays: [] });
          router.navigate({ pathname: '/post/[id]', params: { id: 'new' } });
        }
        return;
      }

      setPendingVideoPost({ segments: videoSegments, textOverlays: [] });
      router.navigate({ pathname: '/post/[id]', params: { id: 'new' } });
    },
    [
      cancelDeletePreview,
      isDeletePreviewActive,
      isProcessing,
      recorder,
      router,
      setPendingVideoPost,
    ]
  );

  const handleBackPress = useCallback(async () => {
    if (isDeletePreviewActive) {
      cancelDeletePreview();
      return;
    }
    if (recorder.isRecording) await recorder.stop();

    const store = useCreateSegmentsStore.getState();
    const leave = () => {
      if (gallery.isTrimmerActive) gallery.closeTrimmer();
      router.back();
    };

    if (store.hasSegments() || store.totalDuration() > 0) {
      Alert.alert(t('video.discardRecordings'), t('video.discardRecordingsMessage'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.discard'),
          style: 'destructive',
          onPress: () => {
            useCreateSegmentsStore.getState().clear();
            leave();
          },
        },
      ]);
    } else {
      leave();
    }
  }, [cancelDeletePreview, gallery, isDeletePreviewActive, recorder, router, t]);

  // Closes the async gap: if pressOut fires before startRecording resolves, stop immediately on start.
  const isPressHeldRef = useRef(false);

  const handlePressIn = useCallback(() => {
    if (recorder.isRecording || isProcessing || availableTime <= 0) return;
    isPressHeldRef.current = true;
    void recorder.start().then(() => {
      if (!isPressHeldRef.current) recorder.stopFireAndForget();
    });
  }, [availableTime, isProcessing, recorder]);

  const handlePressOut = useCallback(() => {
    isPressHeldRef.current = false;
    if (!recorder.isRecording) return;
    recorder.stopFireAndForget();
  }, [recorder]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <StatusBar hidden />

      <CreateTopBar
        topInset={topBarTop}
        showDone={hasSegments}
        doneDisabled={isProcessing}
        onBack={() => void handleBackPress()}
        onDone={() => void finishRecording().catch(() => {})}
      />

      {!cameraPermission?.hasPermission ? (
        cameraPermission ? (
          <PermissionGate onRequestPermission={cameraPermission.requestPermission} />
        ) : (
          <View style={styles.emptyBackground} />
        )
      ) : !cameraDevice ? (
        <View style={styles.emptyBackground} />
      ) : (
        <>
          <CameraStage
            device={cameraDevice}
            videoOutput={videoOutput}
            isActive={isCameraScreenActive && !gallery.isTrimmerActive}
            isFrontCamera={isFrontCamera}
            flashOn={flash === 'on'}
            onionSkinEnabled={isOnionSkinningEnabled}
            deletePreviewUri={deletePreviewUri}
            onCancelDeletePreview={cancelDeletePreview}
            onDoubleTapFlip={flipCamera}
            layout={cameraLayout}
            containerStyle={cameraContainerStyle}
          />

          <RecordingProgressBar
            totalDuration={totalDuration}
            lastSegDuration={segments[segments.length - 1]?.duration ?? null}
            activeProgressSec={activeProgressSec}
            maxDuration={maxDuration}
            height={progressBarHeight}
            fillColor={maxDuration === 6 ? Colors.teal[500] : Colors.purple[500]}
            isDeletePreviewActive={isDeletePreviewActive}
          />

          {!isDeletePreviewActive && (
            <View
              style={[
                styles.bottomCluster,
                { bottom: bottomNavBarHeight + (isSmallPhone ? 40 : 50) },
              ]}
            >
              <View style={styles.row}>
                <View style={styles.spacer} />
                <RecordButton
                  isRecording={recorder.isRecording}
                  isLoading={gallery.isLoadingFromGallery}
                  disabled={availableTime <= 0 || gallery.isLoadingFromGallery}
                  onPressIn={handlePressIn}
                  onPressOut={handlePressOut}
                />
                <View style={styles.spacer}>
                  <DurationSelector selectedDuration={maxDuration} onSelect={setMaxDuration} />
                </View>
              </View>
            </View>
          )}
        </>
      )}

      <BottomToolBar
        mode="create"
        onToolPress={handleToolAction}
        flashActive={flash === 'on'}
        hasSegments={totalDuration > 0}
        isDeletePreviewActive={isDeletePreviewActive}
        isFrontCamera={isFrontCamera}
        disableGalleryUpload={
          Platform.OS === 'android' ||
          (Platform.OS === 'ios' && parseInt(Device.osVersion || '0', 10) < 17) ||
          availableTime <= 0 ||
          hasSegments
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
  emptyBackground: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  bottomCluster: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  row: {
    flexDirection: 'row',
    width: '100%',
    minHeight: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spacer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default CreateScreen;
