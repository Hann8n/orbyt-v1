import React, { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Camera, type CameraDevice, type CameraVideoOutput } from 'react-native-vision-camera';
import * as Haptics from 'expo-haptics';

import { logger } from '@/utils/logger';
import OnionSkinOverlay from './OnionSkinOverlay';
import DeletePreviewOverlay from './DeletePreviewOverlay';

interface Props {
  device: CameraDevice;
  videoOutput: CameraVideoOutput;
  isActive: boolean;
  isFrontCamera: boolean;
  flashOn: boolean;
  onionSkinEnabled: boolean;
  deletePreviewUri: string | null;
  onCancelDeletePreview: () => void;
  onDoubleTapFlip: () => void;
  layout: { width: number; height: number; marginTop: number };
  containerStyle?: { justifyContent: 'flex-start' | 'center' };
}

const CameraStage: React.FC<Props> = ({
  device,
  videoOutput,
  isActive,
  isFrontCamera,
  flashOn,
  onionSkinEnabled,
  deletePreviewUri,
  onCancelDeletePreview,
  onDoubleTapFlip,
  layout,
  containerStyle,
}) => {
  const isDeletePreviewActive = deletePreviewUri !== null;

  const doubleTap = useMemo(
    () =>
      Gesture.Tap()
        .runOnJS(true)
        .numberOfTaps(2)
        .enabled(!isDeletePreviewActive)
        .onEnd(() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onDoubleTapFlip();
        }),
    [isDeletePreviewActive, onDoubleTapFlip]
  );

  const cameraBody = (
    <View style={[styles.cameraWrapper, layout]}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isActive}
        outputs={[videoOutput]}
        torchMode={flashOn && !isFrontCamera ? 'on' : 'off'}
        enableNativeZoomGesture={!isDeletePreviewActive}
        enableNativeTapToFocusGesture={!isFrontCamera && !isDeletePreviewActive}
        enableSmoothAutoFocus={Platform.OS === 'ios'}
        onError={e => {
          logger.error('[Camera] error', { message: e?.message });
        }}
      />
      {isDeletePreviewActive && deletePreviewUri ? (
        <DeletePreviewOverlay uri={deletePreviewUri} />
      ) : (
        onionSkinEnabled && <OnionSkinOverlay />
      )}
    </View>
  );

  return (
    <View style={[styles.container, containerStyle]}>
      <GestureDetector gesture={doubleTap}>
        <View style={styles.surface} collapsable={false}>
          {cameraBody}
          {isDeletePreviewActive && (
            <Pressable style={StyleSheet.absoluteFill} onPress={onCancelDeletePreview} />
          )}
        </View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
    alignItems: 'center',
  },
  surface: {
    width: '100%',
    height: '100%',
    flex: 1,
  },
  cameraWrapper: {
    position: 'relative',
    overflow: 'hidden',
  },
});

export default React.memo(CameraStage);
