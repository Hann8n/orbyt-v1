import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  TextInput,
  Dimensions,
  Platform,
  PanResponder,
  Keyboard,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView, VideoPlayer } from 'expo-video';
import { useEvent } from 'expo';
import * as FileSystem from 'expo-file-system';
import { File, Directory, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { resolveVideoPath, debugVideoPath } from '../src/utils/videoPath';
import { BackArrowIcon, ArrowRightFillIcon, Loading3FillIcon, CloseFillIcon } from '../src/components/ui/Icon';
import { Colors } from '../src/components/ui/UI';
import { BORDER_RADIUS } from '../src/utils/constants';
import VideoEditingService, { TextOverlayOptions, BackgroundMusicOptions } from '../src/services/VideoEditingService';
import VerticalListSheet, { VerticalListButton } from '../src/components/ui/VerticalListSheet';
import BottomToolBar from '../src/components/ui/BottomToolBar';
import { TextOverlay } from '../src/types';
import { getBottomNavBarHeight } from '../src/utils/helpers';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
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
  onUpdate: (updates: Partial<TextOverlayEdit>) => void;
  onDelete: (id: string) => void;
  onDone: () => void;
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
  onUpdate,
  onDelete,
  onDone,
}) => {
  const textInputRef = useRef<TextInput>(null);
  const dragStartPositions = useRef<{ x: number; y: number } | null>(null);
  const hasMoved = useRef(false);
  const tapTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && textInputRef.current) {
      setTimeout(() => {
        textInputRef.current?.focus();
      }, 100);
    }
  }, [isEditing]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !isEditing,
        onMoveShouldSetPanResponder: (evt, gestureState) => {
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
        onPanResponderMove: (evt, gestureState) => {
          if (isEditing) return;
          if (Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5) {
            hasMoved.current = true;
            if (tapTimeout.current) {
              clearTimeout(tapTimeout.current);
              tapTimeout.current = null;
            }
            if (dragStartPositions.current) {
              const newX = Math.max(0, Math.min(SCREEN_WIDTH - 50, dragStartPositions.current.x + gestureState.dx));
              const newY = Math.max(0, Math.min(VIDEO_HEIGHT - 30, dragStartPositions.current.y + gestureState.dy));
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
      }),
    [overlay.id, previewX, previewY, isDragging, isEditing, onDragStart, onDragMove, onDragEnd, onTap]
  );

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
          style={[
            styles.textOverlayInput,
            {
              fontSize: overlay.size,
              color: overlay.color,
              fontFamily: overlay.fontFamily || 'Firma-Bold',
            },
          ]}
          value={overlay.text}
          onChangeText={(text) => onTextChange(overlay.id, text)}
          placeholder="Enter text"
          placeholderTextColor={Colors.lightGray}
          multiline
          autoFocus
          blurOnSubmit={false}
        />
      </View>
    );
  }

  return (
    <View
      {...panResponder.panHandlers}
      style={[
        styles.textOverlayPreview,
        {
          left: previewX,
          top: previewY,
          opacity: isDragging ? 0.8 : 1,
        },
        isEmpty && styles.textOverlayPreviewEmpty,
      ]}
    >
      <Text
        style={[
          styles.textOverlayPreviewText,
          {
            fontSize: overlay.size,
            color: overlay.color,
            fontFamily: overlay.fontFamily || 'Firma-Bold',
          },
          isEmpty && styles.textOverlayPreviewTextEmpty,
        ]}
      >
        {displayText}
      </Text>
    </View>
  );
};


const POSITION_PRESETS = [
  { label: 'Center', x: '(w-text_w)/2', y: '(h-text_h)/2' },
  { label: 'Top Left', x: '10', y: '10' },
  { label: 'Top Right', x: 'w-text_w-10', y: '10' },
  { label: 'Bottom Left', x: '10', y: 'h-text_h-10' },
  { label: 'Bottom Right', x: 'w-text_w-10', y: 'h-text_h-10' },
  { label: 'Top Center', x: '(w-text_w)/2', y: '10' },
  { label: 'Bottom Center', x: '(w-text_w)/2', y: 'h-text_h-10' },
];

