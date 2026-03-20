import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, parseISO, isValid, isToday, isTomorrow } from 'date-fns';
import type { TrueSheet } from '@lodev09/react-native-true-sheet';
import {
  AppTrueSheet,
  CONTENT_TO_FOOTER_GAP_REDUCTION,
  DEFAULT_CONTENT_PADDING_HORIZONTAL,
  SheetActionFooter,
  useMeasuredFooterHeight,
  getFooterBottomPadding,
  SHEET_STYLES,
} from '../../../utils/components/truesheet';
import CloseButton from '../../ui/CloseButton';
import CancelButton from '../../ui/CancelButton';
import { VerticalListButton } from '../../ui/VerticalListSheet';
import Icon from '../../ui/Icon';
import { Colors } from '../../../theme';
import { BORDER_RADIUS } from '../../../utils/constants';
import { formatHandle } from '../../../utils/formatting/handles';
import type { ProfileViewWithOrbyt } from '../../../services/api/types';
import { BlurView } from '../../ui/BlurView';
import { hexToRGBA } from '../../../utils/formatting/colors';
import { FontFamily, Typography } from '../../../utils/components/typography';

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
  const bottomSheetRef = useRef<TrueSheet>(null);
  const insets = useSafeAreaInsets();
  const footerBottomPadding = getFooterBottomPadding(insets.bottom);
  const [contentBottomPadding, wrapFooter] = useMeasuredFooterHeight(44 + footerBottomPadding);

  const status = profile?.status;

  // Handle bottom sheet visibility via instance ref (TrueSheet v3+)
  useEffect(() => {
    const sheet = bottomSheetRef.current;
    if (!sheet) return;
    if (visible) {
      sheet.present().catch(() => {});
    } else {
      sheet.dismiss().catch(() => {});
    }
  }, [visible]);

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
  const displayExpiration = status?.expiresAt;

  // Format expiration time as "ends at [time]" (with date if different day)
  const expirationText = useMemo(() => {
    const expiresAt = displayExpiration;
    if (!expiresAt) return null;
    try {
      const date = parseISO(expiresAt);
      if (!isValid(date)) return null;

      const timeStr = format(date, 'h:mm a');

      // If same day, just show time
      if (isToday(date)) {
        return t('profile.endsAt', { time: timeStr });
      }

      // If tomorrow, show "tomorrow at [time]"
      if (isTomorrow(date)) {
        return t('profile.endsTomorrowAt', { time: timeStr });
      }

      // Otherwise, show date and time
      return t('profile.endsDateAt', {
        date: format(date, 'MMM d'),
        time: format(date, 'h:mm a'),
      });
    } catch {
      // Ignore parsing errors
    }
    return null;
  }, [displayExpiration, t]);

  return (
    <AppTrueSheet
      ref={bottomSheetRef}
      name="live-stream-info-sheet"
      onDidDismiss={onDismiss}
      header={
        <View style={styles.headerContainer}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {profile?.handle
                ? t('profile.handleIsLive', { handle: formatHandle(profile.handle) })
                : t('profile.live')}
            </Text>
          </View>
          <CloseButton onPress={onDismiss} />
        </View>
      }
      footer={wrapFooter(
        <SheetActionFooter bottomPadding={footerBottomPadding} backgroundColor={Colors.black}>
          <CancelButton onPress={onDismiss} text={t('common.close')} />
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
          <>
            {/* Thumbnail */}
            {displayThumbnail && (
              <View style={styles.thumbnailContainer}>
                <Image
                  source={{ uri: displayThumbnail }}
                  style={styles.thumbnail}
                  contentFit="cover"
                />
                <View style={styles.thumbnailOverlay} />
                <View style={styles.liveBadge}>
                  <Text style={styles.liveBadgeText}>{t('profile.live')}</Text>
                </View>
                {expirationText && (
                  <View style={styles.chipsContainer}>
                    <BlurView intensity={80} tint="dark" style={styles.chip}>
                      <Text style={styles.chipText}>{expirationText}</Text>
                    </BlurView>
                  </View>
                )}
              </View>
            )}

            {/* Stream Title/Description */}
            {displayTitle && <Text style={styles.titleText}>{displayTitle}</Text>}
            {displayDescription && <Text style={styles.descriptionText}>{displayDescription}</Text>}

            {/* Link to Stream */}
            {displayUrl && (
              <VerticalListButton
                label={t('profile.watchOn', { domain: getDomainFromUrl(displayUrl) })}
                onPress={() => handleOpenLink(displayUrl)}
                rightIcon={<Icon name="external-link" size={24} color={Colors.black} />}
                style={styles.watchButton}
                textStyle={styles.watchButtonText}
              />
            )}
          </>
        ) : (
          <View style={styles.errorContainer}>
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
  },
  headerContainer: {
    ...SHEET_STYLES.headerContainer,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerTitle: {
    ...SHEET_STYLES.headerTitle,
  },
  titleText: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.title,
    lineHeight: Typography.lineHeights.title,
    fontFamily: FontFamily.bold,
    marginBottom: 8,
    paddingHorizontal: DEFAULT_CONTENT_PADDING_HORIZONTAL,
  },
  descriptionText: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.body,
    lineHeight: Typography.lineHeights.body,
    textAlign: 'left',
    fontFamily: FontFamily.regular,
    marginBottom: 20,
    paddingHorizontal: DEFAULT_CONTENT_PADDING_HORIZONTAL,
  },
  thumbnailContainer: {
    marginBottom: 20,
    marginHorizontal: 3,
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: 200,
    borderRadius: BORDER_RADIUS.MEDIUM,
  },
  thumbnailOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: hexToRGBA(Colors.black, 0.3),
    borderRadius: BORDER_RADIUS.MEDIUM,
  },
  chipsContainer: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BORDER_RADIUS.SMALL,
    overflow: 'hidden',
  },
  chipText: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.caption,
    lineHeight: Typography.lineHeights.caption,
    fontFamily: FontFamily.medium,
  },
  liveBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: Colors.coral[500],
    paddingHorizontal: 7,
    paddingVertical: 3,
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
    padding: 30,
    alignItems: 'center',
  },
  errorText: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.body,
    lineHeight: Typography.lineHeights.body,
    fontFamily: FontFamily.regular,
    marginBottom: 20,
    textAlign: 'center',
  },
  watchButton: {
    backgroundColor: Colors.neutral[50],
  },
  watchButtonText: {
    color: Colors.black,
  },
});

export default LiveStreamInfoSheet;
