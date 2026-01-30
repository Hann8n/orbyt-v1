import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, parseISO, isValid, isToday, isTomorrow } from 'date-fns';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import {
  safeDismiss,
  safePresent,
  sheetStyles,
  defaultSheetProps,
  FOOTER_HEIGHT,
} from '../../../utils/components/truesheet';
import CloseButton from '../../ui/CloseButton';
import CancelButton from '../../ui/CancelButton';
import { VerticalListButton } from '../../ui/VerticalListSheet';
import Icon from '../../ui/Icon';
import { Colors } from '../../ui/UI';
import { BORDER_RADIUS } from '../../../utils/constants';
import { formatHandle } from '../../../utils/formatting/handles';
import type { ProfileViewWithOrbyt } from '../../../services/api/types';
import { BlurView } from '../../ui/BlurView';
import { hexToRGBA } from '../../../utils/formatting/colors';

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
  const bottomSheetRef = useRef<TrueSheet>(null);
  const insets = useSafeAreaInsets();
  const sheetDetents: ('auto' | number)[] = useMemo(() => ['auto'], []);

  const status = profile?.status;

  // Handle bottom sheet visibility
  useEffect(() => {
    if (visible) {
      safePresent('live-stream-info-sheet');
    } else {
      safeDismiss('live-stream-info-sheet');
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
        return `ends at ${timeStr}`;
      }

      // If tomorrow, show "tomorrow at [time]"
      if (isTomorrow(date)) {
        return `ends tomorrow at ${timeStr}`;
      }

      // Otherwise, show date and time
      return `ends ${format(date, 'MMM d')} at ${format(date, 'h:mm a')}`;
    } catch {
      // Ignore parsing errors
    }
    return null;
  }, [displayExpiration]);

  return (
    <TrueSheet
      ref={bottomSheetRef}
      name="live-stream-info-sheet"
      detents={sheetDetents}
      {...defaultSheetProps}
      onDidDismiss={onDismiss}
      header={
        <View style={sheetStyles.headerContainer}>
          <View style={sheetStyles.headerLeft}>
            <Text style={sheetStyles.headerTitle} numberOfLines={1}>
              {profile?.handle ? `${formatHandle(profile.handle)} is LIVE` : 'LIVE'}
            </Text>
          </View>
          <CloseButton onPress={onDismiss} />
        </View>
      }
      footer={
        <View style={[sheetStyles.footerContainer, { paddingBottom: insets.bottom }]}>
          <View style={sheetStyles.cancelContainer}>
            <CancelButton onPress={onDismiss} text="Close" />
          </View>
        </View>
      }
    >
      <View style={[sheetStyles.content, { paddingBottom: FOOTER_HEIGHT.standard }]}>
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
                  <Text style={styles.liveBadgeText}>LIVE</Text>
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
                label={`watch on ${getDomainFromUrl(displayUrl)}`}
                onPress={() => handleOpenLink(displayUrl)}
                rightIcon={<Icon name="external-link" size={24} color={Colors.black} />}
                style={{ backgroundColor: Colors.white }}
                textStyle={{ color: Colors.black }}
              />
            )}
          </>
        ) : (
          <View style={sheetStyles.errorContainer}>
            <Text style={sheetStyles.errorText}>Could not load live stream information</Text>
          </View>
        )}
      </View>
    </TrueSheet>
  );
};

const styles = StyleSheet.create({
  titleText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'Figtree-Bold',
    marginBottom: 8,
    paddingHorizontal: 15,
  },
  descriptionText: {
    color: Colors.lightGray,
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'left',
    fontFamily: 'Figtree-Regular',
    marginBottom: 20,
    paddingHorizontal: 15,
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
    color: Colors.white,
    fontSize: 13,
    fontFamily: 'Figtree-Medium',
  },
  liveBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: Colors.liveRed,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    minWidth: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveBadgeText: {
    color: Colors.white,
    fontSize: 15,
    fontFamily: 'Figtree-Black',
    fontWeight: '900',
    letterSpacing: 0.7,
  },
});

export default LiveStreamInfoSheet;
