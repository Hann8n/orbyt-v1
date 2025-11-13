import React from 'react';
import { BORDER_RADIUS } from '../../utils/constants';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { VideoInfo } from '../../services/VideoProcessingService';
import Icon from './Icon';
import { Colors } from './UI';

interface VideoInfoDisplayProps {
  videoInfo: VideoInfo;
  style?: any;
}

const VideoInfoDisplay: React.FC<VideoInfoDisplayProps> = ({
  videoInfo,
  style
}) => {
  const getCompressionColor = (ratio: number) => {
    if (ratio <= 30) return '#4CAF50'; // Green for excellent compression
    if (ratio <= 50) return '#8BC34A'; // Light green for good compression
    if (ratio <= 70) return '#FFC107'; // Yellow for moderate compression
    return '#FF9800'; // Orange for minimal compression
  };

  return (
    <View style={[styles.videoSizeContainer, style]}>
      {/* Original Video Info */}
      <View style={styles.videoInfoSection}>
        <Text style={styles.videoInfoTitle}>video details</Text>
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
    padding: 15,
    paddingBottom: 5, // reduce bottom padding
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  videoSizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  videoSizeText: {
    color: Colors.white,
    fontSize: 14,
    fontFamily: 'Firma-Medium',
  },
  compressionNote: {
    color: Colors.lightYellow,
    fontSize: 12,
    fontFamily: 'Firma-Regular',
    marginTop: 4,
    marginLeft: 28,
  },
  videoInfoSection: {
    marginBottom: 4, // reduce space beneath video info
  },
  videoInfoTitle: {
    color: Colors.white,
    fontSize: 16,
    fontFamily: 'Firma-SemiBold',
    marginBottom: 10,
  },
  videoInfoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  videoInfoItem: {
    width: '48%',
    marginBottom: 8,
  },
  videoInfoLabel: {
    color: Colors.lightGray,
    fontSize: 12,
    fontFamily: 'Firma-Medium',
    marginBottom: 2,
  },
  videoInfoValue: {
    color: Colors.white,
    fontSize: 14,
    fontFamily: 'Firma-Medium',
  },
  compressionStatusSection: {
    marginBottom: 15,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  compressionOptionsSection: {
    marginTop: 10,
  },
  compressionOptionsTitle: {
    color: Colors.white,
    fontSize: 14,
    fontFamily: 'Firma-SemiBold',
    marginBottom: 8,
  },
  compressionOption: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: BORDER_RADIUS.SMALL,
    padding: 12,
    marginBottom: 8,
  },
  compressionOptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  compressionOptionLabel: {
    color: Colors.white,
    fontSize: 14,
    fontFamily: 'Firma-Medium',
  },
  compressionOptionQuality: {
    color: Colors.lightGreen,
    fontSize: 12,
    fontFamily: 'Firma-Regular',
  },
  compressionOptionDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  compressionOptionSize: {
    color: Colors.lightGray,
    fontSize: 12,
    fontFamily: 'Firma-Regular',
  },
  compressionOptionTime: {
    color: Colors.lightGray,
    fontSize: 12,
    fontFamily: 'Firma-Regular',
  },
  compressButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.lightBlue,
    borderRadius: BORDER_RADIUS.SMALL,
    padding: 12,
    marginTop: 10,
    gap: 8,
  },
  compressButtonText: {
    color: Colors.white,
    fontSize: 14,
    fontFamily: 'Firma-Medium',
  },
});

export default VideoInfoDisplay; 