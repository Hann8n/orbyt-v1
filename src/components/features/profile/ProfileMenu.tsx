import React, { useState, useCallback, useRef } from 'react';
import { BORDER_RADIUS } from '../../../utils/constants';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../utils/queryKeys';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Share,
  Platform,
  Alert,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon from '../../ui/Icon';
import KeyboardAwareFooter from '../../../utils/truesheet/KeyboardAwareFooter';
import AtprotoService from '../../../services/api/AtprotoService';
import { Colors } from '../../ui/UI';
import { hexToRGBA } from '../../../utils/formatting/colorUtils';
import VerticalListSheet, { VerticalListButton } from '../../ui/VerticalListSheet';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { safeDismiss, safePresent } from '../../../utils/truesheet/trueSheetUtils';
import { useAuth, useAccountManagement } from '../../../stores/userStore';
import { useProfileFlags } from '../../../stores/profileInteractionStore';

interface ProfileMenuProps {
  visible: boolean;
  onDismiss: () => void;
  handle: string;
  isOwnProfile?: boolean;
  onLogout?: (clearAllAccounts?: boolean) => Promise<void>;
  onSwitchAccount?: () => void;
  canMessage?: boolean | null;
  onMessagePress?: () => void;
}



const ProfileMenu: React.FC<ProfileMenuProps> = ({ 
  visible, 
  onDismiss, 
  handle,
  isOwnProfile = false,
  
  onLogout,
  onSwitchAccount,
  canMessage = null,
  onMessagePress
}) => {
  const queryClient = useQueryClient();
  const { signOut } = useAuth();
  const { removeAccount } = useAccountManagement();
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const insets = useSafeAreaInsets();
  
  // TrueSheet refs for proper stacking
  const submenuSheetRef = useRef<TrueSheet>(null);
  
  // Calculate footer height as constant: cancelContainer paddingTop (8) + button minHeight (44)
  const submenuFooterHeight = 8 + 44;

  // Get profile data to determine if it's the current user
  // This includes viewer.blocking, viewer.muted, and chat fields
  const { data: profile } = useQuery({
    queryKey: queryKeys.profiles.detail(handle),
    queryFn: () => AtprotoService.getProfile(handle),
    enabled: visible && !!handle,
  });

  // Store-backed flags for this profile
  const { flags, setFlags } = useProfileFlags(profile?.did, handle);

  // Use viewer fields from getProfile response instead of separate API calls
  // viewer.blocking is a string (URI) if blocking, null/undefined otherwise
  // viewer.muted is a boolean or undefined
  const isBlockedFromProfile = !!profile?.viewer?.blocking;
  const isMutedFromProfile = !!profile?.viewer?.muted;

  const isBlocked = flags?.isBlocked ?? isBlockedFromProfile;
  const isMuted = flags?.isMuted ?? isMutedFromProfile;

  // flags are derived; no syncing effects needed

  // Block/unblock handler
  const handleBlockToggle = useCallback(async () => {
    if (!profile?.did) return;

    try {
      setIsSubmitting(true);
      // do not optimistically set blocked; wait for confirmation/API
      
      if (isBlocked) {
        // Ensure submenu is closed
        safeDismiss('profile-menu-submenu');
        await AtprotoService.unblockUser(profile.did);
        // Invalidate profile query to refetch with updated viewer.blocking
        queryClient.invalidateQueries({ 
          queryKey: queryKeys.profiles.detail(handle),
          refetchType: 'active'
        });
        setFlags({ isBlocked: false });
        onDismiss();
      } else {
        // Ensure submenu is closed before showing confirmation alert
        safeDismiss('profile-menu-submenu');
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
                // Invalidate profile query to refetch with updated viewer.blocking
                queryClient.invalidateQueries({ 
          queryKey: queryKeys.profiles.detail(handle),
          refetchType: 'active'
        });
                setFlags({ isBlocked: true });
                onDismiss();
              }
            }
          ]
        );
      }
    } catch (error) {
      Alert.alert('error', 'failed to update block status. please try again.');
      // No optimistic update; nothing to rollback
    } finally {
      setIsSubmitting(false);
    }
  }, [profile?.did, isBlocked, onDismiss, queryClient, handle, setFlags]);

  // Mute/unmute handler
  const handleMuteToggle = useCallback(async () => {
    if (!profile?.did) return;

    try {
      setIsSubmitting(true);
      // optimistic update in store
      setFlags({ isMuted: !isMuted });
      
      if (isMuted) {
        await AtprotoService.unmuteUser(profile.did);
        // Invalidate profile query to refetch with updated viewer.muted
        queryClient.invalidateQueries({ 
          queryKey: queryKeys.profiles.detail(handle),
          refetchType: 'active'
        });
        setFlags({ isMuted: false });
      } else {
        Alert.alert(
          'mute user',
          'are you sure you want to mute this user? you will not see their posts in your timeline.',
          [
            {
              text: 'cancel',
              style: 'cancel'
            },
            {
              text: 'mute',
              style: 'destructive',
              onPress: async () => {
                await AtprotoService.muteUser(profile.did);
                // Invalidate profile query to refetch with updated viewer.muted
                queryClient.invalidateQueries({ 
          queryKey: queryKeys.profiles.detail(handle),
          refetchType: 'active'
        });
                setFlags({ isMuted: true });
                onDismiss();
              }
            }
          ]
        );
      }
    } catch (error) {
      Alert.alert('error', 'failed to update mute status. please try again.');
      // rollback optimistic update
      setFlags({ isMuted });
    } finally {
      setIsSubmitting(false);
    }
  }, [profile?.did, isMuted, onDismiss, queryClient, setFlags, handle]);

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
      Alert.alert('error', 'failed to submit report. please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [profile?.did, onDismiss]);

  // Report or Block handler - now presents submenu sheet using global API
  const handleReportOrBlock = useCallback(() => {
    safePresent('profile-menu-submenu');
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
    }
  }, [handle, onDismiss]);

  // Open on Bluesky handler
  const handleOpenOnBluesky = useCallback(async () => {
    try {
      const profileUrl = `https://bsky.app/profile/${handle}`;
      const canOpen = await Linking.canOpenURL(profileUrl);
      if (canOpen) {
        await Linking.openURL(profileUrl);
        onDismiss();
      } else {
        Alert.alert('error', 'unable to open profile. please check your internet connection.');
      }
    } catch (error) {
      Alert.alert('error', 'failed to open profile on bluesky.');
    }
  }, [handle, onDismiss]);

  // Switch account handler
  const handleSwitchAccount = useCallback(() => {
    onDismiss(); // Close the menu first
    if (onSwitchAccount) {
      onSwitchAccount(); // Open the account switcher
    }
  }, [onDismiss, onSwitchAccount]);



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
              // Clear all queries
              queryClient.clear();
              
              if (onLogout) {
                await onLogout(true); // Clear all accounts
              } else {
                // Use the user store to sign out
                await signOut(true); // Clear all accounts
              }
              
              onDismiss();
              // Note: The actual logout navigation should be handled by the parent component
            } catch (error) {
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
          id: 'switch',
          label: 'switch',
          icon: 'user-3',
          onPress: handleSwitchAccount,
          color: Colors.lightGray
        },
        {
          id: 'logout',
          label: 'log out',
          icon: 'logout',
          onPress: handleLogout,
          color: Colors.red
        }
      ];
    } else {
      const options = [];
      
      // Add message option if available
      if (canMessage === true && onMessagePress) {
        options.push({
          id: 'message',
          label: 'message',
          icon: 'inbox',
          onPress: () => {
            onDismiss();
            onMessagePress();
          },
          color: Colors.lightGray
        });
      }
      
      // Add other options
      options.push(
        {
          id: 'share',
          label: 'share',
          icon: 'share',
          onPress: handleShare,
          color: Colors.lightGray
        },
        {
          id: 'mute',
          label: isMuted ? 'unmute' : 'mute',
          icon: isMuted ? 'volume-2' : 'volume-x',
          onPress: handleMuteToggle,
          color: Colors.lightGray
        },
        {
          id: 'openOnBluesky',
          label: 'view on bluesky',
          icon: 'external-link',
          onPress: handleOpenOnBluesky,
          color: Colors.lightGray,
          rightIcon: <Icon name="outlink" size={20} color={Colors.lightGray} />
        },
        {
          id: 'reportOrBlock',
          label: 'report or block',
          icon: 'more-horizontal',
          onPress: handleReportOrBlock,
          color: Colors.lightGray
        }
      );
      
      return options;
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
      name="profile-menu"
    >
      {/* Main menu options */}
      <View style={styles.optionsContainer}>
        {menuOptions.map((option) => (
          <VerticalListButton
            key={option.id}
            label={option.label.charAt(0).toUpperCase() + option.label.slice(1)}
            onPress={option.onPress}
            disabled={isSubmitting}
            danger={option.id === 'logout'}
            rightIcon={'rightIcon' in option ? option.rightIcon : undefined}
          />
        ))}
      </View>

      {/* Submenu sheet for Report or Block - defined within parent sheet */}
      <TrueSheet
        ref={submenuSheetRef}
        name="profile-menu-submenu"
        detents={['auto']}
        backgroundColor={Colors.black}
        onDidDismiss={() => { /* no-op */ }}
        grabber={false}
        header={
          <View style={styles.headerContainer}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              Report or Block
            </Text>
            <Pressable 
              style={styles.closeButton} 
              onPress={() => safeDismiss('profile-menu-submenu')}
            >
              <Icon name="close" size={20} color={Colors.white} />
            </Pressable>
          </View>
        }
        footer={
          <KeyboardAwareFooter hideOnKeyboard={true} bottomPadding={insets.bottom} style={{ backgroundColor: Colors.black }}>
            <View style={[styles.cancelContainer, { backgroundColor: Colors.black }]}>
            <Pressable 
              style={styles.cancelButton} 
              onPress={() => safeDismiss('profile-menu-submenu')} 
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            </View>
          </KeyboardAwareFooter>
        }
      >
        <View style={[styles.submenuContent, { paddingBottom: submenuFooterHeight }]}>
          
          {/* Submenu options */}
          <View style={styles.optionsContainer}>
            <VerticalListButton
              label="Report Account"
              onPress={() => {
                safeDismiss('profile-menu-submenu');
                handleReport();
              }}
              disabled={isSubmitting}
            />
            <VerticalListButton
              label={isBlocked ? 'Unblock Account' : 'Block Account'}
              onPress={() => {
                safeDismiss('profile-menu-submenu');
                handleBlockToggle();
              }}
              disabled={isSubmitting}
            />
          </View>
        </View>
      </TrueSheet>
    </VerticalListSheet>
  );
};

const styles = StyleSheet.create({
  optionsContainer: {
    flexDirection: 'column',
    marginTop: 0,
  },
  option: {
    backgroundColor: hexToRGBA(Colors.gray, 0.12),
    borderRadius: BORDER_RADIUS.LARGE,
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderWidth: 0,
    borderColor: 'transparent'
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
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
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
    paddingTop: 8,
  },
  cancelButton: {
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.FULL,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
    borderColor: 'transparent',
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
