import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, type EventSubscription } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import VideoTrim, { closeEditor, isValidFile, showEditor, type Spec } from 'react-native-clip-trim';

import { Colors } from '@/theme';
import { posthog } from '@/config/posthog';
import { useCreateSegmentsStore } from '@/stores/createSegmentsStore';

const toFileUri = (path: string): string => (path.startsWith('file://') ? path : `file://${path}`);

interface Options {
  /** Called before showing the editor — chance to dispose camera resources. */
  onBeforeEditor?: () => Promise<void> | void;
  /** Called when a single trimmed video should immediately navigate to post (no other segments). */
  onSingleSegmentReady?: (videoUri: string) => void;
  /** Called after a trimmed video is added as a segment. */
  onSegmentAdded?: () => void;
}

interface Result {
  isLoadingFromGallery: boolean;
  isTrimmerActive: boolean;
  pickFromGallery: () => Promise<void>;
  closeTrimmer: () => void;
}

export function useGalleryTrimImport({
  onBeforeEditor,
  onSingleSegmentReady,
  onSegmentAdded,
}: Options): Result {
  const { t } = useTranslation();
  const [isLoadingFromGallery, setIsLoadingFromGallery] = useState(false);
  const [isTrimmerActive, setIsTrimmerActive] = useState(false);

  const closeTrimmer = useCallback(() => {
    closeEditor();
    setIsTrimmerActive(false);
  }, []);

  const pickFromGallery = useCallback(async () => {
    try {
      setIsLoadingFromGallery(true);

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setIsLoadingFromGallery(false);
        Alert.alert(t('video.permissionRequired'), t('video.mediaLibraryPermissionRequired'));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsMultipleSelection: false,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.High,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
        videoExportPreset: ImagePicker.VideoExportPreset.Passthrough,
      });

      if (result.canceled || !result.assets?.length) {
        setIsLoadingFromGallery(false);
        return;
      }

      const asset = result.assets[0];
      if (asset.type != null && asset.type !== 'video') {
        Alert.alert(t('video.invalidSelection'), t('video.selectVideoOnly'));
        setIsLoadingFromGallery(false);
        return;
      }

      const validation = await isValidFile(asset.uri);
      if (!validation.isValid) {
        Alert.alert(t('video.invalidVideo'), t('video.invalidVideoFile'));
        setIsLoadingFromGallery(false);
        return;
      }

      const available = useCreateSegmentsStore.getState().availableTime();
      if (available <= 0) {
        Alert.alert(t('common.error'), t('video.noTimeRemaining'));
        setIsLoadingFromGallery(false);
        return;
      }

      setIsLoadingFromGallery(false);
      posthog.capture('video_gallery_selected', { duration_ms: asset.duration ?? null });

      showEditor(asset.uri, {
        maxDuration: Platform.OS === 'ios' ? available : available * 1000,
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
    } catch {
      Alert.alert(t('common.error'), t('video.failedToAccessGallery'));
      setIsLoadingFromGallery(false);
    }
  }, [t]);

  useEffect(() => {
    const VideoTrimModule = VideoTrim as Spec;

    const endLoading = () => {
      setIsLoadingFromGallery(false);
      setIsTrimmerActive(false);
    };

    const subs: EventSubscription[] = [
      VideoTrimModule.onCancelTrimming(endLoading),
      VideoTrimModule.onCancel(endLoading),
      VideoTrimModule.onHide(() => setIsTrimmerActive(false)),
      VideoTrimModule.onShow(() => {
        void (async () => {
          await onBeforeEditor?.();
          setIsTrimmerActive(true);
        })();
      }),
      VideoTrimModule.onFinishTrimming(({ outputPath, startTime, endTime }) => {
        const trimmedSec = (endTime - startTime) / 1000;
        const store = useCreateSegmentsStore.getState();
        const available = store.availableTime();

        if (Math.round(trimmedSec * 1000) / 1000 > Math.round(available * 1000) / 1000) {
          Alert.alert(
            t('common.error'),
            t('video.trimmedExceedsAvailable', {
              trimmed: trimmedSec.toFixed(1),
              available: available.toFixed(1),
            })
          );
          endLoading();
          return;
        }

        const videoUri = toFileUri(outputPath);

        if (store.segments.length === 0) {
          onSingleSegmentReady?.(videoUri);
          endLoading();
          return;
        }

        const ok = store.addSegment({
          duration: trimmedSec,
          video: { uri: videoUri },
          sourceType: 'gallery',
        });
        if (!ok) {
          Alert.alert(t('common.error'), t('video.addingExceedsMaxDuration'));
          endLoading();
          return;
        }

        onSegmentAdded?.();
        endLoading();
      }),
      VideoTrimModule.onError(({ message }) => {
        Alert.alert(t('common.error'), message || t('video.failedToTrim'));
        endLoading();
      }),
    ];

    return () => subs.forEach(s => s.remove());
  }, [onBeforeEditor, onSegmentAdded, onSingleSegmentReady, t]);

  return { isLoadingFromGallery, isTrimmerActive, pickFromGallery, closeTrimmer };
}
