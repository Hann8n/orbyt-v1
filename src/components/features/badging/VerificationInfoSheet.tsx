// filepath: /Users/jack/orbyt/components/VerificationInfoSheet.tsx
import React, { useRef, useEffect } from 'react';
import { BORDER_RADIUS } from '../../../utils/constants';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, parseISO, isValid } from 'date-fns';
import { useProfile, useProfileByDid } from '../../../services/data/ProfileService';
import { Colors } from '../../../theme';
import { useRouter } from 'expo-router';
import CloseButton from '../../ui/CloseButton';
import CancelButton from '../../ui/CancelButton';
import KeyboardAwareFooter from '../../../utils/components/truesheet/KeyboardAwareFooter';
import type { TrueSheet } from '@lodev09/react-native-true-sheet';
import {
  AppTrueSheet,
  CONTENT_TO_FOOTER_GAP_REDUCTION,
  DEFAULT_HEADER_STYLE,
  useMeasuredFooterHeight,
  FOOTER_BOTTOM_PADDING_MIN,
} from '../../../utils/components/truesheet';
import VerificationBadge from './VerificationBadge';

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
  const bottomSheetRef = useRef<TrueSheet>(null);
  const navigation = useRouter();
  const insets = useSafeAreaInsets();
  const footerBottomPadding = Math.max(insets.bottom, FOOTER_BOTTOM_PADDING_MIN);
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

  return (
    <AppTrueSheet
      ref={bottomSheetRef}
      name="verification-info-sheet"
      onDidDismiss={onDismiss}
      footer={wrapFooter(
        <View style={{ backgroundColor: Colors.black, paddingBottom: footerBottomPadding }}>
          <KeyboardAwareFooter
            hideOnKeyboard={true}
            bottomPadding={0}
            style={{ backgroundColor: Colors.black }}
          >
            <View style={[styles.cancelContainer, { backgroundColor: Colors.black }]}>
              <CancelButton onPress={onDismiss} text="Close" />
            </View>
          </KeyboardAwareFooter>
        </View>
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
        {/* Header with title, badge and close button */}
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
              {isTrustedVerifier ? 'Trusted Verifier' : 'Verified'}
            </Text>
          </View>
          <CloseButton onPress={onDismiss} />
        </View>

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
            <Text style={styles.errorText}>Could not load verification information</Text>
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
            <Text>
              {' '}
              is a trusted verifier on the atmosphere. Trusted verifiers can verify other accounts
              on the network.
            </Text>
          </Text>
        </View>

        {/* Verification Date */}
        {verification?.verifications?.[0]?.createdAt &&
          (() => {
            const date = parseISO(verification.verifications[0].createdAt);
            return isValid(date) ? (
              <View style={styles.statusDateContainer}>
                <Text style={styles.statusText}>Since {format(date, 'MMM d, yyyy')}</Text>
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
          <Text style={styles.infoText}>
            A verification badge indicates this is an authentic account representing the person or
            organization it claims to be.
          </Text>
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
              <Text style={styles.verifiedByLabel}>verified by:</Text>
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
    paddingHorizontal: 12,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    ...DEFAULT_HEADER_STYLE,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerTitle: {
    color: Colors.neutral[50],
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'left',
    fontFamily: 'Figtree-Bold',
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
    paddingHorizontal: 20,
  },
  infoText: {
    color: Colors.neutral[200],
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'left',
    fontFamily: 'Figtree-Regular',
  },
  verifiedByLabel: {
    color: Colors.neutral[500],
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Figtree-SemiBold',
    marginBottom: 8,
    marginTop: 8,
    paddingHorizontal: 20,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  verifierItem: {
    marginHorizontal: 12,
    marginBottom: 12,
  },
  issuerListItem: {
    marginVertical: 4,
  },
  issuerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
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
    fontSize: 14,
    fontFamily: 'Figtree-Regular',
    textAlign: 'center',
  },
  errorContainer: {
    padding: 30,
    alignItems: 'center',
  },
  errorText: {
    color: Colors.neutral[200],
    fontSize: 16,
    fontFamily: 'Figtree-Regular',
    marginBottom: 20,
    textAlign: 'center',
  },
  cancelContainer: {
    alignItems: 'center',
  },
});

export default VerificationInfoSheet;
