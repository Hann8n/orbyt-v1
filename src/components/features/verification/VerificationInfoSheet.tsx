// filepath: /Users/jack/Orbyt/components/VerificationInfoSheet.tsx
import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  Platform,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import ProfileCache from '../../../services/cache/ProfileCache';
import { BRAND, TEXT, UI } from '../../../utils/formatting/Colors';
import AtprotoService from '../../../services/api/AtprotoService';
import { useNavigation } from '@react-navigation/native';
import { Avatar } from '../../ui/UI';
import Icon from '../../ui/Icon';
import ShimmerPlaceholder from 'react-native-shimmer-placeholder';
import { LinearGradient } from 'expo-linear-gradient';
import { BottomSheetModal, BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import VerificationBadge from './VerificationBadge';
import AuthorItem from '../../ui/AuthorItem';
import { navigateToUserProfile } from '../../../navigation/profileNavigation';

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

const SCREEN_HEIGHT = 500; // This constant is no longer needed for the custom Animated.View
const DISMISS_THRESHOLD = 150; // pixels to drag down before dismissing

// Shimmer component for verified by profile
const VerifiedByShimmer = () => (
  <View style={styles.issuerListItem}>
    <View style={styles.issuerContent}>
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={styles.issuerAvatarShimmer}
        shimmerColors={UI.SHIMMER}
      />
      <View style={styles.issuerTextContainer}>
        <View style={styles.issuerNameRow}>
          <ShimmerPlaceholder
            LinearGradient={LinearGradient}
            style={styles.issuerNameShimmer}
            shimmerColors={UI.SHIMMER}
          />
        </View>
        <ShimmerPlaceholder
          LinearGradient={LinearGradient}
          style={styles.issuerHandleShimmer}
          shimmerColors={UI.SHIMMER}
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
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const navigation = useNavigation<any>();
  const snapPoints = React.useMemo(() => ['70%'], []);

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

  // Backdrop component
  const renderBackdrop = React.useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
      />
    ),
    []
  );

  // Don't render anything if not visible (let BottomSheetModal handle it)
  // But we must always render the modal for controlled presentation

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      index={0}
      snapPoints={snapPoints}
      backdropComponent={renderBackdrop}
      onDismiss={onDismiss}
      backgroundStyle={styles.bottomSheetBackground}
      handleIndicatorStyle={styles.handleIndicator}
    >
      <BottomSheetView style={styles.content}>
          {isLoading ? (
            <ActivityIndicator size="small" color={BRAND.PRIMARY} style={styles.loadingIndicator} />
          ) : verification ? (
            isTrustedVerifier ? renderTrustedVerifierContent() : renderVerifiedAccountContent()
          ) : (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>
                Could not load verification information
              </Text>
              <TouchableOpacity 
                style={styles.closeButton} 
                onPress={onDismiss}
                activeOpacity={0.7}
              >
                <Text style={styles.closeButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          )}
      </BottomSheetView>
    </BottomSheetModal>
  );

  // Render trusted verifier badge info
  function renderTrustedVerifierContent() {
    return (
      <>
        {/* Verification Badge and Status */}
        <View style={styles.verificationHeader}>
          <VerificationBadge
            handle={handle}
            textSize={32}
            badgeType="auto"
            textColor="#FFFFFF"
          />
          <Text style={styles.verificationTitle}>
            Trusted Verifier
          </Text>
        </View>

        {/* Info Container */}
        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>
            <Text style={styles.highlightedText}>{profile?.displayName || handle}</Text>
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

        {/* Close Button */}
        <TouchableOpacity 
          style={styles.closeButton} 
          onPress={onDismiss}
          activeOpacity={0.7}
        >
          <Text style={styles.closeButtonText}>Close</Text>
        </TouchableOpacity>
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
        {/* Verification Badge and Status */}
        <View style={styles.verificationHeader}>
          <VerificationBadge
            handle={handle}
            textSize={28}
            badgeType="auto"
            textColor="#FFFFFF"
          />
          <Text style={styles.verificationTitle}>
            Verified Account
          </Text>
        </View>

        {/* Simplified Info Container */}
        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>
            A verification badge indicates this is an authentic account representing the person or organization it claims to be.
          </Text>
        </View>

        {/* Verified By: Issuer Profile Card */}
        {(actualIssuerHandle || issuerProfile || verifierDid) && (
          <>
            <Text style={styles.verifiedByLabel}>Verified by:</Text>
            {isIssuerLoading ? (
              <VerifiedByShimmer />
            ) : (
              <AuthorItem
                handle={issuerProfile?.handle || actualIssuerHandle || verifierDid}
                displayName={
                  issuerProfile?.displayName || 
                  actualIssuerHandle || 
                  (isOfficialVerification ? 'Bluesky' : 
                   (verifierDid ? `Verifier (${verifierDid.slice(0, 8)}...)` : 'Verifier'))
                }
                avatar={issuerProfile?.avatar}
                textColor="#FFFFFF"
                size="medium"
                showDate={true}
                date={issuerCreatedAt ? new Date(issuerCreatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : undefined}
                style={styles.issuerListItem}
                onPress={() => {
                  onDismiss();
                  // Slightly delay navigation to allow for smooth dismissal animation
                  setTimeout(() => {
                    navigateToUserProfile(navigation, { handle: issuerProfile?.handle || actualIssuerHandle || verifierDid });
                  }, 300);
                }}
              />
            )}
          </>
        )}

        {/* Close Button */}
        <TouchableOpacity 
          style={styles.closeButton} 
          onPress={onDismiss}
          activeOpacity={0.7}
        >
          <Text style={styles.closeButtonText}>Close</Text>
        </TouchableOpacity>
      </>
    );
  }
};

