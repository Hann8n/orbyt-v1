import React, { useRef, useState, useEffect, useCallback } from 'react';
import { BORDER_RADIUS, ICON_SIZES } from '../../src/utils/constants';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Dimensions,
  Alert,
  Platform,
  StatusBar,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  CameraView, 
  CameraType,
  useCameraPermissions,
  useMicrophonePermissions,
  CameraRecordingOptions
} from 'expo-camera';
import { useRouter, useFocusEffect } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming
} from 'react-native-reanimated';
import Icon, { CloseFillIcon, Loading3FillIcon, ArrowRightFillIcon } from '../../src/components/ui/Icon';
import BottomToolBar from '../../src/components/ui/BottomToolBar';
import { isSmallScreen, getBottomNavBarHeight } from '../../src/utils/helpers';
import VideoProcessingService from '../../src/services/VideoProcessingService';
import { debugVideoPath } from '../../src/utils/videoPath';
import { Colors } from '../../src/components/ui/UI';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const ASPECT_RATIO = 9 / 16;
const VIDEO_WIDTH = SCREEN_WIDTH;
const VIDEO_HEIGHT = VIDEO_WIDTH / ASPECT_RATIO;

const MIN_SEGMENT_DURATION = 0.5; // Minimum duration for a segment in seconds

// Duration options in seconds
const DURATION_OPTIONS = [
  { value: 6.5, label: '6.5s' },
  { value: 16, label: '16s' },
  { value: 60, label: '1m' },
  { value: 180, label: '3m' },
] as const;

interface VideoSegment {
  startTime: number;
  duration: number;
  video: { uri: string } | ImagePicker.ImagePickerAsset;
  sourceType?: 'camera' | 'gallery';
}

