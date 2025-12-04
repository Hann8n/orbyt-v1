import React, { memo, useMemo, useCallback, useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Text, TouchableOpacity, StatusBar } from 'react-native';
import UniversalHeader, { HeaderAction, HeaderContent, CustomActionLayout } from './UniversalHeader';
import { useProfile, useProfileColors, useFollowMutation } from '../../../services/cache/ProfileCache';
import { createQueryKeys } from '../../../services/FeedService';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AtprotoService from '../../../services/api/AtprotoService';
import { useProfileFlags } from '../../../stores/profileInteractionStore';
import { useOrbytProfile } from '../../../hooks';
import VerificationBadge from '../../features/badging/VerificationBadge';
import BetaBadge from '../../features/badging/BetaBadge';
import BetaInfoSheet from '../../features/badging/BetaInfoSheet';
import VerificationInfoSheet from '../../features/badging/VerificationInfoSheet';
import ProfileMenu from '../../features/profile/ProfileMenu';
import EditProfileSheet from '../../features/profile/EditProfileSheet';
import ProfileCache from '../../../services/cache/ProfileCache';
import ChatService from '../../../services/ChatService';
import { FollowIcon, MutualHeartIcon, ProfileEditIcon, InboxIcon} from '../../ui/Icon';
import { hexToRGBA, getStatusBarStyle } from '../../../utils/formatting/colorUtils';
import { parseRichText } from '../../../utils/richTextParser';

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
  const [showBetaInfo, setShowBetaInfo] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showEditSheet, setShowEditSheet] = useState(false);
  const [canMessage, setCanMessage] = useState<boolean | null>(null);
  
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
  const queryClient = useQueryClient();

  // Ensure profile data is immediately available from cache to prevent flashing
  const profileData = profile || (handle ? ProfileCache.getProfileFromCacheSync(handle) : null);

  // Block status and flags
  const { flags, setFlags } = useProfileFlags(profileData?.did, profileData?.handle);
  const { data: blockStatus = false } = useQuery({
    queryKey: createQueryKeys.blocks.status(profileData?.did || ''),
    queryFn: () => AtprotoService.isBlocked(profileData?.did || ''),
    enabled: !!profileData?.did && !isOwnProfile,
    initialData: false,
  });
  const isBlocked = flags?.isBlocked ?? blockStatus;

  // Fetch Orbyt profile record join date for this DID
  const { joinDate } = useOrbytProfile(profileData?.did);
  
  // Check if the current user can message this profile
  useEffect(() => {
    const checkAvailability = async () => {
      if (!profileData?.did || isOwnProfile) {
        setCanMessage(null);
        return;
      }
      try {
        const available = await ChatService.getConversationAvailability(profileData.did);
        setCanMessage(available);
      } catch {
        setCanMessage(false);
      }
    };
    checkAvailability();
  }, [profileData?.did, isOwnProfile]);

  // Edit sheet functions
  const openEditSheet = useCallback(() => {
    setShowEditSheet(true);
  }, []);

  const closeEditSheet = useCallback(() => {
    setShowEditSheet(false);
  }, []);

  const handleMessagePress = useCallback(async () => {
    if (!profileData?.did) return;
    
    try {
      // Try to get existing conversation or create new one
      const conversation = await ChatService.createConversation({
        recipientDid: profileData.did,
      });
      
      // Navigate to chat screen
      navigation.push(`/chat/${conversation.id}`);
    } catch (error) {
      // For now, just navigate to the chat tab
      navigation.push('/chat');
    }
  }, [profileData?.did, navigation]);

  // Set default colors for edit sheet
  useEffect(() => {
    const setDefaultColors = () => {
      if (profileData?.profileColors) {
        // Use current profile colors as default for edit sheet
        setExtractedDefaultColors({
          backgroundColor: profileData.profileColors.backgroundColor,
          textColor: profileData.profileColors.foregroundColor,
        });
      } else {
        // Use default colors - do NOT extract from avatar
        setExtractedDefaultColors({
          backgroundColor: '#000000',
          textColor: '#CFD6E8',
        });
      }
    };

    setDefaultColors();
  }, [profileData?.profileColors]);


  // Handle follow/unfollow action
  const handleFollowUnfollow = useCallback(async () => {
    if (!profileData?.did || !profileData?.handle) return;

    try {
      if (isBlocked) {
        await AtprotoService.unblockUser(profileData.did);
        setFlags({ isBlocked: false });
        queryClient.invalidateQueries({ queryKey: createQueryKeys.blocks.status(profileData.did) });
        return;
      }
      const isCurrentlyFollowing = !!profileData.isFollowing;
      followMutation.mutate({
        handle: profileData.handle,
        isFollowing: !isCurrentlyFollowing,
      });
    } catch (error) {
    }
  }, [profileData, followMutation, isBlocked, setFlags, queryClient]);

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

      let label = isBlocked ? 'Unblock' : 'follow';
      let icon: string | undefined = undefined;
      let customIcon: React.ReactNode | undefined = isBlocked ? undefined : (
        <FollowIcon 
          size={16} 
          color={profileColors.textColor} 
        />
      );

      if (!isBlocked && isFollowing && isFollowedBy) {
        label = 'Mutuals';
        icon = undefined;
        customIcon = (
          <MutualHeartIcon 
            size={16} 
            color={profileColors.backgroundColor} 
          />
        );
      } else if (!isBlocked && isFollowing) {
        label = 'Following';
        icon = 'check';
        customIcon = undefined;
      }

      const buttons: HeaderAction[] = [
        {
          id: 'follow',
          label,
          icon,
          customIcon,
          onPress: handleFollowUnfollow,
        } as HeaderAction
      ];

      return [
        {
          type: 'button',
          menuIcon: {
            onPress: handleMenuPress,
          },
          buttons,
        },
      ];
    }
  }, [profileData, isOwnProfile, handleFollowUnfollow, openEditSheet, handleMenuPress, profileColors.textColor]);

  // Create header content with custom description component
  const headerContent = useMemo((): HeaderContent => {
    if (!profileData) {
      return {
        title: '',
        subtitle: '',
      };
    }

    // Compose subtitle lines: handle only (joined date moved to Beta Info Sheet)
    const subtitle: string | undefined = profileData.handle ? profileData.handle : undefined;
    // Do not show joined date in header; it's displayed in BetaInfoSheet

    // Determine beta user by join date cutoff
    const betaCutoff = new Date('2026-01-24T00:00:00.000Z');
    const isBeta = (() => {
      try {
        if (!joinDate) return false;
        const d = new Date(joinDate);
        return d.getTime() < betaCutoff.getTime();
      } catch {
        return false;
      }
    })();

    // Parse description to generate rich text facets
    const parsedDescription = profileData.description 
      ? parseRichText(profileData.description)
      : null;

    return {
      avatar: profileData.avatar || undefined,
      title: profileData.displayName || profileData.handle || 'Unknown User',
      subtitle,
      // subtitleSecondary intentionally omitted (no joined date in header)
      description: parsedDescription?.text,
      facets: parsedDescription?.facets,
      badge: profileData.handle ? (
        <>
          {isBeta && (
            <TouchableOpacity onPress={() => setShowBetaInfo(true)} activeOpacity={0.7}>
              <BetaBadge textSize={24} color={profileColors.textColor} opacity={0.55} />
            </TouchableOpacity>
          )}
          <VerificationBadge
            handle={profileData.handle}
            textSize={24}
            borderColor={profileColors.textColor}
            textColor={profileColors.textColor}
            onPress={() => setShowVerificationInfo(true)}
          />
        </>
      ) : undefined,
      avatarBlurRadius: isBlocked ? 30 : 0,
    };
  }, [profileData, profileColors.textColor, joinDate, isBlocked]);


  // Get colors for description and tab navigation
  const dynamicColors = useMemo(() => {
    return {
      backgroundColor: profileColors.backgroundColor,
      textColor: profileColors.textColor,
    };
  }, [profileColors.backgroundColor, profileColors.textColor]);

  // Determine status bar style based on background color brightness
  const statusBarStyle = useMemo(() => {
    const style = getStatusBarStyle(dynamicColors.backgroundColor);
    return style === 'light' ? 'light-content' : 'dark-content';
  }, [dynamicColors.backgroundColor]);

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
      <StatusBar barStyle={statusBarStyle} backgroundColor={dynamicColors.backgroundColor} translucent={true} />
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
        isLoading={false}
        applySafeArea={applySafeArea}
        style={{ opacity: 1 }}
        contentStyle={[headerStyle]}
        showShadowGradient={false}
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

      {profileData?.handle && (
        <BetaInfoSheet
          visible={showBetaInfo}
          handle={profileData.handle}
          joinDate={joinDate}
          onDismiss={() => setShowBetaInfo(false)}
        />
      )}

      <ProfileMenu
        visible={showProfileMenu}
        onDismiss={() => setShowProfileMenu(false)}
        handle={handle || ''}
        isOwnProfile={isOwnProfile}
        onLogout={handleLogoutFromMenu}
        onSwitchAccount={onSwitchAccount}
        canMessage={canMessage}
        onMessagePress={handleMessagePress}
      />
    </>
  );
};


export default memo(ProfileHeader); 