const styles = StyleSheet.create({
  bottomSheetBackground: {
    backgroundColor: '#000',
    borderTopWidth: 0.5,
    borderTopColor: '#333',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  handleIndicator: {
    backgroundColor: '#666',
    width: 40,
    height: 5,
  },
  content: {
    paddingHorizontal: 25,
    paddingBottom: Platform.OS === 'ios' ? 20 : 30,
  },
  loadingIndicator: {
    marginVertical: 40,
    alignSelf: 'center',
  },
  verificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
    marginBottom: 5,
  },
  verificationTitle: {
    color: '#fff',
    fontSize: 20,
    fontFamily: 'Firma-Bold',
    marginLeft: 6,
  },

  infoContainer: {
    marginTop: 5,
    marginBottom: 15,
    paddingHorizontal: 5,
  },
  infoText: {
    color: TEXT.MEDIUM_GREY,
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
    fontFamily: 'Firma-Regular',
  },
  highlightedText: {
    color: TEXT.PRIMARY,
    fontFamily: 'Firma-Medium',
  },
  verifiedByLabel: {
    color: TEXT.LIGHT_GREY,
    fontSize: 15,
    fontFamily: 'Firma-Medium',
    marginTop: 15,
    marginBottom: 5,
    paddingHorizontal: 5,
  },
  issuerListItem: {
    marginVertical: 4,
  },
  issuerAvatarShimmer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: UI.BORDER.PRIMARY,
  },
  // Date section styling
  dateSection: {
    marginVertical: 15,
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 12,
  },
  labelText: {
    color: TEXT.LIGHT_GREY,
    fontSize: 13,
    fontFamily: 'Firma-Regular',
    marginBottom: 4,
  },
  valueText: {
    color: TEXT.PRIMARY,
    fontSize: 15,
    fontFamily: 'Firma-Medium',
  },
  dateValueText: {
    color: TEXT.PRIMARY,
    fontSize: 15,
    fontFamily: 'Firma-Medium',
    textAlign: 'center',
  },
    // Legacy styles preserved for backward compatibility
  verifierCard: {
    marginVertical: 15,
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 15,
    borderWidth: 1,
    borderColor: '#333',
  },
  verifierContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  verifierAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  verifierTextContainer: {
    flex: 1,
  },
  verifierName: {
    color: TEXT.PRIMARY,
    fontSize: 16,
    fontFamily: 'Firma-Medium',
  },
  verifierHandle: {
    color: TEXT.LIGHT_GREY,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    marginTop: 2,
  },
  errorContainer: {
    padding: 30,
    alignItems: 'center',
  },
  errorText: {
    color: TEXT.LIGHT_GREY,
    fontSize: 16,
    fontFamily: 'Firma-Regular',
    marginBottom: 20,
    textAlign: 'center',
  },
  closeButton: {
    backgroundColor: UI.BACKGROUND.ITEM,
    borderWidth: 1,
    borderColor: UI.BORDER.PRIMARY,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 20,
    minWidth: 120,
  },
  closeButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: 'Firma-SemiBold',
  },
  statusDateContainer: {
    marginTop: 5,
    marginBottom: 15,
    alignItems: 'center',
  },
  statusText: {
    color: TEXT.LIGHT_GREY,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    textAlign: 'center',
  },
  loadingContainer: {
    paddingVertical: 20,
  },
  badgeShimmer: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  titleShimmer: {
    width: 120,
    height: 20,
    borderRadius: 4,
    marginLeft: 6,
  },
  infoShimmer: {
    width: '100%',
    height: 60,
    borderRadius: 8,
  },
  closeButtonShimmer: {
    marginTop: 20,
    alignItems: 'center',
  },
  buttonShimmer: {
    width: 120,
    height: 44,
    borderRadius: 16,
  },
  issuerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
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
  issuerNameShimmer: {
    width: 120,
    height: 14,
    borderRadius: 3,
    marginRight: 8,
  },
  issuerBadgeShimmer: {
    width: 16,
    height: 14,
    borderRadius: 7,
  },
  issuerHandleShimmer: {
    width: 80,
    height: 12,
    borderRadius: 2,
  },
  issuerArrowShimmer: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },

});

export default VerificationInfoSheet;
