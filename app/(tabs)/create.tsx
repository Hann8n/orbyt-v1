import React, { useRef, useState, useEffect, useCallback } from 'react';
import { BORDER_RADIUS } from '../../src/utils/constants';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Dimensions,
  Image,
  Alert,
  Platform,
  StatusBar,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, useCameraDevice, useCameraPermission, VideoFile } from 'react-native-vision-camera';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import Animated, { 
  useSharedValue, 
  withSpring, 
  useAnimatedStyle, 
  withTiming,
  runOnJS,
  interpolate,
  Extrapolate
} from 'react-native-reanimated';
import Icon, { BackArrowIcon, Loading3FillIcon } from '../../src/components/ui/Icon';
import BottomToolBar from '../../src/components/ui/BottomToolBar';
import { isSmallScreen } from '../../src/utils/helpers';
import VideoProcessingService, { VideoSegment as ProcessingVideoSegment } from '../../src/services/VideoProcessingService';
import { Colors } from '../../src/components/ui/UI';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const ASPECT_RATIO = 9 / 16;
const VIDEO_WIDTH = SCREEN_WIDTH;
const VIDEO_HEIGHT = VIDEO_WIDTH / ASPECT_RATIO;

const MAX_DURATION = 60; // Maximum total recording duration in seconds
const MIN_SEGMENT_DURATION = 0.5; // Minimum duration for a segment in seconds

interface VideoSegment {
  startTime: number;
  duration: number;
  video: VideoFile;
  sourceType?: 'camera' | 'gallery';
}

