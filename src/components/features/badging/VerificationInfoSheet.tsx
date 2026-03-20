// filepath: /Users/jack/orbyt/components/VerificationInfoSheet.tsx
import React, { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BORDER_RADIUS } from '../../../utils/constants';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, parseISO, isValid } from 'date-fns';
import { useProfile, useProfileByDid } from '../../../services/data/ProfileService';
import { Colors } from '../../../theme';
import { useRouter } from 'expo-router';
import CloseButton from '../../ui/CloseButton';
import CancelButton from '../../ui/CancelButton';
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
import VerificationBadge from './VerificationBadge';
import { FontFamily, Typography } from '../../../utils/components/typography';

// Import AuthorItem directly - preload to avoid size calculation issues
import AuthorItem from '../../ui/AuthorItem';

interface VerificationInfoSheetProps {
  visible: boolean;
  handle: string;
  onDismiss: () => void;
}

// Define type for verification data to match VerificationState from @atproto/api
// This matches the actual VerificationState structure from ProfileView
interface VerificationData {
  $type?: 'app.bsky.actor.defs#verificationState';
  verifications?: Array<{ issuer: string; uri: string; isValid: boolean; createdAt?: string }>;
  verifiedStatus?: 'valid' | 'invalid' | 'none' | string;
  trustedVerifierStatus?: 'valid' | 'invalid' | 'none' | string;
}

// Loading placeholder component for verified by profile
const VerifiedByShimmer = () => (
  <View style={styles.issuerListItem}>
    <View style={styles.issuerContent}>
      <View style={[styles.issuerAvatarShimmer, { backgroundColor: Colors.neutral[600] }]} />
      <View style={styles.issuerTextContainer}>
        <View style={styles.issuerNameRow}>
          <View style={[styles.issuerNameShimmer, { backgroundColor: Colors.neutral[600] }]} />
        </View>
        <View style={[styles.issuerHandleShimmer, { backgroundColor: Colors.neutral[600] }]} />
      </View>
    </View>
  </View>
);

