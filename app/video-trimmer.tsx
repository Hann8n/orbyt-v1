import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
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
  
  // Calculate available duration (remaining time that can be used for this clip)
  const availableDuration = maxDuration !== undefined ? maxDuration - currentDuration : undefined;
  
  const isSmallDevice = isSmallScreen();
  const bottomNavBarHeight = getBottomNavBarHeight(insets);
  
  // Calculate available height for non-small devices (between safe area top and tab bar bottom)
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const availableHeight = isSmallDevice 
    ? screenHeight 
    : screenHeight - insets.top - bottomNavBarHeight;
  
  const [videoUri, setVideoUri] = useState<string>('');
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [isReady, setIsReady] = useState(false);

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
        
        if (assetId) {
          try {
            const mediaAsset = await MediaLibrary.getAssetInfoAsync(assetId, {
              shouldDownloadFromNetwork: true,
            });
            // MediaLibrary duration is already in seconds
            duration = mediaAsset.duration;
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
        
        // Get video duration from asset if available
        if (duration !== undefined) {
          setVideoDuration(duration);
          setTrimStart(0);
          // Set initial trim end to either video duration or available duration, whichever is smaller
          const initialTrimEnd = availableDuration !== undefined 
            ? Math.min(duration, availableDuration)
            : duration;
          setTrimEnd(initialTrimEnd);
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

  // Handle trim selection
  // Note: maxDuration constraint is now handled inside VideoTrimmerUI component
  // This callback receives the already-constrained values
  const handleSelected = (start: number, end: number) => {
    setTrimStart(start);
    setTrimEnd(end);
    setIsReady(true);
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
      
      let finalVideoPath: string;
      
      if (isFullVideo) {
        // No trimming needed, use original video path
        finalVideoPath = videoUri;
      } else {
        // Generate temporary file path using Expo FileSystem best practices
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
        finalVideoPath = await VideoEditingService.trimVideo(
          inputPath,
          outputPath,
          trimStart,
          trimEnd
        );
      }
      
      // Provide trimmed video to caller and go back
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
          loop={true}
          containerStyle={StyleSheet.flatten([
            styles.trimmerWrapper,
            isSmallDevice 
              ? styles.trimmerWrapperFullScreen 
              : { height: availableHeight }
          ]) as ViewStyle}
          sliderContainerStyle={styles.sliderContainer}
          tintColor={Colors.blurple}
          minDuration={0.5}
          maxDuration={availableDuration}
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
          {isProcessing ? (
            <Loading3FillIcon size={24} color={Colors.black} />
          ) : (
            <Text style={styles.nextButtonTextTop}>NEXT</Text>
          )}
        </TouchableOpacity>
      )}

      {/* Next Button - Bottom toolbar for taller devices */}
      {!isSmallDevice && (
        <TouchableOpacity
          style={[
            styles.nextButtonBottom,
            {
              bottom: insets.bottom + 8, // Position above safe area bottom with padding
              opacity: (isProcessing || !isReady) ? 0.3 : 1,
            }
          ]}
          onPress={handleApply}
          disabled={isProcessing || !isReady}
          activeOpacity={0.7}
        >
          {isProcessing ? (
            <Loading3FillIcon size={24} color={Colors.black} />
          ) : (
            <Text style={styles.nextButtonTextBottom}>NEXT</Text>
          )}
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
    height: 400,
    borderRadius: 0,
    overflow: 'visible',
  },
  trimmerWrapperFullScreen: {
    height: SCREEN_HEIGHT,
  },
  sliderContainer: {
    marginHorizontal: 8,
    marginTop: 20,
  },
});

export default VideoTrimmerScreen;

