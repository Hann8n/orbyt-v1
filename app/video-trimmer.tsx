import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions,
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const VideoTrimmerScreen: React.FC = () => {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const trimmerRef = useRef<any>(null);
  
  const videoPath = params.videoPath as string | undefined;
  const assetId = params.assetId as string | undefined;
  const returnTo = (params.returnTo as string) || 'create';
  const maxDuration = params.maxDuration ? parseFloat(params.maxDuration as string) : undefined;
  const currentDuration = params.currentDuration ? parseFloat(params.currentDuration as string) : 0;
  
  // Calculate available duration (remaining time that can be used for this clip)
  const availableDuration = maxDuration !== undefined ? maxDuration - currentDuration : undefined;
  
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
        let assetForStandardize: ImagePicker.ImagePickerAsset | undefined;
        
        if (assetId) {
          try {
            const mediaAsset = await MediaLibrary.getAssetInfoAsync(assetId, {
              shouldDownloadFromNetwork: true,
            });
            // Convert duration from seconds (MediaLibrary) to match ImagePicker format
            duration = mediaAsset.duration;
            // Create a minimal asset-like object for standardizeVideoPath (only needs assetId)
            assetForStandardize = { assetId } as ImagePicker.ImagePickerAsset;
          } catch (mediaError) {
            console.warn('Failed to get asset info from MediaLibrary:', mediaError);
            // Still create minimal asset object for standardizeVideoPath
            assetForStandardize = { assetId } as ImagePicker.ImagePickerAsset;
          }
        }

        // Standardize video path (handles iCloud downloads)
        const standardizedPath = await VideoProcessingService.standardizeVideoPath(videoPath, assetForStandardize);
        setVideoUri(standardizedPath);
        
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
        // Generate temporary file path
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(7);
        const fileName = `trimmed_${timestamp}_${random}.mp4`;
        
        const tempDir = new Directory(Paths.cache, `video_trim_${timestamp}`);
        await tempDir.create({ intermediates: true });
        
        const outputFile = new File(tempDir, fileName);
        let outputPath = outputFile.uri.replace(/^file:\/\//, '');
        
        // Ensure absolute path for iOS
        if (outputPath && !outputPath.startsWith('/')) {
          outputPath = '/' + outputPath;
        }

        // Normalize input path
        const inputPath = videoUri.replace(/^file:\/\//, '');
        const normalizedInput = inputPath.startsWith('/') ? inputPath : `/${inputPath}`;

        // Trim video using VideoEditingService
        finalVideoPath = await VideoEditingService.trimVideo(
          normalizedInput,
          outputPath,
          trimStart,
          trimEnd
        );
      }
      
      // Navigate back with trimmed video (or original if no trimming)
      if (returnTo === 'create') {
        // Navigate back to create screen with video as a segment
        router.push({
          pathname: '/(tabs)/create',
          params: {
            trimmedVideoPath: finalVideoPath,
            trimmedDuration: trimmedDuration.toString(),
          },
        });
      } else {
        router.back();
      }
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
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { top: insets.top }]}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={handleCancel}
          disabled={isProcessing}
        >
          <CloseFillIcon size={26} color="white" />
        </TouchableOpacity>
        
        <Text style={styles.headerTitle}>Trim Video</Text>
        
        <TouchableOpacity
          style={[styles.headerButton, !isReady && styles.headerButtonDisabled]}
          onPress={handleApply}
          disabled={isProcessing || !isReady}
        >
          {isProcessing ? (
            <Loading3FillIcon size={26} color="white" />
          ) : (
            <ArrowRightFillIcon size={26} color="white" />
          )}
        </TouchableOpacity>
      </View>

      {/* Video Trimmer UI */}
      <View style={styles.trimmerContainer}>
        <VideoTrimmerUI
          ref={trimmerRef}
          source={{ uri: videoUri }}
          onSelected={handleSelected}
          loop={true}
          containerStyle={styles.trimmerWrapper}
          sliderContainerStyle={styles.sliderContainer}
          tintColor={Colors.purple}
          minDuration={0.5}
          maxDuration={availableDuration}
        />
      </View>
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
  header: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 10,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonDisabled: {
    opacity: 0.3,
  },
  headerTitle: {
    color: Colors.white,
    fontSize: 18,
    fontFamily: 'Firma-SemiBold',
  },
  trimmerContainer: {
    flex: 1,
    marginTop: 60,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  trimmerWrapper: {
    height: 300,
    borderRadius: 15,
    overflow: 'hidden',
  },
  sliderContainer: {
    marginHorizontal: 0,
    marginTop: 20,
  },
});

export default VideoTrimmerScreen;

