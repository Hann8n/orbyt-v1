import React, { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { View, Text, StyleSheet, Share, Platform, Alert, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon from '../../ui/Icon';
import KeyboardAwareFooter from '../../../utils/components/truesheet/KeyboardAwareFooter';
import { Colors } from '../../../theme';
import CloseButton from '../../ui/CloseButton';
import CancelButton from '../../ui/CancelButton';
import VerticalListSheet, { VerticalListButton } from '../../ui/VerticalListSheet';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import {
  useMeasuredFooterHeight,
  FOOTER_BOTTOM_PADDING_MIN,
} from '../../../utils/components/truesheet';
import { useAuth } from '../../../stores/userStore';
import {
  useProfile,
  useProfileByDid,
  useBlockMutation,
  useMuteMutation,
} from '../../../services/data/ProfileService';
import AtprotoService from '../../../services/api/AtprotoService';
import type { ProfileAssociatedChat } from '@atproto/api/dist/client/types/app/bsky/actor/defs';

interface ProfileMenuProps {
  visible: boolean;
  onDismiss: () => void;
  handle: string;
  did?: string; // DID from the profile being viewed (required for correct sharing)
  isOwnProfile?: boolean;
  onLogout?: (clearAllAccounts?: boolean) => Promise<void>;
  onSwitchAccount?: () => void;
  chatSettings?: ProfileAssociatedChat;
  /** Whether the viewer follows this profile (for allowIncoming 'following' check) */
  viewerFollowing?: boolean;
  onMessagePress?: () => void;
}

const ProfileMenu: React.FC<ProfileMenuProps> = ({
  visible,
  onDismiss,
  handle,
  did,
  isOwnProfile = false,

  onLogout,
  onSwitchAccount,
  chatSettings,
  viewerFollowing = false,
  onMessagePress,
}) => {
  const queryClient = useQueryClient();
  const { signOut } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const insets = useSafeAreaInsets();

  // TrueSheet refs for proper stacking
  const submenuSheetRef = useRef<TrueSheet>(null);
  const submenuFooterBottomPadding = Math.max(insets.bottom, FOOTER_BOTTOM_PADDING_MIN);
  const [submenuContentBottomPadding, wrapSubmenuFooter] = useMeasuredFooterHeight(8 + 44);

  // Get profile data - prefer useProfileByDid if DID is provided (more reliable for handle.invalid cases)
  // Otherwise fallback to useProfile for backwards compatibility
  const { data: profileByDid } = useProfileByDid(visible && did ? did : null);
  const { data: profileByHandle } = useProfile(visible && !did && handle ? handle : null);
  const profile = profileByDid || profileByHandle;

  // Mutations for block/unblock and mute/unmute
  const blockMutation = useBlockMutation();
  const muteMutation = useMuteMutation();

  // Use moderation flags directly from ProfileView viewer fields
  const isBlocked = !!(profile?.viewer?.blocking || profile?.viewer?.blockingByList);
  const isBlockedByList = !!profile?.viewer?.blockingByList;
  const isMuted = profile?.viewer?.muted ?? false;

  // Can message: profile allows incoming DMs and viewer is allowed (allowIncoming: all | following)
  const canMessage =
    !!chatSettings &&
    chatSettings.allowIncoming !== 'none' &&
    (chatSettings.allowIncoming !== 'following' || viewerFollowing) &&
    !isBlocked;

  // Block/unblock handler
  const handleBlockToggle = useCallback(() => {
    if (!profile?.did || !profile?.handle) return;
    if (blockMutation.isPending) return; // Prevent duplicate calls

    // If blocked by list, don't allow unblocking (user must unsubscribe from list)
    if (isBlockedByList) {
      return;
    }

    if (isBlocked) {
      // Ensure submenu is closed
      submenuSheetRef.current?.dismiss().catch(() => {});
      blockMutation.mutate({
        did: profile.did,
        handle: profile.handle,
        isBlocked: false,
      });
      onDismiss();
    } else {
      // Ensure submenu is closed before showing confirmation alert
      submenuSheetRef.current?.dismiss().catch(() => {});
      Alert.alert(
        'block user',
        'are you sure you want to block this user? they will not be able to see your posts or interact with you.',
        [
          {
            text: 'cancel',
            style: 'cancel',
          },
          {
            text: 'block',
            style: 'destructive',
            onPress: () => {
              blockMutation.mutate({
                did: profile.did,
                handle: profile.handle,
                isBlocked: true,
              });
              onDismiss();
            },
          },
        ]
      );
    }
  }, [profile?.did, profile?.handle, isBlocked, isBlockedByList, onDismiss, blockMutation]);

  // Mute/unmute handler
  const handleMuteToggle = useCallback(() => {
    if (!profile?.did || !profile?.handle) return;
    if (muteMutation.isPending) return; // Prevent duplicate calls

    if (isMuted) {
      muteMutation.mutate({
        did: profile.did,
        handle: profile.handle,
        isMuted: false,
      });
    } else {
      Alert.alert(
        'mute user',
        'are you sure you want to mute this user? you will not see their posts in your timeline.',
        [
          {
            text: 'cancel',
            style: 'cancel',
          },
          {
            text: 'mute',
            style: 'destructive',
            onPress: () => {
              muteMutation.mutate({
                did: profile.did,
                handle: profile.handle,
                isMuted: true,
              });
              onDismiss();
            },
          },
        ]
      );
    }
  }, [profile?.did, profile?.handle, isMuted, onDismiss, muteMutation]);

  // Helper function to report account
  const reportAccount = useCallback(
    async (reasonType: 'spam' | 'violation' | 'misleading' | 'sexual' | 'rude' | 'other') => {
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
      } catch (_error) {
        Alert.alert('error', 'failed to submit report. please try again.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [profile?.did, onDismiss]
  );

  // Report handler
  const handleReport = useCallback(async () => {
    if (!profile?.did) return;

    Alert.alert('report account', 'please select a reason for reporting this account:', [
      {
        text: 'cancel',
        style: 'cancel',
      },
      {
        text: 'spam',
        onPress: () => reportAccount('spam'),
      },
      {
        text: 'harmful content',
        onPress: () => reportAccount('violation'),
      },
      {
        text: 'misleading',
        onPress: () => reportAccount('misleading'),
      },
      {
        text: 'sexual content',
        onPress: () => reportAccount('sexual'),
      },
      {
        text: 'rude/offensive',
        onPress: () => reportAccount('rude'),
      },
      {
        text: 'other',
        onPress: () => reportAccount('other'),
      },
    ]);
  }, [profile?.did, reportAccount]);

  // Report or Block handler - now presents submenu sheet using global API
  const handleReportOrBlock = useCallback(() => {
    submenuSheetRef.current?.present().catch(() => {});
  }, []);

  // Share handler
  const handleShare = useCallback(async () => {
    try {
      // Use DID prop directly (from profile screen) - this is the correct DID for the profile being viewed
      // Use DID if handle ends with .invalid, otherwise use handle
      const identifier = handle && !handle.endsWith('.invalid') ? handle : did;
      if (!identifier) return;

      const profileUrl = `https://getorbyt.com/@${identifier}`;

      await Share.share({
        message: Platform.OS === 'ios' ? '' : profileUrl,
        url: Platform.OS === 'ios' ? profileUrl : '',
        title: `check out @${handle} on bluesky`,
      });

      onDismiss();
    } catch (_error: unknown) {
      // ignore
    }
  }, [handle, did, onDismiss]);

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
    } catch (_error) {
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
    Alert.alert('log out', 'are you sure you want to log out?', [
      {
        text: 'cancel',
        style: 'cancel',
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
          } catch (_error) {
            Alert.alert('error', 'failed to log out. please try again.');
          } finally {
            setIsSubmitting(false);
          }
        },
      },
    ]);
  }, [onDismiss, queryClient, onLogout, signOut]);

  // Determine menu options based on profile type
  const getMenuOptions = () => {
    if (isOwnProfile) {
      return [
        {
          id: 'share',
          label: 'share',
          icon: 'share',
          onPress: handleShare,
          color: Colors.neutral[200],
        },
        {
          id: 'switch',
          label: 'switch',
          icon: 'user-3',
          onPress: handleSwitchAccount,
          color: Colors.neutral[200],
        },
        {
          id: 'logout',
          label: 'log out',
          icon: 'logout',
          onPress: handleLogout,
          color: Colors.coral[500],
        },
      ];
    } else {
      const options = [];

      if (canMessage && did && onMessagePress) {
        options.push({
          id: 'message',
          label: 'message',
          icon: 'inbox',
          onPress: () => {
            onDismiss();
            onMessagePress();
          },
          color: Colors.neutral[200],
        });
      }

      options.push(
        {
          id: 'share',
          label: 'share',
          icon: 'share',
          onPress: handleShare,
          color: Colors.neutral[200],
        },
        {
          id: 'mute',
          label: isMuted ? 'unmute' : 'mute',
          icon: isMuted ? 'volume-2' : 'volume-x',
          onPress: handleMuteToggle,
          color: Colors.neutral[200],
        },
        {
          id: 'openOnBluesky',
          label: 'view on bluesky',
          icon: 'external-link',
          onPress: handleOpenOnBluesky,
          color: Colors.neutral[200],
          rightIcon: <Icon name="outlink" size={20} color={Colors.neutral[200]} />,
        },
        {
          id: 'reportOrBlock',
          label: 'report or block',
          icon: 'more-horizontal',
          onPress: handleReportOrBlock,
          color: Colors.neutral[200],
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
      detents={['auto']}
    >
      {/* Main menu options */}
      <View style={styles.optionsContainer}>
        {menuOptions.map(option => (
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
        onDidDismiss={() => {
          /* no-op */
        }}
        grabber={false}
        header={
          <View style={styles.headerContainer}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              Report or Block
            </Text>
            <CloseButton
              onPress={() => {
                submenuSheetRef.current?.dismiss().catch(() => {});
              }}
            />
          </View>
        }
        footer={wrapSubmenuFooter(
          <KeyboardAwareFooter
            hideOnKeyboard={true}
            bottomPadding={submenuFooterBottomPadding}
            style={{ backgroundColor: Colors.black }}
          >
            <View style={[styles.cancelContainer, { backgroundColor: Colors.black }]}>
              <CancelButton
                onPress={() => {
                  submenuSheetRef.current?.dismiss().catch(() => {});
                }}
              />
            </View>
          </KeyboardAwareFooter>
        )}
      >
        <View style={[styles.submenuContent, { paddingBottom: submenuContentBottomPadding }]}>
          {/* Submenu options */}
          <View style={styles.optionsContainer}>
            <VerticalListButton
              label="Report Account"
              onPress={() => {
                submenuSheetRef.current?.dismiss().catch(() => {});
                handleReport();
              }}
              disabled={isSubmitting}
            />
            <VerticalListButton
              label={isBlocked ? 'Unblock Account' : 'Block Account'}
              onPress={() => {
                submenuSheetRef.current?.dismiss().catch(() => {});
                handleBlockToggle();
              }}
              disabled={isSubmitting || isBlockedByList}
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
    color: Colors.neutral[50],
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'left',
    fontFamily: 'Figtree-Bold',
    flex: 1,
  },
  cancelContainer: {
    alignItems: 'center',
    paddingTop: 8,
  },
});

export default ProfileMenu;
