import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  ScrollView,
  Switch,
  Share,
  Clipboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../../src/components/ui/Icon';
import { Colors } from '../../src/components/ui/UI';
import ListHeader from '../../src/components/ui/ListHeader';
import { useFeedSettings, useAuth, useCurrentUser } from '../../src/stores/userStore';
import { settingsButtonStyles, settingsTextStyles, settingsLayoutStyles } from './SettingsStyles';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { AtprotoService } from '../../src/services/api/AtprotoService';
import { ModerationService } from '../../src/services/ModerationService';
import { ModerationSettings, LabelPreference } from '../../src/services/ModerationTypes';
import { CommonErrorHandlers } from '../../src/utils/errorHandler';
import { useProfile } from '../../src/services/cache/ProfileCache';
import { useChannelColors } from '../../src/services/cache/ChannelCache';
import { useGlobalAccountSwitcher } from '../../src/hooks/useGlobalAccountSwitcher';
import { Host, Button as ExpoButton } from '@expo/ui/swift-ui';
import { background, foregroundColor } from '@expo/ui/swift-ui/modifiers';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';



declare let window: any;

const SettingsScreen: React.FC = () => {
  const navigation = useRouter();
  const onLogout = useAuth().signOut;
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExperimentalFeedsEnabled, setIsExperimentalFeedsEnabled] = useState(true);
  const { presentAccountSwitcher } = useGlobalAccountSwitcher();
  const insets = useSafeAreaInsets();
  const { getExperimentalFeedsEnabled, setExperimentalFeedsEnabled } = useFeedSettings();
  const { currentUser } = useCurrentUser();
  const shouldUseGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const enabled = await getExperimentalFeedsEnabled();
        setIsExperimentalFeedsEnabled(enabled);
      } catch (error) {
        console.error('Error loading settings:', error);
      }
    };
    loadSettings();
  }, []);

  const handleRemoveAccount = async () => {
    if (isSubmitting) return;
    
    Alert.alert(
      'Are you sure?',
      'You will need to sign in again',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Remove Account',
          style: 'destructive',
          onPress: async () => {
            setIsSubmitting(true);
            try {
              // Use userStore to handle account removal (clearAllAccounts = true)
              await onLogout(true);
            } catch (error) {
              console.error('error during account removal:', error);
              Alert.alert('Error', 'Failed to remove account. Please try again.');
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const handlePlaceholderAction = (action: string) => {
    Alert.alert('coming soon', `${action.toLowerCase()} will be available in a future update.`);
  };

  const handleCopyProfileLink = async () => {
    if (!currentUser?.handle) {
      Alert.alert('Error', 'Unable to get your profile information.');
      return;
    }

    try {
      const profileUrl = `https://bsky.app/profile/${currentUser.handle}`;
      await Clipboard.setString(profileUrl);
      Alert.alert('Copied!', 'Your profile link has been copied to clipboard.');
    } catch (error) {
      console.error('Error copying profile link:', error);
      Alert.alert('Error', 'Failed to copy profile link. Please try again.');
    }
  };



  const handleToggleExperimentalFeeds = async (value: boolean) => {
    try {
      await setExperimentalFeedsEnabled(value);
      setIsExperimentalFeedsEnabled(value);
      
      // Invalidate queries that depend on experimental feeds setting
      queryClient.invalidateQueries({ queryKey: ['suggestedFeeds'] });
      queryClient.invalidateQueries({ queryKey: ['unifiedSearch'] });
    } catch (error) {
      console.error('error saving experimental feeds setting:', error);
      Alert.alert('error', 'failed to save setting. please try again.');
    }
  };




  const settingsSections = [
    {
      title: '', // No title for profile section
      items: [
        {
          id: 'switch-account',
          label: 'Switch account',
          icon: 'user',
          onPress: () => {
            navigation.back();
            setTimeout(() => presentAccountSwitcher(), 100);
          },
          showChevron: true
        },
        {
          id: 'insights',
          label: 'Insights',
          icon: 'insights',
                      onPress: () => {
              navigation.back();
              setTimeout(() => navigation.push('/insights'), 100);
            },
          showChevron: true
        },
        {
          id: 'followers',
          label: 'Your followers',
          icon: 'users',
                      onPress: () => {
              navigation.back();
              setTimeout(() => navigation.push('/settings/followers'), 100);
            },
          showChevron: true
        },
        {
          id: 'following',
          label: 'People you follow',
          icon: 'user-plus',
                      onPress: () => {
              navigation.back();
              setTimeout(() => navigation.push('/settings/following'), 100);
            },
          showChevron: true
        },
        {
          id: 'channels',
          label: 'Your channels',
          icon: 'device-tv',
                      onPress: () => {
              navigation.back();
              setTimeout(() => navigation.push('/settings/channels'), 100);
            },
          showChevron: true
        }
      ]
    },
    {
      title: 'Sharing',
      items: [
        {
          id: 'copy-profile-link',
          label: 'Copy your profile link',
          icon: 'link',
          onPress: handleCopyProfileLink,
          showChevron: false
        }
      ]
    },
    {
      title: 'Privacy',
      items: [
        {
          id: 'blocked-users',
          label: 'Blocked accounts',
                      onPress: () => {
              navigation.back();
              setTimeout(() => navigation.push('/settings/blocked'), 100);
            },
          showChevron: true
        },
        {
          id: 'muted-users',
          label: 'Muted accounts',
                      onPress: () => {
              navigation.back();
              setTimeout(() => navigation.push('/settings/muted'), 100);
            },
          showChevron: true
        },
      ]
    },
    {
      title: 'Content',
      items: [
        {
          id: 'content-filters',
          label: 'Content filters',
          icon: 'filter',
                      onPress: () => {
              navigation.back();
              setTimeout(() => navigation.push('/settings/content-filters'), 100);
            },
          showChevron: true
        },

        // {
        //   id: 'experimental-feeds',
        //   label: 'Experimental Feeds',
        //   icon: 'lightbulb',
        //   onPress: () => handlePlaceholderAction('Experimental Feeds'),
        //   showChevron: true
        // },
        // {
        //   id: 'data-usage',
        //   label: 'Data Usage',
        //   icon: 'radio-signal',
        //   onPress: () => handlePlaceholderAction('Data Usage'),
        //   showChevron: true
        // }
      ]
    },
    {
      title: 'App',
      items: [
        {
          id: 'color-palette',
          label: 'Color palette',
          icon: 'color-picker-fill',
                      onPress: () => {
              navigation.back();
              setTimeout(() => navigation.push('/settings/color-palette'), 100);
            },
          showChevron: true
        },
        {
          id: 'about',
          label: 'About orbyt',
          icon: 'device-tv',
                      onPress: () => {
              navigation.back();
              setTimeout(() => navigation.push('/settings/about'), 100);
            },
          showChevron: true
        },
        // {
        //   id: 'help',
        //   label: 'Help & Support',
        //   icon: 'headset',
        //   onPress: () => handlePlaceholderAction('Help & Support'),
        //   showChevron: true
        // },
        // {
        //   id: 'feedback',
        //   label: 'Send Feedback',
        //   icon: 'message-text',
        //   onPress: () => handlePlaceholderAction('Send Feedback'),
        //   showChevron: true
        // }
      ]
    },

  ];

  // Build flat list data for FlashList
  type ListRow =
    | { kind: 'section-title'; id: string; title: string }
    | { kind: 'setting'; id: string; label: string; showChevron?: boolean; onPress: () => void }
    | { kind: 'toggle'; id: string; label: string; subtitle?: string; value: boolean; onValueChange: (v: boolean) => void }
    | { kind: 'logout'; id: 'logout' }; // This is actually "remove account" now

  const listData: ListRow[] = [];

  settingsSections.forEach((section) => {
    // Only add section title if it's not empty
    if (section.title) {
      listData.push({ kind: 'section-title', id: `title-${section.title}`, title: section.title });
    }

    section.items.forEach((item) => {
      listData.push({
        kind: 'setting',
        id: (item as any).id,
        label: (item as any).label,
        showChevron: (item as any).showChevron,
        onPress: (item as any).onPress,
      });
    });

    if (section.title === 'Content') {
      listData.push({
        kind: 'toggle',
        id: 'experimental-feeds',
        label: 'Experimental feeds',
        subtitle: 'Show non-video feeds',
        value: isExperimentalFeedsEnabled,
        onValueChange: handleToggleExperimentalFeeds,
      });
    }
  });

  // Add remove account row at the end
  listData.push({ kind: 'logout', id: 'logout' });

  return (
    <View style={[settingsLayoutStyles.container, { backgroundColor: Colors.black }]}>
      <ScrollView
        contentContainerStyle={settingsLayoutStyles.contentContainerWithPadding}
        showsVerticalScrollIndicator={false}
      >
        <ListHeader 
          mode="sheet"
          title="Settings"
          showCloseButton
                      onClosePress={() => navigation.back()}
          applySafeAreaTop={false}
          style={{ marginHorizontal: -5 }}
        />
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
                <View key={key} style={{ marginBottom: 0 }}>
                  <TouchableOpacity
                    style={[
                      settingsButtonStyles.menuOption,
                      shouldUseGlass && settingsButtonStyles.menuOptionGlass
                    ]}
                    onPress={item.onPress}
                    activeOpacity={0.7}
                    disabled={isSubmitting}
                  >
                    {shouldUseGlass && (
                      <GlassView
                        style={StyleSheet.absoluteFill}
                        glassEffectStyle="clear"
                        tintColor="rgba(24,28,34,0.15)"
                        isInteractive
                      />
                    )}
                    <View style={styles.menuOptionLeft}>
                      <Text style={settingsTextStyles.menuOptionText}>{item.label}</Text>
                    </View>
                    {item.showChevron && (
                      <Icon name="right_arrow_filled" size={24} color={Colors.lightGray} />
                    )}
                  </TouchableOpacity>
                </View>
              );
            case 'toggle':
              return (
                <View key={key} style={{ marginBottom: 0 }}>
                  <View style={[
                    settingsButtonStyles.menuOption,
                    shouldUseGlass && settingsButtonStyles.menuOptionGlass
                  ]}>
                    {shouldUseGlass && (
                      <GlassView
                        style={StyleSheet.absoluteFill}
                        glassEffectStyle="clear"
                        tintColor="rgba(24,28,34,0.15)"
                        isInteractive
                      />
                    )}
                    <View style={styles.menuOptionLeft}>
                      <Text style={settingsTextStyles.menuOptionText}>{item.label}</Text>
                      {item.subtitle ? (
                        <Text style={settingsTextStyles.menuOptionSubtitle}>{item.subtitle}</Text>
                      ) : null}
                    </View>
                    <Switch
                      value={item.value}
                      onValueChange={item.onValueChange}
                      trackColor={{ false: Colors.mediumGray, true: Colors.lightGreen }}
                      thumbColor={item.value ? Colors.white : Colors.lightGray}
                      ios_backgroundColor={Colors.mediumGray}
                    />
                  </View>
                </View>
              );
            case 'logout':
              return (
                <View key={key} style={settingsLayoutStyles.logoutSection}>
                  {/* Expo UI Button Examples */}
                  <Host style={{ marginBottom: 16, gap: 12 }}>
                    <ExpoButton
                      variant="default"
                      modifiers={[
                        background(Colors.darkGray),
                        foregroundColor(Colors.white)
                      ]}
                      onPress={() => Alert.alert('Expo UI', 'This is a default Expo UI button!')}
                    >
                      Default Button
                    </ExpoButton>
                    <ExpoButton
                      variant="default"
                      modifiers={[
                        background(Colors.mediumGray),
                        foregroundColor(Colors.white)
                      ]}
                      onPress={() => Alert.alert('Expo UI', 'This is a secondary Expo UI button!')}
                    >
                      Secondary Button
                    </ExpoButton>
                    <ExpoButton
                      variant="default"
                      modifiers={[
                        background(Colors.red),
                        foregroundColor(Colors.white)
                      ]}
                      onPress={() => Alert.alert('Expo UI', 'This is a destructive Expo UI button!')}
                    >
                      Destructive Button
                    </ExpoButton>
                  </Host>
                  
                  {/* Traditional React Native Button */}
                  <TouchableOpacity
                    style={[
                      settingsButtonStyles.logoutButton,
                      shouldUseGlass && settingsButtonStyles.logoutButtonGlass
                    ]}
                    onPress={handleRemoveAccount}
                    activeOpacity={0.7}
                    disabled={isSubmitting}
                  >
                    {shouldUseGlass && (
                      <GlassView
                        style={StyleSheet.absoluteFill}
                        glassEffectStyle="clear"
                        tintColor="rgba(24,28,34,0.15)"
                        isInteractive
                      />
                    )}
                    <Text style={settingsTextStyles.logoutButtonText}>Remove Account</Text>
                  </TouchableOpacity>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginHorizontal: -5,
    borderBottomWidth: 0,
    borderBottomColor: 'transparent',
    backgroundColor: Colors.black,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: Colors.white,
    fontSize: 22,
    fontFamily: 'Firma-Bold',
    fontWeight: '700',
  },
  headerRight: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  optionsContainer: {
    flexDirection: 'column',
    gap: 12,
    marginHorizontal: 0,
  },
  menuOptionLeft: {
    flexDirection: 'column',
    flex: 1,
  },

});

export default SettingsScreen;