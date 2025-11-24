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
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import Animated, { 
  useSharedValue, 
  withSpring, 
  useAnimatedStyle, 
  withTiming,
  runOnJS,
  interpolate,
  Extrapolate
} from 'react-native-reanimated';
import Icon, { CloseFillIcon, Loading3FillIcon, ArrowRightFillIcon } from '../../src/components/ui/Icon';
import BottomToolBar from '../../src/components/ui/BottomToolBar';
import { isSmallScreen, getBottomNavBarHeight } from '../../src/utils/helpers';
import VideoProcessingService, { VideoSegment as ProcessingVideoSegment } from '../../src/services/VideoProcessingService';
import { Colors } from '../../src/components/ui/UI';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const ASPECT_RATIO = 9 / 16;
const VIDEO_WIDTH = SCREEN_WIDTH;
const VIDEO_HEIGHT = VIDEO_WIDTH / ASPECT_RATIO;

const MAX_DURATION = 60; // Maximum total recording duration in seconds
const MIN_SEGMENT_DURATION = 0.5; // Minimum duration for a segment in seconds

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
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [flash, setFlash] = useState<'off' | 'on'>('off');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingFromGallery, setIsLoadingFromGallery] = useState(false);
  const [recordedVideo, setRecordedVideo] = useState<{ uri: string } | null>(null);
  const [segments, setSegments] = useState<VideoSegment[]>([]);
  const [totalDuration, setTotalDuration] = useState(0);
  const [zoom, setZoom] = useState(0); // Expo Camera uses 0-1 range

  const recordingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const segmentStartTime = useRef<number>(0);
  const cameraRef = useRef<CameraView>(null);
  const recordingPromiseRef = useRef<Promise<{ uri: string } | undefined> | null>(null);

  const recButtonScale = useSharedValue(1);
  const progressWidth = useSharedValue(0);
  const recordingPulse = useSharedValue(0);
  const dragDistance = useSharedValue(0);
  const isZooming = useSharedValue(false);
  
  const navigation = useRouter();
  const insets = useSafeAreaInsets();
  const bottomNavBarHeight = getBottomNavBarHeight(insets);
  
  // Expo Camera zoom is 0-1 range, where 0 is no zoom and 1 is max zoom
  const minZoom = 0;
  const neutralZoom = 0;
  const maxZoom = 1;

  // Request camera permissions on mount
  useEffect(() => {
    const checkPermissions = async () => {
      if (!cameraPermission?.granted) await requestCameraPermission();
      if (!microphonePermission?.granted) await requestMicrophonePermission();
    };
    checkPermissions();
  }, [cameraPermission, requestCameraPermission, microphonePermission, requestMicrophonePermission]);
  
  // Reset zoom when switching cameras
  useEffect(() => {
    setZoom(neutralZoom);
    dragDistance.value = 0;
    isZooming.value = false;
  }, [isFrontCamera, neutralZoom, dragDistance, isZooming]);

  // Disable flash when switching to front camera
  useEffect(() => {
    if (isFrontCamera && flash === 'on') {
      setFlash('off');
    }
  }, [isFrontCamera]);

  // Animated styles
  const animatedRecordingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: recButtonScale.value }],
  }));

  const animatedProgressStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  const animatedRecordingPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(recordingPulse.value, [0, 1], [1, 1.1], Extrapolate.CLAMP) }],
    opacity: interpolate(recordingPulse.value, [0, 1], [0.8, 1], Extrapolate.CLAMP),
  }));

  // Start recording pulse animation
  const startRecordingPulse = useCallback(() => {
    recordingPulse.value = withTiming(1, { duration: 1000 }, () => {
      recordingPulse.value = withTiming(0, { duration: 1000 }, () => {
        if (isRecording) {
          runOnJS(startRecordingPulse)();
        }
      });
    });
  }, [isRecording, recordingPulse]);

  // Stop recording pulse animation
  const stopRecordingPulse = useCallback(() => {
    recordingPulse.value = withTiming(0, { duration: 200 });
  }, [recordingPulse]);

  // Define stopRecording first so that it can be used inside startRecording
  const stopRecording = useCallback(async () => {
    if (cameraRef.current && isRecording) {
      try {
        setIsProcessing(true);
        stopRecordingPulse();
        
        if (recordingTimer.current) clearInterval(recordingTimer.current);
        recButtonScale.value = withSpring(1);
        
        // Stop recording - expo-camera's stopRecording() stops the recording
        // Then await the promise from recordAsync() to get the video result
        cameraRef.current.stopRecording();
        
        if (recordingPromiseRef.current) {
          const video = await recordingPromiseRef.current;
          if (video) {
            const segmentDuration = (Date.now() - segmentStartTime.current) / 1000;
            if (segmentDuration >= MIN_SEGMENT_DURATION) {
              setSegments(prev => [
                ...prev,
                {
                  startTime: segmentStartTime.current,
                  duration: segmentDuration,
                  video,
                  sourceType: 'camera',
                },
              ]);
              setTotalDuration(prev => prev + segmentDuration);
            }
            setRecordedVideo(video);
          }
        }
        
        // Reset zoom to neutralZoom when recording stops
        setZoom(neutralZoom);
        dragDistance.value = 0;
        isZooming.value = false;
        
        // Reset if maximum duration has been reached
        if (totalDuration >= MAX_DURATION) {
          progressWidth.value = withTiming(0);
          setRecordingProgress(0);
          setSegments([]);
          setTotalDuration(0);
        }
        
        setIsProcessing(false);
        setIsRecording(false);
        recordingPromiseRef.current = null;
      } catch (e) {
        setIsProcessing(false);
        setIsRecording(false);
        recordingPromiseRef.current = null;
      }
    }
  }, [isRecording, recButtonScale, progressWidth, totalDuration, stopRecordingPulse, dragDistance, isZooming, neutralZoom]);

  const startRecording = useCallback(async () => {
    if (cameraRef.current && !isRecording && totalDuration < MAX_DURATION) {
      // Ensure microphone permission only when needed
      if (!microphonePermission?.granted) {
        const result = await requestMicrophonePermission();
        if (!result.granted) {
          Alert.alert('Microphone Permission', 'Please enable microphone access to record video with sound.');
          return;
        }
      }
      
      setIsRecording(true);
      recButtonScale.value = withSpring(1.2);
      startRecordingPulse();
      
      // Start at neutralZoom
      setZoom(neutralZoom);
      
      segmentStartTime.current = Date.now();
      try {
        const recordingOptions: CameraRecordingOptions = {
          maxDuration: MAX_DURATION - totalDuration,
          mute: !microphonePermission?.granted,
          videoQuality: '1080p',
        };
        
        recordingPromiseRef.current = cameraRef.current.recordAsync(recordingOptions);
        
        // Update progress bar at ~60fps
        recordingTimer.current = setInterval(() => {
          const currentDuration = totalDuration + ((Date.now() - segmentStartTime.current) / 1000);
          const progress = (currentDuration / MAX_DURATION) * 100;
          if (progress >= 100) {
            stopRecording();
            if (recordingTimer.current) clearInterval(recordingTimer.current);
            progressWidth.value = withTiming(100);
          } else {
            setRecordingProgress(progress);
            progressWidth.value = withTiming(progress);
          }
        }, 16);
      } catch (e) {
        setIsRecording(false);
        stopRecordingPulse();
        recordingPromiseRef.current = null;
      }
    }
  }, [isRecording, recButtonScale, progressWidth, totalDuration, stopRecording, microphonePermission, requestMicrophonePermission, startRecordingPulse, stopRecordingPulse, neutralZoom]);
  
  // Handle press start - begin recording
  const handlePressIn = useCallback(() => {
    if (!isRecording && totalDuration < MAX_DURATION) {
      setZoom(neutralZoom);
      startRecording();
    }
  }, [isRecording, totalDuration, neutralZoom, startRecording]);

  // Handle press end - stop recording
  const handlePressOut = useCallback(() => {
    if (isRecording) {
      setZoom(neutralZoom);
      stopRecording();
    }
  }, [isRecording, neutralZoom, stopRecording]);

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
        
        // Ensure video is downloaded from iCloud using MediaLibrary
        let videoUri = asset.uri;
        if (asset.assetId && Platform.OS === 'ios') {
          try {
            const mediaAsset = await MediaLibrary.getAssetInfoAsync(asset.assetId, {
              shouldDownloadFromNetwork: true,
            });
            if (mediaAsset.localUri) {
              videoUri = mediaAsset.localUri;
            }
          } catch (mediaError) {
            console.warn('Failed to download video from iCloud:', mediaError);
            // Continue with original URI - it might work
          }
        }
        
        const segmentDuration = asset.duration ? (asset.duration > 1000 ? asset.duration / 1000 : asset.duration) : 0;
        if (segmentDuration > 0) {
          const newTotalDuration = totalDuration + segmentDuration;
          if (newTotalDuration > MAX_DURATION) {
            Alert.alert(
              'Video too long',
              `Adding this video would exceed the ${MAX_DURATION} second limit. Please select a shorter video.`
            );
            setIsLoadingFromGallery(false);
            setIsProcessing(false);
            return;
          }
          
          // Update asset URI if we got a new one from MediaLibrary
          const updatedAsset = videoUri !== asset.uri ? { ...asset, uri: videoUri } : asset;
          
          const gallerySegment: VideoSegment = {
            startTime: Date.now(),
            duration: segmentDuration,
            video: updatedAsset, // Use full ImagePickerAsset with downloaded URI
            sourceType: 'gallery',
          };
          
          await new Promise(resolve => setTimeout(resolve, 100));
          setSegments(prev => [...prev, gallerySegment]);
          setTotalDuration(newTotalDuration);
          const progress = (newTotalDuration / MAX_DURATION) * 100;
          progressWidth.value = withTiming(progress);
          setRecordingProgress(progress);
        } else {
          Alert.alert('Invalid video', 'Could not determine video duration.');
          setIsLoadingFromGallery(false);
        }
        
        // Show video info alert for gallery videos
        try {
          const finalAsset = videoUri !== asset.uri ? { ...asset, uri: videoUri } : asset;
          const videoInfo = await VideoProcessingService.getVideoInfo(videoUri, finalAsset);
          const sizeInfo = await VideoProcessingService.checkVideoSize(videoUri, asset.assetId);
          
          Alert.alert(
            'Video Selected',
            `Resolution: ${videoInfo.resolution}\nQuality: ${videoInfo.qualityStandard}\nDuration: ${videoInfo.durationFormatted}\nSize: ${videoInfo.sizeFormatted}\nAspect Ratio: ${videoInfo.aspectRatio}\nFrame Rate: ${videoInfo.frameRate} fps\nCodec: ${videoInfo.codec.toUpperCase()}\n\n${sizeInfo.needsCompression ? 'Video will be compressed for upload.' : 'Video is ready for upload.'}`,
            [{ text: 'OK' }]
          );
        } catch (error) {
          // Silent fail for video info
        }
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to access gallery. Please try again.');
    } finally {
      setIsLoadingFromGallery(false);
      setIsProcessing(false);
    }
  };

  const flipCamera = () => setIsFrontCamera(prev => !prev);
  const toggleFlash = () => {
    // Only allow flash on back camera
    if (!isFrontCamera) {
      setFlash(prev => (prev === 'off' ? 'on' : 'off'));
    }
  };

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

  const handleBackPress = () => navigation.back();

  const deleteLastSegment = () => {
    if (segments.length > 0) {
      const newSegments = [...segments];
      const removedSegment = newSegments.pop();
      setSegments(newSegments);
      const newTotalDuration = totalDuration - (removedSegment?.duration || 0);
      setTotalDuration(newTotalDuration);
      const progress = (newTotalDuration / MAX_DURATION) * 100;
      progressWidth.value = withTiming(progress);
      setRecordingProgress(progress);
    }
  };

  const finishRecording = useCallback(async () => {
    if (segments.length === 0) return;
    setIsProcessing(true);
    try {
      // Prepare segments data for video editor
      const segmentsData = segments.map(segment => {
        const videoPath = 'uri' in segment.video ? segment.video.uri : segment.video.path;
        const assetId = 'assetId' in segment.video ? segment.video.assetId : null;
        return {
          videoPath: videoPath.startsWith('file://') ? videoPath : `file://${videoPath}`,
          assetId,
          duration: segment.duration,
          sourceType: segment.sourceType || 'camera',
        };
      });

      // Pass all segments to video editor as JSON
      navigation.push({
        pathname: '/video-editor',
        params: { 
          segments: JSON.stringify(segmentsData)
        }
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to process videos. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }, [segments, navigation]);

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
        <View style={styles.progressBarOverlay}>
          <View style={styles.combinedProgressBarContainer}>
            <View style={styles.progressSegmentsContainer}>
              {segments.map((segment, index) => (
                <React.Fragment key={`segment-${index}-${segment.startTime}`}>
                  {index > 0 && <View style={styles.segmentSeparator} />}
                  <View
                    style={{
                      width: `${(segment.duration / MAX_DURATION) * 100}%`,
                      height: '100%',
                      backgroundColor: Colors.purple,
                    }}
                  />
                </React.Fragment>
              ))}
              {isRecording && (
                <Animated.View
                  style={[
                    {
                      width: `${recordingProgress - ((totalDuration / MAX_DURATION) * 100)}%`,
                      height: '100%',
                      backgroundColor: Colors.red,
                    },
                    animatedRecordingPulseStyle
                  ]}
                />
              )}
            </View>
          </View>
        </View>

        {/* Camera View */}
        <View style={styles.cameraContainer}>
          <StatusBar barStyle="light-content" />
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing={isFrontCamera ? 'front' : 'back'}
            mode="video"
            enableTorch={flash === 'on' && !isFrontCamera}
            zoom={zoom}
            mute={!microphonePermission?.granted}
            videoQuality="1080p"
            ratio="16:9"
          />
          
          {/* Controls */}
          <View style={[styles.centerButtonContainer, { bottom: bottomNavBarHeight + (isSmallScreen() ? 20 : 30) }]}>
            <Pressable
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              style={styles.recordButtonContainer}
            >
              <Animated.View style={[styles.recordButton, animatedRecordingStyle]}>
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
      {segments.length > 0 && (
        <TouchableOpacity 
          style={[styles.doneButton, { top: insets.top + 10 }]} 
          onPress={finishRecording} 
          disabled={isProcessing}
          activeOpacity={0.7}
        >
          <ArrowRightFillIcon size={30} color="white" />
        </TouchableOpacity>
      )}
      {renderContent()}
      <BottomToolBar 
        mode="create" 
        onToolPress={handleToolAction} 
        flashActive={flash === 'on'} 
        hasSegments={segments.length > 0}
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
    height: isSmallScreen() ? 20 : (SCREEN_HEIGHT - VIDEO_HEIGHT) / 2.6,
    zIndex: 999,
  },
  combinedProgressBarContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.black,
    position: 'relative',
    overflow: 'hidden',
    minHeight: isSmallScreen() ? 4 : 2,
  },
  progressSegmentsContainer: {
    flexDirection: 'row',
    height: '100%',
    width: '100%',
    backgroundColor: Colors.black,
    minHeight: isSmallScreen() ? 4 : 2,
  },
  segmentSeparator: {
    width: 0,
    backgroundColor: Colors.black,
    height: '100%',
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
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: Colors.white,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  captureButtonRecording: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: Colors.red,
  },
  zoomIndicator: {
    position: 'absolute',
    top: -50,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Colors.overlayBlack60,
    borderRadius: BORDER_RADIUS.MEDIUM,
    borderWidth: 1,
    borderColor: Colors.overlayWhite10,
  },
  zoomIndicatorText: {
    color: Colors.white,
    fontSize: 14,
    fontFamily: 'Firma-SemiBold',
  },
});

