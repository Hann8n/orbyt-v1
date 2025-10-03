import React, { memo, useMemo, useCallback, useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import UniversalHeader, { HeaderAction, HeaderContent, CustomActionLayout } from './UniversalHeader';
import HeaderSkeleton from './HeaderSkeleton';
import { useProfile, useProfileColors, useFollowMutation } from '../../../services/cache/ProfileCache';
import VerificationBadge from '../../features/verification/VerificationBadge';
import VerificationInfoSheet from '../../features/verification/VerificationInfoSheet';
import ProfileMenu from '../../features/profile/ProfileMenu';
import EditProfileSheet from '../../features/profile/EditProfileSheet';
import ProfileCache from '../../../services/cache/ProfileCache';
import { FollowIcon, MutualHeartIcon, ProfileEditIcon} from '../../ui/Icon';
import { hexToRGBA, extractColorsFromImage } from '../../../utils/formatting/colorUtils';

interface ProfileHeaderProps {
  handle: string | null;
  showBackButton?: boolean;
  onBackPress?: () => void;
  isOwnProfile?: boolean;
  onLogout?: (clearAllAccounts?: boolean) => Promise<void>;
  onSwitchAccount?: () => void;
  forceLoading?: boolean;
  children?: React.ReactNode;
  applySafeArea?: boolean;
  headerStyle?: any;
  onColorsChange?: (colors: { backgroundColor: string; textColor: string }) => void;
}

const ProfileHeader: React.FC<ProfileHeaderProps> = ({
  handle,
  showBackButton = false,
  onBackPress,
  isOwnProfile = false,
  onLogout,
  onSwitchAccount,
  forceLoading = false,
  children,
  applySafeArea = false,
  headerStyle,
  onColorsChange,
}) => {
  const navigation = useRouter();
  const [showVerificationInfo, setShowVerificationInfo] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showEditSheet, setShowEditSheet] = useState(false);
  
  const [extractedDefaultColors, setExtractedDefaultColors] = useState<{
    backgroundColor: string;
    textColor: string;
  } | null>(null);

  // Use profile data and colors from cache
  const {
    data: profile,
    isLoading: isProfileLoading,
    isError: isProfileError,
    refetch: refetchProfile,
  } = useProfile(handle);

  const { colors: profileColors } = useProfileColors(handle);
  const followMutation = useFollowMutation();

  // Ensure profile data is immediately available from cache to prevent flashing
  const profileData = profile || (handle ? ProfileCache.getProfileFromCacheSync(handle) : null);

  // Edit sheet functions
  const openEditSheet = useCallback(() => {
    setShowEditSheet(true);
  }, []);

  const closeEditSheet = useCallback(() => {
    setShowEditSheet(false);
  }, []);



  // Extract default colors from avatar when profile data changes
  useEffect(() => {
    const extractDefaultColors = async () => {
      if (profileData?.avatar) {
        try {
          const colors = await extractColorsFromImage(profileData.avatar);
          
          setExtractedDefaultColors({
            backgroundColor: colors.backgroundColor,
            textColor: colors.foregroundColor,
          });
          
        } catch (error) {
          // Fallback to black/white if extraction fails
          setExtractedDefaultColors({
            backgroundColor: '#000000',
            textColor: '#FFFFFF',
          });
        }
      } else {
      }
    };

    extractDefaultColors();
  }, [profileData?.avatar]);


  // Handle follow/unfollow action
  const handleFollowUnfollow = useCallback(async () => {
    if (!profileData?.did || !profileData?.handle) return;

    try {
      const isCurrentlyFollowing = !!profileData.isFollowing;
      
      followMutation.mutate({
        handle: profileData.handle,
        isFollowing: !isCurrentlyFollowing,
      });
    } catch (error) {
    }
  }, [profileData, followMutation]);

  // Handle menu button press
  const handleMenuPress = useCallback(() => {
    if (isOwnProfile) {
      // Navigate to settings for own profile
              navigation.push('/settings');
    } else {
      // Show profile menu for other profiles
      setShowProfileMenu(true);
    }
  }, [isOwnProfile, navigation]);

  // Handle logout from menu
  const handleLogoutFromMenu = useCallback(async () => {
    if (onLogout) {
      await onLogout();
    }
  }, [onLogout]);

  // Create custom action layouts
  const customActions = useMemo((): CustomActionLayout[] => {
    if (!profileData) return [];


    if (isOwnProfile) {
      return [
        {
          type: 'button',
          menuIcon: {
            onPress: handleMenuPress,
          },
          buttons: [
            {
              id: 'edit',
              label: 'Edit profile',
              onPress: openEditSheet,
            },
          ],
        },
      ];
    } else {
      const isFollowing = !!profileData.isFollowing;
      const isFollowedBy = !!profileData.isFollowedBy;

      let label = 'follow';
      let icon: string | undefined = undefined;
      let customIcon: React.ReactNode | undefined = (
        <FollowIcon 
          size={16} 
          color={profileColors.textColor} 
        />
      );

      if (isFollowing && isFollowedBy) {
        label = 'Mutuals';
        icon = undefined;
        customIcon = (
          <MutualHeartIcon 
            size={16} 
            color={profileColors.backgroundColor} 
          />
        );
      } else if (isFollowing) {
        label = 'Following';
        icon = 'check';
        customIcon = undefined;
      }

      return [
        {
          type: 'button',
          menuIcon: {
            onPress: handleMenuPress,
          },
          buttons: [
            {
              id: 'follow',
              label,
              icon,
              customIcon,
              onPress: handleFollowUnfollow,
            },
          ],
        },
      ];
    }
  }, [profileData, isOwnProfile, handleFollowUnfollow, openEditSheet, handleMenuPress]);

  // Create header content with custom description component
  const headerContent = useMemo((): HeaderContent => {
    if (!profileData) {
      return {
        title: '',
        subtitle: '',
      };
    }

    return {
      avatar: profileData.avatar || undefined,
      title: profileData.displayName || profileData.handle || 'Unknown User',
      subtitle: profileData.handle ? profileData.handle : undefined,
      description: profileData.description,
      badge: profileData.handle ? (
        <VerificationBadge
          handle={profileData.handle}
          textSize={24}
          borderColor={profileColors.textColor}
          textColor={profileColors.textColor}
          onPress={() => setShowVerificationInfo(true)}
        />
      ) : undefined,
    };
  }, [profileData, profileColors.textColor]);

  // Create skeleton component
  const skeleton = useMemo(() => (
    <HeaderSkeleton
      textColor={profileColors.textColor}
      backgroundColor={profileColors.backgroundColor}
      showAvatar={true}
      showDescription={true}
    />
  ), [profileColors.textColor, profileColors.backgroundColor]);

  // Get colors for description and tab navigation
  const dynamicColors = useMemo(() => {
    return {
      backgroundColor: profileColors.backgroundColor,
      textColor: profileColors.textColor,
    };
  }, [profileColors.backgroundColor, profileColors.textColor]);

  // Notify parent of color changes
  useEffect(() => {
    onColorsChange?.(dynamicColors);
  }, [dynamicColors, onColorsChange]);

  // Custom description is no longer needed since we use modal sheet
  const customDescription = useMemo(() => {
    return null;

  }, []);


  return (
    <>
      <EditProfileSheet
        visible={showEditSheet}
        onDismiss={closeEditSheet}
        profileData={profileData}
        defaultColors={extractedDefaultColors}
      />
      
      <UniversalHeader
        content={headerContent}
        actions={[]}
        customActions={customActions}
        showBackButton={showBackButton}
        onBackPress={onBackPress}
        backgroundColor={dynamicColors.backgroundColor}
        textColor={dynamicColors.textColor}
        isLoading={forceLoading || (isProfileLoading && !profileData)}
        skeleton={skeleton}
        applySafeArea={applySafeArea}
        style={{ opacity: 1 }}
        contentStyle={[headerStyle]}
      >
        {children}
      </UniversalHeader>

      {profileData?.handle && (
        <VerificationInfoSheet
          visible={showVerificationInfo}
          handle={profileData.handle}
          onDismiss={() => setShowVerificationInfo(false)}
        />
      )}

      <ProfileMenu
        visible={showProfileMenu}
        onDismiss={() => setShowProfileMenu(false)}
        handle={handle || ''}
        isOwnProfile={isOwnProfile}
        onLogout={handleLogoutFromMenu}
        onSwitchAccount={onSwitchAccount}
      />
    </>
  );
};


export default memo(ProfileHeader); 