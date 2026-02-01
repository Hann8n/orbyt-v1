import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Platform,
  ScrollView,
  Linking,
  TouchableOpacity,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Application from 'expo-application';
import Icon from '../../src/components/ui/Icon';
import { getBuildNumber, getBuildVersion, getFormattedVersion } from '../../src/utils/version';
import { Colors } from '../../src/components/ui/UI';
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

  const getDeviceInfo = async () => {
    const platform =
      Platform.OS === 'ios'
        ? 'iOS'
        : Platform.OS === 'android'
          ? 'Android'
          : Platform.OS === 'web'
            ? 'Web'
            : Platform.OS;
    const appType = `orbyt for ${platform}`;
    const osVersion = Device.osVersion || 'Unknown';
    const modelName = Device.modelName || 'Unknown';
    const appVersion = getBuildVersion();
    const buildNumber = getBuildNumber();
    const environment = __DEV__ ? 'Debug' : 'Release';
    const applicationId = Application.applicationId ?? 'N/A';
    const applicationName = Application.applicationName ?? 'N/A';

    const installationTime = await Application.getInstallationTimeAsync().catch(() => null);
    const installationTimeText = installationTime ? installationTime.toISOString() : 'N/A';

    const platformAppInfo: string[] = [];

    if (Platform.OS === 'android') {
      const androidId = (() => {
        try {
          return Application.getAndroidId();
        } catch {
          return null;
        }
      })();
      platformAppInfo.push(`Android ID: ${androidId ?? 'N/A'}`);

      const installReferrer = await Application.getInstallReferrerAsync().catch(() => null);
      platformAppInfo.push(`Install Referrer: ${installReferrer ?? 'N/A'}`);

      const lastUpdateTime = await Application.getLastUpdateTimeAsync().catch(() => null);
      platformAppInfo.push(
        `Last Update Time: ${lastUpdateTime ? lastUpdateTime.toISOString() : 'N/A'}`
      );
    }

    if (Platform.OS === 'ios') {
      const idForVendor = await Application.getIosIdForVendorAsync().catch(() => null);
      platformAppInfo.push(`ID for Vendor: ${idForVendor ?? 'N/A'}`);

      const releaseType = await Application.getIosApplicationReleaseTypeAsync().catch(() => null);
      const releaseTypeLabel =
        releaseType === null || releaseType === undefined
          ? 'N/A'
          : // Numeric enum reverse-mapping (e.g. 5 -> 'APP_STORE')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (((Application as any).ApplicationReleaseType?.[releaseType] as string | undefined) ??
            String(releaseType));
      platformAppInfo.push(`iOS Release Type: ${releaseTypeLabel}`);

      const apnsEnv = await Application.getIosPushNotificationServiceEnvironmentAsync().catch(
        () => null
      );
      platformAppInfo.push(`APNs Environment: ${apnsEnv ?? 'N/A'}`);
    }

    return [
      appType,
      `Platform: ${platform}`,
      `OS Version: ${osVersion}`,
      `Device Model: ${modelName}`,
      '',
      `App Version: ${appVersion}`,
      `Build Number: ${buildNumber}`,
      `Environment: ${environment}`,
      '',
      `Application ID: ${applicationId}`,
      `Application Name: ${applicationName}`,
      '',
      `Installation Time: ${installationTimeText}`,
      ...(platformAppInfo.length ? ['', ...platformAppInfo] : []),
    ].join('\n');
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
  const buildVersion = getBuildVersion();

  const handleVersionPress = async () => {
    try {
      const appVersion = buildVersion;
      const buildNumber = getBuildNumber();
      const environment = __DEV__ ? 'Debug' : 'Release';

      const applicationId = Application.applicationId ?? 'N/A';
      const applicationName = Application.applicationName ?? 'N/A';

      const installationTime = await Application.getInstallationTimeAsync().catch(() => null);
      const installationTimeText = installationTime ? installationTime.toISOString() : 'N/A';

      const platformAppInfo: string[] = [];

      if (Platform.OS === 'android') {
        const androidId = (() => {
          try {
            return Application.getAndroidId();
          } catch {
            return null;
          }
        })();
        platformAppInfo.push(`Android ID: ${androidId ?? 'N/A'}`);

        const installReferrer = await Application.getInstallReferrerAsync().catch(() => null);
        platformAppInfo.push(`Install Referrer: ${installReferrer ?? 'N/A'}`);

        const lastUpdateTime = await Application.getLastUpdateTimeAsync().catch(() => null);
        platformAppInfo.push(
          `Last Update Time: ${lastUpdateTime ? lastUpdateTime.toISOString() : 'N/A'}`
        );
      }

      if (Platform.OS === 'ios') {
        const idForVendor = await Application.getIosIdForVendorAsync().catch(() => null);
        platformAppInfo.push(`ID for Vendor: ${idForVendor ?? 'N/A'}`);

        const releaseType = await Application.getIosApplicationReleaseTypeAsync().catch(() => null);
        const releaseTypeLabel =
          releaseType === null || releaseType === undefined
            ? 'N/A'
            : // Numeric enum reverse-mapping (e.g. 5 -> 'APP_STORE')
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (((Application as any).ApplicationReleaseType?.[releaseType] as string | undefined) ??
              String(releaseType));
        platformAppInfo.push(`iOS Release Type: ${releaseTypeLabel}`);

        const apnsEnv = await Application.getIosPushNotificationServiceEnvironmentAsync().catch(
          () => null
        );
        platformAppInfo.push(`APNs Environment: ${apnsEnv ?? 'N/A'}`);
      }

      const message = [
        `App Version: ${appVersion}`,
        `Build Number: ${buildNumber}`,
        `Environment: ${environment}`,
        `Platform: ${Platform.OS}`,
        '',
        `Application ID: ${applicationId}`,
        `Application Name: ${applicationName}`,
        '',
        `Installation Time: ${installationTimeText}`,
        ...(platformAppInfo.length ? ['', ...platformAppInfo] : []),
      ].join('\n');

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
          onPress: () => router.push('/settings/followers'),
          linkType: 'internal',
        },
        {
          id: 'following',
          label: 'People you follow',
          icon: 'user-plus',
          onPress: () => router.push('/settings/following'),
          linkType: 'internal',
        },
        {
          id: 'saves',
          label: 'Your saves',
          icon: 'bookmark',
          onPress: () => router.push('/settings/saves'),
          linkType: 'internal',
        },
        {
          id: 'watched',
          label: 'Watched videos',
          icon: 'eye',
          onPress: () => router.push('/settings/watched'),
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
          onPress: () => router.push('/settings/blocked'),
          linkType: 'internal',
        },
        {
          id: 'muted-users',
          label: 'Muted accounts',
          onPress: () => router.push('/settings/muted'),
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
          onPress: () => router.push('/settings/algorithmic-feed'),
          linkType: 'internal',
        },
        // {
        //   id: 'app-icon',
        //   label: 'App icon',
        //   icon: 'device-tv',
        //   onPress: () => router.push('/settings/app-icon'),
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
      title: 'About',
      items: [
        {
          id: 'website',
          label: 'Website',
          onPress: () => handleOpenLink('https://getorbyt.com'),
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
            router.back();
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
        label: 'New tabs layout',
        subtitle: 'Use native navigation bar',
        value: nativeTabsEnabled,
        onValueChange: handleToggleNativeTabs,
      });
      // Only show modal profile toggle on iOS devices that don't require compact layout
      if (Platform.OS === 'ios' && !isCompactDevice) {
        listData.push({
          kind: 'toggle',
          id: 'modal-profile',
          label: 'Modal profile',
          subtitle: 'Native modal with pull-to-dismiss',
          value: modalProfileEnabled,
          onValueChange: handleToggleModalProfile,
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
        onClosePress={() => router.back()}
        applySafeAreaTop={Platform.OS === 'android'}
        backgroundColor={Colors.black}
        titleIndent={true}
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
                      <Icon name="check" size={18} color={Colors.lightGreen} />
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
                      <Icon name="heart" size={18} color={Colors.lightRed} />
                      <Text style={styles.footerSubtext}> for the community</Text>
                    </View>
                    <TouchableOpacity onPress={handleVersionPress} activeOpacity={0.7}>
                      <Text style={styles.versionText}>v{formattedVersion}</Text>
                    </TouchableOpacity>
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
    color: Colors.gray,
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
    color: Colors.mediumGray,
    fontSize: 12,
    fontFamily: 'Figtree-Regular',
    textAlign: 'center',
  },
});

export default SettingsScreen;
