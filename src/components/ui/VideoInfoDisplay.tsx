import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { VideoInfo } from '../../services/video/VideoProcessingService';
import { Colors } from './UI';

interface VideoInfoDisplayProps {
  videoInfo: VideoInfo;
  style?: StyleProp<ViewStyle>;
}

const QUALITY_STANDARD_KEYS: Record<string, string> = {
  '480p': 'video.quality480p',
  '720p': 'video.quality720p',
  '1080p': 'video.quality1080p',
  '1440p': 'video.quality1440p',
  '4K': 'video.quality4K',
  custom: 'video.qualityCustom',
};

const VideoInfoDisplay: React.FC<VideoInfoDisplayProps> = ({ videoInfo, style }) => {
  const { t } = useTranslation();
  const qualityLabel =
    QUALITY_STANDARD_KEYS[videoInfo.qualityStandard] != null
      ? t(QUALITY_STANDARD_KEYS[videoInfo.qualityStandard])
      : videoInfo.qualityStandard;
  return (
    <View style={[styles.videoSizeContainer, style]}>
      {/* Original Video Info */}
      <View style={styles.videoInfoSection}>
        <View style={styles.videoInfoGrid}>
          <View style={styles.videoInfoItem}>
            <Text style={styles.videoInfoLabel}>{t('video.resolution')}</Text>
            <Text style={styles.videoInfoValue}>{videoInfo.resolution}</Text>
          </View>
          <View style={styles.videoInfoItem}>
            <Text style={styles.videoInfoLabel}>{t('video.quality')}</Text>
            <Text style={styles.videoInfoValue}>{qualityLabel}</Text>
          </View>
          <View style={styles.videoInfoItem}>
            <Text style={styles.videoInfoLabel}>{t('video.duration')}</Text>
            <Text style={styles.videoInfoValue}>{videoInfo.durationFormatted}</Text>
          </View>
          <View style={styles.videoInfoItem}>
            <Text style={styles.videoInfoLabel}>{t('video.size')}</Text>
            <Text style={styles.videoInfoValue}>{videoInfo.sizeFormatted}</Text>
          </View>
          <View style={styles.videoInfoItem}>
            <Text style={styles.videoInfoLabel}>{t('video.aspectRatio')}</Text>
            <Text style={styles.videoInfoValue}>{videoInfo.aspectRatio}</Text>
          </View>
          <View style={styles.videoInfoItem}>
            <Text style={styles.videoInfoLabel}>{t('video.codec')}</Text>
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
