import React, { useMemo, useCallback, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Modal, TouchableWithoutFeedback, ActivityIndicator, TextInput, Alert, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import UniversalHeader, { HeaderAction, HeaderContent, CustomActionLayout } from './UniversalHeader';
import HeaderSkeleton from './HeaderSkeleton';
import { useProfile, useProfileColors, useFollowMutation, useProfileUpdateMutation } from '../../../services/cache/ProfileCache';
import { TextWithLinks } from '../../ui/TextWithLinks';
import VerificationBadge from '../../features/verification/VerificationBadge';
import VerificationInfoSheet from '../../features/verification/VerificationInfoSheet';
import ProfileMenu from '../../features/profile/ProfileMenu';
import ProfileCache from '../../../services/cache/ProfileCache';
import AtprotoService from '../../../services/api/AtprotoService';
import Icon, { PlusIcon, CheckIcon } from '../../ui/Icon';
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
      // Request camera permissions first
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

      // Show action sheet for camera or gallery
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
      
      // Exit edit mode
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
      
      // Use the follow mutation which handles both follow and unfollow
      followMutation.mutate({
        handle: profileData.handle,
        isFollowing: !isCurrentlyFollowing,
      });
    } catch (error) {
      console.error('Error during follow/unfollow:', error);
    }
  }, [profileData, followMutation]);

  // Handle author navigation
  const handleAuthorPress = useCallback((authorHandle: string) => {
    navigation.navigate("AuthorProfile", { handle: authorHandle });
  }, [navigation]);

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
                icon: 'check',
                onPress: handleSaveProfile,
                disabled: profileUpdateMutation.isPending,
                loading: profileUpdateMutation.isPending,
                variant: 'primary' as const,
              },
              secondary: {
                id: 'cancel',
                label: 'Cancel',
                icon: 'x',
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
              name: 'more-horizontal',
              onPress: handleMenuPress,
            },
            buttons: [
              {
                id: 'edit',
                label: 'Edit',
                icon: 'edit',
                onPress: enterEditMode,
              },
            ],
          },
        ];
      }
    } else {
      // Non-own profile: follow button and menu
      const isFollowing = !!profileData.isFollowing;
      const isFollowedBy = !!profileData.isFollowedBy;

      let label = 'Follow';
      let icon: string | undefined = 'plus';
      let customIcon: React.ReactNode | undefined = undefined;

      if (isFollowing && isFollowedBy) {
        label = 'Mutuals';
        icon = 'users';
      } else if (isFollowing) {
        label = 'Following';
        icon = undefined;
        customIcon = (
          <CheckIcon 
            size={16} 
            color={profileColors.backgroundColor} 
            strokeWidth={2.0}
          />
        );
      }

      return [
        {
          type: 'button',
          menuIcon: {
            name: 'more-horizontal',
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
      subtitle: profileData.handle ? `@${profileData.handle}` : undefined,
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

  // Custom description component with TextWithLinks or TextInput for edit mode
  const customDescription = useMemo(() => {
    if (isEditMode) {
      return (
        <TextInput
          style={[
            styles.description,
            styles.editDescription,
            { 
              color: profileColors.textColor + 'DD',
              borderColor: hexToRGBA(profileColors.textColor, 0.3),
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
      );
    } else if (profileData?.description) {
      return (
        <TextWithLinks
          text={profileData.description}
          style={[styles.description, { color: profileColors.textColor + 'DD' }]}
          onAuthorPress={handleAuthorPress}
        />
      );
    }
    return null;
  }, [isEditMode, profileData?.description, editDescription, profileColors.textColor, handleAuthorPress]);

  return (
    <>
      <UniversalHeader
        content={headerContent}
        actions={[]} // Hide default actions, use custom layout
        customActions={customActions}
        showBackButton={showBackButton}
        onBackPress={onBackPress}
        backgroundColor={profileColors.backgroundColor}
        textColor={profileColors.textColor}
        isLoading={forceLoading || (isProfileLoading && !profileData)}
        skeleton={skeleton}
        showGradient={false}
      >
        {customDescription}
        {children}
      </UniversalHeader>

      {/* Verification Info Sheet */}
      {profileData?.handle && (
              <VerificationInfoSheet
                visible={showVerificationInfo}
                handle={profileData.handle}
                onDismiss={() => setShowVerificationInfo(false)}
              />
      )}

      {/* Profile Menu Sheet */}
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
    fontSize: 16, 
    marginTop: 12,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontFamily: 'Firma-Regular'
  },
  editDescription: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    minHeight: 80,
    fontFamily: 'Firma-Regular',
    backgroundColor: 'transparent',
    borderStyle: 'dashed',
  },
});

export default ProfileHeader; 