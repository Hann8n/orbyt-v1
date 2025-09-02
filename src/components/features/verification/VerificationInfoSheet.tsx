// filepath: /Users/jack/Orbyt/components/VerificationInfoSheet.tsx
import React, { useRef, useEffect } from 'react';
import { BORDER_RADIUS } from '../../../utils/constants';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import ProfileCache from '../../../services/cache/ProfileCache';
import { Colors } from '../../ui/UI';
import AtprotoService from '../../../services/api/AtprotoService';
import { useRouter } from 'expo-router';
import { Avatar } from '../../ui/UI';
import Icon from '../../ui/Icon';
import ShimmerPlaceholder from 'react-native-shimmer-placeholder';
import { LinearGradient } from 'expo-linear-gradient';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import VerificationBadge from './VerificationBadge';
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

// Shimmer component for verified by profile
const VerifiedByShimmer = () => (
  <View style={styles.issuerListItem}>
    <View style={styles.issuerContent}>
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={styles.issuerAvatarShimmer}
        shimmerColors={Colors.SHIMMER.PRIMARY}
      />
      <View style={styles.issuerTextContainer}>
        <View style={styles.issuerNameRow}>
          <ShimmerPlaceholder
            LinearGradient={LinearGradient}
            style={styles.issuerNameShimmer}
            shimmerColors={Colors.SHIMMER.PRIMARY}
          />
        </View>
        <ShimmerPlaceholder
          LinearGradient={LinearGradient}
          style={styles.issuerHandleShimmer}
          shimmerColors={Colors.SHIMMER.PRIMARY}
        />
      </View>
    </View>
  </View>
);