const CreateScreen: React.FC = () => {
  const { hasPermission, requestPermission } = useCameraPermission();
  // Gallery permissions are handled by ImagePicker automatically
  const [hasMicPermission, setHasMicPermission] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [flash, setFlash] = useState<'off' | 'on'>('off');
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordedVideo, setRecordedVideo] = useState<VideoFile | null>(null);
  const [segments, setSegments] = useState<VideoSegment[]>([]);
  const [totalDuration, setTotalDuration] = useState(0);

  const recordingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const segmentStartTime = useRef<number>(0);
  const cameraRef = useRef<Camera>(null);

  const recButtonScale = useSharedValue(1);
  const progressWidth = useSharedValue(0);
  const recordingPulse = useSharedValue(0);

  const device = useCameraDevice(isFrontCamera ? 'front' : 'back');
  const navigation = useRouter();

  // Request camera permissions on mount
  useEffect(() => {
    const checkPermissions = async () => {
      if (!hasPermission) await requestPermission();
    };
    checkPermissions();
  }, [hasPermission, requestPermission]);

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
        
        await cameraRef.current.stopRecording();
        if (recordingTimer.current) clearInterval(recordingTimer.current);
        recButtonScale.value = withSpring(1);
        
        // Reset if maximum duration has been reached
        if (totalDuration >= MAX_DURATION) {
          progressWidth.value = withTiming(0);
          setRecordingProgress(0);
          setSegments([]);
          setTotalDuration(0);
        }
      } catch (e) {
        setIsProcessing(false);
        setIsRecording(false);
      }
    }
  }, [isRecording, recButtonScale, progressWidth, totalDuration, stopRecordingPulse]);

  const startRecording = useCallback(async () => {
    if (cameraRef.current && !isRecording && totalDuration < MAX_DURATION) {
      // Ensure microphone permission only when needed
      if (!hasMicPermission) {
        const micPermission = await Camera.requestMicrophonePermission();
        const granted = micPermission === 'granted';
        setHasMicPermission(granted);
        if (!granted) {
          Alert.alert('Microphone Permission', 'Please enable microphone access to record video with sound.');
          return;
        }
      }
      
      setIsRecording(true);
      recButtonScale.value = withSpring(1.2);
      startRecordingPulse();
      
      segmentStartTime.current = Date.now();
      try {
        cameraRef.current.startRecording({
          fileType: 'mp4',
          flash: flash,
          onRecordingFinished: (video) => {
            const segmentDuration = (Date.now() - segmentStartTime.current) / 1000;
            if (segmentDuration >= MIN_SEGMENT_DURATION) {
              setSegments(prev => [
                ...prev,
                {
                  startTime: segmentStartTime.current,
                  duration: segmentDuration,
                  video,
                },
              ]);
              setTotalDuration(prev => prev + segmentDuration);
            }
            setRecordedVideo(video);
            setIsProcessing(false);
            setIsRecording(false);
          },
          onRecordingError: (error) => {
            setIsRecording(false);
            setIsProcessing(false);
            stopRecordingPulse();
            Alert.alert('Recording failed', 'Please try again');
          },
        });
        
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
      }
    }
  }, [isRecording, flash, recButtonScale, progressWidth, totalDuration, stopRecording, hasMicPermission, startRecordingPulse, stopRecordingPulse]);

  const pickFromGallery = async () => {
    try {
      setIsProcessing(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'videos',
        allowsMultipleSelection: false,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.High,
      });
      
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const videoFile: VideoFile = {
          path: asset.uri,
          duration: asset.duration ? (asset.duration > 1000 ? asset.duration / 1000 : asset.duration) : 0,
          width: asset.width || 0,
          height: asset.height || 0,
        };
        
        const segmentDuration = asset.duration ? asset.duration / 1000 : 0;
        if (segmentDuration > 0) {
          const newTotalDuration = totalDuration + segmentDuration;
          if (newTotalDuration > MAX_DURATION) {
            Alert.alert(
              'Video too long',
              `Adding this video would exceed the ${MAX_DURATION} second limit. Please select a shorter video.`
            );
            setIsProcessing(false);
            return;
          }
          
          const gallerySegment: VideoSegment = {
            startTime: Date.now(),
            duration: segmentDuration,
            video: videoFile,
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
        }
        
        // Show video info alert for gallery videos
        try {
          const videoInfo = await VideoProcessingService.getVideoInfo(asset.uri, {
            duration: asset.duration || undefined,
            width: asset.width || undefined,
            height: asset.height || undefined,
          });
          const sizeInfo = await VideoProcessingService.checkVideoSize(asset.uri);
          
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
      setIsProcessing(false);
    }
  };

  const flipCamera = () => setIsFrontCamera(prev => !prev);
  const toggleFlash = () => setFlash(prev => (prev === 'off' ? 'on' : 'off'));

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
      default:
        break;
    }
  }, [pickFromGallery, flipCamera, toggleFlash]);

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
      if (segments.length === 1) {
        const segment = segments[0];
        if (segment.sourceType === 'gallery') {
          try {
            const optimizedVideo = await VideoProcessingService.optimizeVideoForPosting(segment.video.path);
            const videoWithUri = { 
              ...optimizedVideo, 
              path: optimizedVideo.path.startsWith('file://') ? optimizedVideo.path : `file://${optimizedVideo.path}` 
            };
            navigation.push({
              pathname: '/post/[id]',
              params: { id: 'new', videoPath: videoWithUri.path }
            });
            return;
          } catch (error) {
            const fallbackVideo = {
              ...segment.video,
              path: segment.video.path.startsWith('file://') ? segment.video.path : `file://${segment.video.path}`,
            };
            navigation.push({
              pathname: '/post/[id]',
              params: { id: 'new', videoPath: fallbackVideo.path }
            });
            return;
          }
        }
        const videoWithUri = { 
          ...segment.video, 
          path: segment.video.path.startsWith('file://') ? segment.video.path : `file://${segment.video.path}` 
        };
        navigation.push({
          pathname: '/post/[id]',
          params: { id: 'new', videoPath: videoWithUri.path }
        });
        return;
      }
      
      // Merge all recorded segments into a single file
      try {
        const mergedVideo = await mergeSegments(segments);
        const videoWithUri = { 
          ...mergedVideo, 
          path: mergedVideo.path.startsWith('file://') ? mergedVideo.path : `file://${mergedVideo.path}` 
        };
        navigation.push({
          pathname: '/post/[id]',
          params: { id: 'new', videoPath: videoWithUri.path }
        });
      } catch (mergeError) {
        if (segments.length > 0) {
          const fallbackVideo = segments[0].video;
          Alert.alert(
            'Merge Failed',
            'Failed to merge video segments. Using the first segment instead.',
            [{ text: 'OK' }]
          );
          navigation.push({
            pathname: '/post/[id]',
            params: { id: 'new', videoPath: fallbackVideo.path }
          });
        } else {
          throw mergeError;
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to process videos. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }, [segments, navigation]);

  const isActive = device && hasPermission;

  // Render content based on the state of permissions and device availability
  const renderContent = () => {
    if (!hasPermission) {
      return (
        <View style={styles.warningContainer}>
          <Icon name="videocam" size={64} color={Colors.lightGray} style={styles.errorIcon} />
          <Text style={styles.warningText}>Please enable camera permissions</Text>
          <TouchableOpacity style={styles.button} activeOpacity={0.7} onPress={requestPermission}>
            <Text style={styles.buttonText}>Open Settings</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!device) {
      return (
        <View style={styles.warningContainer}>
          <Icon name="videocam" size={64} color={Colors.lightGray} style={styles.errorIcon} />
          <Text style={styles.warningText}>No Camera Found</Text>
          <TouchableOpacity style={styles.button} activeOpacity={0.7} onPress={() => Linking.openSettings()}>
            <Text style={styles.buttonText}>Open Settings</Text>
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
                <React.Fragment key={`segment-${segment.startTime}`}>
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
          <Camera
            ref={cameraRef}
            style={styles.camera}
            device={device}
            isActive={isActive || false}
            enableZoomGesture
            audio={hasMicPermission}
            video
          />

          {/* Controls */}
          <View style={styles.centerButtonContainer}>
            {segments.length > 0 && (
              <TouchableOpacity 
                style={styles.sideButton} 
                onPress={deleteLastSegment} 
                disabled={isProcessing}
                activeOpacity={0.7}
              >
                <Image 
                  source={require('../../src/assets/ButtonCameraDelete_Normal.png')} 
                  style={styles.sideButtonImage} 
                />
              </TouchableOpacity>
            )}
            
            <Pressable 
              onPressIn={startRecording} 
              onPressOut={stopRecording} 
              disabled={isProcessing}
              style={styles.recordButtonContainer}
            >
              <Animated.View style={[styles.recordButton, animatedRecordingStyle]}>
                {isProcessing ? (
                  <Loading3FillIcon size={24} color="white" />
                ) : (
                  <Image 
                    source={require('../../src/assets/CaptureButton_Normal.png')} 
                    style={styles.captureButtonImage} 
                  />
                )}
              </Animated.View>
            </Pressable>
            
            {segments.length > 0 && (
              <TouchableOpacity 
                style={styles.sideButton} 
                onPress={finishRecording} 
                disabled={isProcessing}
                activeOpacity={0.7}
              >
                <Text style={styles.doneButtonText}>Done</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
        <BackArrowIcon size={32} color="white" style={{ marginLeft: 1 }} />
      </TouchableOpacity>
      {renderContent()}
      <BottomToolBar mode="create" onToolPress={handleToolAction} flashActive={flash === 'on'} />
    </SafeAreaView>
  );
};

// Media library permissions are handled automatically by ImagePicker

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
    backgroundColor: Colors.darkGray,
    position: 'relative',
    overflow: 'hidden',
    minHeight: isSmallScreen() ? 4 : 2,
  },
  progressSegmentsContainer: {
    flexDirection: 'row',
    height: '100%',
    width: '100%',
    backgroundColor: Colors.darkGray,
    minHeight: isSmallScreen() ? 4 : 2,
  },
  segmentSeparator: {
    width: 0,
    backgroundColor: Colors.darkGray,
    height: '100%',
  },
  backButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 20,
    zIndex: 10,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerButtonContainer: {
    position: 'absolute',
    bottom: isSmallScreen() ? 30 : 50,
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
    borderRadius: BORDER_RADIUS.LARGE,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonImage: {
    width: 72,
    height: 72,
    resizeMode: 'contain',
  },
  sideButton: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sideButtonImage: {
    width: 44,
    height: 44,
    resizeMode: 'contain',
  },
  doneButtonText: {
    color: Colors.white,
    fontSize: 14,
    fontFamily: 'Firma-Medium',
  },
});

export default CreateScreen;

async function mergeSegments(segments: VideoSegment[]): Promise<VideoFile> {
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
      path: mergedVideo.path,
      duration: mergedVideo.duration,
      width: mergedVideo.width,
      height: mergedVideo.height,
    };
  } catch (error) {
    // Fallback: return the first segment if merging fails
    const totalDurationMs = segments.reduce((sum, seg) => sum + seg.duration * 1000, 0);
    return {
      path: segments[0].video.path,
      duration: totalDurationMs / 1000,
      width: segments[0].video.width,
      height: segments[0].video.height,
    };
  }
}