const CreateScreen: React.FC = () => {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();
  const [isRecording, setIsRecording] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(false);
  const [flash, setFlash] = useState<'off' | 'on'>('off');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingFromGallery, setIsLoadingFromGallery] = useState(false);
  const [recordedVideo, setRecordedVideo] = useState<{ uri: string } | null>(null);
  const [segments, setSegments] = useState<VideoSegment[]>([]);
  const [totalDuration, setTotalDuration] = useState(0);
  const [selectedDuration, setSelectedDuration] = useState(16); // Default to 16 seconds
  const [isDurationSelectorExpanded, setIsDurationSelectorExpanded] = useState(false);

  const recordingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const segmentStartTime = useRef<number>(0);
  const cameraRef = useRef<CameraView>(null);
  const recordingPromiseRef = useRef<Promise<{ uri: string } | undefined> | null>(null);
  const isMountedRef = useRef(true);
  const isRecordingRef = useRef(false);
  
  const isFocused = useIsFocused();

  const progressWidth = useSharedValue(0);
  const buttonOpacity = useSharedValue(1);
  
  const navigation = useRouter();
  const insets = useSafeAreaInsets();
  const bottomNavBarHeight = getBottomNavBarHeight(insets);
  
  // Get current max duration from selected option
  const maxDuration = selectedDuration;

  // Request camera permissions on mount
  useEffect(() => {
    const checkPermissions = async () => {
      if (!cameraPermission?.granted) await requestCameraPermission();
      if (!microphonePermission?.granted) await requestMicrophonePermission();
    };
    checkPermissions();
  }, [cameraPermission, requestCameraPermission, microphonePermission, requestMicrophonePermission]);
  
  // Cleanup: reset processing state when component unmounts or user navigates away
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Stop recording if active when component unmounts
      if (isRecordingRef.current && cameraRef.current) {
        cameraRef.current.stopRecording();
        if (recordingTimer.current) {
          clearInterval(recordingTimer.current);
        }
        isRecordingRef.current = false;
        setIsRecording(false);
      }
      setIsProcessing(false);
    };
  }, []);

  // Reset processing state when screen comes back into focus (user navigated back)
  useFocusEffect(
    useCallback(() => {
      // Reset processing state when screen is focused again
      setIsProcessing(false);
      isMountedRef.current = true;
      
      return () => {
        // Cleanup when screen loses focus - stop recording if active
        if (isRecordingRef.current && cameraRef.current) {
          cameraRef.current.stopRecording();
          if (recordingTimer.current) {
            clearInterval(recordingTimer.current);
          }
          isRecordingRef.current = false;
          setIsRecording(false);
        }
      };
    }, [])
  );

  // Disable flash when switching to front camera
  useEffect(() => {
    if (isFrontCamera && flash === 'on') {
      setFlash('off');
    }
  }, [isFrontCamera]);

  // Animated styles
  const animatedProgressStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }), []);

  const animatedButtonOpacityStyle = useAnimatedStyle(() => ({
    opacity: buttonOpacity.value,
  }), []);

  // Animate button opacity when recording state changes
  useEffect(() => {
    buttonOpacity.value = withTiming(isRecording ? 0.5 : 1, { duration: 100 });
  }, [isRecording]);


  // Define stopRecording first so that it can be used inside startRecording
  const stopRecording = useCallback(async () => {
    if (cameraRef.current && isRecordingRef.current) {
      try {
        setIsProcessing(true);
        
        if (recordingTimer.current) clearInterval(recordingTimer.current);
        
        // Stop recording - expo-camera's stopRecording() stops the recording
        // Then await the promise from recordAsync() to get the video result
        cameraRef.current.stopRecording();
        
        if (recordingPromiseRef.current) {
          const video = await recordingPromiseRef.current;
          if (video) {
            const segmentDuration = (Date.now() - segmentStartTime.current) / 1000;
            let updatedDuration: number | null = null;
            if (segmentDuration >= MIN_SEGMENT_DURATION) {
              updatedDuration = totalDuration + segmentDuration;
              setSegments(prev => [
                ...prev,
                {
                  startTime: segmentStartTime.current,
                  duration: segmentDuration,
                  video,
                  sourceType: 'camera',
                },
              ]);
              setTotalDuration(updatedDuration);
            } else {
              // Reset progress bar if segment was too short
              const progress = (totalDuration / maxDuration) * 100;
              progressWidth.value = withTiming(progress, { duration: 200 });
            }
            setRecordedVideo(video);
            
            if (updatedDuration !== null && updatedDuration >= maxDuration) {
              // Cap progress at 100% when max duration is reached, but keep segments
              progressWidth.value = withTiming(100, { duration: 200 });
            }
          }
        }
        
        setIsProcessing(false);
        isRecordingRef.current = false;
        setIsRecording(false);
        recordingPromiseRef.current = null;
      } catch (e) {
        setIsProcessing(false);
        isRecordingRef.current = false;
        setIsRecording(false);
        recordingPromiseRef.current = null;
      }
    }
  }, [progressWidth, totalDuration, maxDuration]);

  const startRecording = useCallback(async () => {
    if (cameraRef.current && !isRecordingRef.current && totalDuration < maxDuration) {
      // Ensure microphone permission only when needed
      if (!microphonePermission?.granted) {
        const result = await requestMicrophonePermission();
        if (!result.granted) {
          Alert.alert('Microphone Permission', 'Please enable microphone access to record video with sound.');
          return;
        }
      }
      
      isRecordingRef.current = true;
      setIsRecording(true);
      
      segmentStartTime.current = Date.now();
      try {
        const recordingOptions: CameraRecordingOptions = {
          maxDuration: maxDuration - totalDuration,
        };
        
        recordingPromiseRef.current = cameraRef.current.recordAsync(recordingOptions);
        
        // Update progress bar smoothly
        recordingTimer.current = setInterval(() => {
          const currentDuration = totalDuration + ((Date.now() - segmentStartTime.current) / 1000);
          const progress = (currentDuration / maxDuration) * 100;
          if (progress >= 100) {
            stopRecording();
            if (recordingTimer.current) clearInterval(recordingTimer.current);
            progressWidth.value = withTiming(100, { duration: 200 });
          } else {
            progressWidth.value = withTiming(progress, { duration: 100 });
          }
        }, 50);
      } catch (e) {
        isRecordingRef.current = false;
        setIsRecording(false);
        recordingPromiseRef.current = null;
      }
    }
  }, [progressWidth, totalDuration, stopRecording, microphonePermission, requestMicrophonePermission, maxDuration]);
  
  // Handle press start - begin recording
  const handlePressIn = useCallback(() => {
    if (!isRecordingRef.current && totalDuration < maxDuration) {
      startRecording();
    }
  }, [totalDuration, startRecording, maxDuration]);

  // Handle press end - stop recording
  const handlePressOut = useCallback(() => {
    if (isRecordingRef.current) {
      stopRecording();
    }
  }, [stopRecording]);

  const pickFromGallery = async () => {
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
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
        videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
      });
      
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        
        // iCloud downloads will be handled by VideoProcessingService.standardizeVideoPath()
        // when processing the video
        
        const segmentDuration = asset.duration ? (asset.duration > 1000 ? asset.duration / 1000 : asset.duration) : 0;
        if (segmentDuration > 0) {
          const newTotalDuration = totalDuration + segmentDuration;
          if (newTotalDuration > maxDuration) {
            Alert.alert(
              'Video too long',
              `Adding this video would exceed the ${maxDuration} second limit. Please select a shorter video.`
            );
            setIsLoadingFromGallery(false);
            setIsProcessing(false);
            return;
          }
          
          const gallerySegment: VideoSegment = {
            startTime: Date.now(),
            duration: segmentDuration,
            video: asset, // Use full ImagePickerAsset - standardization will handle iCloud downloads
            sourceType: 'gallery',
          };
          
          await new Promise(resolve => setTimeout(resolve, 100));
          setSegments(prev => [...prev, gallerySegment]);
          setTotalDuration(newTotalDuration);
          const progress = (newTotalDuration / maxDuration) * 100;
          progressWidth.value = withTiming(progress, { duration: 300 });
        } else {
          Alert.alert('Invalid video', 'Could not determine video duration.');
          setIsLoadingFromGallery(false);
        }
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to access gallery. Please try again.');
    } finally {
      setIsLoadingFromGallery(false);
      setIsProcessing(false);
    }
  };

  const flipCamera = useCallback(async () => {
    // Stop any active recording before switching cameras
    if (isRecordingRef.current && cameraRef.current) {
      await stopRecording();
    }
    setIsFrontCamera(prev => !prev);
  }, [stopRecording]);
  const toggleFlash = useCallback(() => {
    // Only allow flash on back camera
    if (!isFrontCamera) {
      setFlash(prev => (prev === 'off' ? 'on' : 'off'));
    }
  }, [isFrontCamera]);

  const deleteLastSegment = useCallback(() => {
    if (segments.length > 0) {
      const newSegments = [...segments];
      const removedSegment = newSegments.pop();
      const newTotalDuration = Math.max(0, totalDuration - (removedSegment?.duration || 0));
      
      setSegments(newSegments);
      setTotalDuration(newTotalDuration);
      
      // Explicitly reset progress to 0 when all segments are deleted
      const progress = newSegments.length === 0 ? 0 : (newTotalDuration / maxDuration) * 100;
      progressWidth.value = withTiming(progress, { duration: 300 });
    } else if (totalDuration > 0) {
      // Handle case where there's progress but no segments (e.g., tiny rejected segment)
      setTotalDuration(0);
      progressWidth.value = withTiming(0, { duration: 300 });
    }
  }, [segments, totalDuration, maxDuration, progressWidth]);

  const handleToolAction = useCallback((action: string) => {
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
  }, [pickFromGallery, flipCamera, toggleFlash, deleteLastSegment]);

  const handleBackPress = async () => {
    if (isRecordingRef.current) {
      await stopRecording();
    }
    navigation.back();
  };

  const finishRecording = useCallback(async () => {
    if (segments.length === 0 || isProcessing) return;
    
    // Stop recording if active
    if (isRecordingRef.current) {
      await stopRecording();
    }
    
    setIsProcessing(true);
    try {
      // If only one segment, check compatibility and process accordingly
      if (segments.length === 1) {
        const segment = segments[0];
        const asset = 'assetId' in segment.video ? segment.video as ImagePicker.ImagePickerAsset : undefined;
        // Both { uri: string } and ImagePickerAsset have uri property
        const videoPath = segment.video.uri;
        
        // Validate that videoPath exists before proceeding
        if (!videoPath) {
          throw new Error('Video URI is undefined. Cannot process video.');
        }
        
        // Debug: Log the incoming video path
        debugVideoPath('create.tsx single segment', videoPath, asset);
        
        // Standardize path first (handles iCloud downloads)
        const standardizedPath = await VideoProcessingService.standardizeVideoPath(videoPath, asset);
        
        console.log('[create.tsx] Standardized path:', standardizedPath);
        
        // Check if video is already compatible - skip normalization if so
        // Use standardizedPath for compatibility check since that's the path we'll actually use
        const isCompatible = await VideoProcessingService.isVideoCompatible(standardizedPath, asset);
        
        let finalVideoPath: string;
        if (isCompatible) {
          // Video is compatible, use standardized path directly
          finalVideoPath = standardizedPath;
          console.log('[create.tsx] Video compatible, using standardized path');
        } else {
          // Video needs normalization
          console.log('[create.tsx] Video needs normalization');
          const normalizedVideo = await VideoProcessingService.normalizeVideo(segment.video);
          finalVideoPath = normalizedVideo.path;
          console.log('[create.tsx] Normalized path:', finalVideoPath);
        }
        
        // Debug: Log the final path being sent
        debugVideoPath('create.tsx -> VideoPostScreen', finalVideoPath);
        
        // Only navigate if component is still mounted
        if (isMountedRef.current) {
          // Navigate directly to post screen with processed video
          navigation.push({
            pathname: '/post/[id]',
            params: {
              id: 'new',
              videoPath: finalVideoPath
            }
          });
        }
      } else {
        // Multiple segments need merging - go to processing screen
        console.log('[create.tsx] Multiple segments, going to processing screen');
        // Only navigate if component is still mounted
        if (isMountedRef.current) {
          navigation.push({
            pathname: '/video-processing',
            params: { 
              segments: JSON.stringify(segments)
            }
          });
        }
      }
    } catch (error) {
      console.error('[create.tsx] Error processing video:', error);
      // Only show alert if component is still mounted
      if (isMountedRef.current) {
        Alert.alert('Error', 'Failed to process video. Please try again.');
      }
    } finally {
      // Reset processing state in finally block to ensure cleanup
      if (isMountedRef.current) {
        setIsProcessing(false);
      }
    }
  }, [segments, navigation, isProcessing, stopRecording]);

  // Render content based on the state of permissions and device availability
  const renderContent = () => {
    if (!cameraPermission) {
      // Camera permissions are still loading
      return <View style={styles.warningContainer} />;
    }

    if (!cameraPermission.granted) {
      return (
        <View style={styles.warningContainer}>
          <Icon name="videocam" size={64} color={Colors.lightGray} style={styles.errorIcon} />
          <Text style={styles.warningText}>Please enable camera permissions</Text>
          <TouchableOpacity style={styles.button} activeOpacity={0.7} onPress={requestCameraPermission}>
            <Text style={styles.buttonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Normal camera content when permissions and device are available
    return (
      <>
        {/* Progress Bar */}
        <View style={[styles.progressBarOverlay, { height: insets.top }]}>
          <View style={styles.combinedProgressBarContainer}>
            <Animated.View
              style={[
                styles.progressBarFill,
                animatedProgressStyle
              ]}
            />
          </View>
        </View>

        {/* Camera View - only render when screen is focused */}
        <View style={styles.cameraContainer}>
          <StatusBar barStyle="light-content" />
          {isFocused && (
            <CameraView
              key={`camera-${isFrontCamera ? 'front' : 'back'}`}
              ref={cameraRef}
              style={styles.camera}
              facing={isFrontCamera ? 'front' : 'back'}
              mode="video"
              enableTorch={flash === 'on' && !isFrontCamera}
              zoom={0}
              mute={!microphonePermission?.granted}
              videoQuality="1080p"
              ratio="16:9"
            />
          )}
          
          {/* Controls */}
          <View style={[styles.centerButtonContainer, { bottom: bottomNavBarHeight + (isSmallScreen() ? 40 : 50) }]}>
            <Pressable
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              style={styles.recordButtonContainer}
            >
              <Animated.View style={[styles.recordButton, animatedButtonOpacityStyle]}>
                {isLoadingFromGallery ? (
                  <Loading3FillIcon size={32} color="white" />
                ) : (
                  <View style={styles.captureButtonInner} />
                )}
              </Animated.View>
            </Pressable>
          </View>
        </View>
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity style={[styles.backButton, { top: insets.top + 10 }]} onPress={handleBackPress}>
        <CloseFillIcon size={26} color="white" />
      </TouchableOpacity>
      
      {/* Duration Selector */}
      {!isRecording && segments.length === 0 && (
        <View style={[styles.durationSelector, { top: insets.top + 10 }]}>
          {isDurationSelectorExpanded ? (
            <>
              {DURATION_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.durationOption,
                    selectedDuration === option.value && styles.durationOptionSelected,
                  ]}
                  onPress={() => {
                    // Only allow changing duration if not recording and no segments exist
                    if (!isRecording && segments.length === 0) {
                      setSelectedDuration(option.value);
                      setIsDurationSelectorExpanded(false);
                    }
                  }}
                  disabled={isRecording || segments.length > 0}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.durationOptionText,
                      selectedDuration === option.value && styles.durationOptionTextSelected,
                      (isRecording || segments.length > 0) && styles.durationOptionTextDisabled,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </>
          ) : (
            <TouchableOpacity
              style={styles.durationOption}
              onPress={() => setIsDurationSelectorExpanded(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.durationOptionText}>
                {DURATION_OPTIONS.find(opt => opt.value === selectedDuration)?.label || '16s'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      
      {segments.length > 0 && (
        <TouchableOpacity 
          style={[styles.doneButton, { top: insets.top + 10 }]} 
          onPress={finishRecording} 
          disabled={isProcessing}
          activeOpacity={0.7}
        >
          {isProcessing ? (
            <Loading3FillIcon size={30} color="white" />
          ) : (
            <ArrowRightFillIcon size={30} color="white" />
          )}
        </TouchableOpacity>
      )}
      {renderContent()}
      <BottomToolBar 
        mode="create" 
        onToolPress={handleToolAction} 
        flashActive={flash === 'on'} 
        hasSegments={totalDuration > 0}
        isFrontCamera={isFrontCamera}
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
    color: Colors.lightGray,
    fontSize: 18,
    fontFamily: 'Firma-SemiBold',
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
    backgroundColor: Colors.white,
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
    fontFamily: 'Firma-SemiBold',
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    alignSelf: 'center',
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
    backgroundColor: Colors.black,
    position: 'relative',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.blurple,
    borderRadius: 0,
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
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  durationOptionSelected: {
    backgroundColor: Colors.white,
  },
  durationOptionText: {
    color: Colors.white,
    fontSize: 14,
    fontFamily: 'Firma-Medium',
  },
  durationOptionTextSelected: {
    color: Colors.black,
    fontFamily: 'Firma-SemiBold',
  },
  durationOptionTextDisabled: {
    opacity: 0.5,
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
    borderColor: Colors.white,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInner: {
    width: 74,
    height: 74,
    borderRadius: 38,
    backgroundColor: 'rgba(129, 136, 150, 0.4)',
  },
  captureButtonRecording: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: Colors.red,
  },
});

export default CreateScreen;
