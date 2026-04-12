import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet, Linking, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import {
  AppTrueSheet,
  CONTENT_TO_FOOTER_GAP_REDUCTION,
  SheetActionFooter,
  useMeasuredFooterHeight,
  getFooterBottomPadding,
  SHEET_STYLES,
} from '../../../utils/components/truesheet';
import CloseButton from '../../ui/CloseButton';
import CancelButton from '../../ui/CancelButton';
import Icon from '../../ui/Icon';
import { VerticalListButton } from '../../ui/VerticalListSheet';
import { Colors } from '../../ui/UI';
import { BORDER_RADIUS, LAYOUT_INSETS } from '../../../utils/constants';
import { formatHandle } from '../../../utils/formatting/handles';
import type { ProfileViewWithOrbyt } from '../../../services/api/types';
import { LinearGradient } from '../../ui/LinearGradient';
import { hexToRGBA } from '../../../utils/formatting/colors';
import { FontFamily, Typography } from '../../../utils/components/typography';
import { useSheetPresentation } from '../../../hooks';

interface LiveStreamInfoSheetProps {
  visible: boolean;
  profile: ProfileViewWithOrbyt | null;
  onDismiss: () => void;
}

const LiveStreamInfoSheet: React.FC<LiveStreamInfoSheetProps> = ({
  visible,
  profile,
  onDismiss,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const footerBottomPadding = getFooterBottomPadding(insets.bottom);
  const [contentBottomPadding, wrapFooter] = useMeasuredFooterHeight(44 + footerBottomPadding);

  const status = profile?.status;

  useSheetPresentation(visible, 'live-stream-info-sheet');

  const handleClosePress = useCallback(() => {
    TrueSheet.dismiss('live-stream-info-sheet').catch(() => {});
  }, []);

  const handleOpenLink = useCallback(async (url: string) => {
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      }
    } catch {
      // Silently fail
    }
  }, []);

  // Extract primary domain from URL
  const getDomainFromUrl = useCallback((url: string): string => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, ''); // Remove www. prefix if present
    } catch {
      // If URL parsing fails, try to extract domain manually
      const match = url.match(/^(?:https?:\/\/)?(?:www\.)?([^/]+)/);
      return match ? match[1] : url;
    }
  }, []);

  // Extract embed information
  type ExternalEmbed = {
    $type?: string;
    external?: {
      uri?: string;
      title?: string;
      description?: string;
      thumb?: string;
    };
  };
  const embed = (status?.embed as ExternalEmbed | undefined) ?? null;
  const embedUrl = embed?.external?.uri;
  const embedTitle = embed?.external?.title;
  const displayDescription = embed?.external?.description;
  const embedThumbnail = embed?.external?.thumb;

  // Use real data from status
  const displayTitle = embedTitle;
  const displayThumbnail = embedThumbnail;
  const displayUrl = embedUrl;

  return (
    <AppTrueSheet
      name="live-stream-info-sheet"
      onDidDismiss={onDismiss}
      header={
        status && displayThumbnail ? (
          <View
            style={[
              styles.headerThumbnail,
              {
                width: screenWidth,
                aspectRatio: 16 / 9,
              },
            ]}
          >
            <Image source={{ uri: displayThumbnail }} style={styles.thumbnail} contentFit="cover" />
            <View style={styles.thumbnailOverlay} />
            <View style={styles.liveBadge}>
              <Text style={styles.liveBadgeText}>{t('profile.live')}</Text>
            </View>
            <LinearGradient
              colors={[Colors.transparent, hexToRGBA(Colors.black, 0.8)]}
              locations={[0.4, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFillObject}
              pointerEvents="none"
            />
          </View>
        ) : (
          <View style={styles.headerFallback}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {profile?.handle
                ? t('profile.handleIsLive', { handle: formatHandle(profile.handle) })
                : t('profile.live')}
            </Text>
            <CloseButton onPress={handleClosePress} />
          </View>
        )
      }
      footer={wrapFooter(
        <SheetActionFooter bottomPadding={footerBottomPadding}>
          <CancelButton onPress={handleClosePress} text={t('common.close')} />
        </SheetActionFooter>
      )}
    >
      <View
        style={[
          styles.content,
          {
            paddingBottom: Math.max(0, contentBottomPadding - CONTENT_TO_FOOTER_GAP_REDUCTION),
          },
        ]}
      >
        {status ? (
          <View style={styles.contentBlock}>
            {/* Title - primary */}
            {displayTitle && <Text style={styles.titleText}>{displayTitle}</Text>}

            {/* Description - secondary */}
            {displayDescription && <Text style={styles.descriptionText}>{displayDescription}</Text>}

            {/* Watch CTA - primary action */}
            {displayUrl && (
              <VerticalListButton
                label={t('profile.watchOn', { domain: getDomainFromUrl(displayUrl) })}
                onPress={() => handleOpenLink(displayUrl)}
                rightIcon={<Icon name="arrow_right_up" size={24} color={Colors.neutral[200]} />}
              />
            )}
          </View>
        ) : (
          <View style={styles.errorContainer}>
            <Icon name="tv_2" size={48} color={Colors.neutral[600]} />
            <Text style={styles.errorText}>{t('profile.couldNotLoadLiveStream')}</Text>
          </View>
        )}
      </View>
    </AppTrueSheet>
  );
};

const styles = StyleSheet.create({
  content: {
    ...SHEET_STYLES.contentContainer,
    paddingTop: 24,
  },
  contentBlock: {
    gap: 0,
  },
  headerThumbnail: {
    position: 'relative',
    overflow: 'hidden',
    marginHorizontal: -LAYOUT_INSETS.SHEET_FOOTER,
    alignSelf: 'center',
  },
  headerFallback: {
    ...SHEET_STYLES.headerContainer,
  },
  headerTitle: {
    ...SHEET_STYLES.headerTitle,
  },
  titleText: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.h3,
    lineHeight: Typography.lineHeights.h3,
    fontFamily: FontFamily.bold,
    marginBottom: 12,
  },
  descriptionText: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.body,
    lineHeight: Typography.lineHeights.body,
    textAlign: 'left',
    fontFamily: FontFamily.regular,
    marginBottom: 16,
  },
  thumbnail: {
    ...StyleSheet.absoluteFillObject,
  },
  thumbnailOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: hexToRGBA(Colors.black, 0.12),
  },
  liveBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: Colors.coral[500],
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BORDER_RADIUS.SMALL,
    minWidth: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveBadgeText: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.bodySmall,
    lineHeight: Typography.lineHeights.bodySmall,
    fontFamily: FontFamily.black,
    letterSpacing: 0.7,
  },
  errorContainer: {
    padding: 40,
    alignItems: 'center',
    gap: 16,
  },
  errorText: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.body,
    lineHeight: Typography.lineHeights.body,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
  },
});

export default LiveStreamInfoSheet;
