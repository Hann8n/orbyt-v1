import { useState, useEffect, useRef, useCallback } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView, VideoPlayer } from 'expo-video';
import { File, Directory, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { resolveVideoPath, debugVideoPath, VideoPathInfo } from '../src/utils/video/path';
import { DEFAULT_BUFFER_OPTIONS } from '../src/utils/video/helpers';
import { Loading3FillIcon, CloseFillIcon } from '../src/components/ui/Icon';
import { Colors } from '../src/components/ui/UI';
import { BORDER_RADIUS, APP_CONSTANTS } from '../src/utils/constants';
import VideoEditingService, {
  TextOverlayOptions,
  BackgroundMusicOptions,
} from '../src/services/video/VideoEditingService';
import VideoProcessingService from '../src/services/video/VideoProcessingService';
import VerticalListSheet, { VerticalListButton } from '../src/components/ui/VerticalListSheet';
import BottomToolBar from '../src/components/ui/BottomToolBar';
import { useWindowDimensions } from 'react-native';
import { getBottomNavBarHeight } from '../src/utils/device/screen';

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
  { name: 'Black', value: 'black' },
  { name: 'Red', value: '#FE4359' },
  { name: 'Green', value: '#00D4AA' },
  { name: 'Blue', value: '#6366F1' },
  { name: 'Purple', value: '#8B5CF6' },
  { name: 'Yellow', value: '#FFD700' },
  { name: 'Orange', value: '#FF6B35' },
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

  const displayText = overlay.text.trim() || 'Tap to edit';
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
          placeholder="Enter text"
          placeholderTextColor={Colors.lightGray}
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
  const [showMusicSheet, setShowMusicSheet] = useState(false);

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
        console.error('[VideoEditor] Error merging segments:', error);
        setIsMerging(false);
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Failed to merge video segments. Please try again.';
        Alert.alert('Merging Failed', errorMessage, [
          {
            text: 'Go Back',
            onPress: () => router.back(),
          },
        ]);
      }
    };

    mergeSegments();
  }, [segmentsParam, mergedVideoPath, router]);

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

      // Debug the incoming path
      debugVideoPath('VideoEditor received', activeVideoPath);

      try {
        setVideoLoading(true);
        setVideoError(null);

        // Use the utility to resolve the path (handles iCloud, normalization, validation)
        const pathInfo = await resolveVideoPath(activeVideoPath);

        setVideoPathInfo(pathInfo);

        if (!pathInfo.exists) {
          setVideoError('Video file not found');
        }
      } catch (error) {
        console.error('[VideoEditor] Error resolving video path:', error);
        setVideoError('Unable to access video file');
      } finally {
        setVideoLoading(false);
      }
    };

    resolveVideo();
  }, [activeVideoPath, isMerging]);

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
      tempFiles.forEach(async file => {
        try {
          const normalizedPath = file.replace('file://', '');
          const tempFile = new File(normalizedPath);
          if (tempFile.exists) {
            await tempFile.delete();
          }
        } catch (error) {
          console.warn('Failed to cleanup temp file:', error);
        }
      });
    };
  }, []);

  // Generate temporary file path using new FileSystem API
  const getTempFilePath = useCallback(async (): Promise<string> => {
    try {
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const fileName = `video_edit_${timestamp}_${random}.mp4`;

      // Use new FileSystem API like VideoProcessingService
      const tempDir = new Directory(Paths.cache, `video_edit_${timestamp}`);
      await tempDir.create({ intermediates: true });

      const outputFile = new File(tempDir, fileName);
      let tempPath = outputFile.uri;

      // Remove file:// prefix
      tempPath = tempPath.replace(/^file:\/\//, '');

      // Ensure absolute path for iOS
      if (Platform.OS === 'ios' && !tempPath.startsWith('/')) {
        tempPath = '/' + tempPath;
      }

      // Validate path has directory structure
      if (!tempPath.includes('/') || (tempPath.endsWith(fileName) && !tempPath.includes('/'))) {
        throw new Error(`Invalid temp path generated: ${tempPath}`);
      }

      tempFilesRef.current.push(tempPath);
      return tempPath;
    } catch (_error) {
      // Fallback to Paths API if new API fails
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const fileName = `video_edit_${timestamp}_${random}.mp4`;

      // Use Paths.cache as fallback (same as primary path)
      let tempDir: string | null = null;
      try {
        const cacheDir = new Directory(Paths.cache);
        if (cacheDir.exists) {
          tempDir = cacheDir.uri;
        }
      } catch {
        // If cache fails, we can't proceed
      }

      if (!tempDir) {
        throw new Error('Unable to determine temporary directory');
      }

      tempDir = tempDir.replace(/^file:\/\//, '');
      const normalizedDir = tempDir.endsWith('/') ? tempDir : `${tempDir}/`;
      let tempPath = `${normalizedDir}${fileName}`;

      // Ensure absolute path for iOS
      if (Platform.OS === 'ios' && !tempPath.startsWith('/')) {
        tempPath = '/' + tempPath;
      }

      if (!tempPath.includes('/') || tempPath === fileName) {
        throw new Error(`Invalid temp path generated: ${tempPath}`);
      }

      tempFilesRef.current.push(tempPath);
      return tempPath;
    }
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
        Alert.alert(
          'Permission required',
          'Please grant access to your media library to select music.'
        );
        return;
      }

      const assets = await MediaLibrary.getAssetsAsync({
        mediaType: 'audio',
        first: 100,
      });

      if (assets.assets.length === 0) {
        Alert.alert('No music found', 'No audio files found in your library.');
        return;
      }

      // For simplicity, use first audio file
      // In a full implementation, show a picker
      const selectedAsset = assets.assets[0];
      const assetInfo = await MediaLibrary.getAssetInfoAsync(selectedAsset.id);

      if (assetInfo.localUri) {
        setMusicPath(assetInfo.localUri);
        setShowMusicSheet(false);
      } else {
        Alert.alert('Error', 'Could not access music file');
      }
    } catch (error) {
      console.error('Error selecting music:', error);
      Alert.alert('Error', 'Failed to select music file');
    }
  }, []);

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
      const finalPath = workingPath.startsWith('file://') ? workingPath : `file://${workingPath}`;
      setMergedVideoPath(finalPath);

      // Reset video player
      if (player) {
        player.currentTime = 0;
      }

      Alert.alert('Success', 'Video edits applied successfully!');
    } catch (error: unknown) {
      console.error('Error applying edits:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to apply edits. Please try again.';
      Alert.alert('Error', errorMessage);
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
  ]);

  // Check if there are pending edits
  const hasPendingEdits = textOverlays.length > 0 || musicPath !== null || masterVolume !== 1.0;

  const handleBack = () => {
    router.back();
  };

  const handleNext = async () => {
    if (!activeVideoPath) {
      Alert.alert('Error', 'No video available');
      return;
    }

    const normalizedPath = activeVideoPath.startsWith('file://')
      ? activeVideoPath
      : `file://${activeVideoPath}`;
    router.push({
      pathname: '/post/[id]',
      params: { id: 'new', videoPath: normalizedPath },
    });
  };

  const bottomNavBarHeight = getBottomNavBarHeight(insets);

  const handleToolAction = useCallback(
    (action: string) => {
      switch (action) {
        case 'text':
          handleAddTextOverlay();
          break;
        case 'audio':
          setShowMusicSheet(true);
          break;
        default:
          break;
      }
    },
    [handleAddTextOverlay]
  );

  const { width, height } = useWindowDimensions();
  const isSmallDevice = width <= 375 || height <= 667;

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
              <Loading3FillIcon size={48} color={Colors.white} />
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
              <Loading3FillIcon size={24} color={Colors.white} />
            ) : (
              <Text style={styles.applyButtonText}>Apply Changes</Text>
            )}
          </Pressable>
        )}
      </View>

      {/* Music Selection Sheet */}
      <VerticalListSheet
        visible={showMusicSheet}
        onDismiss={() => setShowMusicSheet(false)}
        title="Select Background Music"
      >
        <VerticalListButton label="Choose from Library" onPress={handleSelectMusic} />
        <VerticalListButton label="Cancel" onPress={() => setShowMusicSheet(false)} />
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
              <CloseFillIcon size={20} color={Colors.white} />
            </Pressable>

            {/* Done */}
            <Pressable style={styles.doneControlButton} onPress={handleDoneEditing}>
              <Text style={styles.doneControlText}>Done</Text>
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
    backgroundColor: Colors.darkGray,
  },
  errorText: {
    color: Colors.lightGray,
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
    borderColor: Colors.lightGray,
    borderStyle: 'dashed',
    borderRadius: BORDER_RADIUS.SMALL,
  },
  textOverlayPreviewText: {
    textShadowColor: Colors.overlayBlack75,
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  textOverlayPreviewTextEmpty: {
    color: Colors.lightGray,
    fontStyle: 'italic',
  },
  textOverlayEditing: {
    backgroundColor: Colors.transparent,
    minWidth: 120,
    maxWidth: SCREEN_WIDTH - 40,
    padding: 4,
  },
  textOverlayInput: {
    color: Colors.white,
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
    borderTopColor: Colors.mediumGray,
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
    backgroundColor: Colors.darkGray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlButtonText: {
    color: Colors.white,
    fontSize: 18,
    fontFamily: 'Figtree-Bold',
  },
  controlValue: {
    color: Colors.white,
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
    borderColor: Colors.white,
  },
  deleteControlButton: {
    width: 32,
    height: 32,
    borderRadius: BORDER_RADIUS.SMALL,
    backgroundColor: Colors.darkGray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneControlButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.MEDIUM,
    backgroundColor: Colors.purple,
  },
  doneControlText: {
    color: Colors.white,
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
    backgroundColor: Colors.overlayBlack60,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  playIndicatorText: {
    color: Colors.white,
    fontSize: 24,
    marginLeft: 4,
  },
  applyButton: {
    position: 'absolute',
    left: 20,
    right: 20,
    backgroundColor: Colors.purple,
    borderRadius: BORDER_RADIUS.LARGE,
    paddingVertical: 16,
    alignItems: 'center',
    zIndex: 5,
  },
  applyButtonDisabled: {
    opacity: 0.6,
  },
  applyButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontFamily: 'Figtree-SemiBold',
  },
});

export default VideoEditorScreen;
