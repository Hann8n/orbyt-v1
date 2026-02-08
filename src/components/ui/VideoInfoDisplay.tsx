import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { VideoInfo } from '../../services/video/VideoProcessingService';
import { Colors } from './UI';

interface VideoInfoDisplayProps {
  videoInfo: VideoInfo;
  style?: StyleProp<ViewStyle>;
}

const VideoInfoDisplay: React.FC<VideoInfoDisplayProps> = ({ videoInfo, style }) => {
  return (
    <View style={[styles.videoSizeContainer, style]}>
      {/* Original Video Info */}
      <View style={styles.videoInfoSection}>
        <View style={styles.videoInfoGrid}>
          <View style={styles.videoInfoItem}>
            <Text style={styles.videoInfoLabel}>resolution</Text>
            <Text style={styles.videoInfoValue}>{videoInfo.resolution}</Text>
          </View>
          <View style={styles.videoInfoItem}>
            <Text style={styles.videoInfoLabel}>quality</Text>
            <Text style={styles.videoInfoValue}>{videoInfo.qualityStandard}</Text>
          </View>
          <View style={styles.videoInfoItem}>
            <Text style={styles.videoInfoLabel}>duration</Text>
            <Text style={styles.videoInfoValue}>{videoInfo.durationFormatted}</Text>
          </View>
          <View style={styles.videoInfoItem}>
            <Text style={styles.videoInfoLabel}>size</Text>
            <Text style={styles.videoInfoValue}>{videoInfo.sizeFormatted}</Text>
          </View>
          <View style={styles.videoInfoItem}>
            <Text style={styles.videoInfoLabel}>aspect ratio</Text>
            <Text style={styles.videoInfoValue}>{videoInfo.aspectRatio}</Text>
          </View>
          <View style={styles.videoInfoItem}>
            <Text style={styles.videoInfoLabel}>codec</Text>
            <Text style={styles.videoInfoValue}>{videoInfo.codec}</Text>
          </View>

          {/* Compression Stats - Only show if compression has been performed */}
          {/* The compression status, options, and button are removed */}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  videoSizeContainer: {
    padding: 0,
    paddingBottom: 0,
  },
  videoInfoSection: {
    marginBottom: 0,
  },
  videoInfoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  videoInfoItem: {
    width: '48%',
    marginBottom: 16,
  },
  videoInfoLabel: {
    color: Colors.neutral[200],
    fontSize: 13,
    fontFamily: 'Figtree-Regular',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  videoInfoValue: {
    color: Colors.neutral[50],
    fontSize: 16,
    fontFamily: 'Figtree-SemiBold',
  },
});

export default VideoInfoDisplay;
