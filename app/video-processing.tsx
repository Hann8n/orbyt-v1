import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Loading3FillIcon } from '../src/components/ui/Icon';
import { Colors } from '../src/components/ui/UI';
import VideoProcessingService, { VideoSegment as ProcessingVideoSegment } from '../src/services/VideoProcessingService';
import { debugVideoPath } from '../src/utils/videoPath';
import { Alert } from 'react-native';

interface VideoSegment {
  startTime: number;
  duration: number;
  video: { uri: string } | any;
  sourceType?: 'camera' | 'gallery';
}

const VideoProcessingScreen: React.FC = () => {
  const params = useLocalSearchParams();
  const navigation = useRouter();
  const [status, setStatus] = useState('Preparing video...');
  const processingRef = useRef(false);

  useEffect(() => {
    const processVideo = async () => {
      if (processingRef.current) return;
      processingRef.current = true;

      try {
        // Parse segments from params
        const segmentsParam = params.segments as string;
        if (!segmentsParam) {
          throw new Error('No video segments provided');
        }

        const segments: VideoSegment[] = JSON.parse(segmentsParam);
        
        if (segments.length === 0) {
          throw new Error('No segments to process');
        }

        // This screen only handles merging (multiple segments)
        // Single videos should be handled directly in create.tsx
        if (segments.length === 1) {
          // Single segment shouldn't reach here - pass through without processing
          const segment = segments[0];
          const videoPath = segment.video.uri || segment.video.path;
          
          navigation.replace({
            pathname: '/post/[id]',
            params: { 
              id: 'new',
              videoPath: videoPath
            }
          });
          return;
        }

        setStatus('Merging videos...');
        
        // Debug: Log each segment's video path
        segments.forEach((segment, index) => {
          debugVideoPath(`video-processing segment ${index}`, segment.video?.uri || segment.video?.path);
        });
        
        // Convert to ProcessingVideoSegment format
        const processingSegments: ProcessingVideoSegment[] = segments.map(segment => ({
          startTime: segment.startTime,
          duration: segment.duration,
          video: segment.video,
          sourceType: segment.sourceType,
        }));

        // Use the VideoProcessingService to merge segments
        // mergeSegments returns a standardized path (with file:// prefix)
        const mergedVideo = await VideoProcessingService.mergeSegments(processingSegments);
        
        console.log('[video-processing] Merged video path:', mergedVideo.path);
        debugVideoPath('video-processing -> VideoPostScreen', mergedVideo.path);
        
        setStatus('Finalizing...');
        
        // Small delay to show completion
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Navigate to post screen with standardized path
        navigation.replace({
          pathname: '/post/[id]',
          params: { 
            id: 'new',
            videoPath: mergedVideo.path
          }
        });
      } catch (error: any) {
        console.error('Video processing error:', error);
        Alert.alert(
          'Processing Failed',
          error.message || 'Failed to process video. Please try again.',
          [
            {
              text: 'Go Back',
              onPress: () => navigation.back(),
            }
          ]
        );
      }
    };

    processVideo();
  }, [params, navigation]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.content}>
        <Loading3FillIcon size={64} color={Colors.white} />
        <Text style={styles.statusText}>{status}</Text>
        <Text style={styles.subtitleText}>This may take a moment</Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  statusText: {
    color: Colors.white,
    fontSize: 18,
    fontFamily: 'Firma-SemiBold',
    marginTop: 24,
    textAlign: 'center',
  },
  subtitleText: {
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    marginTop: 8,
    textAlign: 'center',
  },
});

export default VideoProcessingScreen;

