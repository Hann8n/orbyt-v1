import React, { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { View, Text, StyleSheet, Share, Platform, Alert, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon from '../../ui/Icon';
import { Colors } from '../../../theme';
import CloseButton from '../../ui/CloseButton';
import CancelButton from '../../ui/CancelButton';
import VerticalListSheet, { VerticalListButton } from '../../ui/VerticalListSheet';
import {
  AppTrueSheet,
  CONTENT_TO_FOOTER_GAP_REDUCTION,
  SheetActionFooter,
  FOOTER_TOP_PADDING_DEFAULT,
  useMeasuredFooterHeight,
  getFooterBottomPadding,
  SHEET_STYLES,
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
import { useSheetPresentation } from '../../../hooks';

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
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { signOut } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const insets = useSafeAreaInsets();

  useSheetPresentation(visible, 'profile-menu-sheet');

  // TrueSheet refs for proper stacking (submenu uses AppTrueSheet with ref)
  const submenuSheetRef = useRef<import('@lodev09/react-native-true-sheet').TrueSheet>(null);
  const submenuFooterBottomPadding = getFooterBottomPadding(insets.bottom);
  const submenuFooterTopPadding = FOOTER_TOP_PADDING_DEFAULT;
  const [submenuContentBottomPadding, wrapSubmenuFooter] = useMeasuredFooterHeight(
    submenuFooterTopPadding + 44 + submenuFooterBottomPadding
  );

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
      Alert.alert(t('alerts.blockUser'), t('alerts.blockUserConfirm'), [
        {
          text: t('common.cancel'),
          style: 'cancel',
        },
        {
          text: t('alerts.block'),
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
      ]);
    }
  }, [profile?.did, profile?.handle, isBlocked, isBlockedByList, onDismiss, blockMutation, t]);

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
      Alert.alert(t('alerts.muteUser'), t('alerts.muteUserConfirm'), [
        {
          text: t('common.cancel'),
          style: 'cancel',
        },
        {
          text: t('alerts.mute'),
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
      ]);
    }
  }, [profile?.did, profile?.handle, isMuted, onDismiss, muteMutation, t]);

  // Helper function to report account
  const reportAccount = useCallback(
    async (reasonType: 'spam' | 'violation' | 'misleading' | 'sexual' | 'rude' | 'other') => {
      if (!profile?.did) return;

      setIsSubmitting(true);
      try {
        const success = await AtprotoService.reportContent(profile.did, reasonType);
        if (success) {
          Alert.alert(t('common.thankYou'), t('alerts.accountReported'));
          onDismiss();
        } else {
          Alert.alert(t('common.error'), t('alerts.failedToSubmitReport'));
        }
      } catch (_error) {
        Alert.alert(t('common.error'), t('alerts.failedToSubmitReport'));
      } finally {
        setIsSubmitting(false);
      }
    },
    [profile?.did, onDismiss, t]
  );

  // Report handler
  const handleReport = useCallback(async () => {
    if (!profile?.did) return;

    Alert.alert(t('alerts.reportAccount'), t('alerts.reportReasonPrompt'), [
      {
        text: t('common.cancel'),
        style: 'cancel',
      },
      {
        text: t('alerts.spam'),
        onPress: () => reportAccount('spam'),
      },
      {
        text: t('alerts.harmfulContent'),
        onPress: () => reportAccount('violation'),
      },
      {
        text: t('alerts.misleading'),
        onPress: () => reportAccount('misleading'),
      },
      {
        text: t('alerts.sexualContent'),
        onPress: () => reportAccount('sexual'),
      },
      {
        text: t('alerts.rudeOffensive'),
        onPress: () => reportAccount('rude'),
      },
      {
        text: t('alerts.other'),
        onPress: () => reportAccount('other'),
      },
    ]);
  }, [profile?.did, reportAccount, t]);

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
        title: t('profile.checkOutOnBluesky', { handle }),
      });

      onDismiss();
    } catch (_error: unknown) {
      // ignore
    }
  }, [handle, did, onDismiss, t]);

  // Open on Bluesky handler
  const handleOpenOnBluesky = useCallback(async () => {
    try {
      const profileUrl = `https://bsky.app/profile/${handle}`;
      const canOpen = await Linking.canOpenURL(profileUrl);
      if (canOpen) {
        await Linking.openURL(profileUrl);
        onDismiss();
      } else {
        Alert.alert(t('common.error'), t('alerts.unableToOpenProfile'));
      }
    } catch (_error) {
      Alert.alert(t('common.error'), t('alerts.failedToOpenBluesky'));
    }
  }, [handle, onDismiss, t]);

  // Switch account handler
  const handleSwitchAccount = useCallback(() => {
    onDismiss(); // Close the menu first
    if (onSwitchAccount) {
      onSwitchAccount(); // Open the account switcher
    }
  }, [onDismiss, onSwitchAccount]);

  // Logout handler
  const handleLogout = useCallback(async () => {
    Alert.alert(t('alerts.logOut'), t('alerts.logOutConfirm'), [
      {
        text: t('common.cancel'),
        style: 'cancel',
      },
      {
        text: t('profile.logOut'),
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
            Alert.alert(t('common.error'), t('errors.logoutFailed'));
          } finally {
            setIsSubmitting(false);
          }
        },
      },
    ]);
  }, [onDismiss, queryClient, onLogout, signOut, t]);

  // Determine menu options based on profile type
  const getMenuOptions = () => {
    if (isOwnProfile) {
      return [
        { id: 'share', label: t('profile.share'), onPress: handleShare },
        { id: 'switch', label: t('profile.switch'), onPress: handleSwitchAccount },
        { id: 'logout', label: t('profile.logOut'), onPress: handleLogout, danger: true },
      ];
    } else {
      const options = [];

      if (canMessage && did && onMessagePress) {
        options.push({
          id: 'message',
          label: t('profile.message'),
          onPress: () => {
            onDismiss();
            onMessagePress();
          },
        });
      }

      options.push(
        { id: 'share', label: t('profile.share'), onPress: handleShare },
        {
          id: 'mute',
          label: isMuted ? t('profile.unmute') : t('profile.mute'),
          onPress: handleMuteToggle,
        },
        {
          id: 'openOnBluesky',
          label: t('profile.viewOnBluesky'),
          onPress: handleOpenOnBluesky,
          rightIcon: <Icon name="outlink" size={24} color={Colors.neutral[200]} />,
        },
        { id: 'reportOrBlock', label: t('profile.reportOrBlock'), onPress: handleReportOrBlock }
      );

      return options;
    }
  };

  const menuOptions = getMenuOptions();

  return (
    <VerticalListSheet
      name="profile-menu-sheet"
      onDismiss={onDismiss}
      title={handle}
      showCancelButton={true}
      cancelButtonText={t('common.cancel')}
    >
      {/* Main menu options */}
      <View style={styles.optionsContainer}>
        {menuOptions.map(option => (
          <VerticalListButton
            key={option.id}
            label={option.label}
            onPress={option.onPress}
            disabled={isSubmitting}
            danger={'danger' in option && option.danger}
            rightIcon={'rightIcon' in option ? option.rightIcon : undefined}
          />
        ))}
      </View>

      {/* Submenu sheet for Report or Block - defined within parent sheet */}
      <AppTrueSheet
        ref={submenuSheetRef}
        name="profile-menu-submenu"
        onDidDismiss={() => {
          /* no-op */
        }}
        header={
          <View style={styles.headerContainer}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {t('profile.reportOrBlock')}
            </Text>
            <CloseButton
              onPress={() => {
                submenuSheetRef.current?.dismiss().catch(() => {});
              }}
            />
          </View>
        }
        footer={wrapSubmenuFooter(
          <SheetActionFooter
            bottomPadding={submenuFooterBottomPadding}
            topPadding={submenuFooterTopPadding}
            backgroundColor={Colors.black}
          >
            <CancelButton
              onPress={() => {
                submenuSheetRef.current?.dismiss().catch(() => {});
              }}
            />
          </SheetActionFooter>
        )}
      >
        <View
          style={[
            styles.submenuContent,
            {
              paddingBottom: Math.max(
                0,
                submenuContentBottomPadding - CONTENT_TO_FOOTER_GAP_REDUCTION
              ),
            },
          ]}
        >
          {/* Submenu options */}
          <View style={styles.optionsContainer}>
            <VerticalListButton
              label={t('alerts.reportAccount')}
              onPress={() => {
                submenuSheetRef.current?.dismiss().catch(() => {});
                handleReport();
              }}
              disabled={isSubmitting}
            />
            <VerticalListButton
              label={isBlocked ? t('profile.unblockAccount') : t('profile.blockAccount')}
              onPress={() => {
                submenuSheetRef.current?.dismiss().catch(() => {});
                handleBlockToggle();
              }}
              disabled={isSubmitting || isBlockedByList}
            />
          </View>
        </View>
      </AppTrueSheet>
    </VerticalListSheet>
  );
};

const styles = StyleSheet.create({
  optionsContainer: {
    flexDirection: 'column',
    marginTop: 0,
  },
  submenuContent: {
    ...SHEET_STYLES.contentContainer,
  },
  headerContainer: {
    ...SHEET_STYLES.headerContainer,
  },
  headerTitle: {
    ...SHEET_STYLES.headerTitle,
  },
});

export default ProfileMenu;
