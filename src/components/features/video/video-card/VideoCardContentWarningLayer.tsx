import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { SquircleNativePressable } from '@/components/ui/Squircle';
import { Colors } from '../../../../theme';
import { FontFamily, Typography } from '../../../../utils/components/typography';
import { BORDER_RADIUS } from '../../../../utils/constants';
import { OVERLAY_Z_INDEX } from '../../../../utils/constants/overlay';

export interface VideoCardContentWarningLayerProps {
  cannotShowMedia: boolean;
  isBlurred: boolean;
  warningDescription: string;
  onViewContent: () => void;
}

/**
 * Moderation / sensitive-content full-bleed layer (above video, below nothing).
 */
const VideoCardContentWarningLayer = memo(function VideoCardContentWarningLayer({
  cannotShowMedia,
  isBlurred,
  warningDescription,
  onViewContent,
}: VideoCardContentWarningLayerProps) {
  const { t } = useTranslation();

  return (
    <>
      <BlurView intensity={100} tint="dark" style={styles.contentWarningBlur} />
      <View style={styles.contentWarningOverlay}>
        <View style={styles.blurMessage}>
          <Text style={styles.blurTitle}>
            {cannotShowMedia ? t('video.contentBlocked') : t('video.sensitiveContent')}
          </Text>
          <Text style={styles.blurText}>
            {cannotShowMedia ? t('video.contentHiddenBySafety') : warningDescription}
          </Text>
        </View>
        {isBlurred && (
          <SquircleNativePressable onPress={onViewContent} style={styles.viewButton}>
            <View style={styles.buttonContent} pointerEvents="none">
              <Text style={styles.viewButtonText}>{t('video.seeVideo')}</Text>
            </View>
          </SquircleNativePressable>
        )}
      </View>
    </>
  );
});

const styles = StyleSheet.create({
  contentWarningBlur: {
    ...StyleSheet.absoluteFillObject,
    zIndex: OVERLAY_Z_INDEX.CONTENT_WARNING,
  },
  contentWarningOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: OVERLAY_Z_INDEX.CONTENT_WARNING_MESSAGE,
    paddingBottom: 60,
  },
  blurMessage: {
    width: '90%',
    maxWidth: 400,
    padding: 24,
    alignItems: 'center',
  },
  blurTitle: {
    fontSize: Typography.sizes.h3,
    fontFamily: FontFamily.bold,
    color: Colors.neutral[50],
    marginBottom: 12,
    textAlign: 'center',
  },
  blurText: {
    fontSize: Typography.sizes.body,
    fontFamily: FontFamily.regular,
    color: Colors.neutral[200],
    textAlign: 'center',
    lineHeight: Typography.lineHeights.body,
  },
  viewButton: {
    position: 'absolute',
    bottom: 80,
    backgroundColor: Colors.neutral[50],
    borderRadius: BORDER_RADIUS.FULL,
    overflow: 'hidden',
    minWidth: 120,
  },
  buttonContent: {
    position: 'relative',
    zIndex: OVERLAY_Z_INDEX.MEDIA_BASE,
    paddingVertical: 12,
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewButtonText: {
    color: Colors.black,
    fontSize: Typography.sizes.body,
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
  },
});

export default VideoCardContentWarningLayer;
