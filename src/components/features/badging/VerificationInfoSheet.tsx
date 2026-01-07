// filepath: /Users/jack/Orbyt/components/VerificationInfoSheet.tsx
import React, { useRef, useEffect, useMemo } from 'react';
import { BORDER_RADIUS } from '../../../utils/constants';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, parseISO, isValid } from 'date-fns';
import { useProfile, useProfileByDid } from '../../../services/data/ProfileService';
import { Colors } from '../../ui/UI';
import { useRouter } from 'expo-router';
import { Loading3FillIcon } from '../../ui/Icon';
import CloseButton from '../../ui/CloseButton';
import CancelButton from '../../ui/CancelButton';
import KeyboardAwareFooter from '../../../utils/components/truesheet/KeyboardAwareFooter';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { safeDismiss, safePresent } from '../../../utils/components/truesheet/utils';
import VerificationBadge from './VerificationBadge';

// Import AuthorItem directly - preload to avoid size calculation issues
import AuthorItem from '../../ui/AuthorItem';

interface VerificationInfoSheetProps {
  visible: boolean;
  handle: string;
  onDismiss: () => void;
}

// Define type for verification data to better handle the structure
interface VerificationData {
  verifications?: Array<{ issuer: string; uri: string; isValid: boolean; createdAt: string }>;
  status?: string;
  verifiedBy?: string;
  verifierHandle?: string;
  verifiedAt?: string;
  trustedVerifierStatus?: string;
  isOfficial?: boolean;
  isVerified?: boolean;
}

// Loading placeholder component for verified by profile
const VerifiedByShimmer = () => (
  <View style={styles.issuerListItem}>
    <View style={styles.issuerContent}>
      <View style={[styles.issuerAvatarShimmer, { backgroundColor: Colors.mediumGray }]} />
      <View style={styles.issuerTextContainer}>
        <View style={styles.issuerNameRow}>
          <View style={[styles.issuerNameShimmer, { backgroundColor: Colors.mediumGray }]} />
        </View>
        <View style={[styles.issuerHandleShimmer, { backgroundColor: Colors.mediumGray }]} />
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
  const sheetDetents: ('auto' | number)[] = useMemo(() => ['auto'], []);
  const insets = useSafeAreaInsets();

  // Calculate footer height as constant: cancelContainer paddingTop (20) + button minHeight (44)
  const footerHeight = 20 + 44;

  // Get profile info - use cached data if available
  // Verification data is included in profile response, so we only need one query
  // Use React Query hook for profile data
  const { data: profile, isLoading: isProfileLoading } = useProfile(handle);

  // Use verification data from profile - no separate query needed
  const verification = profile?.verification as VerificationData | null | undefined;
  const isLoading = isProfileLoading;

  // Get the verifier DID from the valid verification's issuer
  const validVerification = verification?.verifications?.find(v => v.isValid);
  const verifierDid = validVerification?.issuer || verification?.verifiedBy;

  // Fetch issuer profile using React Query hook
  // Preload this data even when sheet is not visible to avoid size calculation issues
  const { data: issuerProfile, isLoading: isIssuerLoading } = useProfileByDid(verifierDid);

  // Determine verification status using cache fields
  const isTrustedVerifier =
    verification?.trustedVerifierStatus === 'valid' ||
    verification?.trustedVerifierStatus === 'active';

  // Handle bottom sheet visibility
  useEffect(() => {
    if (visible) {
      safePresent('verification-info-sheet');
    } else {
      safeDismiss('verification-info-sheet');
    }
  }, [visible]);

  return (
    <TrueSheet
      ref={bottomSheetRef}
      name="verification-info-sheet"
      detents={sheetDetents}
      backgroundColor={Colors.black}
      onDidDismiss={onDismiss}
      grabber={false}
      footer={
        <View style={{ backgroundColor: Colors.black, paddingBottom: insets.bottom }}>
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
      }
    >
      <View style={[styles.content, { paddingBottom: footerHeight }]}>
        {/* Header with title, badge and close button */}
        <View style={styles.headerContainer}>
          <View style={styles.headerLeft}>
            <VerificationBadge
              handle={handle}
              textSize={20}
              badgeType="auto"
              textColor={Colors.white}
              customMargin={0}
              verification={verification || undefined}
            />
            <Text style={[styles.headerTitle, { marginLeft: 4 }]} numberOfLines={1}>
              {isTrustedVerifier ? 'Trusted Verifier' : 'Verified'}
            </Text>
          </View>
          <CloseButton onPress={onDismiss} />
        </View>

        {isLoading ? (
          <Loading3FillIcon size={24} color={Colors.lightGray} style={styles.loadingIndicator} />
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
    </TrueSheet>
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
    // Get verifier handle from profile or verification data
    const actualIssuerHandle = issuerProfile?.handle || verification?.verifierHandle;

    // Determine official status
    const isOfficialVerification = verification?.isOfficial || false;

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
            (isOfficialVerification
              ? 'bluesky'
              : verifierDid
                ? `verifier (${verifierDid.slice(0, 8)}...)`
                : 'verifier');

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
                  displayName={authorDisplayName}
                  avatar={issuerProfile?.avatar}
                  size="large"
                  showArrow={true}
                  onPress={() => {
                    const target = authorHandle.trim();
                    if (!target) return;

                    // Navigate to the verifier's profile, not the current profile
                    navigation.push(`/profile/${target}`);

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
    paddingTop: 8,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerTitle: {
    color: Colors.white,
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'left',
    fontFamily: 'Firma-Bold',
  },
  loadingIndicator: {
    marginVertical: 40,
    alignSelf: 'center',
  },
  infoContainer: {
    marginBottom: 20,
    paddingHorizontal: 15,
  },
  infoText: {
    color: Colors.lightGray,
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'left',
    fontFamily: 'Firma-Regular',
  },
  highlightedText: {
    color: Colors.white,
    fontFamily: 'Firma-Medium',
  },
  verifiedByLabel: {
    color: Colors.gray,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
    marginBottom: 8,
    marginTop: 8,
    paddingHorizontal: 15,
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
    borderColor: 'transparent',
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
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    textAlign: 'center',
  },
  errorContainer: {
    padding: 30,
    alignItems: 'center',
  },
  errorText: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Firma-Regular',
    marginBottom: 20,
    textAlign: 'center',
  },
  cancelContainer: {
    alignItems: 'center',
    paddingTop: 20,
  },
});

export default VerificationInfoSheet;
