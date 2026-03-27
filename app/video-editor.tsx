import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  TextInput,
  Dimensions,
  Platform,
  PanResponder,
  Keyboard,
  StatusBar,
  AppState,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView, VideoPlayer } from 'expo-video';
import { File, Directory, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import {
  ensureFileUri,
  normalizePathForNative,
  resolveVideoPath,
  VideoPathInfo,
} from '@/utils/video/path';
import { DEFAULT_BUFFER_OPTIONS } from '@/utils/video/helpers';
import { CloseFillIcon } from '@/components/ui/Icon';
import { Colors } from '@/theme';
import { BORDER_RADIUS, APP_CONSTANTS } from '@/utils/constants';
import VideoEditingService, {
  TextOverlayOptions,
  BackgroundMusicOptions,
} from '@/services/video/VideoEditingService';
import VideoProcessingService from '@/services/video/VideoProcessingService';
import { usePendingVideoPostStore } from '@/stores/pendingVideoPostStore';
import VerticalListSheet, {
  VerticalListButton,
  TrueSheet,
} from '@/components/ui/VerticalListSheet';
import BottomToolBar from '@/components/ui/BottomToolBar';
import { getBottomNavBarHeight } from '@/utils/device/screen';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
import { logger } from '@/utils/logger';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ASPECT_RATIO = 9 / 16;
const VIDEO_WIDTH = SCREEN_WIDTH;
const VIDEO_HEIGHT = VIDEO_WIDTH / ASPECT_RATIO;

interface TextOverlayEdit {
  id: string;
  text: string;
  position: { x: number | string; y: number | string };
  size: number;
  color: string;
  fontFamily?: string;
}

const TEXT_COLORS = [
  { name: 'White', value: 'white' },
  { name: 'Black', value: Colors.black },
  { name: 'Red', value: Colors.coral[500] },
  { name: 'Green', value: Colors.teal[500] },
  { name: 'Blue', value: Colors.blue[500] },
  { name: 'Purple', value: Colors.purple[500] },
  { name: 'Yellow', value: Colors.amber[500] },
  { name: 'Orange', value: Colors.orange[500] },
];

// Editable Text Overlay Component
interface EditableTextOverlayProps {
  overlay: TextOverlayEdit;
  previewX: number;
  previewY: number;
  isDragging: boolean;
  isEditing: boolean;
  onDragStart: (id: string) => void;
  onDragMove: (id: string, x: number, y: number) => void;
  onDragEnd: (id: string) => void;
  onTap: (id: string) => void;
  onTextChange: (id: string, text: string) => void;
}

const EditableTextOverlay: React.FC<EditableTextOverlayProps> = ({
  overlay,
  previewX,
  previewY,
  isDragging,
  isEditing,
  onDragStart,
  onDragMove,
  onDragEnd,
  onTap,
  onTextChange,
}) => {
  const { t } = useTranslation();
  const textInputRef = useRef<TextInput>(null);
  const dragStartPositions = useRef<{ x: number; y: number } | null>(null);
  const hasMoved = useRef(false);
  const tapTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [panHandlers, setPanHandlers] = useState<
    ReturnType<typeof PanResponder.create>['panHandlers'] | null
  >(null);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && textInputRef.current) {
      setTimeout(() => {
        textInputRef.current?.focus();
      }, 100);
    }
  }, [isEditing]);

  useEffect(() => {
    const responder = PanResponder.create({
      onStartShouldSetPanResponder: () => !isEditing,
      onMoveShouldSetPanResponder: (_evt, gestureState) => {
        if (isEditing) return false;
        return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
      },
      onPanResponderGrant: () => {
        if (isEditing) return;
        dragStartPositions.current = { x: previewX, y: previewY };
        hasMoved.current = false;
        tapTimeout.current = setTimeout(() => {
          if (!hasMoved.current) {
            onTap(overlay.id);
          }
        }, 200);
      },
      onPanResponderMove: (_evt, gestureState) => {
        if (isEditing) return;
        if (Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5) {
          hasMoved.current = true;
          if (tapTimeout.current) {
            clearTimeout(tapTimeout.current);
            tapTimeout.current = null;
          }
          if (dragStartPositions.current) {
            const newX = Math.max(
              0,
              Math.min(SCREEN_WIDTH - 50, dragStartPositions.current.x + gestureState.dx)
            );
            const newY = Math.max(
              0,
              Math.min(VIDEO_HEIGHT - 30, dragStartPositions.current.y + gestureState.dy)
            );
            onDragMove(overlay.id, newX, newY);
            if (!isDragging) {
              onDragStart(overlay.id);
            }
          }
        }
      },
      onPanResponderRelease: () => {
        if (isEditing) return;
        if (tapTimeout.current) {
          clearTimeout(tapTimeout.current);
          tapTimeout.current = null;
        }
        if (hasMoved.current) {
          dragStartPositions.current = null;
          onDragEnd(overlay.id);
        } else {
          onTap(overlay.id);
        }
      },
    });

    setPanHandlers(responder.panHandlers);
  }, [
    overlay.id,
    previewX,
    previewY,
    isDragging,
    isEditing,
    onDragStart,
    onDragMove,
    onDragEnd,
    onTap,
  ]);

  const activePanHandlers = panHandlers ?? {};

  const displayText = overlay.text.trim() || t('video.tapToEdit');
  const isEmpty = !overlay.text.trim();

  if (isEditing) {
    return (
      <View
        style={[
          styles.textOverlayPreview,
          styles.textOverlayEditing,
          {
            left: previewX,
            top: previewY,
          },
        ]}
      >
        <TextInput
          ref={textInputRef}
          nativeID={`video-editor-text-overlay-${overlay.id}`}
          style={[
            styles.textOverlayInput,
            {
              fontSize: overlay.size,
              color: overlay.color,
              fontFamily: overlay.fontFamily || 'Figtree-Bold',
            },
          ]}
          value={overlay.text}
          onChangeText={text => onTextChange(overlay.id, text)}
          placeholder={t('video.enterText')}
          placeholderTextColor={Colors.neutral[200]}
          multiline
          autoFocus
          blurOnSubmit={false}
          autoComplete="off"
          textContentType="none"
          importantForAutofill="no"
          caretHidden={false}
        />
      </View>
    );
  }

  return (
    <View
      {...activePanHandlers}
      style={[
        styles.textOverlayPreview,
        {
          left: previewX,
          top: previewY,
        },
        isDragging && styles.textOverlayPreviewDragging,
        isEmpty && styles.textOverlayPreviewEmpty,
      ]}
    >
      <Text
        style={[
          styles.textOverlayPreviewText,
          {
            fontSize: overlay.size,
            color: overlay.color,
            fontFamily: overlay.fontFamily || 'Figtree-Bold',
          },
          isEmpty && styles.textOverlayPreviewTextEmpty,
        ]}
      >
        {displayText}
      </Text>
    </View>
  );
};

