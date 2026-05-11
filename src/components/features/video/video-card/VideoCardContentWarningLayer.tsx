import { memo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { SquircleNativePressable } from '@/components/ui/Squircle';
import { BlurView } from 'expo-blur';
import { BORDER_RADIUS } from '../../../../utils/constants';
import { Colors } from '../../../../theme';
import { FontFamily, Typography } from '../../../../utils/components/typography';

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
            {Platform.OS === 'ios' && isLiquidGlassAvailable() ? (
              <GlassView
                style={styles.glassBackground}
                glassEffectStyle="clear"
                tintColor={Colors.neutral[50]}
                isInteractive
              />
            ) : null}
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
    zIndex: 20,
  },
  contentWarningOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 21,
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
  glassBackground: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BORDER_RADIUS.FULL,
  },
  buttonContent: {
    position: 'relative',
    zIndex: 1,
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
