import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions,
  Platform,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import VideoTrimmerUI from '../src/components/Trimmer/src';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CloseFillIcon, ArrowRightFillIcon, Loading3FillIcon } from '../src/components/ui/Icon';
import { Colors } from '../src/components/ui/UI';
import VideoEditingService from '../src/services/VideoEditingService';
import VideoProcessingService from '../src/services/VideoProcessingService';
import { resolveVideoPath } from '../src/utils/videoPath';
import { File, Directory, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { useVideoTrimStore } from '../src/stores/videoTrimStore';
import { isSmallScreen, getBottomNavBarHeight } from '../src/utils/helpers';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const ASPECT_RATIO = 9 / 16; // 9:16 aspect ratio for video crop

const VideoTrimmerScreen: React.FC = () => {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setPendingTrim = useVideoTrimStore(state => state.setPendingTrim);
  const trimmerRef = useRef<any>(null);
  
  const videoPath = params.videoPath as string | undefined;
  const assetId = params.assetId as string | undefined;
  const returnTo = (params.returnTo as string) || 'create';
  const maxDuration = params.maxDuration ? parseFloat(params.maxDuration as string) : undefined;
  const currentDuration = params.currentDuration ? parseFloat(params.currentDuration as string) : 0;
  const useLiquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();
  
  // Calculate available duration (remaining time that can be used for this clip)
  const availableDuration = maxDuration !== undefined ? maxDuration - currentDuration : undefined;
  
  const isSmallDevice = isSmallScreen();
  const bottomNavBarHeight = getBottomNavBarHeight(insets);
  
  // Calculate available height for non-small devices (between safe area top and tab bar bottom)
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const availableHeight = isSmallDevice 
    ? screenHeight 
    : screenHeight - insets.top - bottomNavBarHeight;
  
  // Calculate 9:16 aspect ratio dimensions for video container
  // Use full screen width, calculate height from aspect ratio
  const videoContainerWidth = screenWidth;
  const videoContainerHeight = videoContainerWidth / ASPECT_RATIO;
  
  const [videoUri, setVideoUri] = useState<string>('');
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [videoWidth, setVideoWidth] = useState<number>(1080);
  const [videoHeight, setVideoHeight] = useState<number>(1920);
  const [panOffsetX, setPanOffsetX] = useState<number>(0);
  const [panOffsetY, setPanOffsetY] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [isReady, setIsReady] = useState(false);
  
  // Progress bar animations - separate for existing and trim progress
  const existingProgressWidth = useSharedValue(0);
  const trimProgressWidth = useSharedValue(0);

  // Resolve video path
  useEffect(() => {
    const resolveVideo = async () => {
      if (!videoPath) {
        Alert.alert('Error', 'No video provided');
        router.back();
        return;
      }

      try {
        // Get asset info from MediaLibrary if we have assetId
        let duration: number | undefined;
        let width: number | undefined;
        let height: number | undefined;
        
        if (assetId) {
          try {
            const mediaAsset = await MediaLibrary.getAssetInfoAsync(assetId, {
              shouldDownloadFromNetwork: true,
            });
            // MediaLibrary duration is already in seconds
            duration = mediaAsset.duration;
            width = mediaAsset.width;
            height = mediaAsset.height;
          } catch (mediaError) {
            console.warn('Failed to get asset info from MediaLibrary:', mediaError);
          }
        }

        // Normalize early for editing:
        // - Resolves iCloud / Photos URIs
        // - Converts any HDR / non-H.264 input into SDR BT.709 H.264 MP4
        const normalizedPath = await VideoProcessingService.normalizeVideoPathForEditing(
          videoPath,
          assetId || null
        );
        setVideoUri(normalizedPath);
        
        // Get video info to get dimensions if not available from asset
        if (!width || !height) {
          try {
            const videoInfo = await VideoProcessingService.getVideoInfo(normalizedPath);
            width = videoInfo.width;
            height = videoInfo.height;
            if (duration === undefined) {
              duration = videoInfo.duration;
            }
          } catch (infoError) {
            console.warn('Failed to get video info, using defaults:', infoError);
            // Use defaults
            width = width || 1080;
            height = height || 1920;
          }
        }
        
        // Store video dimensions
        if (width && height) {
          setVideoWidth(width);
          setVideoHeight(height);
        }
        
        // Get video duration from asset if available
        if (duration !== undefined) {
          setVideoDuration(duration);
          setTrimStart(0);
          // Set initial trim end to either video duration or available duration, whichever is smaller
          const initialTrimEnd = availableDuration !== undefined 
            ? Math.min(duration, availableDuration)
            : duration;
          setTrimEnd(initialTrimEnd);
          // Initialize progress bars
          if (maxDuration !== undefined) {
            // Existing progress (from previous segments)
            const existingProgress = Math.min((currentDuration / maxDuration) * 100, 100);
            existingProgressWidth.value = withTiming(existingProgress, { duration: 200 });
            
            // Trim progress (from current video being trimmed)
            const initialTrimmedDuration = initialTrimEnd;
            const trimProgress = Math.min((initialTrimmedDuration / maxDuration) * 100, 100);
            trimProgressWidth.value = withTiming(trimProgress, { duration: 200 });
          }
          setIsReady(true); // Allow applying without trimming
        }
      } catch (error) {
        console.error('Error resolving video:', error);
        Alert.alert('Error', 'Failed to load video');
        router.back();
      }
    };

    resolveVideo();
  }, [videoPath, assetId, router, availableDuration]);

  // Update progress bar based on current trim selection
  const updateProgress = (start: number, end: number) => {
    if (maxDuration !== undefined) {
      const trimmedDuration = end - start;
      const trimProgress = Math.min((trimmedDuration / maxDuration) * 100, 100);
      trimProgressWidth.value = withTiming(trimProgress, { duration: 100 });
    }
  };

  // Handle trim selection
  // Note: maxDuration constraint is now handled inside VideoTrimmerUI component
  // This callback receives the already-constrained values
  const handleSelected = (start: number, end: number) => {
    setTrimStart(start);
    setTrimEnd(end);
    updateProgress(start, end);
    setIsReady(true);
  };

  // Handle real-time value changes during dragging
  const handleValueChange = (start: number, end: number) => {
    updateProgress(start, end);
  };

  // Apply trim
  const handleApply = async () => {
    if (!videoUri || isProcessing) return;
    
    if (trimEnd <= trimStart) {
      Alert.alert('Error', 'End time must be greater than start time');
      return;
    }
    
    // Validate that trimmed duration doesn't exceed available duration
    // Note: This should rarely trigger since maxDuration is enforced in the UI,
    // but keeping as a safety check
    const trimmedDuration = trimEnd - trimStart;
    if (availableDuration !== undefined && trimmedDuration > availableDuration + 0.1) {
      Alert.alert('Error', `Trimmed clip duration (${trimmedDuration.toFixed(1)}s) exceeds available time (${availableDuration.toFixed(1)}s)`);
      return;
    }

    setIsProcessing(true);
    
    try {
      // Calculate actual trimmed duration (always use the selected trim range)
      const trimmedDuration = trimEnd - trimStart;
      
      // Check if trimming is needed (if full video is selected, skip trimming)
      const isFullVideo = trimStart === 0 && Math.abs(trimEnd - videoDuration) < 0.1;
      
      let trimmedVideoPath: string;
      
      // Step 1: Trim video if needed
      if (isFullVideo) {
        // No trimming needed, use original video path
        trimmedVideoPath = videoUri;
      } else {
        // Generate temporary file path for trimmed video
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(7);
        const fileName = `trimmed_${timestamp}_${random}.mp4`;
        
        // Create directory in cache using Directory.create() with intermediates option
        const tempDir = new Directory(Paths.cache, `video_trim_${timestamp}`);
        await tempDir.create({ intermediates: true });
        
        // Create File object - .uri property already has correct format
        const outputFile = new File(tempDir, fileName);
        
        // VideoEditingService.trimVideo expects paths without file:// prefix for FFmpeg
        // It handles normalization internally, so we pass the .uri without file:// prefix
        const outputPath = outputFile.uri.replace(/^file:\/\//, '');
        const inputPath = videoUri.replace(/^file:\/\//, '');

        // Trim video using VideoEditingService
        // trimVideo returns path with file:// prefix, which is what we need for storage
        // It throws an error if trimming fails, so we can trust the returned path
        trimmedVideoPath = await VideoEditingService.trimVideo(
          inputPath,
          outputPath,
          trimStart,
          trimEnd
        );
      }
      
      // Step 2: Crop video to 9:16 aspect ratio
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const fileName = `cropped_${timestamp}_${random}.mp4`;
      
      const cropDir = new Directory(Paths.cache, `video_crop_${timestamp}`);
      await cropDir.create({ intermediates: true });
      
      const cropOutputFile = new File(cropDir, fileName);
      const cropOutputPath = cropOutputFile.uri.replace(/^file:\/\//, '');
      const cropInputPath = trimmedVideoPath.replace(/^file:\/\//, '');
      
      // Get pan offset from trimmer ref (normalized -1 to 1)
      let finalPanOffsetX = panOffsetX;
      let finalPanOffsetY = panOffsetY;
      if (trimmerRef.current && 'getCropPosition' in trimmerRef.current) {
        const cropPos = (trimmerRef.current as any).getCropPosition();
        finalPanOffsetX = cropPos.x;
        finalPanOffsetY = cropPos.y;
      }
      
      // Crop video to 9:16 using pan offset
      const finalVideoPath = await VideoEditingService.cropVideoTo9x16(
        cropInputPath,
        cropOutputPath,
        videoWidth,
        videoHeight,
        finalPanOffsetX,
        finalPanOffsetY
      );
      
      // Provide cropped video to caller and go back
      if (returnTo === 'create') {
        setPendingTrim({
          videoPath: finalVideoPath,
          duration: trimmedDuration,
        });
      }
      router.back();
    } catch (error: any) {
      console.error('Error trimming video:', error);
      Alert.alert('Error', error.message || 'Failed to trim video. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  // Animated progress bar styles - must be called before any early returns
  const animatedExistingProgressStyle = useAnimatedStyle(() => ({
    width: `${existingProgressWidth.value}%`,
  }), []);

  const animatedTrimProgressStyle = useAnimatedStyle(() => ({
    width: `${trimProgressWidth.value}%`,
    left: `${existingProgressWidth.value}%`,
  }), []);

  if (!videoUri) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Loading3FillIcon size={48} color={Colors.white} />
          <Text style={styles.loadingText}>Loading video...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      {/* Progress Bar - overlays on top of trimmer */}
      {maxDuration !== undefined && (
        <View style={[styles.progressBarOverlay, { 
          height: isSmallDevice ? 54 : insets.top
        }]}>
          <View style={styles.combinedProgressBarContainer}>
            {/* Existing progress (from previous segments) */}
            {currentDuration > 0 && (
              <Animated.View
                style={[
                  styles.progressBarFill,
                  { backgroundColor: Colors.blurple, opacity: 0.4 },
                  animatedExistingProgressStyle,
                ]}
              />
            )}
            {/* Trim progress (from current video being trimmed) */}
            <Animated.View
              style={[
                styles.progressBarFill,
                { backgroundColor: Colors.blurple },
                animatedTrimProgressStyle,
              ]}
            />
          </View>
        </View>
      )}
      
      {/* Video Trimmer UI */}
      <View style={[
        styles.trimmerContainer,
        !isSmallDevice && {
          marginTop: insets.top,
          marginBottom: bottomNavBarHeight,
        }
      ]}>
        <VideoTrimmerUI
          ref={trimmerRef}
          source={{ uri: videoUri }}
          onSelected={handleSelected}
          onValueChange={handleValueChange}
          loop={true}
          containerStyle={StyleSheet.flatten([
            styles.trimmerWrapper,
            isSmallDevice 
              ? { width: videoContainerWidth, height: videoContainerHeight }
              : { width: videoContainerWidth, height: Math.min(videoContainerHeight, availableHeight) }
          ]) as ViewStyle}
          sliderContainerStyle={styles.sliderContainer}
          tintColor={Colors.blurple}
          minDuration={0.5}
          maxDuration={availableDuration}
          videoWidth={videoWidth}
          videoHeight={videoHeight}
          onCropPositionChange={(x, y) => {
            setPanOffsetX(x);
            setPanOffsetY(y);
          }}
        />
      </View>

      {/* Back Button */}
      <TouchableOpacity
        style={[styles.backButton, { 
          top: isSmallDevice ? 5 : insets.top + 4,
          left: 4,
        }]}
        onPress={handleCancel}
        disabled={isProcessing}
      >
        <CloseFillIcon size={26} color="white" />
      </TouchableOpacity>

      {/* Next Button - Above progress bar for small devices */}
      {isSmallDevice && (
        <TouchableOpacity
          style={[
            styles.nextButtonTop, 
            useLiquidGlass && styles.nextButtonGlassWrapper,
            { 
              bottom: 100, // Position above the slider/progress bar area
              right: 16,
              opacity: (isProcessing || !isReady) ? 0.3 : 1,
            }
          ]}
          onPress={handleApply}
          disabled={isProcessing || !isReady}
          activeOpacity={0.7}
        >
          {useLiquidGlass && (
            <GlassView
              style={styles.nextButtonGlassBackground}
              glassEffectStyle="clear"
              tintColor="rgba(255,255,255,1)"
              isInteractive
            />
          )}
          <View pointerEvents="none">
            {isProcessing ? (
              <Loading3FillIcon size={24} color={Colors.black} />
            ) : (
              <Text style={styles.nextButtonTextTop}>NEXT</Text>
            )}
          </View>
        </TouchableOpacity>
      )}

      {/* Next Button - Bottom toolbar for taller devices */}
      {!isSmallDevice && (
        <TouchableOpacity
          style={[
            styles.nextButtonBottom,
            useLiquidGlass && styles.nextButtonGlassWrapper,
            {
              bottom: insets.bottom + 8, // Position above safe area bottom with padding
              opacity: (isProcessing || !isReady) ? 0.3 : 1,
            }
          ]}
          onPress={handleApply}
          disabled={isProcessing || !isReady}
          activeOpacity={0.7}
        >
          {useLiquidGlass && (
            <GlassView
              style={styles.nextButtonGlassBackground}
              glassEffectStyle="clear"
              tintColor="rgba(255,255,255,1)"
              isInteractive
            />
          )}
          <View pointerEvents="none">
            {isProcessing ? (
              <Loading3FillIcon size={24} color={Colors.black} />
            ) : (
              <Text style={styles.nextButtonTextBottom}>NEXT</Text>
            )}
          </View>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: Colors.white,
    fontSize: 16,
    fontFamily: 'Firma-Medium',
    marginTop: 16,
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
  nextButtonTop: {
    position: 'absolute',
    right: 16,
    zIndex: 1000,
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButtonGlassWrapper: {
    backgroundColor: 'transparent',
  },
  nextButtonGlassBackground: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
  },
  nextButtonTextTop: {
    fontFamily: 'Firma-Bold',
    fontSize: 17,
    color: Colors.black,
    fontWeight: '600',
  },
  nextButtonBottom: {
    position: 'absolute',
    right: 16,
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  nextButtonTextBottom: {
    fontFamily: 'Firma-Bold',
    fontSize: 17,
    color: Colors.black,
    fontWeight: '600',
  },
  trimmerContainer: {
    flex: 1,
    marginTop: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  trimmerWrapper: {
    alignSelf: 'center',
    borderRadius: 0,
    overflow: 'hidden',
  },
  sliderContainer: {
    marginHorizontal: 8,
    marginTop: 20,
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
    backgroundColor: 'transparent',
    position: 'relative',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.blurple,
    borderRadius: 0,
    position: 'absolute',
    top: 0,
    left: 0,
  },
});

export default VideoTrimmerScreen;

