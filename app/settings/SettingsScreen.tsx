import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Platform,
  ScrollView,
  Linking,
  Pressable,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Icon from '../../src/components/ui/Icon';
import { getDeviceInfo, getFormattedVersion } from '../../src/utils/version';
import { Colors } from '../../src/theme';
import ListHeader from '../../src/components/ui/ListHeader';
import { OptionsButton } from '../../src/components/ui/OptionsButton';
import {
  useFeedSettings,
  useAuth,
  useCurrentUser,
  useAccountManagement,
} from '../../src/stores/userStore';
import { settingsTextStyles, settingsLayoutStyles } from './SettingsStyles';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useGlobalAccountSwitcher } from '../../src/hooks/useGlobalModals';
import ProfileService from '../../src/services/data/ProfileService';
import { useWindowDimensions } from 'react-native';
import * as Device from 'expo-device';

const SettingsScreen: React.FC = () => {
  const router = useRouter();
  const onLogout = useAuth().signOut;
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProfileLinkCopied, setIsProfileLinkCopied] = useState(false);
  const { presentAccountSwitcher } = useGlobalAccountSwitcher();
  const { nativeTabsEnabled, modalProfileEnabled, setNativeTabsEnabled, setModalProfileEnabled } =
    useFeedSettings();
  const { currentUser } = useCurrentUser();
  const { savedAccounts } = useAccountManagement();
  const { width, height } = useWindowDimensions();
  const isTablet = Device.deviceType === Device.DeviceType.TABLET || Math.min(width, height) >= 600;
  const isSmallScreen = width <= 375 || height <= 667;
  const isCompactDevice = isTablet || isSmallScreen;

  const handleLogout = async () => {
    if (isSubmitting) return;

    Alert.alert('Log out', 'Are you sure you want to log out?', [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Log out',
        style: 'default',
        onPress: async () => {
          setIsSubmitting(true);
          try {
            // Use userStore to handle logout without removing accounts (clearAllAccounts = false)
            await onLogout(false);
          } catch (_error) {
            Alert.alert('Error', 'Failed to log out. Please try again.');
          } finally {
            setIsSubmitting(false);
          }
        },
      },
    ]);
  };

  const handleRemoveAccount = async () => {
    if (isSubmitting) return;

    const hasMultipleAccounts = savedAccounts.length > 1;
    const title = hasMultipleAccounts ? 'Remove accounts?' : 'Remove account?';
    const message = hasMultipleAccounts
      ? 'This will remove all accounts from this device. You will need to sign in again.'
      : 'You will need to sign in again.';
    const confirmLabel = hasMultipleAccounts ? 'Remove accounts' : 'Remove account';

    Alert.alert(title, message, [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: confirmLabel,
        style: 'destructive',
        onPress: async () => {
          setIsSubmitting(true);
          try {
            // Use userStore to handle account removal (clearAllAccounts = true)
            await onLogout(true);
          } catch (_error) {
            Alert.alert('Error', 'Failed to remove account. Please try again.');
          } finally {
            setIsSubmitting(false);
          }
        },
      },
    ]);
  };

  const handleCopyProfileLink = async () => {
    if (!currentUser?.handle && !currentUser?.did) {
      Alert.alert('Error', 'Unable to get your profile information.');
      return;
    }

    try {
      // Use DID if handle ends with .invalid, otherwise use handle
      const handle = currentUser?.handle;
      const identifier = handle && !handle.endsWith('.invalid') ? handle : currentUser?.did;
      if (!identifier) {
        Alert.alert('Error', 'Unable to get your profile information.');
        return;
      }

      const profileUrl = `https://getorbyt.com/@${identifier}`;
      await Clipboard.setStringAsync(profileUrl);
      setIsProfileLinkCopied(true);
      // Reset the copied state after 4 seconds
      setTimeout(() => {
        setIsProfileLinkCopied(false);
      }, 4000);
    } catch (_error) {
      // Ignore clipboard errors
    }
  };

  const handleToggleNativeTabs = async (value: boolean) => {
    try {
      await setNativeTabsEnabled(value);
    } catch (_error) {
      Alert.alert('error', 'failed to save setting. please try again.');
    }
  };

  const handleToggleModalProfile = async (value: boolean) => {
    try {
      await setModalProfileEnabled(value);
    } catch (_error) {
      Alert.alert('error', 'failed to save setting. please try again.');
    }
  };

  const handleClearCache = async () => {
    Alert.alert(
      'Clear app cache',
      'This will clear all cached data including profiles, channels, and other app data. You may need to reload some content.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Clear Cache',
          style: 'default',
          onPress: async () => {
            try {
              // Clear all caches
              await Promise.all([ProfileService.clearCache()]);

              // Clear React Query cache
              queryClient.clear();

              Alert.alert('Success', 'App cache has been cleared successfully.');
            } catch (_error) {
              // Ignore cache clear failures
            }
          },
        },
      ]
    );
  };

  const handleOpenLink = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  const handleOpenEmail = async (email: string) => {
    try {
      const deviceInfo = await getDeviceInfo();
      const subject = encodeURIComponent('orbyt support request');
      const body = encodeURIComponent(
        `



----------------------------------------
Device Information (do not edit below this line):
${deviceInfo}`
      );
      const mailtoUrl = `mailto:${email}?subject=${subject}&body=${body}`;

      const canOpen = await Linking.canOpenURL(`mailto:${email}`);
      if (canOpen) {
        await Linking.openURL(mailtoUrl);
      } else {
        // Fallback: Copy email body to clipboard
        await Clipboard.setStringAsync(`${email}\n\n${deviceInfo}`);
        Alert.alert(
          'Email Copied',
          'No email app is configured. The support email and device information have been copied to your clipboard.',
          [{ text: 'OK' }]
        );
      }
    } catch (_error) {
      // Fallback: Just open basic mailto
      Linking.openURL(`mailto:${email}`).catch(() => {});
    }
  };

  const formattedVersion = getFormattedVersion();

  const handleVersionPress = async () => {
    try {
      const message = await getDeviceInfo();
      Alert.alert('Version Information', message, [
        {
          text: 'Copy',
          onPress: async () => {
            await Clipboard.setStringAsync(message);
            Alert.alert('Copied', 'Version copied to clipboard');
          },
        },
        {
          text: 'OK',
          style: 'default',
        },
      ]);
    } catch (_error) {
      Alert.alert('Error', 'Unable to get version information.');
    }
  };

  const settingsSections = [
    {
      title: '', // No title for profile section
      items: [
        {
          id: 'followers',
          label: 'Your followers',
          icon: 'users',
          onPress: () => router.navigate('/settings/followers'),
          linkType: 'internal',
        },
        {
          id: 'following',
          label: 'People you follow',
          icon: 'user-plus',
          onPress: () => router.navigate('/settings/following'),
          linkType: 'internal',
        },
        {
          id: 'saves',
          label: 'Your saves',
          icon: 'bookmark',
          onPress: () => router.navigate('/settings/saves'),
          linkType: 'internal',
        },
        {
          id: 'watched',
          label: 'Watched videos',
          icon: 'eye',
          onPress: () => router.navigate('/settings/watched'),
          linkType: 'internal',
        },
      ],
    },
    {
      title: 'Sharing',
      items: [
        {
          id: 'copy-profile-link',
          label: 'Copy your profile link',
          onPress: handleCopyProfileLink,
          linkType: 'none',
        },
      ],
    },
    {
      title: 'Privacy',
      items: [
        {
          id: 'blocked-users',
          label: 'Blocked accounts',
          onPress: () => router.navigate('/settings/blocked'),
          linkType: 'internal',
        },
        {
          id: 'muted-users',
          label: 'Muted accounts',
          onPress: () => router.navigate('/settings/muted'),
          linkType: 'internal',
        },
      ],
    },
    {
      title: 'App Settings',
      items: [
        {
          id: 'algorithmic-feed',
          label: 'Your mix',
          icon: 'sparkles',
          onPress: () => router.navigate('/settings/algorithmic-feed'),
          linkType: 'internal',
        },
        // {
        //   id: 'app-icon',
        //   label: 'App icon',
        //   icon: 'device-tv',
        //   onPress: () => router.navigate('/settings/app-icon'),
        //   linkType: 'internal',
        // },
        {
          id: 'content-filters',
          label: 'Content filters',
          icon: 'external-link',
          onPress: () => handleOpenLink('https://bsky.app/moderation'),
          linkType: 'external',
        },
        // {
        //   id: 'data-usage',
        //   label: 'Data Usage',
        //   icon: 'radio-signal',
        //   onPress: () => handlePlaceholderAction('Data Usage'),
        //   showChevron: true
        // }
      ],
    },
    {
      title: 'Labs',
      items: [],
    },
    {
      title: 'Troubleshooting',
      items: [
        {
          id: 'clear-cache',
          label: 'Clear cache',
          onPress: handleClearCache,
          linkType: 'none',
        },
        {
          id: 'support',
          label: 'Support',
          onPress: () => handleOpenEmail('support@getorbyt.com'),
          linkType: 'none',
        },
      ],
    },
    {
      title: 'Community',
      items: [
        {
          id: 'ideas',
          label: 'Ideas & feature requests',
          icon: 'message-circle',
          onPress: () => router.navigate('/settings/community'),
          linkType: 'internal',
        },
      ],
    },
    {
      title: 'About',
      items: [
        {
          id: 'website',
          label: 'Website',
          onPress: () => handleOpenLink('https://getorbyt.com'),
          linkType: 'external',
        },
        {
          id: 'forum',
          label: 'Forum',
          onPress: () => handleOpenLink('https://community.getorbyt.com'),
          linkType: 'external',
        },
        {
          id: 'privacy',
          label: 'Privacy policy',
          onPress: () => handleOpenLink('https://getorbyt.com/privacy'),
          linkType: 'external',
        },
        {
          id: 'terms',
          label: 'Terms of service',
          onPress: () => handleOpenLink('https://getorbyt.com/terms'),
          linkType: 'external',
        },
      ],
    },
    {
      title: 'Accounts',
      items: [
        {
          id: 'switch-account',
          label: savedAccounts.length > 1 ? 'Switch account' : 'Add an account',
          icon: 'user',
          onPress: () => {
            router.dismiss();
            // Ensure modal close animation completes before presenting account switcher
            // Account switcher will show "Add Account" options by default if only one account
            setTimeout(() => presentAccountSwitcher(), 350);
          },
          linkType: 'none',
        },
        {
          id: 'logout',
          label: 'Log out',
          onPress: handleLogout,
          linkType: 'none',
        },
        {
          id: 'remove-account',
          label: savedAccounts.length > 1 ? 'Remove accounts' : 'Remove account',
          onPress: handleRemoveAccount,
          linkType: 'none',
          destructive: true,
        },
      ],
    },
  ];

  // Build flat list data for FlashList
  type SettingItem = {
    id: string;
    label: string;
    onPress: () => void;
    linkType?: 'internal' | 'external' | 'none';
    icon?: string;
    rightIcon?: React.ReactNode;
    destructive?: boolean;
  };

  type ListRow =
    | { kind: 'section-title'; id: string; title: string }
    | {
        kind: 'setting';
        id: string;
        label: string;
        linkType?: 'internal' | 'external' | 'none';
        onPress: () => void;
        rightIcon?: React.ReactNode;
        destructive?: boolean;
      }
    | {
        kind: 'toggle';
        id: string;
        label: string;
        subtitle?: string;
        value: boolean;
        onValueChange: (v: boolean) => void;
      }
    | { kind: 'spacer'; id: string; height?: number }
    | { kind: 'footer'; id: string };

  const listData: ListRow[] = [];

  settingsSections.forEach(section => {
    // Only add section title if it's not empty
    if (section.title) {
      listData.push({ kind: 'section-title', id: `title-${section.title}`, title: section.title });
    }

    (section.items as SettingItem[]).forEach((item: SettingItem) => {
      listData.push({
        kind: 'setting',
        id: item.id,
        label: item.label,
        linkType: item.linkType,
        onPress: item.onPress,
        rightIcon: item.rightIcon,
        destructive: item.destructive,
      });
    });

    if (section.title === 'Labs') {
      listData.push({
        kind: 'toggle',
        id: 'native-tabs',
        label: 'New tabs',
        subtitle: 'Use native navigation bar',
        value: nativeTabsEnabled,
        onValueChange: handleToggleNativeTabs,
      });
      // Only show profile/channel presentation toggle on iOS devices that don't require compact layout.
      // When modal is the default, show "Classic layout" (inverted); otherwise "Modal layout".
      if (Platform.OS === 'ios' && !isCompactDevice) {
        const modalIsDefault = true; // modal is default on iOS non-compact
        listData.push({
          kind: 'toggle',
          id: 'modal-profile',
          label: modalIsDefault ? 'Classic layout' : 'Modal layout',
          subtitle: modalIsDefault
            ? 'Card-style for profile and channel'
            : 'Native modal with pull-to-dismiss',
          value: modalIsDefault ? !modalProfileEnabled : modalProfileEnabled,
          onValueChange: (value: boolean) =>
            handleToggleModalProfile(modalIsDefault ? !value : value),
        });
      }
    }
  });

  // Add footer with version and built with love message
  listData.push({
    kind: 'footer',
    id: 'footer',
  });

  return (
    <View style={[settingsLayoutStyles.container, { backgroundColor: Colors.black }]}>
      <ListHeader
        mode="sheet"
        title="Settings"
        showCloseButton
        onClosePress={() => router.dismiss()}
        applySafeAreaTop={Platform.OS === 'android'}
        backgroundColor={Colors.transparent}
      />
      <ScrollView
        contentContainerStyle={settingsLayoutStyles.contentContainerWithPadding}
        showsVerticalScrollIndicator={false}
      >
        {listData.map((item, index) => {
          const key = `${item.kind}-${item.id}-${index}`;
          switch (item.kind) {
            case 'section-title':
              return (
                <View key={key} style={settingsLayoutStyles.section}>
                  <Text style={settingsTextStyles.sectionTitle}>{item.title}</Text>
                </View>
              );
            case 'setting':
              return (
                <OptionsButton
                  key={key}
                  label={item.label}
                  onPress={item.onPress}
                  linkType={item.linkType}
                  destructive={item.destructive}
                  disabled={isSubmitting}
                  rightIcon={
                    item.id === 'copy-profile-link' && isProfileLinkCopied ? (
                      <Icon name="check" size={18} color={Colors.teal[300]} />
                    ) : (
                      item.rightIcon
                    )
                  }
                />
              );
            case 'toggle':
              return (
                <OptionsButton
                  key={key}
                  label={item.label}
                  subtitle={item.subtitle}
                  showSwitch={true}
                  switchValue={item.value}
                  onSwitchChange={item.onValueChange}
                />
              );
            case 'spacer':
              return <View key={key} style={{ height: item.height || 12 }} />;
            case 'footer':
              return (
                <View key={key} style={styles.footer}>
                  <View style={styles.footerContent}>
                    <View style={styles.footerHeartContainer}>
                      <Text style={styles.footerSubtext}>built with </Text>
                      <Icon name="heart" size={18} color={Colors.coral[400]} />
                      <Text style={styles.footerSubtext}> for the community</Text>
                    </View>
                    <Pressable onPress={handleVersionPress}>
                      <Text style={styles.versionText}>v{formattedVersion}</Text>
                    </Pressable>
                  </View>
                </View>
              );

            default:
              return null;
          }
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  footer: {
    marginTop: 12,
    marginBottom: 8,
  },
  footerContent: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  footerSubtext: {
    color: Colors.neutral[500],
    fontSize: 12,
    fontFamily: 'Figtree-Regular',
    textAlign: 'center',
  },
  footerHeartContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  versionText: {
    color: Colors.neutral[600],
    fontSize: 12,
    fontFamily: 'Figtree-Regular',
    textAlign: 'center',
  },
});

export default SettingsScreen;