const VideoEditorScreen: React.FC = () => {
  const { t } = useTranslation();
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const playerRef = useRef<VideoPlayer | null>(null);

  // Get video path or segments from params (same as post screen)
  const videoPath = params.videoPath as string | undefined;
  const segmentsParam = params.segments as string | undefined;

  // Background merging state (same as post screen)
  const [isMerging, setIsMerging] = useState(false);
  const [mergedVideoPath, setMergedVideoPath] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [videoLoading, setVideoLoading] = useState(true);
  const [videoError, setVideoError] = useState<string | null>(null);

  // Text overlay state
  const [textOverlays, setTextOverlays] = useState<TextOverlayEdit[]>([]);
  const [editingOverlayId, setEditingOverlayId] = useState<string | null>(null);
  const [draggingOverlayId, setDraggingOverlayId] = useState<string | null>(null);
  const [keyboardHeight] = useState(0);

  // Background music state
  const [musicPath, setMusicPath] = useState<string | null>(null);
  const [videoVolume] = useState(1.0);
  const [musicVolume] = useState(1.0);

  // Volume control state
  const [masterVolume] = useState(1.0);

  // Temporary files to clean up
  const tempFilesRef = useRef<string[]>([]);

  // Handle background merging if segments are provided (same as post screen)
  useEffect(() => {
    if (!segmentsParam || mergedVideoPath) return; // Already merged or no segments

    const mergeSegments = async () => {
      try {
        setIsMerging(true);

        // Parse segments from params
        const segments = JSON.parse(segmentsParam) as unknown;

        if (!segments || !Array.isArray(segments) || segments.length === 0) {
          throw new Error('No video segments provided');
        }

        // Type guard for segment structure
        type ParsedSegment = {
          startTime?: unknown;
          duration?: unknown;
          video?: unknown;
          sourceType?: unknown;
        };

        // Convert to ProcessingVideoSegment format with proper type checking
        const processingSegments = (segments as ParsedSegment[]).map(segment => {
          if (
            typeof segment.startTime !== 'number' ||
            typeof segment.duration !== 'number' ||
            !segment.video ||
            typeof segment.video !== 'object'
          ) {
            throw new Error('Invalid segment format');
          }
          return {
            startTime: segment.startTime,
            duration: segment.duration,
            video: segment.video as { uri: string } | { uri: string; [key: string]: unknown },
            sourceType: segment.sourceType as 'camera' | 'gallery' | undefined,
          };
        });

        // Merge segments in background using requestIdleCallback
        requestIdleCallback(
          async () => {
            const mergedVideo = await VideoProcessingService.mergeSegments(processingSegments);
            setMergedVideoPath(mergedVideo.path);
            setIsMerging(false);
          },
          { timeout: APP_CONSTANTS.IDLE_CALLBACK_TIMEOUT }
        );
      } catch (error: unknown) {
        logger.error('Error merging segments', error, { component: 'VideoEditor' });
        setIsMerging(false);
        const errorMessage =
          error instanceof Error ? error.message : t('video.mergingFailedMessage');
        Alert.alert(t('video.mergingFailed'), errorMessage, [
          {
            text: t('common.goBack'),
            onPress: () => router.back(),
          },
        ]);
      }
    };

    mergeSegments();
  }, [segmentsParam, mergedVideoPath, router, t]);

  // Determine the active video path (merged > provided > null) - same as post screen
  const activeVideoPath = mergedVideoPath || videoPath;

  // Resolved video path info (same as post screen)
  const [videoPathInfo, setVideoPathInfo] = useState<VideoPathInfo | null>(null);

  // Resolve video path on mount or when activeVideoPath changes (same as post screen)
  useEffect(() => {
    const resolveVideo = async () => {
      // Wait for merging to complete if in progress
      if (isMerging || !activeVideoPath) {
        if (isMerging) {
          setVideoLoading(true);
          setVideoError(null);
        }
        return;
      }

      try {
        setVideoLoading(true);
        setVideoError(null);

        // Use the utility to resolve the path (handles iCloud, normalization, validation)
        const pathInfo = await resolveVideoPath(activeVideoPath);

        setVideoPathInfo(pathInfo);

        if (!pathInfo.exists) {
          setVideoError(t('video.videoFileNotFound'));
        }
      } catch (error) {
        logger.error('Error resolving video path', error, { component: 'VideoEditor' });
        setVideoError(t('video.unableToAccessVideoFile'));
      } finally {
        setVideoLoading(false);
      }
    };

    resolveVideo();
  }, [activeVideoPath, isMerging, t]);

  // Final video URI for playback (same as post screen)
  const videoUri = videoPathInfo?.uri || '';

  // Simple video player - auto-plays when source is set (same as post screen)
  const player = useVideoPlayer(videoUri ? { uri: videoUri } : null, p => {
    p.loop = true;
    p.volume = masterVolume;
    p.bufferOptions = DEFAULT_BUFFER_OPTIONS;
    playerRef.current = p;
  });

  // Update source and play when videoUri changes (same as post screen)
  useEffect(() => {
    if (!player || !videoUri) return;
    player.replaceAsync({ uri: videoUri }).then(() => {
      player.play();
    });
  }, [player, videoUri]);

  // Sync play/pause state (same as post screen)
  useEffect(() => {
    if (!player) return;
    if (isPlaying) {
      player.play();
    } else {
      player.pause();
    }
  }, [player, isPlaying]);

  // Update volume when masterVolume changes
  useEffect(() => {
    if (player) {
      player.volume = masterVolume;
    }
  }, [player, masterVolume]);

  // Cleanup temporary files
  useEffect(() => {
    const tempFiles = tempFilesRef.current;
    return () => {
      tempFiles.forEach(file => {
        try {
          const tempFile = new File(normalizePathForNative(file));
          if (tempFile.exists) {
            tempFile.delete();
          }
        } catch (error) {
          logger.warn('Failed to cleanup temp file', { component: 'VideoEditor', error });
        }
      });
    };
  }, []);

  // Generate temporary file path using new FileSystem API
  const getTempFilePath = useCallback(async (): Promise<string> => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const fileName = `video_edit_${timestamp}_${random}.mp4`;
    const tempDir = new Directory(Paths.cache, `video_edit_${timestamp}`);
    tempDir.create({ intermediates: true, idempotent: true });
    const outputFile = new File(tempDir, fileName);
    const tempPath = normalizePathForNative(outputFile.uri);
    tempFilesRef.current.push(tempPath);
    return tempPath;
  }, []);

  // Add text overlay - immediately add empty overlay to video and start editing
  const handleAddTextOverlay = useCallback(() => {
    const newOverlay: TextOverlayEdit = {
      id: `overlay_${Date.now()}`,
      text: '', // Empty text initially
      position: { x: SCREEN_WIDTH / 2, y: VIDEO_HEIGHT / 2 }, // Center position in pixels
      size: 24,
      color: 'white',
    };
    // Add to overlays immediately
    setTextOverlays(prev => [...prev, newOverlay]);
    // Start editing inline
    setEditingOverlayId(newOverlay.id);
  }, []);

  // Handle tap on text overlay to edit inline
  const handleTapTextOverlay = useCallback((id: string) => {
    setEditingOverlayId(id);
  }, []);

  // Update text overlay text
  const handleTextChange = useCallback((id: string, text: string) => {
    setTextOverlays(prev => prev.map(o => (o.id === id ? { ...o, text } : o)));
  }, []);

  // Update text overlay properties
  const handleOverlayUpdate = useCallback((id: string, updates: Partial<TextOverlayEdit>) => {
    setTextOverlays(prev => prev.map(o => (o.id === id ? { ...o, ...updates } : o)));
  }, []);

  // Delete text overlay
  const handleDeleteTextOverlay = useCallback(
    (id: string) => {
      setTextOverlays(prev => prev.filter(o => o.id !== id));
      if (editingOverlayId === id) {
        setEditingOverlayId(null);
        Keyboard.dismiss();
      }
    },
    [editingOverlayId]
  );

  // Done editing
  const handleDoneEditing = useCallback(() => {
    setEditingOverlayId(null);
    Keyboard.dismiss();
  }, []);

  // Get currently editing overlay
  const editingOverlay = editingOverlayId
    ? textOverlays.find(o => o.id === editingOverlayId)
    : null;

  // Handle drag events for text overlays
  const handleDragStart = useCallback((id: string) => {
    setDraggingOverlayId(id);
  }, []);

  const handleDragMove = useCallback((id: string, x: number, y: number) => {
    setTextOverlays(prev => prev.map(o => (o.id === id ? { ...o, position: { x, y } } : o)));
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingOverlayId(null);
  }, []);

  // Select background music
  const handleSelectMusic = useCallback(async () => {
    try {
      const permissionResult = await MediaLibrary.requestPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert(t('video.permissionRequired'), t('video.mediaLibraryPermissionForMusic'));
        return;
      }

      const assets = await MediaLibrary.getAssetsAsync({
        mediaType: 'audio',
        first: 100,
      });

      if (assets.assets.length === 0) {
        Alert.alert(t('video.noMusicFound'), t('video.noMusicFoundMessage'));
        return;
      }

      // For simplicity, use first audio file
      // In a full implementation, show a picker
      const selectedAsset = assets.assets[0];
      const assetInfo = await MediaLibrary.getAssetInfoAsync(selectedAsset.id);

      if (assetInfo.localUri) {
        setMusicPath(assetInfo.localUri);
        TrueSheet.dismiss('video-editor-music-sheet');
      } else {
        Alert.alert(t('common.error'), t('video.couldNotAccessMusicFile'));
      }
    } catch (error) {
      logger.error('Error selecting music', error, { component: 'VideoEditor' });
      Alert.alert(t('common.error'), t('video.failedToSelectMusicFile'));
    }
  }, [t]);

  // Apply all edits
  const handleApplyEdits = useCallback(async () => {
    if (isProcessing || !activeVideoPath) return;

    setIsProcessing(true);
    setVideoLoading(true);

    try {
      let workingPath = activeVideoPath.replace('file://', '');

      // Step 1: Apply text overlays
      if (textOverlays.length > 0) {
        for (let i = 0; i < textOverlays.length; i++) {
          const overlay = textOverlays[i];
          const outputPath = await getTempFilePath();

          // Convert position to FFmpeg format (strings like '(w-text_w)/2' or numeric pixels)
          const xPos =
            typeof overlay.position.x === 'number'
              ? overlay.position.x.toString()
              : overlay.position.x;
          const yPos =
            typeof overlay.position.y === 'number'
              ? overlay.position.y.toString()
              : overlay.position.y;

          const options: TextOverlayOptions = {
            x: xPos,
            y: yPos,
            size: overlay.size,
            color: overlay.color,
          };

          const resultPath = await VideoEditingService.addTextOverlay(
            workingPath,
            outputPath,
            overlay.text,
            options
          );

          // Update working path for next overlay
          workingPath = resultPath.replace('file://', '');
        }
      }

      // Step 2: Add background music (if selected)
      if (musicPath) {
        const outputPath = await getTempFilePath();
        const musicOptions: BackgroundMusicOptions = {
          videoVolume,
          musicVolume,
        };

        const resultPath = await VideoEditingService.addBackgroundMusic(
          workingPath,
          musicPath.replace('file://', ''),
          outputPath,
          musicOptions
        );

        workingPath = resultPath.replace('file://', '');
      }

      // Step 3: Adjust volume (if changed from default)
      if (masterVolume !== 1.0) {
        const outputPath = await getTempFilePath();
        const resultPath = await VideoEditingService.adjustVolume(
          workingPath,
          outputPath,
          masterVolume
        );

        workingPath = resultPath.replace('file://', '');
      }

      // Update merged video path
      const finalPath = ensureFileUri(workingPath);
      setMergedVideoPath(finalPath);

      // Reset video player
      if (player) {
        player.currentTime = 0;
      }

      Alert.alert(t('common.success'), t('video.videoEditsAppliedSuccess'));
    } catch (error: unknown) {
      logger.error('Error applying edits', error, { component: 'VideoEditor' });
      const errorMessage = error instanceof Error ? error.message : t('video.failedToApplyEdits');
      Alert.alert(t('common.error'), errorMessage);
    } finally {
      setIsProcessing(false);
      setVideoLoading(false);
    }
  }, [
    textOverlays,
    musicPath,
    videoVolume,
    musicVolume,
    masterVolume,
    activeVideoPath,
    getTempFilePath,
    player,
    isProcessing,
    t,
  ]);

  // Check if there are pending edits
  const hasPendingEdits = textOverlays.length > 0 || musicPath !== null || masterVolume !== 1.0;

  const handleBack = () => {
    router.back();
  };

  const handleNext = async () => {
    if (!activeVideoPath) {
      Alert.alert(t('common.error'), t('video.noVideoAvailable'));
      return;
    }

    const normalizedPath = activeVideoPath.startsWith('file://')
      ? activeVideoPath
      : `file://${activeVideoPath}`;

    const thumbnailPath = await VideoProcessingService.extractFirstFrame(normalizedPath, null, {
      quality: 0.5,
    }).catch(() => undefined);

    usePendingVideoPostStore.getState().setPayload({
      videoPath: normalizedPath,
      thumbnailPath: thumbnailPath ?? undefined,
    });
    router.navigate({ pathname: '/post/[id]', params: { id: 'new' } });
  };

  const bottomNavBarHeight = getBottomNavBarHeight(insets);

  const handleToolAction = useCallback(
    (action: string) => {
      switch (action) {
        case 'text':
          handleAddTextOverlay();
          break;
        case 'audio':
          TrueSheet.present('video-editor-music-sheet');
          break;
        default:
          break;
      }
    },
    [handleAddTextOverlay]
  );

  const { isSmallPhone: isSmallDevice } = useDeviceLayout();

  // Keep status bar hidden even when app returns from background
  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active') {
        StatusBar.setHidden(true, 'none');
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
      StatusBar.setHidden(false, 'fade');
    };
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar hidden={true} />
      {/* Header buttons - matches create screen */}
      <Pressable
        style={({ pressed }) => [
          styles.backButton,
          {
            top: isSmallDevice ? 5 : insets.top + 4,
            left: 4,
          },
          pressed && { opacity: 0.7 },
        ]}
        onPress={handleBack}
      >
        <CloseFillIcon size={26} color="white" />
      </Pressable>

      {/* Video Preview Container - matches cameraContainer from create.tsx */}
      <View style={styles.videoContainer}>
        <Pressable onPress={() => setIsPlaying(!isPlaying)} style={styles.videoWrapper}>
          {videoUri && player && (
            <VideoView
              player={player}
              style={styles.video}
              contentFit="contain"
              nativeControls={false}
              surfaceType={Platform.OS === 'android' ? 'textureView' : undefined}
            />
          )}
          {(videoLoading || isMerging) && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={Colors.neutral[50]} />
            </View>
          )}
          {videoError && (
            <View style={[styles.loadingOverlay, styles.errorOverlay]}>
              <Text style={styles.errorText}>{videoError}</Text>
            </View>
          )}
          {/* Text Overlay Previews */}
          {textOverlays.map(overlay => {
            // Calculate preview position from FFmpeg expressions or use numeric values
            let previewX = SCREEN_WIDTH / 2;
            let previewY = VIDEO_HEIGHT / 2;

            if (typeof overlay.position.x === 'number') {
              previewX = overlay.position.x;
            } else if (typeof overlay.position.x === 'string') {
              // Parse common FFmpeg expressions for preview
              if (overlay.position.x === '(w-text_w)/2') previewX = SCREEN_WIDTH / 2;
              else if (overlay.position.x === 'w-text_w-10') previewX = SCREEN_WIDTH - 100;
              else if (overlay.position.x === '10') previewX = 10;
            }

            if (typeof overlay.position.y === 'number') {
              previewY = overlay.position.y;
            } else if (typeof overlay.position.y === 'string') {
              if (overlay.position.y === '(h-text_h)/2') previewY = VIDEO_HEIGHT / 2;
              else if (overlay.position.y === 'h-text_h-10') previewY = VIDEO_HEIGHT - 50;
              else if (overlay.position.y === '10') previewY = 10;
            }

            return (
              <EditableTextOverlay
                key={overlay.id}
                overlay={overlay}
                previewX={previewX}
                previewY={previewY}
                isDragging={draggingOverlayId === overlay.id}
                isEditing={editingOverlayId === overlay.id}
                onDragStart={handleDragStart}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
                onTap={handleTapTextOverlay}
                onTextChange={handleTextChange}
              />
            );
          })}
          {/* Play/Pause Indicator */}
          {!isPlaying && !videoLoading && (
            <View style={styles.playIndicator}>
              <Text style={styles.playIndicatorText}>▶</Text>
            </View>
          )}
        </Pressable>

        {/* Apply Changes Button - positioned absolutely */}
        {hasPendingEdits && (
          <Pressable
            style={[
              styles.applyButton,
              { bottom: bottomNavBarHeight + 20 },
              isProcessing && styles.applyButtonDisabled,
            ]}
            onPress={handleApplyEdits}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color={Colors.neutral[50]} />
            ) : (
              <Text style={styles.applyButtonText}>{t('video.applyChanges')}</Text>
            )}
          </Pressable>
        )}
      </View>

      {/* Music Selection Sheet */}
      <VerticalListSheet
        name="video-editor-music-sheet"
        onDismiss={() => {}}
        title={t('video.selectBackgroundMusic')}
      >
        <VerticalListButton label={t('video.chooseFromLibrary')} onPress={handleSelectMusic} />
        <VerticalListButton
          label={t('common.cancel')}
          onPress={() => TrueSheet.dismiss('video-editor-music-sheet')}
        />
      </VerticalListSheet>

      {/* Text Overlay Controls - appears above keyboard when editing */}
      {editingOverlay && keyboardHeight > 0 && (
        <View style={[styles.textControlsBar, { bottom: keyboardHeight }]}>
          <View style={styles.textControlsRow}>
            {/* Size controls */}
            <Pressable
              style={styles.controlButton}
              onPress={() =>
                handleOverlayUpdate(editingOverlay.id, {
                  size: Math.max(12, editingOverlay.size - 4),
                })
              }
            >
              <Text style={styles.controlButtonText}>−</Text>
            </Pressable>
            <Text style={styles.controlValue}>{editingOverlay.size}</Text>
            <Pressable
              style={styles.controlButton}
              onPress={() =>
                handleOverlayUpdate(editingOverlay.id, {
                  size: Math.min(72, editingOverlay.size + 4),
                })
              }
            >
              <Text style={styles.controlButtonText}>+</Text>
            </Pressable>

            {/* Color picker */}
            <View style={styles.colorRow}>
              {TEXT_COLORS.map(color => (
                <Pressable
                  key={color.value}
                  style={[
                    styles.colorDot,
                    { backgroundColor: color.value },
                    editingOverlay.color === color.value && styles.colorDotSelected,
                  ]}
                  onPress={() => handleOverlayUpdate(editingOverlay.id, { color: color.value })}
                />
              ))}
            </View>

            {/* Delete */}
            <Pressable
              style={styles.deleteControlButton}
              onPress={() => handleDeleteTextOverlay(editingOverlay.id)}
            >
              <CloseFillIcon size={20} color={Colors.neutral[50]} />
            </Pressable>

            {/* Done */}
            <Pressable style={styles.doneControlButton} onPress={handleDoneEditing}>
              <Text style={styles.doneControlText}>{t('common.done')}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Bottom Toolbar */}
      <BottomToolBar
        mode="edit"
        onToolPress={handleToolAction}
        onNextPress={handleNext}
        nextButtonDisabled={isProcessing || !activeVideoPath}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  backButton: {
    position: 'absolute',
    zIndex: 1000,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoContainer: {
    flex: 1,
    position: 'relative',
  },
  videoWrapper: {
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    alignSelf: 'center',
    backgroundColor: Colors.black,
    overflow: 'hidden',
    position: 'relative',
  },
  video: {
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.black,
    zIndex: 2,
  },
  errorOverlay: {
    zIndex: 3,
    backgroundColor: Colors.neutral[900],
  },
  errorText: {
    color: Colors.neutral[200],
    fontSize: 16,
  },
  textOverlayPreview: {
    position: 'absolute',
    zIndex: 1,
    padding: 8,
  },
  textOverlayPreviewDragging: {
    opacity: 0.8,
  },
  textOverlayPreviewEmpty: {
    borderWidth: 1,
    borderColor: Colors.neutral[200],
    borderStyle: 'dashed',
    borderRadius: BORDER_RADIUS.SMALL,
  },
  textOverlayPreviewText: {
    textShadowColor: Colors.overlay.black75,
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  textOverlayPreviewTextEmpty: {
    color: Colors.neutral[200],
    fontStyle: 'italic',
  },
  textOverlayEditing: {
    backgroundColor: Colors.transparent,
    minWidth: 120,
    maxWidth: SCREEN_WIDTH - 40,
    padding: 4,
  },
  textOverlayInput: {
    color: Colors.neutral[50],
    fontFamily: 'Figtree-Bold',
    padding: 4,
    minWidth: 100,
    textAlign: 'left',
  },
  textControlsBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: Colors.black,
    borderTopWidth: 1,
    borderTopColor: Colors.neutral[600],
    paddingVertical: 12,
    paddingHorizontal: 16,
    zIndex: 1000,
  },
  textControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  controlButton: {
    width: 32,
    height: 32,
    borderRadius: BORDER_RADIUS.SMALL,
    backgroundColor: Colors.neutral[900],
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlButtonText: {
    color: Colors.neutral[50],
    fontSize: 18,
    fontFamily: 'Figtree-Bold',
  },
  controlValue: {
    color: Colors.neutral[50],
    fontSize: 14,
    fontFamily: 'Figtree-Medium',
    minWidth: 30,
    textAlign: 'center',
  },
  colorRow: {
    flexDirection: 'row',
    gap: 8,
    flex: 1,
    justifyContent: 'center',
  },
  colorDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.transparent,
  },
  colorDotSelected: {
    borderColor: Colors.neutral[50],
  },
  deleteControlButton: {
    width: 32,
    height: 32,
    borderRadius: BORDER_RADIUS.SMALL,
    backgroundColor: Colors.neutral[900],
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneControlButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.MEDIUM,
    backgroundColor: Colors.purple[500],
  },
  doneControlText: {
    color: Colors.neutral[50],
    fontSize: 14,
    fontFamily: 'Figtree-SemiBold',
  },
  playIndicator: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -25,
    marginTop: -25,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.overlay.black60,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  playIndicatorText: {
    color: Colors.neutral[50],
    fontSize: 24,
    marginLeft: 4,
  },
  applyButton: {
    position: 'absolute',
    left: 20,
    right: 20,
    backgroundColor: Colors.purple[500],
    borderRadius: BORDER_RADIUS.LARGE,
    paddingVertical: 16,
    alignItems: 'center',
    zIndex: 5,
  },
  applyButtonDisabled: {
    opacity: 0.6,
  },
  applyButtonText: {
    color: Colors.neutral[50],
    fontSize: 16,
    fontFamily: 'Figtree-SemiBold',
  },
});

export default VideoEditorScreen;
