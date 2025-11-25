import React, { useEffect, useState } from 'react';
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

  useEffect(() => {
    const processVideo = async () => {
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
          // Fallback: normalize single video if it somehow reaches here
          setStatus('Normalizing video...');
          const normalizedVideo = await VideoProcessingService.normalizeVideo(segments[0].video);
          
          navigation.replace({
            pathname: '/post/[id]',
            params: { 
              id: 'new',
              videoPath: normalizedVideo.path
            }
          });
          return;
        }

        setStatus('Merging videos...');
        
        // Convert to ProcessingVideoSegment format
        const processingSegments: ProcessingVideoSegment[] = segments.map(segment => ({
          startTime: segment.startTime,
          duration: segment.duration,
          video: segment.video,
          sourceType: segment.sourceType,
        }));

        // Use the VideoProcessingService to merge segments
        const mergedVideo = await VideoProcessingService.mergeSegments(processingSegments);
        
        setStatus('Finalizing...');
        
        const videoPath = mergedVideo.path.startsWith('file://') 
          ? mergedVideo.path 
          : `file://${mergedVideo.path}`;
        
        // Small delay to show completion
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Navigate to post screen
        navigation.replace({
          pathname: '/post/[id]',
          params: { 
            id: 'new',
            videoPath: videoPath
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