// Trim Sheet Component
interface TrimSheetProps {
  visible: boolean;
  clip: VideoClip | undefined;
  onDismiss: () => void;
  onApply: (startTime: number, endTime: number) => void;
  isProcessing: boolean;
}

const TrimSheet: React.FC<TrimSheetProps> = ({ visible, clip, onDismiss, onApply, isProcessing }) => {
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(clip?.duration || 10);
  const [actualDuration, setActualDuration] = useState(clip?.duration || 10);

  useEffect(() => {
    if (clip) {
      const clipDuration = clip.duration || 10;
      setActualDuration(clipDuration);
      setStartTime(clip.trimStart || 0);
      setEndTime(clip.trimEnd || clipDuration);
    }
  }, [clip]);

  if (!visible || !clip) return null;

  const maxDuration = actualDuration > 0 ? actualDuration : 10;
  const duration = endTime - startTime;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const percentage = ((value: number, min: number, max: number) => ((value - min) / (max - min)) * 100);
  const trackWidth = SCREEN_WIDTH - 80;

  const TrimSlider = ({ value, onValueChange, min = 0, max = 1 }: {
    value: number;
    onValueChange: (value: number) => void;
    min?: number;
    max?: number;
  }) => {
    const percent = percentage(value, min, max);
    return (
      <View style={styles.trimSliderContainer}>
        <TouchableOpacity
          style={styles.sliderTrack}
          activeOpacity={1}
          onPress={(e) => {
            const { locationX } = e.nativeEvent;
            const newValue = min + (locationX / trackWidth) * (max - min);
            onValueChange(Math.max(min, Math.min(max, newValue)));
          }}
        >
          <View style={[styles.sliderFill, { width: `${percent}%` }]} />
          <View
            style={[
              styles.sliderThumb,
              { left: `${percent}%`, marginLeft: -8 }
            ]}
          />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <VerticalListSheet
      visible={visible}
      onDismiss={onDismiss}
      title="Trim Video"
    >
      <View style={styles.trimContainer}>
        <Text style={styles.trimLabel}>Start: {formatTime(startTime)}</Text>
        <TrimSlider
          value={startTime}
          onValueChange={(value) => {
            const newStart = Math.max(0, Math.min(value, endTime - 0.5));
            setStartTime(newStart);
          }}
          min={0}
          max={maxDuration}
        />
        
        <Text style={styles.trimLabel}>End: {formatTime(endTime)}</Text>
        <TrimSlider
          value={endTime}
          onValueChange={(value) => {
            const newEnd = Math.max(startTime + 0.5, Math.min(value, maxDuration));
            setEndTime(newEnd);
          }}
          min={0}
          max={maxDuration}
        />
        
        <Text style={styles.trimDuration}>Duration: {formatTime(duration)}</Text>
        
        <View style={styles.trimButtons}>
          <VerticalListButton
            label="Cancel"
            onPress={onDismiss}
          />
          <VerticalListButton
            label={isProcessing ? "Processing..." : "Apply Trim"}
            onPress={() => onApply(startTime, endTime)}
            disabled={isProcessing || duration < 0.5}
          />
        </View>
      </View>
    </VerticalListSheet>
  );
};

interface VideoClip {
  videoPath: string;
  assetId?: string | null;
  duration: number;
  sourceType?: 'camera' | 'gallery';
  trimStart?: number;
  trimEnd?: number;
}

const VideoEditorScreen: React.FC = () => {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const playerRef = useRef<VideoPlayer | null>(null);
  
  // Parse segments from params or fallback to single videoPath
  const segmentsParam = params.segments as string | undefined;
  const originalVideoPath = params.videoPath as string | undefined;
  
  const [clips, setClips] = useState<VideoClip[]>(() => {
    if (segmentsParam) {
      try {
        const parsed = JSON.parse(segmentsParam);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        console.error('Failed to parse segments:', e);
      }
    }
    if (originalVideoPath) {
      // Fallback: single video
      return [{ videoPath: originalVideoPath, duration: 0 }];
    }
    return [];
  });
  
  const [mergedVideoPath, setMergedVideoPath] = useState<string | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [videoLoading, setVideoLoading] = useState(true);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showTrimSheet, setShowTrimSheet] = useState(false);
  const [trimmingClipIndex, setTrimmingClipIndex] = useState<number | null>(null);
  
  // Text overlay state
  const [textOverlays, setTextOverlays] = useState<TextOverlayEdit[]>([]);
  const [editingOverlayId, setEditingOverlayId] = useState<string | null>(null);
  const [showTextOverlaySheet, setShowTextOverlaySheet] = useState(false);
  const [draggingOverlayId, setDraggingOverlayId] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  
  // Background music state
  const [musicPath, setMusicPath] = useState<string | null>(null);
  const [videoVolume, setVideoVolume] = useState(1.0);
  const [musicVolume, setMusicVolume] = useState(1.0);
  const [showMusicSheet, setShowMusicSheet] = useState(false);
  
  // Volume control state
  const [masterVolume, setMasterVolume] = useState(1.0);
  
  // Temporary files to clean up
  const tempFilesRef = useRef<string[]>([]);
  
  // Merge clips into a single seamless video using FFmpeg
  const mergeClipsForPlayback = useCallback(async () => {
    if (clips.length === 0) {
      setMergedVideoPath(null);
      return;
    }

    setIsMerging(true);
    try {
      const { default: VideoProcessingService } = await import('../src/services/VideoProcessingService');
      
      // Convert clips to VideoSegment format
      const processingSegments = clips.map((clip) => {
        const videoObject: any = {
          uri: clip.videoPath,
          duration: clip.duration,
        };
        
        if (clip.assetId) {
          videoObject.assetId = clip.assetId;
        }
        
        return {
          startTime: 0,
          duration: clip.duration,
          video: videoObject,
          sourceType: clip.sourceType,
        };
      });
      
      // Process clips (merges multiple or normalizes single)
      const processedVideo = await VideoProcessingService.mergeSegments(processingSegments);
      const processedPath = processedVideo.path.startsWith('file://') 
        ? processedVideo.path 
        : `file://${processedVideo.path}`;
      
      // Verify processed file exists
      const processedFile = new File(processedPath.replace('file://', ''));
      if (!processedFile.exists) {
        throw new Error(`Processed video file not found at: ${processedPath}`);
      }
      
      setMergedVideoPath(processedPath);
    } catch (error) {
      Alert.alert(
        'Processing Error', 
        `Failed to process video: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      setMergedVideoPath(null);
    } finally {
      setIsMerging(false);
    }
  }, [clips]);

  // Merge clips when they change
  useEffect(() => {
    mergeClipsForPlayback();
  }, [mergeClipsForPlayback]);

  // Current video path is the merged video for seamless playback
  const currentVideoPath = mergedVideoPath || '';

  // Resolved video URI for playback
  const [resolvedVideoUri, setResolvedVideoUri] = useState<string>('');
  
  // Resolve video path when it changes
  useEffect(() => {
    const resolve = async () => {
      if (!currentVideoPath) {
        setResolvedVideoUri('');
        return;
      }
      
      debugVideoPath('VideoEditor currentVideoPath', currentVideoPath);
      
      try {
        const pathInfo = await resolveVideoPath(currentVideoPath);
        setResolvedVideoUri(pathInfo.uri);
        
        if (!pathInfo.exists) {
          setVideoError('Video file not found');
        }
      } catch (error) {
        console.error('[VideoEditor] Error resolving path:', error);
        setVideoError('Unable to access video');
      }
    };
    
    resolve();
  }, [currentVideoPath]);

  // Final video URI for playback
  const videoUri = resolvedVideoUri;

  // Create expo-video player
  const player = useVideoPlayer(null, (p) => {
    p.loop = true;
    p.volume = masterVolume;
    playerRef.current = p;
  });

  // Attach/replace source when resolved
  useEffect(() => {
    if (!player) return;
    if (videoUri) {
      (async () => {
        try {
          await player.replaceAsync({ uri: videoUri });
          setVideoError(null);
        } catch (e) {
          setVideoError('Failed to load video');
        }
      })();
    }
  }, [player, videoUri]);

  // Handle player status changes
  (useEvent as any)(player, 'statusChange', (payload: any) => {
    const status = typeof payload === 'string' ? payload : payload?.status;
    if (status === 'loading') {
      setVideoLoading(true);
      setVideoError(null);
    } else if (status === 'readyToPlay') {
      setVideoLoading(false);
      if (player.duration) {
        setDuration(player.duration);
      }
    } else if (status === 'error') {
      setVideoLoading(false);
      setVideoError('Failed to load video');
    }
  });

  // Track playback progress
  useEffect(() => {
    if (!player) return;
    const interval = setInterval(() => {
      if (player.currentTime !== undefined) {
        setCurrentTime(player.currentTime);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [player]);

  // Sync play/pause state
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
    return () => {
      tempFilesRef.current.forEach(async (file) => {
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
      if (!tempPath.includes('/') || tempPath.endsWith(fileName) && !tempPath.includes('/')) {
        throw new Error(`Invalid temp path generated: ${tempPath}`);
      }
      
      tempFilesRef.current.push(tempPath);
      return tempPath;
    } catch (error) {
      // Fallback to old API if new API fails
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const fileName = `video_edit_${timestamp}_${random}.mp4`;
      
      let tempDir = (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory;
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
    setTextOverlays(prev => prev.map(o => 
      o.id === id ? { ...o, text } : o
    ));
  }, []);

  // Update text overlay properties
  const handleOverlayUpdate = useCallback((id: string, updates: Partial<TextOverlayEdit>) => {
    setTextOverlays(prev => prev.map(o => 
      o.id === id ? { ...o, ...updates } : o
    ));
  }, []);

  // Delete text overlay
  const handleDeleteTextOverlay = useCallback((id: string) => {
    setTextOverlays(prev => prev.filter(o => o.id !== id));
    if (editingOverlayId === id) {
      setEditingOverlayId(null);
      Keyboard.dismiss();
    }
  }, [editingOverlayId]);

  // Done editing
  const handleDoneEditing = useCallback(() => {
    setEditingOverlayId(null);
    Keyboard.dismiss();
  }, []);

  // Get currently editing overlay
  const editingOverlay = editingOverlayId ? textOverlays.find(o => o.id === editingOverlayId) : null;

  // Handle drag events for text overlays
  const handleDragStart = useCallback((id: string) => {
    setDraggingOverlayId(id);
  }, []);

  const handleDragMove = useCallback((id: string, x: number, y: number) => {
    setTextOverlays(prev => prev.map(o => 
      o.id === id 
        ? { ...o, position: { x, y } }
        : o
    ));
  }, []);

  const handleDragEnd = useCallback((id: string) => {
    setDraggingOverlayId(null);
  }, []);


  // Save text overlay
  const handleSaveTextOverlay = useCallback(() => {
    if (!editingOverlay) return;
    
    if (editingOverlay.text.trim() === '') {
      Alert.alert('Error', 'Text cannot be empty');
      return;
    }
    
    setTextOverlays(prev => {
      const existingIndex = prev.findIndex(o => o.id === editingOverlay.id);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = editingOverlay;
        return updated;
      }
      return [...prev, editingOverlay];
    });
    
    setEditingOverlayId(null);
    setShowTextOverlaySheet(false);
  }, [editingOverlay]);

  // Select background music
  const handleSelectMusic = useCallback(async () => {
    try {
      const permissionResult = await MediaLibrary.requestPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission required', 'Please grant access to your media library to select music.');
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

  // Remove background music
  const handleRemoveMusic = useCallback(() => {
    setMusicPath(null);
    setMusicVolume(1.0);
    setVideoVolume(1.0);
  }, []);

  // Apply all edits
  const handleApplyEdits = useCallback(async () => {
    if (isProcessing) return;
    
    setIsProcessing(true);
    setVideoLoading(true);
    
    try {
      let workingPath = originalVideoPath.replace('file://', '');
      
      // Step 0: Merge clips if multiple clips exist
      if (clips.length === 0) {
        throw new Error('No clips to process');
      }
      
      if (clips.length > 1) {
        // Import VideoProcessingService for merging
        const { default: VideoProcessingService } = await import('../src/services/VideoProcessingService');
        const processingSegments = clips.map(clip => ({
          startTime: 0,
          duration: clip.duration,
          video: { path: clip.videoPath.replace('file://', '') } as any,
          sourceType: clip.sourceType,
        }));
        const mergedVideo = await VideoProcessingService.mergeSegments(processingSegments);
        workingPath = mergedVideo.path.replace('file://', '');
      } else {
        workingPath = clips[0].videoPath.replace('file://', '');
      }

      // Step 1: Apply text overlays
      if (textOverlays.length > 0) {
        for (let i = 0; i < textOverlays.length; i++) {
          const overlay = textOverlays[i];
          const outputPath = await getTempFilePath();
          
          // Convert position to FFmpeg format (strings like '(w-text_w)/2' or numeric pixels)
          const xPos = typeof overlay.position.x === 'number' 
            ? overlay.position.x.toString() 
            : overlay.position.x;
          const yPos = typeof overlay.position.y === 'number'
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
      
      // Update current video path
      const finalPath = workingPath.startsWith('file://') ? workingPath : `file://${workingPath}`;
      setMergedVideoPath(finalPath);
      
      // Reset video player
      if (player) {
        player.currentTime = 0;
      }
      
      Alert.alert('Success', 'Video edits applied successfully!');
    } catch (error: any) {
      console.error('Error applying edits:', error);
      Alert.alert('Error', error.message || 'Failed to apply edits. Please try again.');
    } finally {
      setIsProcessing(false);
      setVideoLoading(false);
    }
  }, [textOverlays, musicPath, videoVolume, musicVolume, masterVolume, clips, getTempFilePath]);

  // Check if there are pending edits
  const hasPendingEdits = textOverlays.length > 0 || musicPath !== null || masterVolume !== 1.0;

  const handleBack = () => {
    router.back();
  };

  const handleNext = async () => {
    if (!currentVideoPath) {
      Alert.alert('Error', 'No video available');
      return;
    }

    const normalizedPath = currentVideoPath.startsWith('file://') ? currentVideoPath : `file://${currentVideoPath}`;
    router.push({
      pathname: '/post/[id]',
      params: { id: 'new', videoPath: normalizedPath }
    });
  };

  // Custom slider component
  const Slider = ({ value, onValueChange, min = 0, max = 1, step = 0.01 }: {
    value: number;
    onValueChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
  }) => {
    const percentage = ((value - min) / (max - min)) * 100;
    const trackWidth = SCREEN_WIDTH - 60 - 45; // Container width minus padding and value width
    
    return (
      <View style={styles.sliderContainer}>
        <TouchableOpacity
          style={styles.sliderTrack}
          activeOpacity={1}
          onPress={(e) => {
            const { locationX } = e.nativeEvent;
            const newValue = min + (locationX / trackWidth) * (max - min);
            onValueChange(Math.max(min, Math.min(max, newValue)));
          }}
        >
          <View style={[styles.sliderFill, { width: `${percentage}%` }]} />
          <View
            style={[
              styles.sliderThumb,
              { left: `${percentage}%`, marginLeft: -8 }
            ]}
          />
        </TouchableOpacity>
        <Text style={styles.sliderValue}>{Math.round(value * 100)}%</Text>
      </View>
    );
  };


  const bottomNavBarHeight = getBottomNavBarHeight(insets);

  // Handle trim action - trim the currently visible clip
  const handleTrim = useCallback(() => {
    // For merged video, we need to determine which clip is at current time
    // For simplicity, allow trimming any clip by index
    // In a full implementation, you'd calculate which clip based on currentTime
    if (clips.length > 0) {
      // For now, trim the first clip - can be enhanced to detect current clip
      setTrimmingClipIndex(0);
      setShowTrimSheet(true);
    }
  }, [clips.length]);

  // Apply trim to clip
  const handleApplyTrim = useCallback(async (clipIndex: number, startTime: number, endTime: number) => {
    if (isProcessing) return;
    
    const clip = clips[clipIndex];
    if (!clip) return;

    setIsProcessing(true);
    try {
      const outputPath = await getTempFilePath();
      const trimmedPath = await VideoEditingService.trimVideo(
        clip.videoPath.replace('file://', ''),
        outputPath,
        startTime,
        endTime
      );

      // Update clip with trimmed path and trim times
      setClips(prev => prev.map((c, i) => 
        i === clipIndex 
          ? { ...c, videoPath: trimmedPath, trimStart: startTime, trimEnd: endTime, duration: endTime - startTime }
          : c
      ));

      // Clips will be re-merged automatically via useEffect
      setShowTrimSheet(false);
      setTrimmingClipIndex(null);
    } catch (error: any) {
      console.error('Error trimming video:', error);
      Alert.alert('Error', error.message || 'Failed to trim video. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }, [clips, getTempFilePath, isProcessing]);

  const handleToolAction = useCallback((action: string) => {
    switch (action) {
      case 'text':
        handleAddTextOverlay();
        break;
      case 'audio':
        setShowMusicSheet(true);
        break;
      case 'trim':
        handleTrim();
        break;
      default:
        break;
    }
  }, [handleAddTextOverlay, handleTrim]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Minimal header buttons */}
      <TouchableOpacity 
        style={[styles.backButton, { top: insets.top + 10 }]} 
        onPress={handleBack}
      >
        <CloseFillIcon size={26} color="white" />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.doneButton, { top: insets.top + 10 }]}
        onPress={handleNext}
        disabled={isProcessing}
        activeOpacity={0.7}
      >
        <ArrowRightFillIcon size={30} color="white" />
      </TouchableOpacity>

      {/* Video Preview Container - matches cameraContainer from create.tsx */}
      <View style={styles.videoContainer}>
        <TouchableOpacity
          onPress={() => setIsPlaying(!isPlaying)}
          activeOpacity={0.9}
          style={styles.videoWrapper}
        >
          {/* Show loading overlay when video is loading */}
          {videoLoading && !isMerging && (
            <View style={styles.loadingOverlay}>
              <Loading3FillIcon size={48} color={Colors.white} />
            </View>
          )}
          {(videoUri && clips.length > 0) || isMerging ? (
            <>
              {isMerging && (
                <View style={styles.loadingOverlay}>
                  <Loading3FillIcon size={48} color={Colors.white} />
                  <Text style={styles.mergingText}>
                    {clips.length > 1 ? 'Merging clips...' : 'Processing video...'}
                  </Text>
                </View>
              )}
              {videoUri && !isMerging && mergedVideoPath && player && (
                <VideoView
                  key={mergedVideoPath}
                  player={player}
                  style={styles.video}
                  contentFit="contain"
                  nativeControls={false}
                />
              )}
            </>
          ) : (
            <View style={styles.noVideoContainer}>
              <Text style={styles.noVideoText}>No video available</Text>
            </View>
          )}
          {videoError && (
            <View style={styles.errorOverlay}>
              <Text style={styles.errorText}>{videoError}</Text>
            </View>
          )}
          {/* Text Overlay Previews */}
          {textOverlays.map((overlay) => {
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
                onUpdate={(updates) => handleOverlayUpdate(overlay.id, updates)}
                onDelete={() => handleDeleteTextOverlay(overlay.id)}
                onDone={handleDoneEditing}
              />
            );
          })}
          {/* Play/Pause Indicator */}
          {!isPlaying && !videoLoading && (
            <View style={styles.playIndicator}>
              <Text style={styles.playIndicatorText}>▶</Text>
            </View>
          )}
          
          {/* Clip Indicator - show when multiple clips */}
          {clips.length > 1 && mergedVideoPath && (
            <View style={styles.clipIndicator}>
              <Text style={styles.clipIndicatorText}>
                {clips.length} clips merged
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Apply Changes Button - positioned absolutely */}
        {hasPendingEdits && (
          <TouchableOpacity
            style={[styles.applyButton, { bottom: bottomNavBarHeight + 20 }, isProcessing && styles.applyButtonDisabled]}
            onPress={handleApplyEdits}
            disabled={isProcessing}
            activeOpacity={0.7}
          >
            {isProcessing ? (
              <Loading3FillIcon size={24} color={Colors.white} />
            ) : (
              <Text style={styles.applyButtonText}>Apply Changes</Text>
            )}
          </TouchableOpacity>
        )}
      </View>


      {/* Music Selection Sheet */}
      <VerticalListSheet
        visible={showMusicSheet}
        onDismiss={() => setShowMusicSheet(false)}
        title="Select Background Music"
      >
        <VerticalListButton
          label="Choose from Library"
          onPress={handleSelectMusic}
        />
        <VerticalListButton
          label="Cancel"
          onPress={() => setShowMusicSheet(false)}
        />
      </VerticalListSheet>

      {/* Trim Sheet */}
      {trimmingClipIndex !== null && clips[trimmingClipIndex] && (
        <TrimSheet
          visible={showTrimSheet}
          clip={clips[trimmingClipIndex]}
          onDismiss={() => {
            setShowTrimSheet(false);
            setTrimmingClipIndex(null);
          }}
          onApply={(startTime, endTime) => handleApplyTrim(trimmingClipIndex, startTime, endTime)}
          isProcessing={isProcessing}
        />
      )}

      {/* Text Overlay Controls - appears above keyboard when editing */}
      {editingOverlay && keyboardHeight > 0 && (
        <View style={[styles.textControlsBar, { bottom: keyboardHeight }]}>
          <View style={styles.textControlsRow}>
            {/* Size controls */}
            <TouchableOpacity
              style={styles.controlButton}
              onPress={() => handleOverlayUpdate(editingOverlay.id, { size: Math.max(12, editingOverlay.size - 4) })}
            >
              <Text style={styles.controlButtonText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.controlValue}>{editingOverlay.size}</Text>
            <TouchableOpacity
              style={styles.controlButton}
              onPress={() => handleOverlayUpdate(editingOverlay.id, { size: Math.min(72, editingOverlay.size + 4) })}
            >
              <Text style={styles.controlButtonText}>+</Text>
            </TouchableOpacity>
            
            {/* Color picker */}
            <View style={styles.colorRow}>
              {TEXT_COLORS.map((color) => (
                <TouchableOpacity
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
            <TouchableOpacity
              style={styles.deleteControlButton}
              onPress={() => handleDeleteTextOverlay(editingOverlay.id)}
            >
              <CloseFillIcon size={20} color={Colors.white} />
            </TouchableOpacity>
            
            {/* Done */}
            <TouchableOpacity
              style={styles.doneControlButton}
              onPress={handleDoneEditing}
            >
              <Text style={styles.doneControlText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Bottom Toolbar */}
      <BottomToolBar
        mode="edit"
        onToolPress={handleToolAction}
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
    left: 10,
    zIndex: 10,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButton: {
    position: 'absolute',
    right: 10,
    zIndex: 10,
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
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.black,
    zIndex: 3,
  },
  errorText: {
    color: Colors.white,
    fontSize: 16,
    textAlign: 'center',
  },
  noVideoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.black,
  },
  noVideoText: {
    color: Colors.lightGray,
    fontSize: 16,
  },
  textOverlayPreview: {
    position: 'absolute',
    zIndex: 1,
    padding: 8,
  },
  textOverlayPreviewEmpty: {
    borderWidth: 1,
    borderColor: Colors.lightGray,
    borderStyle: 'dashed',
    borderRadius: BORDER_RADIUS.SMALL,
  },
  textOverlayPreviewText: {
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  textOverlayPreviewTextEmpty: {
    color: Colors.lightGray,
    fontStyle: 'italic',
  },
  textOverlayEditing: {
    backgroundColor: 'transparent',
    minWidth: 120,
    maxWidth: SCREEN_WIDTH - 40,
    padding: 4,
  },
  textOverlayInput: {
    color: Colors.white,
    fontFamily: 'Firma-Bold',
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
    fontFamily: 'Firma-Bold',
  },
  controlValue: {
    color: Colors.white,
    fontSize: 14,
    fontFamily: 'Firma-Medium',
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
    borderColor: 'transparent',
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
    fontFamily: 'Firma-SemiBold',
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
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  playIndicatorText: {
    color: Colors.white,
    fontSize: 24,
    marginLeft: 4,
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sliderTrack: {
    flex: 1,
    height: 4,
    backgroundColor: Colors.mediumGray,
    borderRadius: 2,
    position: 'relative',
  },
  sliderFill: {
    height: '100%',
    backgroundColor: Colors.purple,
    borderRadius: 2,
  },
  sliderThumb: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.white,
    top: -6,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  sliderValue: {
    color: Colors.white,
    fontSize: 14,
    fontFamily: 'Firma-Medium',
    minWidth: 45,
    textAlign: 'right',
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
    fontFamily: 'Firma-SemiBold',
  },
  editSheetContent: {
    flex: 1,
  },
  editField: {
    marginBottom: 24,
  },
  editFieldLabel: {
    color: Colors.white,
    fontSize: 14,
    fontFamily: 'Firma-SemiBold',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.MEDIUM,
    padding: 12,
    color: Colors.white,
    fontSize: 16,
    fontFamily: 'Firma-Regular',
    minHeight: 48,
  },
  positionPresets: {
    flexDirection: 'row',
    gap: 8,
  },
  presetButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: BORDER_RADIUS.MEDIUM,
    backgroundColor: Colors.darkGray,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  presetButtonSelected: {
    backgroundColor: Colors.purple,
    borderColor: Colors.purple,
  },
  presetButtonText: {
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Firma-Medium',
  },
  presetButtonTextSelected: {
    color: Colors.white,
  },
  colorPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  colorSquare: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.SMALL,
    borderWidth: 2,
    borderColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorSquareSelected: {
    borderColor: Colors.white,
  },
  colorCheckmark: {
    color: Colors.white,
    fontSize: 20,
    fontFamily: 'Firma-Bold',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  saveButton: {
    backgroundColor: Colors.purple,
    borderRadius: BORDER_RADIUS.LARGE,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  saveButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontFamily: 'Firma-SemiBold',
  },
  closeButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trimContainer: {
    padding: 20,
  },
  trimLabel: {
    color: Colors.white,
    fontSize: 16,
    fontFamily: 'Firma-SemiBold',
    marginBottom: 8,
  },
  trimDuration: {
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Firma-Medium',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  trimButtons: {
    marginTop: 20,
    gap: 12,
  },
  trimSliderContainer: {
    marginBottom: 20,
  },
  clipIndicator: {
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.MEDIUM,
    zIndex: 2,
  },
  clipIndicatorText: {
    color: Colors.white,
    fontSize: 12,
    fontFamily: 'Firma-SemiBold',
  },
  mergingText: {
    color: Colors.white,
    fontSize: 14,
    fontFamily: 'Firma-Medium',
    marginTop: 12,
  },
});

export default VideoEditorScreen;
