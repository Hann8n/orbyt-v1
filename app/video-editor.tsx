import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Video from 'react-native-video';
import { VideoFile } from 'react-native-vision-camera';
import * as ImagePicker from 'expo-image-picker';
import Icon, { BackArrowIcon } from '../src/components/ui/Icon';
import { Colors } from '../src/components/ui/UI';
import { BORDER_RADIUS } from '../src/utils/constants';
import VideoEditingService, { VideoSegment } from '../src/services/VideoEditingService';
import VideoProcessingService from '../src/services/VideoProcessingService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const THUMBNAIL_SIZE = 80;

interface EditableSegment extends VideoSegment {
  thumbnailUri?: string;
}

const VideoEditorScreen: React.FC = () => {
  const params = useLocalSearchParams();
  const navigation = useRouter();
  
  // Parse segments from params
  const segmentsParam = params.segments as string;
  const initialSegments: EditableSegment[] = segmentsParam
    ? JSON.parse(segmentsParam)
    : [];

  const [segments, setSegments] = useState<EditableSegment[]>(initialSegments);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewVideoPath, setPreviewVideoPath] = useState<string | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);

  const handleBackPress = () => {
    Alert.alert(
      'Discard Changes?',
      'Are you sure you want to go back? Your edits will be lost.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.back() },
      ]
    );
  };

  const handleDeleteSegment = (segmentId: string) => {
    Alert.alert(
      'Delete Segment',
      'Are you sure you want to delete this clip?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setSegments(prev => prev.filter(seg => seg.id !== segmentId));
          },
        },
      ]
    );
  };

  const handleTrimSegment = (segmentId: string) => {
    // Find the segment
    const segment = segments.find(seg => seg.id === segmentId);
    if (!segment) return;

    // For now, show an informative message about trim functionality
    Alert.alert(
      'Trim Clip',
      'Trim functionality is coming in a future update! You can currently:\n\n• Reorder clips by long pressing and dragging\n• Delete unwanted clips\n• Preview the final video\n\nFor now, consider re-recording shorter clips or editing the video after posting.',
      [{ text: 'Got it' }]
    );
  };

  const handlePreview = async () => {
    if (segments.length === 0) {
      Alert.alert('No Clips', 'Please add some video clips to preview.');
      return;
    }

    try {
      setIsGeneratingPreview(true);

      // Merge segments for preview
      const mergedVideo = await VideoProcessingService.mergeSegments(
        segments.map(seg => ({
          startTime: seg.startTime,
          duration: seg.duration,
          video: seg.video,
          sourceType: seg.sourceType,
        }))
      );

      setPreviewVideoPath(mergedVideo.path);
    } catch (error) {
      Alert.alert('Preview Error', 'Failed to generate preview. Please try again.');
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  const handleDone = async () => {
    if (segments.length === 0) {
      Alert.alert('No Clips', 'Please add some video clips before continuing.');
      return;
    }

    try {
      setIsProcessing(true);

      // Merge all segments
      const mergedVideo = await VideoProcessingService.mergeSegments(
        segments.map(seg => ({
          startTime: seg.startTime,
          duration: seg.duration,
          video: seg.video,
          sourceType: seg.sourceType,
        }))
      );

      // Navigate to post screen with the merged video
      navigation.push({
        pathname: '/post/[id]',
        params: {
          id: 'new',
          videoPath: mergedVideo.path,
        },
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to process videos. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const getVideoPath = (video: VideoFile | ImagePicker.ImagePickerAsset): string => {
    return 'uri' in video ? video.uri : video.path;
  };

  const renderSegmentItem = ({ item, drag, isActive }: RenderItemParams<EditableSegment>) => {
    const videoPath = getVideoPath(item.video);
    const segmentNumber = segments.findIndex(seg => seg.id === item.id) + 1;

    return (
      <ScaleDecorator>
        <TouchableOpacity
          onLongPress={drag}
          disabled={isActive || isProcessing}
          activeOpacity={0.8}
          style={[
            styles.segmentItem,
            isActive && styles.segmentItemActive,
          ]}
        >
          <View style={styles.segmentContent}>
            {/* Drag Handle */}
            <View style={styles.dragHandle}>
              <Icon name="menu" size={24} color={Colors.lightGray} />
            </View>

            {/* Video Thumbnail */}
            <View style={styles.thumbnailContainer}>
              <Video
                source={{ uri: videoPath }}
                style={styles.thumbnail}
                paused
                resizeMode="cover"
              />
              <View style={styles.segmentNumber}>
                <Text style={styles.segmentNumberText}>{segmentNumber}</Text>
              </View>
            </View>

            {/* Segment Info */}
            <View style={styles.segmentInfo}>
              <Text style={styles.segmentDuration}>
                {formatDuration(item.duration)}
              </Text>
              <Text style={styles.segmentType}>
                {item.sourceType === 'gallery' ? 'From Gallery' : 'Recorded'}
              </Text>
            </View>

            {/* Action Buttons */}
            <View style={styles.segmentActions}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleTrimSegment(item.id)}
                disabled={isProcessing}
              >
                <Icon name="cut" size={20} color={Colors.white} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleDeleteSegment(item.id)}
                disabled={isProcessing}
              >
                <Icon name="trash" size={20} color={Colors.red} />
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </ScaleDecorator>
    );
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const totalDuration = segments.reduce((sum, seg) => sum + seg.duration, 0);

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
            <BackArrowIcon size={28} color={Colors.white} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Edit Video</Text>
            <Text style={styles.headerSubtitle}>
              {segments.length} {segments.length === 1 ? 'clip' : 'clips'} • {formatDuration(totalDuration)}
            </Text>
          </View>
          <View style={styles.headerRight} />
        </View>

        {/* Preview Video (if available) */}
        {previewVideoPath && (
          <View style={styles.previewContainer}>
            <Video
              source={{ uri: previewVideoPath }}
              style={styles.previewVideo}
              controls
              resizeMode="contain"
            />
            <TouchableOpacity
              style={styles.closePreviewButton}
              onPress={() => setPreviewVideoPath(null)}
            >
              <Icon name="close" size={24} color={Colors.white} />
            </TouchableOpacity>
          </View>
        )}

        {/* Segments List */}
        {segments.length > 0 ? (
          <View style={styles.listContainer}>
            <View style={styles.instructionContainer}>
              <Icon name="information" size={20} color={Colors.lightGray} />
              <Text style={styles.instructionText}>
                Long press and drag to reorder clips
              </Text>
            </View>
            <DraggableFlatList
              data={segments}
              renderItem={renderSegmentItem}
              keyExtractor={(item) => item.id}
              onDragEnd={({ data }) => setSegments(data)}
              containerStyle={styles.flatList}
            />
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Icon name="videocam" size={64} color={Colors.darkGray} />
            <Text style={styles.emptyStateText}>No video clips</Text>
            <Text style={styles.emptyStateSubtext}>
              Go back to capture or select videos
            </Text>
          </View>
        )}

        {/* Bottom Actions */}
        <View style={styles.bottomActions}>
          <TouchableOpacity
            style={[styles.actionButtonLarge, styles.previewButton]}
            onPress={handlePreview}
            disabled={isProcessing || isGeneratingPreview || segments.length === 0}
          >
            {isGeneratingPreview ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <>
                <Icon name="play" size={20} color={Colors.white} />
                <Text style={styles.actionButtonText}>Preview</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButtonLarge, styles.doneButton]}
            onPress={handleDone}
            disabled={isProcessing || segments.length === 0}
          >
            {isProcessing ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <>
                <Icon name="checkmark" size={20} color={Colors.white} />
                <Text style={styles.actionButtonText}>Continue to Post</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.darkGray,
  },
  backButton: {
    padding: 8,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    color: Colors.white,
    fontSize: 18,
    fontFamily: 'Firma-SemiBold',
  },
  headerSubtitle: {
    color: Colors.lightGray,
    fontSize: 12,
    fontFamily: 'Firma-Regular',
    marginTop: 2,
  },
  headerRight: {
    width: 44,
  },
  previewContainer: {
    width: '100%',
    aspectRatio: 9 / 16,
    backgroundColor: Colors.black,
    position: 'relative',
  },
  previewVideo: {
    width: '100%',
    height: '100%',
  },
  closePreviewButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContainer: {
    flex: 1,
    paddingTop: 16,
  },
  instructionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginBottom: 16,
    backgroundColor: Colors.darkGray,
    marginHorizontal: 16,
    borderRadius: BORDER_RADIUS.SMALL,
    gap: 8,
  },
  instructionText: {
    color: Colors.lightGray,
    fontSize: 13,
    fontFamily: 'Firma-Regular',
  },
  flatList: {
    paddingHorizontal: 16,
  },
  segmentItem: {
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.MEDIUM,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  segmentItemActive: {
    opacity: 0.9,
    elevation: 8,
    shadowColor: Colors.purple,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    borderColor: Colors.purple,
    transform: [{ scale: 1.02 }],
  },
  segmentContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  dragHandle: {
    marginRight: 12,
  },
  thumbnailContainer: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: BORDER_RADIUS.SMALL,
    overflow: 'hidden',
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  segmentNumber: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentNumberText: {
    color: Colors.white,
    fontSize: 12,
    fontFamily: 'Firma-SemiBold',
  },
  segmentInfo: {
    flex: 1,
    marginLeft: 12,
  },
  segmentDuration: {
    color: Colors.white,
    fontSize: 16,
    fontFamily: 'Firma-SemiBold',
    marginBottom: 4,
  },
  segmentType: {
    color: Colors.lightGray,
    fontSize: 12,
    fontFamily: 'Firma-Regular',
  },
  segmentActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyStateText: {
    color: Colors.white,
    fontSize: 20,
    fontFamily: 'Firma-SemiBold',
    marginTop: 16,
  },
  emptyStateSubtext: {
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    marginTop: 8,
    textAlign: 'center',
  },
  bottomActions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.darkGray,
  },
  actionButtonLarge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: BORDER_RADIUS.LARGE,
    gap: 8,
  },
  previewButton: {
    backgroundColor: Colors.mediumGray,
  },
  doneButton: {
    backgroundColor: Colors.purple,
    shadowColor: Colors.purple,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  actionButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontFamily: 'Firma-SemiBold',
  },
});

export default VideoEditorScreen;
