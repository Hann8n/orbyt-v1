import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../services/queryKeys';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  SafeAreaView,
  Share,
  Platform,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../../navigation/types';
import { BottomSheetModal, BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import Icon from '../../ui/Icon';
import AtprotoService from '../../../services/api/AtprotoService';
import ProfileCache from '../../../services/cache/ProfileCache';

interface ProfileMenuProps {
  visible: boolean;
  onDismiss: () => void;
  handle: string;
  isOwnProfile?: boolean;
  onLogout?: (clearAllAccounts?: boolean) => Promise<void>;
  onSwitchAccount?: () => void;
}

type ProfileMenuNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Settings'>;

const SCREEN_WIDTH = Dimensions.get('window').width;

const ProfileMenu: React.FC<ProfileMenuProps> = ({ 
  visible, 
  onDismiss, 
  handle,
  isOwnProfile = false,
  onLogout,
  onSwitchAccount
}) => {
  const navigation = useNavigation<ProfileMenuNavigationProp>();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isBlocked, setIsBlocked] = useState<boolean>(false);

  // Bottom sheet ref and snap points
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['50%'], []);

  // Get profile data to determine if it's the current user
  const { data: profile } = useQuery({
    queryKey: queryKeys.profiles.detail(handle),
    queryFn: () => AtprotoService.getProfile(handle),
    enabled: visible && !!handle,
  });

  // Check block status for non-own profiles
  const { data: blockStatus = false } = useQuery({
    queryKey: queryKeys.blocks.status(profile?.did || ''),
    queryFn: () => AtprotoService.isBlocked(profile?.did || ''),
    enabled: visible && !!profile?.did && !isOwnProfile,
    initialData: false
  });

  // Update isBlocked state when blockStatus changes
  useEffect(() => {
    setIsBlocked(blockStatus);
  }, [blockStatus]);

  // Handle bottom sheet visibility
  useEffect(() => {
    if (visible) {
      bottomSheetRef.current?.present();
    } else {
      bottomSheetRef.current?.dismiss();
    }
  }, [visible]);

  // Block/unblock handler
  const handleBlockToggle = useCallback(async () => {
    if (!profile?.did) return;

    try {
      setIsSubmitting(true);
      
      if (isBlocked) {
        await AtprotoService.unblockUser(profile.did);
        queryClient.invalidateQueries({ queryKey: queryKeys.blocks.status(profile.did) });
        setIsBlocked(false);
      } else {
        Alert.alert(
          'Block User',
          'Are you sure you want to block this user? They will not be able to see your posts or interact with you.',
          [
            {
              text: 'Cancel',
              style: 'cancel'
            },
            {
              text: 'Block',
              style: 'destructive',
              onPress: async () => {
                await AtprotoService.blockUser(profile.did);
                queryClient.invalidateQueries({ queryKey: queryKeys.blocks.status(profile.did) });
                setIsBlocked(true);
                onDismiss();
              }
            }
          ]
        );
      }
    } catch (error) {
      console.error('Error toggling block status:', error);
      Alert.alert('Error', 'Failed to update block status. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [profile?.did, isBlocked, onDismiss, queryClient]);

  // Report user handler
  const handleReport = useCallback(() => {
    if (!profile?.did) return;

    Alert.alert(
      'Report User',
      'Please select a reason for reporting this user:',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Spam',
          onPress: () => reportUser('spam')
        },
        {
          text: 'Harmful Content',
          onPress: () => reportUser('violation')
        },
        {
          text: 'Misleading',
          onPress: () => reportUser('misleading')
        },
        {
          text: 'Sexual Content',
          onPress: () => reportUser('sexual')
        },
        {
          text: 'Rude/Offensive',
          onPress: () => reportUser('rude')
        },
        {
          text: 'Other',
          onPress: () => reportUser('other')
        }
      ]
    );
  }, [profile?.did]);

  // Helper function to report user
  const reportUser = useCallback(async (
    reasonType: 'spam' | 'violation' | 'misleading' | 'sexual' | 'rude' | 'other'
  ) => {
    if (!profile?.did) return;

    setIsSubmitting(true);
    try {
      const success = await AtprotoService.reportContent(profile.did, reasonType);
      if (success) {
        Alert.alert('Thank you', 'This user has been reported for review.');
        onDismiss();
      } else {
        Alert.alert('Error', 'Failed to submit report. Please try again.');
      }
    } catch (error) {
      console.error('Error reporting user:', error);
      Alert.alert('Error', 'Failed to submit report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [profile?.did, onDismiss]);

  // Share profile handler
  const handleShare = useCallback(async () => {
    try {
      const shareUrl = `https://bsky.app/profile/${handle}`;
      
      await Share.share({
        message: Platform.OS === 'ios' ? '' : shareUrl,
        url: Platform.OS === 'ios' ? shareUrl : '',
        title: `Check out @${handle} on Bluesky`,
      });
      
      onDismiss();
    } catch (error) {
      console.error('Error sharing profile:', error);
    }
  }, [handle, onDismiss]);

  // Switch account handler
  const handleSwitchAccount = useCallback(() => {
    onDismiss(); // Close the menu first
    if (onSwitchAccount) {
      onSwitchAccount(); // Open the account switcher
    }
  }, [onDismiss, onSwitchAccount]);

  // Settings handler
  const handleSettings = useCallback(() => {
    onDismiss(); // Close the menu first
    navigation.navigate({ name: 'Settings', params: {} });
  }, [onDismiss, navigation]);

  // Logout handler
  const handleLogout = useCallback(() => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            setIsSubmitting(true);
            try {
              if (onLogout) {
                await onLogout(false); // Don't clear all accounts by default
              } else {
                // Fallback to direct logout if no callback provided
                await AtprotoService.logout(false);
              }
              // Clear all queries
              queryClient.clear();
              onDismiss();
              // Note: The actual logout navigation should be handled by the parent component
            } catch (error) {
              console.error('Error during logout:', error);
              Alert.alert('Error', 'Failed to log out. Please try again.');
            } finally {
              setIsSubmitting(false);
            }
          }
        }
      ]
    );
  }, [onDismiss, queryClient, onLogout]);

  // Backdrop component
  const renderBackdrop = useCallback(
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

  // Determine menu options based on profile type
  const getMenuOptions = () => {
    if (isOwnProfile) {
      return [
        {
          id: 'share',
          label: 'Share',
          icon: 'link',
          onPress: handleShare,
          color: '#fff'
        },
        {
          id: 'insights',
          label: 'Insights',
          icon: 'chart',
          onPress: () => {
            onDismiss();
            navigation.navigate({ name: 'Insights', params: {} });
          },
          color: '#fff'
        },
        {
          id: 'switch',
          label: 'Switch',
          icon: 'user',
          onPress: handleSwitchAccount,
          color: '#fff'
        },
        {
          id: 'settings',
          label: 'Settings',
          icon: 'sliders-2',
          onPress: handleSettings,
          color: '#fff'
        }
      ];
    } else {
      return [
        {
          id: 'share',
          label: 'Share',
          icon: 'link',
          onPress: handleShare,
          color: '#fff'
        },
        {
          id: 'mute',
          label: 'Mute',
          icon: 'volume',
          onPress: () => {
            Alert.alert('Mute', 'Mute functionality will be implemented in a future update.');
            onDismiss();
          },
          color: '#fff'
        },
        {
          id: 'block',
          label: isBlocked ? 'Unblock' : 'Block',
          icon: 'user-x',
          onPress: handleBlockToggle,
          color: '#fff'
        },
        {
          id: 'report',
          label: 'Report',
          icon: 'warning-box',
          onPress: handleReport,
          color: '#fff',
          buttonColor: '#FE4359'
        }
      ];
    }
  };

  const menuOptions = getMenuOptions();

  // Calculate dynamic spacing based on screen width and number of options
  const calculateSpacing = () => {
    const optionWidth = 64; // Width of each option button
    const totalOptionsWidth = menuOptions.length * optionWidth;
    const availableWidth = SCREEN_WIDTH - 60; // Account for horizontal padding
    const remainingSpace = availableWidth - totalOptionsWidth;
    const spacing = Math.max(20, remainingSpace / (menuOptions.length + 1)); // Minimum 20px spacing
    return spacing;
  };

  const dynamicSpacing = calculateSpacing();

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
        {/* Options */}
        <View style={[styles.optionsContainer, { gap: dynamicSpacing }]}>
          {menuOptions.map((option) => (
            <View key={option.id} style={styles.optionWrapper}>
              <TouchableOpacity 
                style={[
                  styles.option,
                  option.buttonColor ? { backgroundColor: option.buttonColor } : null
                ]} 
                onPress={option.onPress}
                activeOpacity={0.7}
                disabled={isSubmitting}
              >
                <Icon 
                  name={option.icon} 
                  size={32} 
                  color={option.color} 
                />
              </TouchableOpacity>
              <Text style={styles.optionText}>{option.label}</Text>
            </View>
          ))}
        </View>
        <View style={styles.cancelContainer}>
          <TouchableOpacity 
            style={styles.cancelButton} 
            onPress={onDismiss} 
            activeOpacity={0.7}
            disabled={isSubmitting}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
};

const styles = StyleSheet.create({
  bottomSheetBackground: {
    backgroundColor: '#000',
    borderTopWidth: 0.5,
    borderTopColor: '#333',
    // Square top corners - no border radius
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  handleIndicator: {
    backgroundColor: '#666',
    width: 40,
    height: 5,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 20 : 30,
  },
  optionsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginTop: 0,
  },
  optionWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  option: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#333',
  },
  cancelContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  cancelButton: {
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: 'Firma-SemiBold',
  },
  optionText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
    fontFamily: 'Firma-SemiBold',
  },
});

export default ProfileMenu;