const VerificationInfoSheet: React.FC<VerificationInfoSheetProps> = ({
  visible,
  handle,
  onDismiss,
}) => {
  const { t } = useTranslation();
  const bottomSheetRef = useRef<TrueSheet>(null);
  const navigation = useRouter();
  const insets = useSafeAreaInsets();
  const footerBottomPadding = getFooterBottomPadding(insets.bottom);
  const [contentBottomPadding, wrapFooter] = useMeasuredFooterHeight(44 + footerBottomPadding);

  // Get profile info - use cached data if available
  // Verification data is included in profile response, so we only need one query
  // Use React Query hook for profile data
  const { data: profile, isLoading: isProfileLoading } = useProfile(handle);

  // Use verification data from profile - no separate query needed
  const verification = profile?.verification as VerificationData | null | undefined;
  const isLoading = isProfileLoading;

  // Get the verifier DID from the valid verification's issuer
  const validVerification = verification?.verifications?.find(v => v.isValid);
  const verifierDid = validVerification?.issuer;

  // Fetch issuer profile using React Query hook
  // Preload this data even when sheet is not visible to avoid size calculation issues
  const { data: issuerProfile, isLoading: isIssuerLoading } = useProfileByDid(verifierDid);

  // Determine verification status using cache fields
  // trustedVerifierStatus is 'valid' | 'invalid' | 'none' per API
  const isTrustedVerifier = verification?.trustedVerifierStatus === 'valid';

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

  const headerComponent = (
    <View style={styles.headerContainer}>
      <View style={styles.headerLeft}>
        <VerificationBadge
          handle={handle}
          size={24}
          badgeType="auto"
          textColor={Colors.neutral[50]}
          customMargin={0}
          verification={verification || undefined}
        />
        <Text style={[styles.headerTitle, styles.headerTitleMargin]} numberOfLines={1}>
          {isTrustedVerifier ? t('profile.trustedVerifier') : t('profile.verified')}
        </Text>
      </View>
      <CloseButton onPress={onDismiss} />
    </View>
  );

  return (
    <AppTrueSheet
      ref={bottomSheetRef}
      name="verification-info-sheet"
      onDidDismiss={onDismiss}
      header={headerComponent}
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
        {isLoading ? (
          <ActivityIndicator
            size="small"
            color={Colors.neutral[200]}
            style={styles.loadingIndicator}
          />
        ) : verification ? (
          isTrustedVerifier ? (
            renderTrustedVerifierContent()
          ) : (
            renderVerifiedAccountContent()
          )
        ) : (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{t('profile.couldNotLoadVerification')}</Text>
          </View>
        )}
      </View>
    </AppTrueSheet>
  );

  // Render trusted verifier badge info
  function renderTrustedVerifierContent() {
    return (
      <>
        {/* Info Container */}
        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>
            <Text>{profile?.displayName || handle}</Text>
            <Text> {t('profile.trustedVerifierDescription')}</Text>
          </Text>
        </View>

        {/* Verification Date */}
        {verification?.verifications?.[0]?.createdAt &&
          (() => {
            const date = parseISO(verification.verifications[0].createdAt);
            return isValid(date) ? (
              <View style={styles.statusDateContainer}>
                <Text style={styles.statusText}>
                  {t('profile.sinceDate', { date: format(date, 'MMM d, yyyy') })}
                </Text>
              </View>
            ) : null;
          })()}
      </>
    );
  }

  // Render verified account info
  function renderVerifiedAccountContent() {
    // Get verification details from the first valid verification in the array
    // Get verifier handle from issuer profile
    const actualIssuerHandle = issuerProfile?.handle;

    return (
      <>
        {/* Info Container */}
        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>{t('profile.verificationBadgeDescription')}</Text>
        </View>

        {/* Verified By: Issuer Profile Card */}
        {/* Only show if we have valid data - if loading fails, just don't show this section */}
        {(() => {
          // Determine if we should show the author item
          const hasValidData = !isIssuerLoading && (issuerProfile || actualIssuerHandle);
          const shouldShow = hasValidData || (isIssuerLoading && verifierDid); // Show shimmer only while loading with valid verifierDid

          if (!shouldShow) {
            return null; // Don't show anything if we don't have data and loading failed
          }

          const authorHandle = issuerProfile?.handle || actualIssuerHandle || verifierDid || '';
          const authorDisplayName =
            issuerProfile?.displayName ||
            actualIssuerHandle ||
            (verifierDid ? `verifier (${verifierDid.slice(0, 8)}...)` : 'verifier');

          // Only render if we have a valid handle
          if (!authorHandle && !isIssuerLoading) {
            return null;
          }

          return (
            <>
              <Text style={styles.verifiedByLabel}>{t('profile.verifiedBy')}</Text>
              {isIssuerLoading ? (
                <VerifiedByShimmer />
              ) : (
                <AuthorItem
                  handle={authorHandle}
                  did={issuerProfile?.did || verifierDid}
                  displayName={authorDisplayName}
                  avatar={issuerProfile?.avatar}
                  size="large"
                  showArrow={true}
                  onPress={() => {
                    const targetDid = (issuerProfile?.did || verifierDid)?.trim();
                    if (!targetDid) return;

                    // Navigate to the verifier's profile, not the current profile
                    navigation.navigate({
                      pathname: '/profile/[did]',
                      params: { did: targetDid },
                    });

                    // Dismiss the sheet after navigation starts
                    setTimeout(() => {
                      onDismiss();
                    }, 100);
                  }}
                  style={styles.verifierItem}
                />
              )}
            </>
          );
        })()}
      </>
    );
  }
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
  headerTitleMargin: {
    marginLeft: 4,
  },
  loadingIndicator: {
    marginVertical: 40,
    alignSelf: 'center',
  },
  infoContainer: {
    marginBottom: 20,
    paddingHorizontal: DEFAULT_CONTENT_PADDING_HORIZONTAL,
  },
  infoText: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.body,
    lineHeight: Typography.lineHeights.body,
    textAlign: 'left',
    fontFamily: FontFamily.regular,
  },
  verifiedByLabel: {
    color: Colors.neutral[500],
    fontSize: Typography.sizes.bodySmall,
    fontFamily: FontFamily.semibold,
    marginBottom: 8,
    marginTop: 8,
    paddingHorizontal: DEFAULT_CONTENT_PADDING_HORIZONTAL,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  verifierItem: {
    marginHorizontal: DEFAULT_CONTENT_PADDING_HORIZONTAL,
    marginBottom: DEFAULT_CONTENT_PADDING_HORIZONTAL,
  },
  issuerListItem: {
    marginVertical: 4,
  },
  issuerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: DEFAULT_CONTENT_PADDING_HORIZONTAL,
    paddingHorizontal: DEFAULT_CONTENT_PADDING_HORIZONTAL,
  },
  issuerTextContainer: {
    flex: 1,
    justifyContent: 'center',
    marginLeft: 12,
  },
  issuerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  issuerAvatarShimmer: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.LARGE,
    borderWidth: 0,
    borderColor: Colors.transparent,
  },
  issuerNameShimmer: {
    width: 120,
    height: 14,
    borderRadius: BORDER_RADIUS.SMALL,
    marginRight: 8,
  },
  issuerHandleShimmer: {
    width: 80,
    height: 12,
    borderRadius: BORDER_RADIUS.SMALL,
  },
  statusDateContainer: {
    marginBottom: 20,
    alignItems: 'center',
  },
  statusText: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.bodySmall,
    lineHeight: Typography.lineHeights.bodySmall,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
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
});

export default VerificationInfoSheet;