export default CreateScreen;

async function mergeSegments(segments: VideoSegment[]): Promise<{ uri: string; duration?: number; width?: number; height?: number }> {
  try {
    // Convert to ProcessingVideoSegment format
    const processingSegments: ProcessingVideoSegment[] = segments.map(segment => ({
      startTime: segment.startTime,
      duration: segment.duration,
      video: segment.video,
      sourceType: segment.sourceType,
    }));

    // Use the VideoProcessingService to merge segments
    const mergedVideo = await VideoProcessingService.mergeSegments(processingSegments);
    
    return {
      uri: mergedVideo.path.startsWith('file://') ? mergedVideo.path : `file://${mergedVideo.path}`,
      duration: mergedVideo.duration,
      width: mergedVideo.width,
      height: mergedVideo.height,
    };
  } catch (error) {
    // Fallback: return the first segment if merging fails
    const totalDurationMs = segments.reduce((sum, seg) => sum + seg.duration * 1000, 0);
    const firstVideo = segments[0].video;
    const videoUri = 'uri' in firstVideo ? firstVideo.uri : (firstVideo as ImagePicker.ImagePickerAsset).uri;
    const videoDuration = 'uri' in firstVideo 
      ? totalDurationMs / 1000
      : ((firstVideo as ImagePicker.ImagePickerAsset).duration ? ((firstVideo as ImagePicker.ImagePickerAsset).duration! > 1000 ? (firstVideo as ImagePicker.ImagePickerAsset).duration! / 1000 : (firstVideo as ImagePicker.ImagePickerAsset).duration!) : totalDurationMs / 1000);
    const videoWidth = 'uri' in firstVideo ? 0 : ((firstVideo as ImagePicker.ImagePickerAsset).width || 0);
    const videoHeight = 'uri' in firstVideo ? 0 : ((firstVideo as ImagePicker.ImagePickerAsset).height || 0);
    
    return {
      uri: videoUri,
      duration: videoDuration,
      width: videoWidth,
      height: videoHeight,
    };
  }
}