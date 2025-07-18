import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { VideoInfo } from '../../services/VideoProcessingService';
import Icon from './Icon';

interface VideoInfoDisplayProps {
  videoInfo: VideoInfo;
  showCompressionStatus?: boolean;
  needsCompression?: boolean;
  recommendedLevel?: string;
  compressionStats?: {
    originalSize: string;
    compressedSize: string;
    compressionRatio: number;
    sizeReduction: string;
  };
  compressionOptions?: Array<{
    level: string;
    label: string;
    estimatedSize: string;
    quality: string;
    uploadTime: string;
  }>;
  isCompressing?: boolean;
  onCompressPress?: () => void;
  style?: any;
}

const VideoInfoDisplay: React.FC<VideoInfoDisplayProps> = ({
  videoInfo,
  showCompressionStatus = false,
  needsCompression = false,
  recommendedLevel,
  compressionStats,
  compressionOptions,
  isCompressing = false,
  onCompressPress,
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
        <Text style={styles.videoInfoTitle}>Video Details</Text>
        <View style={styles.videoInfoGrid}>
          <View style={styles.videoInfoItem}>
            <Text style={styles.videoInfoLabel}>Resolution</Text>
            <Text style={styles.videoInfoValue}>{videoInfo.resolution}</Text>
          </View>
          <View style={styles.videoInfoItem}>
            <Text style={styles.videoInfoLabel}>Quality</Text>
            <Text style={styles.videoInfoValue}>{videoInfo.qualityStandard}</Text>
          </View>
          <View style={styles.videoInfoItem}>
            <Text style={styles.videoInfoLabel}>Duration</Text>
            <Text style={styles.videoInfoValue}>{videoInfo.durationFormatted}</Text>
          </View>
          <View style={styles.videoInfoItem}>
            <Text style={styles.videoInfoLabel}>Size</Text>
            <Text style={styles.videoInfoValue}>{videoInfo.sizeFormatted}</Text>
          </View>
          <View style={styles.videoInfoItem}>
            <Text style={styles.videoInfoLabel}>Aspect Ratio</Text>
            <Text style={styles.videoInfoValue}>{videoInfo.aspectRatio}</Text>
          </View>
          <View style={styles.videoInfoItem}>
            <Text style={styles.videoInfoLabel}>Bitrate</Text>
            <Text style={styles.videoInfoValue}>{videoInfo.bitrateFormatted}</Text>
          </View>
          <View style={styles.videoInfoItem}>
            <Text style={styles.videoInfoLabel}>Frame Rate</Text>
            <Text style={styles.videoInfoValue}>{videoInfo.frameRate} fps</Text>
          </View>
          <View style={styles.videoInfoItem}>
            <Text style={styles.videoInfoLabel}>Codec</Text>
            <Text style={styles.videoInfoValue}>{videoInfo.codec.toUpperCase()}</Text>
          </View>

          {/* Compression Stats - Only show if compression has been performed */}
          {compressionStats && (
            <>
              <View style={styles.videoInfoItem}>
                <Text style={styles.videoInfoLabel}>Original Size</Text>
                <Text style={styles.videoInfoValue}>{compressionStats.originalSize}</Text>
              </View>
              <View style={styles.videoInfoItem}>
                <Text style={styles.videoInfoLabel}>Compressed Size</Text>
                <Text style={styles.videoInfoValue}>{compressionStats.compressedSize}</Text>
              </View>
              <View style={styles.videoInfoItem}>
                <Text style={styles.videoInfoLabel}>Compression Rate</Text>
                <Text style={[styles.videoInfoValue, { color: getCompressionColor(compressionStats.compressionRatio) }]}>
                  {compressionStats.compressionRatio.toFixed(1)}%
                </Text>
              </View>
              <View style={styles.videoInfoItem}>
                <Text style={styles.videoInfoLabel}>Size Reduction</Text>
                <Text style={styles.videoInfoValue}>{compressionStats.sizeReduction}</Text>
              </View>
            </>
          )}
        </View>
      </View>

      {/* Compression Status */}
      {showCompressionStatus && (
        <View style={styles.compressionStatusSection}>
          <View style={styles.videoSizeRow}>
            <Icon 
              name={!needsCompression ? "check-circle" : "alert-circle"} 
              size={20} 
              iconSet="pixelarticons" 
              color={!needsCompression ? "#4CAF50" : "#FF9800"} 
            />
            <Text style={styles.videoSizeText}>
              {needsCompression ? 'Compression needed' : ''}
            </Text>
          </View>
          {needsCompression && recommendedLevel && (
            <Text style={styles.compressionNote}>
              Recommended: {compressionOptions?.find(opt => opt.level === recommendedLevel)?.label || 'Auto compression'}
            </Text>
          )}
        </View>
      )}

      {/* Compression Options */}
      {needsCompression && compressionOptions && !compressionStats && (
        <View style={styles.compressionOptionsSection}>
          <Text style={styles.compressionOptionsTitle}>Compression Options</Text>
          {compressionOptions.map((option, index) => (
            <View key={option.level} style={styles.compressionOption}>
              <View style={styles.compressionOptionHeader}>
                <Text style={styles.compressionOptionLabel}>{option.label}</Text>
                <Text style={styles.compressionOptionQuality}>{option.quality}</Text>
              </View>
              <View style={styles.compressionOptionDetails}>
                <Text style={styles.compressionOptionSize}>{option.estimatedSize}</Text>
                <Text style={styles.compressionOptionTime}>~{option.uploadTime}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Compression Button */}
      {needsCompression && !compressionStats && onCompressPress && (
        <TouchableOpacity
          style={styles.compressButton}
          onPress={onCompressPress}
          disabled={isCompressing}
        >
          {isCompressing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Icon name="compress" size={20} iconSet="pixelarticons" color="#fff" />
          )}
          <Text style={styles.compressButtonText}>
            {isCompressing ? 'Compressing...' : 'Compress Video'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  videoSizeContainer: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  videoSizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  videoSizeText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Firma-Medium',
  },
  compressionNote: {
    color: '#FF9800',
    fontSize: 12,
    fontFamily: 'Firma-Regular',
    marginTop: 4,
    marginLeft: 28,
  },
  videoInfoSection: {
    marginBottom: 15,
  },
  videoInfoTitle: {
    color: '#fff',
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
    color: '#999',
    fontSize: 12,
    fontFamily: 'Firma-Regular',
    marginBottom: 2,
  },
  videoInfoValue: {
    color: '#fff',
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
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Firma-SemiBold',
    marginBottom: 8,
  },
  compressionOption: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
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
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Firma-Medium',
  },
  compressionOptionQuality: {
    color: '#4CAF50',
    fontSize: 12,
    fontFamily: 'Firma-Regular',
  },
  compressionOptionDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  compressionOptionSize: {
    color: '#999',
    fontSize: 12,
    fontFamily: 'Firma-Regular',
  },
  compressionOptionTime: {
    color: '#999',
    fontSize: 12,
    fontFamily: 'Firma-Regular',
  },
  compressButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5a34df',
    borderRadius: 8,
    padding: 12,
    marginTop: 10,
    gap: 8,
  },
  compressButtonText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Firma-Medium',
  },
});

export default VideoInfoDisplay; 