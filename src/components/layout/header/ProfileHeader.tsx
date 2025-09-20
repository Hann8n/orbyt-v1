import React, { memo, useMemo, useCallback, useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Modal, TouchableWithoutFeedback, ActivityIndicator, TextInput, Alert, Image } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import UniversalHeader, { HeaderAction, HeaderContent, CustomActionLayout } from './UniversalHeader';
import HeaderSkeleton from './HeaderSkeleton';
import { useProfile, useProfileColors, useFollowMutation, useProfileUpdateMutation } from '../../../services/cache/ProfileCache';
import VerificationBadge from '../../features/verification/VerificationBadge';
import VerificationInfoSheet from '../../features/verification/VerificationInfoSheet';
import ProfileMenu from '../../features/profile/ProfileMenu';
import ProfileColorPicker, { ProfileColorOption } from '../../features/profile/ProfileColorPicker';
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
  onEditModeChange?: (isEditMode: boolean) => void;
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
  onEditModeChange,
  onColorsChange,
}) => {
  const navigation = useRouter();
  const [showVerificationInfo, setShowVerificationInfo] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  
  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAvatar, setEditAvatar] = useState<string | undefined>(undefined);
  const [selectedColorId, setSelectedColorId] = useState<string>('default');
  const [selectedColorType, setSelectedColorType] = useState<'background' | 'text'>('background');
  const [customColors, setCustomColors] = useState<{
    backgroundColor: string;
    textColor: string;
  } | null>(null);
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
  const profileUpdateMutation = useProfileUpdateMutation();

  // Ensure profile data is immediately available from cache to prevent flashing
  const profileData = profile || (handle ? ProfileCache.getProfileFromCacheSync(handle) : null);

  // Initialize edit form when entering edit mode
  const enterEditMode = useCallback(() => {
    if (profileData) {
      setEditDisplayName(profileData.displayName || '');
      setEditDescription(profileData.description || '');
      setEditAvatar(undefined);
      setSelectedColorId('default');
      setSelectedColorType('background');
      setCustomColors(null);
      setIsEditMode(true);
      onEditModeChange?.(true);
    }
  }, [profileData, onEditModeChange]);

  // Exit edit mode and reset form
  const exitEditMode = useCallback(() => {
    setIsEditMode(false);
    setEditDisplayName('');
    setEditDescription('');
    setEditAvatar(undefined);
    setSelectedColorId('default');
    setSelectedColorType('background');
    setCustomColors(null);
    onEditModeChange?.(false);
  }, [onEditModeChange]);

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

  // Handle color selection
  const handleColorSelect = useCallback((colorOption: ProfileColorOption) => {
    console.log('[ProfileHeader] Color selected:', {
      id: colorOption.id,
      backgroundColor: colorOption.backgroundColor,
      textColor: colorOption.textColor,
      label: colorOption.label,
    });
    
    setSelectedColorId(colorOption.id);
    if (colorOption.id === 'default') {
      console.log('[ProfileHeader] Using default colors (extracted from avatar)');
      setCustomColors(null);
    } else {
      console.log('[ProfileHeader] Using custom colors:', {
        backgroundColor: colorOption.backgroundColor,
        textColor: colorOption.textColor,
      });
      setCustomColors({
        backgroundColor: colorOption.backgroundColor,
        textColor: colorOption.textColor,
      });
    }
  }, []);

  // Extract default colors from avatar when profile data changes
  useEffect(() => {
    const extractDefaultColors = async () => {
      if (profileData?.avatar) {
        console.log('[ProfileHeader] Extracting colors from avatar:', profileData.avatar);
        try {
          const colors = await extractColorsFromImage(profileData.avatar);
          console.log('[ProfileHeader] Extracted colors from avatar:', {
            backgroundColor: colors.backgroundColor,
            foregroundColor: colors.foregroundColor,
            textColor: colors.textColor,
            secondaryColor: colors.secondaryColor,
            accentColor: colors.accentColor,
            statusBarStyle: colors.statusBarStyle,
          });
          
          setExtractedDefaultColors({
            backgroundColor: colors.backgroundColor,
            textColor: colors.foregroundColor,
          });
          
          console.log('[ProfileHeader] Set extracted default colors:', {
            backgroundColor: colors.backgroundColor,
            textColor: colors.foregroundColor,
          });
        } catch (error) {
          console.error('[ProfileHeader] Error extracting default colors:', error);
          // Fallback to black/white if extraction fails
          setExtractedDefaultColors({
            backgroundColor: '#000000',
            textColor: '#FFFFFF',
          });
        }
      } else {
        console.log('[ProfileHeader] No avatar available for color extraction');
      }
    };

    extractDefaultColors();
  }, [profileData?.avatar]);

  // Handle color type selection (background or text)
  const handleColorTypeSelect = useCallback((colorType: 'background' | 'text') => {
    setSelectedColorType(colorType);
  }, []);

  // Handle save profile
  const handleSaveProfile = useCallback(async () => {
    if (!profileData) return;

    console.log('[ProfileHeader] Saving profile with updates:', {
      handle: profileData.handle,
      displayName: editDisplayName.trim() || undefined,
      description: editDescription.trim() || undefined,
      avatar: editAvatar || undefined,
      customColors: customColors || undefined,
    });

          try {
        let avatarToUpload = editAvatar;

      const result = await profileUpdateMutation.mutateAsync({
        handle: profileData.handle,
        updates: {
          displayName: editDisplayName.trim() || undefined,
          description: editDescription.trim() || undefined,
          avatar: avatarToUpload || undefined,
          customColors: customColors || undefined,
        }
      });
      
      console.log('[ProfileHeader] Profile update successful:', result);
      exitEditMode();
    } catch (error) {
      console.error('[ProfileHeader] Error updating profile:', error);
      Alert.alert('Error', 'Failed to update profile. Please try again.');
    }
  }, [profileData, editDisplayName, editDescription, editAvatar, customColors, profileUpdateMutation, exitEditMode]);

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

    // Debug logging
    console.log('[ProfileHeader] customActions calculation:', {
      isOwnProfile,
      profileDataHandle: profileData?.handle,
      profileDataDid: profileData?.did,
      isEditMode
    });

    if (isOwnProfile) {
      if (isEditMode) {
        return []; // No custom actions in edit mode since buttons are in color picker
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
                label: 'Edit profile',
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

  // Get colors for description and tab navigation (should update in real-time during edit mode)
  const dynamicColors = useMemo(() => {
    console.log('[ProfileHeader] dynamicColors calculation:', {
      isEditMode,
      hasCustomColors: !!customColors,
      customColors,
      profileColors: {
        backgroundColor: profileColors.backgroundColor,
        textColor: profileColors.textColor,
      },
    });
    
    if (isEditMode && customColors) {
      console.log('[ProfileHeader] Using custom colors for dynamic colors');
      return customColors;
    }
    
    console.log('[ProfileHeader] Using profile colors for dynamic colors');
    return {
      backgroundColor: profileColors.backgroundColor,
      textColor: profileColors.textColor,
    };
  }, [isEditMode, customColors, profileColors.backgroundColor, profileColors.textColor]);

  // Notify parent of color changes
  useEffect(() => {
    onColorsChange?.(dynamicColors);
  }, [dynamicColors, onColorsChange]);

  // Only render custom description in edit mode; view mode is handled by UniversalHeader
  const customDescription = useMemo(() => {
    if (!isEditMode) return null;

    return (
      <View>
        <Text style={[styles.editSubheader, { color: hexToRGBA(dynamicColors.textColor, 0.67) }]}>ABOUT</Text>
        <TextInput
          style={[
            styles.description,
            styles.editDescription,
            { 
              color: dynamicColors.textColor + 'DD',
            }
          ]}
          value={editDescription}
          onChangeText={setEditDescription}
          placeholder="Write a bio..."
          placeholderTextColor={hexToRGBA(dynamicColors.textColor, 0.5)}
          multiline
          maxLength={256}
        />
      </View>
    );
  }, [isEditMode, editDescription, dynamicColors.textColor]);

  // Get current colors for the color picker and header content
  const currentColors = useMemo(() => {
    if (customColors) {
      return customColors;
    }
    return {
      backgroundColor: profileColors.backgroundColor,
      textColor: profileColors.textColor,
    };
  }, [customColors, profileColors.backgroundColor, profileColors.textColor]);

  return (
    <>
      {isEditMode && (
        <ProfileColorPicker
          selectedColorId={selectedColorId}
          onColorSelect={handleColorSelect}
          defaultColors={extractedDefaultColors || {
            backgroundColor: '#000000',
            textColor: '#FFFFFF',
          }}
          textColor="#FFFFFF"
          backgroundColor="#000000"
          onSave={handleSaveProfile}
          onCancel={exitEditMode}
          isSaving={profileUpdateMutation.isPending}
          selectedColorType={selectedColorType}
          onColorTypeSelect={handleColorTypeSelect}
        />
      )}
      
      <UniversalHeader
        content={headerContent}
        actions={[]}
        customActions={customActions}
        showBackButton={showBackButton && !isEditMode}
        onBackPress={onBackPress}
        backgroundColor={currentColors.backgroundColor}
        textColor={currentColors.textColor}
        isLoading={forceLoading || (isProfileLoading && !profileData)}
        skeleton={skeleton}
        applySafeArea={applySafeArea && !isEditMode}
        style={{ 
          opacity: 1,
          ...(isEditMode && {
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            overflow: 'hidden',
            paddingTop: 20,
          })
        }}
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