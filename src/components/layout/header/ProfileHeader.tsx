import React, { memo, useMemo, useCallback, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Modal, TouchableWithoutFeedback, ActivityIndicator, TextInput, Alert, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import UniversalHeader, { HeaderAction, HeaderContent, CustomActionLayout } from './UniversalHeader';
import HeaderSkeleton from './HeaderSkeleton';
import { useProfile, useProfileColors, useFollowMutation, useProfileUpdateMutation } from '../../../services/cache/ProfileCache';
import VerificationBadge from '../../features/verification/VerificationBadge';
import VerificationInfoSheet from '../../features/verification/VerificationInfoSheet';
import ProfileMenu from '../../features/profile/ProfileMenu';
import ProfileCache from '../../../services/cache/ProfileCache';
import { FollowIcon, MutualHeartIcon, ProfileEditIcon} from '../../ui/Icon';
import { hexToRGBA } from '../../../utils/formatting/colorUtils';

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
}) => {
  const navigation = useNavigation<any>();
  const [showVerificationInfo, setShowVerificationInfo] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  
  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAvatar, setEditAvatar] = useState<string | undefined>(undefined);

  // Use profile data and colors from cache
  const {
    data: profile,
    isLoading: isProfileLoading,
    isError: isProfileError,
    refetch: refetchProfile,
  } = useProfile(handle);

  const { colors: profileColors } = useProfileColors(handle);
  const followMutation = useFollowMutation();
  const profileUpdateMutation = useProfileUpdateMutation();

  // Ensure profile data is immediately available from cache to prevent flashing
  const profileData = profile || (handle ? ProfileCache.getProfileFromCacheSync(handle) : null);

  // Initialize edit form when entering edit mode
  const enterEditMode = useCallback(() => {
    if (profileData) {
      setEditDisplayName(profileData.displayName || '');
      setEditDescription(profileData.description || '');
      setEditAvatar(undefined);
      setIsEditMode(true);
    }
  }, [profileData]);

  // Exit edit mode and reset form
  const exitEditMode = useCallback(() => {
    setIsEditMode(false);
    setEditDisplayName('');
    setEditDescription('');
    setEditAvatar(undefined);
  }, []);

  // Handle avatar selection
  const handleAvatarPress = useCallback(async () => {
    try {
      const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
      const { status: mediaLibraryStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (cameraStatus !== 'granted' && mediaLibraryStatus !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Camera and photo library permissions are required to change your profile picture.',
          [{ text: 'OK' }]
        );
        return;
      }

      Alert.alert(
        'Choose Photo',
        'Select a photo from your camera or photo library',
        [
          {
            text: 'Camera',
            onPress: async () => {
              try {
                const result = await ImagePicker.launchCameraAsync({
                  mediaTypes: ImagePicker.MediaTypeOptions.Images,
                  allowsEditing: true,
                  aspect: [1, 1],
                  quality: 0.8,
                });

                if (!result.canceled && result.assets && result.assets[0] && result.assets[0].uri) {
                  setEditAvatar(result.assets[0].uri || undefined);
                }
              } catch (error) {
                console.error('Camera error:', error);
                Alert.alert('Error', 'Failed to open camera. Please try again.');
              }
            },
          },
          {
            text: 'Photo Library',
            onPress: async () => {
              try {
                const result = await ImagePicker.launchImageLibraryAsync({
                  mediaTypes: ImagePicker.MediaTypeOptions.Images,
                  allowsEditing: true,
                  aspect: [1, 1],
                  quality: 0.8,
                });

                if (!result.canceled && result.assets && result.assets[0] && result.assets[0].uri) {
                  setEditAvatar(result.assets[0].uri || undefined);
                }
              } catch (error) {
                console.error('Photo library error:', error);
                Alert.alert('Error', 'Failed to open photo library. Please try again.');
              }
            },
          },
          {
            text: 'Cancel',
            style: 'cancel',
          },
        ]
      );
    } catch (error) {
      console.error('Avatar selection error:', error);
      Alert.alert('Error', 'Failed to open image picker. Please try again.');
    }
  }, []);

  // Handle save profile
  const handleSaveProfile = useCallback(async () => {
    if (!profileData) return;

    try {
      await profileUpdateMutation.mutateAsync({
        handle: profileData.handle,
        updates: {
          displayName: editDisplayName.trim() || undefined,
          description: editDescription.trim() || undefined,
          avatar: editAvatar || undefined,
        }
      });
      
      exitEditMode();
    } catch (error) {
      console.error('Error updating profile:', error);
      Alert.alert('Error', 'Failed to update profile. Please try again.');
    }
  }, [profileData, editDisplayName, editDescription, editAvatar, profileUpdateMutation, exitEditMode]);

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
      console.error('Error during follow/unfollow:', error);
    }
  }, [profileData, followMutation]);

  // Handle menu button press
  const handleMenuPress = useCallback(() => {
    setShowProfileMenu(true);
  }, []);

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
      if (isEditMode) {
        return [
          {
            type: 'button-group',
            buttonGroup: {
              primary: {
                id: 'save',
                label: profileUpdateMutation.isPending ? 'Saving...' : 'Save',
                onPress: handleSaveProfile,
                disabled: profileUpdateMutation.isPending,
                loading: profileUpdateMutation.isPending,
                variant: 'primary' as const,
              },
              secondary: {
                id: 'cancel',
                label: 'Cancel',
                onPress: exitEditMode,
                variant: 'secondary' as const,
              },
            },
          },
        ];
      } else {
        return [
          {
            type: 'button',
            menuIcon: {
              onPress: handleMenuPress,
            },
            buttons: [
              {
                id: 'edit',
                label: 'edit',
                customIcon: (
                  <ProfileEditIcon 
                    size={16} 
                    color={profileColors.textColor} 
                  />
                ),
                onPress: enterEditMode,
              },
            ],
          },
        ];
      }
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
  }, [profileData, isOwnProfile, isEditMode, profileUpdateMutation.isPending, handleFollowUnfollow, enterEditMode, exitEditMode, handleSaveProfile, handleMenuPress]);

  // Create header content with custom description component
  const headerContent = useMemo((): HeaderContent => {
    if (!profileData) {
      return {
        title: '',
        subtitle: '',
      };
    }

    return {
      avatar: editAvatar || profileData.avatar || undefined,
      title: isEditMode ? editDisplayName : (profileData.displayName || profileData.handle || 'Unknown User'),
      onTitleChange: isEditMode ? setEditDisplayName : undefined,
      subtitle: isEditMode ? undefined : (profileData.handle ? profileData.handle : undefined),
      description: isEditMode ? undefined : profileData.description,
      badge: profileData.handle ? (
        <VerificationBadge
          handle={profileData.handle}
          textSize={24}
          borderColor={profileColors.textColor}
          textColor={profileColors.textColor}
          onPress={() => setShowVerificationInfo(true)}
        />
      ) : undefined,
      onAvatarPress: isEditMode ? handleAvatarPress : undefined,
      isEditMode: isEditMode,
    };
  }, [profileData, isEditMode, editDisplayName, editDescription, editAvatar, handleAvatarPress]);

  // Create skeleton component
  const skeleton = useMemo(() => (
    <HeaderSkeleton
      textColor={profileColors.textColor}
      backgroundColor={profileColors.backgroundColor}
      showAvatar={true}
      showDescription={true}
    />
  ), [profileColors.textColor, profileColors.backgroundColor]);

  // Only render custom description in edit mode; view mode is handled by UniversalHeader
  const customDescription = useMemo(() => {
    if (!isEditMode) return null;

    return (
      <View>
        <Text style={[styles.editSubheader, { color: hexToRGBA(profileColors.textColor, 0.67) }]}>ABOUT</Text>
        <TextInput
          style={[
            styles.description,
            styles.editDescription,
            { 
              color: profileColors.textColor + 'DD',
            }
          ]}
          value={editDescription}
          onChangeText={setEditDescription}
          placeholder="Write a bio..."
          placeholderTextColor={hexToRGBA(profileColors.textColor, 0.5)}
          multiline
          maxLength={256}
          textAlignVertical="top"
        />
      </View>
    );
  }, [isEditMode, editDescription, profileColors.textColor]);

  return (
    <>
      <UniversalHeader
        content={headerContent}
        actions={[]}
        customActions={customActions}
        showBackButton={showBackButton && !isEditMode}
        onBackPress={onBackPress}
        backgroundColor={profileColors.backgroundColor}
        textColor={profileColors.textColor}
        isLoading={forceLoading || (isProfileLoading && !profileData)}
        skeleton={skeleton}
        showGradient={false}
        applySafeArea={applySafeArea}
        style={{ opacity: 1 }}
        contentStyle={[headerStyle]}
      >
        {customDescription}
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

const styles = StyleSheet.create({
  description: { 
    fontSize: 18, 
    marginTop: 4,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontFamily: 'Firma-Regular'
  },
  editDescription: {
    padding: 0,
    minHeight: 80,
    fontFamily: 'Firma-Regular',
    backgroundColor: 'transparent',
  },
  editSubheader: {
    fontFamily: 'Firma-Bold',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
    marginTop: 12,
  },
});

export default memo(ProfileHeader); 