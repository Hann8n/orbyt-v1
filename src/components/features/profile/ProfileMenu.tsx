import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createQueryKeys } from '../../../services/FeedService';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Share,
  Platform,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../../navigation/types';
import Icon, { ShareIcon } from '../../ui/Icon';
import AtprotoService from '../../../services/api/AtprotoService';
import ProfileCache from '../../../services/cache/ProfileCache';
import { Colors } from '../../ui/UI';
import VerticalListSheet from '../../ui/VerticalListSheet';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { useAuth, useAccountManagement } from '../../../stores/userStore';

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
  const { signOut } = useAuth();
  const { removeAccount } = useAccountManagement();
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isBlocked, setIsBlocked] = useState<boolean>(false);
  const insets = useSafeAreaInsets();
  
  // TrueSheet refs for proper stacking
  const submenuSheetRef = useRef<TrueSheet>(null);

  // Get profile data to determine if it's the current user
  const { data: profile } = useQuery({
    queryKey: createQueryKeys.profiles.detail(handle),
    queryFn: () => AtprotoService.getProfile(handle),
    enabled: visible && !!handle,
  });

  // Check block status for non-own profiles
  const { data: blockStatus = false } = useQuery({
    queryKey: createQueryKeys.blocks.status(profile?.did || ''),
    queryFn: () => AtprotoService.isBlocked(profile?.did || ''),
    enabled: visible && !!profile?.did && !isOwnProfile,
    initialData: false
  });

  // Update isBlocked state when blockStatus changes
  useEffect(() => {
    setIsBlocked(blockStatus);
  }, [blockStatus]);

  // Block/unblock handler
  const handleBlockToggle = useCallback(async () => {
    if (!profile?.did) return;

    try {
      setIsSubmitting(true);
      
      if (isBlocked) {
        await AtprotoService.unblockUser(profile.did);
        queryClient.invalidateQueries({ queryKey: createQueryKeys.blocks.status(profile.did) });
        setIsBlocked(false);
      } else {
        Alert.alert(
          'block user',
          'are you sure you want to block this user? they will not be able to see your posts or interact with you.',
          [
            {
              text: 'cancel',
              style: 'cancel'
            },
            {
              text: 'block',
              style: 'destructive',
              onPress: async () => {
                await AtprotoService.blockUser(profile.did);
                queryClient.invalidateQueries({ queryKey: createQueryKeys.blocks.status(profile.did) });
                setIsBlocked(true);
                onDismiss();
              }
            }
          ]
        );
      }
    } catch (error) {
      console.error('Error toggling block status:', error);
      Alert.alert('error', 'failed to update block status. please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [profile?.did, isBlocked, onDismiss, queryClient]);

  // Report handler
  const handleReport = useCallback(async () => {
    if (!profile?.did) return;

    Alert.alert(
      'report account',
      'please select a reason for reporting this account:',
      [
        {
          text: 'cancel',
          style: 'cancel'
        },
        {
          text: 'spam',
          onPress: () => reportAccount('spam')
        },
        {
          text: 'harmful content',
          onPress: () => reportAccount('violation')
        },
        {
          text: 'misleading',
          onPress: () => reportAccount('misleading')
        },
        {
          text: 'sexual content',
          onPress: () => reportAccount('sexual')
        },
        {
          text: 'rude/offensive',
          onPress: () => reportAccount('rude')
        },
        {
          text: 'other',
          onPress: () => reportAccount('other')
        }
      ]
    );
  }, [profile?.did]);

  // Helper function to report account
  const reportAccount = useCallback(async (
    reasonType: 'spam' | 'violation' | 'misleading' | 'sexual' | 'rude' | 'other'
  ) => {
    if (!profile?.did) return;

    setIsSubmitting(true);
    try {
      const success = await AtprotoService.reportContent(profile.did, reasonType);
      if (success) {
        Alert.alert('thank you', 'this account has been reported for review.');
        onDismiss();
      } else {
        Alert.alert('error', 'failed to submit report. please try again.');
      }
    } catch (error) {
      console.error('Error reporting account:', error);
      Alert.alert('error', 'failed to submit report. please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [profile?.did, onDismiss]);

  // Report or Block handler - now presents submenu sheet
  const handleReportOrBlock = useCallback(() => {
    submenuSheetRef.current?.present();
  }, []);

  // Share handler
  const handleShare = useCallback(async () => {
    try {
      const profileUrl = `https://bsky.app/profile/${handle}`;
      
      await Share.share({
        message: Platform.OS === 'ios' ? '' : profileUrl,
        url: Platform.OS === 'ios' ? profileUrl : '',
        title: `check out @${handle} on bluesky`,
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
  const handleLogout = useCallback(async () => {
    Alert.alert(
      'log out',
      'are you sure you want to log out?',
      [
        {
          text: 'cancel',
          style: 'cancel'
        },
        {
          text: 'log out',
          style: 'destructive',
          onPress: async () => {
            setIsSubmitting(true);
            try {
              // Remove the current account using userStore
              // The userStore will handle getting the active account and removing it
              await signOut(true); // Clear all accounts
              
              if (onLogout) {
                await onLogout(false); // Don't clear all accounts since we already removed the current one
              } else {
                // Use the user store to sign out
                await signOut(false);
              }
              // Clear all queries
              queryClient.clear();
              onDismiss();
              // Note: The actual logout navigation should be handled by the parent component
            } catch (error) {
              console.error('Error during logout:', error);
              Alert.alert('error', 'failed to log out. please try again.');
            } finally {
              setIsSubmitting(false);
            }
          }
        }
      ]
    );
  }, [onDismiss, queryClient, onLogout, signOut, removeAccount]);

  // Determine menu options based on profile type
  const getMenuOptions = () => {
    if (isOwnProfile) {
      return [
        {
          id: 'share',
          label: 'share',
          icon: 'share',
          onPress: handleShare,
          color: Colors.lightGray
        },
        {
          id: 'insights',
          label: 'insights',
          icon: 'insights',
          onPress: () => {
            onDismiss();
            navigation.navigate({ name: 'Insights', params: {} });
          },
          color: Colors.lightGray
        },
        {
          id: 'switch',
          label: 'switch',
          icon: 'user-3',
          onPress: handleSwitchAccount,
          color: Colors.lightGray
        },
        {
          id: 'settings',
          label: 'settings',
          icon: 'settings',
          onPress: handleSettings,
          color: Colors.lightGray
        }
      ];
    } else {
      return [
        {
          id: 'share',
          label: 'share',
          icon: 'share',
          onPress: handleShare,
          color: Colors.lightGray
        },
        {
          id: 'mute',
          label: 'mute',
          icon: 'volume-x',
          onPress: () => {
            Alert.alert('mute', 'mute functionality will be implemented in a future update.');
            onDismiss();
          },
          color: Colors.lightGray
        },
        {
          id: 'reportOrBlock',
          label: 'report or block',
          icon: 'more-horizontal',
          onPress: handleReportOrBlock,
          color: Colors.lightGray
        }
      ];
    }
  };

  const menuOptions = getMenuOptions();

  return (
    <VerticalListSheet
      visible={visible}
      onDismiss={onDismiss}
      title={handle}
      showCancelButton={true}
      cancelButtonText="Cancel"
    >
      {/* Main menu options */}
      <View style={styles.optionsContainer}>
        {menuOptions.map((option) => (
          <TouchableOpacity 
            key={option.id}
            style={styles.option}
            onPress={option.onPress}
            activeOpacity={0.7}
            disabled={isSubmitting}
          >
            <Text style={styles.optionText}>{option.label.charAt(0).toUpperCase() + option.label.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Submenu sheet for Report or Block - defined within parent sheet */}
      <TrueSheet
        ref={submenuSheetRef}
        sizes={['auto']}
        backgroundColor={Colors.black}
        onDismiss={() => submenuSheetRef.current?.dismiss()}
        cornerRadius={25}
        grabber={false}
        FooterComponent={
          <View style={[styles.cancelContainer, { paddingBottom: insets.bottom }]}>
            <TouchableOpacity 
              style={styles.cancelButton} 
              onPress={() => submenuSheetRef.current?.dismiss()} 
              activeOpacity={0.7}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        }
      >
        <View style={styles.submenuContent}>
          {/* Header with title and close button */}
          <View style={styles.headerContainer}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              Report or Block
            </Text>
            <TouchableOpacity 
              style={styles.closeButton} 
              onPress={() => submenuSheetRef.current?.dismiss()}
              activeOpacity={0.7}
            >
              <Icon name="close" size={20} color={Colors.white} />
            </TouchableOpacity>
          </View>
          
          {/* Submenu options */}
          <View style={styles.optionsContainer}>
            <TouchableOpacity 
              style={[styles.option, styles.submenuOption]}
              onPress={() => {
                submenuSheetRef.current?.dismiss();
                handleReport();
              }}
              activeOpacity={0.7}
              disabled={isSubmitting}
            >
              <Text style={[styles.optionText, styles.submenuText]}>Report Account</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.option, styles.submenuOption]}
              onPress={() => {
                submenuSheetRef.current?.dismiss();
                handleBlockToggle();
              }}
              activeOpacity={0.7}
              disabled={isSubmitting}
            >
              <Text style={[styles.optionText, styles.submenuText]}>{isBlocked ? 'Unblock Account' : 'Block Account'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TrueSheet>
    </VerticalListSheet>
  );
};

const styles = StyleSheet.create({
  optionsContainer: {
    flexDirection: 'column',
    gap: 12,
    marginTop: 0,
  },
  option: {
    backgroundColor: Colors.darkGray,
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  optionText: {
    color: Colors.lightGray,
    fontSize: 18,
    fontWeight: '500',
    textAlign: 'left',
    fontFamily: 'Firma-Medium',
    paddingLeft: 8,
  },
  submenuText: {
    color: Colors.white,
    textAlign: 'center',
    paddingLeft: 0,
    fontFamily: 'Firma-SemiBold',
  },
  submenuOption: {
    backgroundColor: Colors.darkRed,
  },
  submenuContent: {
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
  headerTitle: {
    color: Colors.white,
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'left',
    fontFamily: 'Firma-Bold',
    flex: 1,
  },
  closeButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelContainer: {
    alignItems: 'center',
    paddingTop: 20,
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

export default ProfileMenu;
