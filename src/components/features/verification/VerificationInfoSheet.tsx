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
import { Colors } from '../../ui/UI';
import AtprotoService from '../../../services/api/AtprotoService';
import { useNavigation } from '@react-navigation/native';
import { Avatar } from '../../ui/UI';
import Icon from '../../ui/Icon';
import ShimmerPlaceholder from 'react-native-shimmer-placeholder';
import { LinearGradient } from 'expo-linear-gradient';
import { BottomSheetModal, BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
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

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      index={0}
      snapPoints={snapPoints}
      backdropComponent={renderBackdrop}
      onDismiss={onDismiss}
      backgroundStyle={styles.bottomSheetBackground}
      handleIndicatorStyle={{ display: 'none' }}
    >
      <BottomSheetView style={styles.content}>
        {/* Header with badge, title and close button */}
        <View style={styles.headerContainer}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>
              {isTrustedVerifier ? 'Trusted Verifier' : 'Verified'}
            </Text>
            <VerificationBadge
              handle={handle}
              textSize={20}
              badgeType="auto"
              textColor={Colors.white}
            />
          </View>
          <TouchableOpacity 
            style={styles.closeButton} 
            onPress={onDismiss}
            activeOpacity={0.7}
          >
            <Text style={styles.closeButtonText}>×</Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <ActivityIndicator size="small" color={Colors.lightGray} style={styles.loadingIndicator} />
        ) : verification ? (
          isTrustedVerifier ? renderTrustedVerifierContent() : renderVerifiedAccountContent()
        ) : (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>
              could not load verification information
            </Text>
            <TouchableOpacity 
              style={styles.cancelButton} 
              onPress={onDismiss}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelButtonText}>close</Text>
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
        {/* Info Container */}
        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>
            <Text>{profile?.displayName || handle}</Text>
            <Text> is a trusted verifier on bluesky. trusted verifiers can verify other accounts on the network.</Text>
          </Text>
        </View>
          
        {/* Verification Date */}
        {verification?.verifications?.[0]?.createdAt && (
          <View style={styles.statusDateContainer}>
            <Text style={styles.statusText}>
              since {new Date(verification.verifications[0].createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </Text>
          </View>
        )}

        {/* Cancel Button */}
        <View style={styles.cancelContainer}>
          <TouchableOpacity 
            style={styles.cancelButton} 
            onPress={onDismiss}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelButtonText}>close</Text>
          </TouchableOpacity>
        </View>
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
            a verification badge indicates this is an authentic account representing the person or organization it claims to be.
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
                backgroundColor="transparent"
                size="large"
                showDate={true}
                date={issuerCreatedAt ? new Date(issuerCreatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : undefined}
                nameFontWeight="Firma-Bold"
                handleFontWeight="Firma-Bold"
                style={styles.issuerListItem}
                onPress={() => {
                  onDismiss();
                  // Slightly delay navigation to allow for smooth dismissal animation
                  setTimeout(() => {
                    const target = (issuerProfile?.handle || actualIssuerHandle || verifierDid || '').trim();
                    if (!target) return;
                    let rootNav: any = navigation as any;
                    while (rootNav?.getParent?.()) {
                      rootNav = rootNav.getParent();
                    }
                    rootNav?.navigate?.('AuthorProfile', { handle: target });
                  }, 300);
                }}
              />
            )}
          </>
        )}

        {/* Cancel Button */}
        <View style={styles.cancelContainer}>
          <TouchableOpacity 
            style={styles.cancelButton} 
            onPress={onDismiss}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelButtonText}>close</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }
};

const styles = StyleSheet.create({
  bottomSheetBackground: {
    backgroundColor: Colors.black,
    // Square top corners - no border radius
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 20 : 30,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'left',
    fontFamily: 'Firma-Black',
  },
  closeButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: Colors.lightGray,
    fontSize: 24,
    fontWeight: 'bold',
  },
  loadingIndicator: {
    marginVertical: 40,
    alignSelf: 'center',
  },
  infoContainer: {
    marginBottom: 30,
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
    fontSize: 15,
    fontFamily: 'Firma-Regular',
    marginBottom: 5,
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
    borderRadius: 20,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  issuerNameShimmer: {
    width: 120,
    height: 14,
    borderRadius: 3,
    marginRight: 8,
  },
  issuerHandleShimmer: {
    width: 80,
    height: 12,
    borderRadius: 2,
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
    marginTop: 30,
  },
  cancelButton: {
    backgroundColor: Colors.darkGray,
    borderRadius: 50,
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