const VerificationInfoSheet: React.FC<VerificationInfoSheetProps> = ({
  visible,
  handle,
  onDismiss
}) => {
  const bottomSheetRef = useRef<TrueSheet>(null);
  const navigation = useRouter();
  const snapPoints = React.useMemo(() => ['auto'] as any, []);
  const insets = useSafeAreaInsets();

  // Get profile info - use cached data if available
  const { data: profile } = useQuery({
    queryKey: ['profile', handle],
    queryFn: async () => {
      try {
        // First try to get from cache synchronously
        const cachedProfile = ProfileCache.getProfileFromCacheSync(handle);
        if (cachedProfile) {
          return cachedProfile;
        }
        
        // If not in cache, fetch it
        const result = await ProfileCache.getProfile(handle);
        return result || null;
      } catch (error) {
        console.error('Error fetching profile:', error);
        return null;
      }
    },
    enabled: visible && !!handle,
    staleTime: 60000, // 1 minute
    refetchOnWindowFocus: false
  });

  // Get verification details with proper typing
  const { data: verification, isLoading } = useQuery<VerificationData | null, Error>({
    queryKey: ['verification-details', handle],
    queryFn: async () => {
      try {
        const result = await ProfileCache.getVerificationDetails(handle);
        return result || null;
      } catch (error) {
        console.error('Error fetching verification details:', error);
        return null;
      }
    },
    enabled: visible && !!handle,
    staleTime: 60000, // 1 minute
    refetchOnWindowFocus: false
  });

  // Get the verifier DID from the valid verification's issuer
  const validVerification = verification?.verifications?.find(v => v.isValid);
  const verifierDid = validVerification?.issuer || verification?.verifiedBy;
  
  // Fetch issuer profile using cached data if available
  const { data: issuerProfile, isLoading: isIssuerLoading } = useQuery({
    queryKey: ['issuer-profile', verifierDid],
    queryFn: async () => {
      try {
        // Try to get profile by DID using cached data first
        if (verifierDid) {
          // Try to get from cache first
          const cachedProfile = ProfileCache.getProfileFromCacheSync(verifierDid);
          if (cachedProfile) {
            return cachedProfile;
          }
          // If not in cache, fetch it
          const profile = await AtprotoService.getVerifierProfile(verifierDid);
          if (profile) return profile;
        }
        return null;
      } catch (error) {
        console.error('Error fetching issuer profile:', error);
        return null;
      }
    },
    enabled: visible && !!verifierDid,
    staleTime: 60000,
    refetchOnWindowFocus: false
  });

  // Determine verification status using cache fields
  const isTrustedVerifier = verification?.trustedVerifierStatus === 'valid' || verification?.trustedVerifierStatus === 'active';
  const isVerified =
    verification?.status === 'valid' ||
    verification?.isVerified ||
    (verification?.verifications && verification.verifications.length > 0 && verification.verifications.some(v => v.isValid));

  // Handle bottom sheet visibility
  useEffect(() => {
    if (visible) {
      bottomSheetRef.current?.present();
    } else {
      bottomSheetRef.current?.dismiss();
    }
  }, [visible]);

  // Backdrop component - TrueSheet handles backdrop automatically
  const renderBackdrop = React.useCallback(() => null, []);

  return (
    <TrueSheet
      ref={bottomSheetRef}
      sizes={snapPoints as any}
      backgroundColor={Colors.black}
      onDismiss={onDismiss}
      cornerRadius={20}
      grabber={false}
      FooterComponent={
        <View style={[styles.cancelContainer, { paddingBottom: insets.bottom }]}>
          <TouchableOpacity 
            style={styles.cancelButton} 
            onPress={onDismiss}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <View style={styles.content}>
        {/* Header with title, badge and close button */}
        <View style={styles.headerContainer}>
          <View style={styles.headerLeft}>
            <VerificationBadge
              handle={handle}
              textSize={20}
              badgeType="auto"
              textColor={Colors.white}
              customMargin={0}
            />
            <Text style={[styles.headerTitle, { marginLeft: 4 }]} numberOfLines={1}>
              {isTrustedVerifier ? 'Trusted Verifier' : 'Verified'}
            </Text>
          </View>
          <TouchableOpacity 
            style={styles.closeButton} 
            onPress={onDismiss}
            activeOpacity={0.7}
          >
            <Icon name="close" size={20} color={Colors.white} />
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <ActivityIndicator size="small" color={Colors.lightGray} style={styles.loadingIndicator} />
        ) : verification ? (
          isTrustedVerifier ? renderTrustedVerifierContent() : renderVerifiedAccountContent()
        ) : (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>
              Could not load verification information
            </Text>
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
            <Text> is a trusted verifier on Bluesky. Trusted verifiers can verify other accounts on the network.</Text>
          </Text>
        </View>
          
        {/* Verification Date */}
        {verification?.verifications?.[0]?.createdAt && (
          <View style={styles.statusDateContainer}>
            <Text style={styles.statusText}>
              Since {new Date(verification.verifications[0].createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </Text>
          </View>
        )}
      </>
    );
  }

  // Render verified account info
  function renderVerifiedAccountContent() {
    // Get verification details from the first valid verification in the array
    const verificationInfo = validVerification || verification?.verifications?.[0];
    
    // Determine issuer information
    const issuerDid = verifierDid;
    const issuerCreatedAt = verificationInfo?.createdAt || verification?.verifiedAt;
    
    // Get verifier handle from profile or verification data
    const actualIssuerHandle = issuerProfile?.handle || verification?.verifierHandle;
    
    // Determine official status
    const isOfficialVerification = verification?.isOfficial || false;
    
    return (
      <>
        {/* Info Container */}
        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>
            A verification badge indicates this is an authentic account representing the person or organization it claims to be.
          </Text>
        </View>

        {/* Verified By: Issuer Profile Card */}
        {(actualIssuerHandle || issuerProfile || verifierDid) && (
          <>
            <Text style={styles.verifiedByLabel}>verified by:</Text>
            {isIssuerLoading ? (
              <VerifiedByShimmer />
            ) : (
              <AuthorItem
                handle={issuerProfile?.handle || actualIssuerHandle || verifierDid}
                displayName={
                  issuerProfile?.displayName || 
                  actualIssuerHandle || 
                  (isOfficialVerification ? 'bluesky' : 
                   (verifierDid ? `verifier (${verifierDid.slice(0, 8)}...)` : 'verifier'))
                }
                avatar={issuerProfile?.avatar}
                textColor={Colors.white}
                size="large"
                showDate={true}
                date={issuerCreatedAt ? new Date(issuerCreatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : undefined}
                nameFontWeight="Firma-Bold"
                handleFontWeight="Firma-Bold"
                style={styles.issuerListItem}
                onPress={() => {
                  const target = (issuerProfile?.handle || actualIssuerHandle || verifierDid || '').trim();
                  if (!target) return;
                  
                  // Navigate immediately without dismissing first
                  navigation.push(`/profile/${profile.handle}`);
                  
                  // Dismiss the sheet after navigation starts
                  setTimeout(() => {
                    onDismiss();
                  }, 100);
                }}
              />
            )}
          </>
        )}


      </>
    );
  }
};

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 4,
    paddingTop: 4,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 15,
    paddingTop: 15,
    paddingBottom: 15,
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
  closeButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingIndicator: {
    marginVertical: 40,
    alignSelf: 'center',
  },
  infoContainer: {
    marginBottom: 30,
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
    fontFamily: 'Firma-Medium',
    marginBottom: 8,
    marginTop: 8,
    paddingHorizontal: 15,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
  cancelButton: {
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.FULL,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: Colors.lightGray,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: 'Firma-SemiBold',
  },
});

export default VerificationInfoSheet;
