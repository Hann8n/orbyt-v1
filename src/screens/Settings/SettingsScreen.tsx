import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  Switch,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList, useLogout } from '../../navigation/types';
import Icon, { TvIcon, BackArrowIcon } from '../../components/ui/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ModerationDebug from '../../components/features/moderation/ModerationDebug';
import AccountManager from '../../services/storage/AccountManager';

// global flag for immediate effect without re-mounts
declare global {
  // eslint-disable-next-line no-var
  var __ORBYT_FEED_DEBUG_OVERLAY__: boolean | undefined;
}
import { useQueryClient } from '@tanstack/react-query';
import { Colors } from '../../components/ui/UI';

type SettingsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Settings'>;
type SettingsScreenRouteProp = RouteProp<RootStackParamList, 'Settings'>;

declare let window: any;

const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<SettingsScreenNavigationProp>();
  const route = useRoute<SettingsScreenRouteProp>();
  const onLogout = useLogout();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExperimentalFeedsEnabled, setIsExperimentalFeedsEnabled] = useState(true);
  const [isFeedDebugEnabled, setIsFeedDebugEnabled] = useState<boolean>(false);
  const insets = useSafeAreaInsets();

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const enabled = await AccountManager.getExperimentalFeedsEnabled();
        setIsExperimentalFeedsEnabled(enabled);
        const debugEnabled = await AccountManager.getFeedDebugOverlayEnabled();
        setIsFeedDebugEnabled(debugEnabled);
        // set global for immediate effect
        (global as any).__ORBYT_FEED_DEBUG_OVERLAY__ = debugEnabled;
      } catch (error) {
        console.error('Error loading settings:', error);
      }
    };
    loadSettings();
  }, []);

  const handleLogout = async () => {
    if (isSubmitting) return;
    
    Alert.alert(
      'log out',
      'are you sure you want to log out?',
      [
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
              await onLogout();
            } catch (error) {
              console.error('error during logout:', error);
              Alert.alert('error', 'failed to log out. please try again.');
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



  const handleToggleExperimentalFeeds = async (value: boolean) => {
    try {
      await AccountManager.setExperimentalFeedsEnabled(value);
      setIsExperimentalFeedsEnabled(value);
      
      // Invalidate queries that depend on experimental feeds setting
      queryClient.invalidateQueries({ queryKey: ['suggestedFeeds'] });
      queryClient.invalidateQueries({ queryKey: ['unifiedSearch'] });
    } catch (error) {
      console.error('error saving experimental feeds setting:', error);
      Alert.alert('error', 'failed to save setting. please try again.');
    }
  };

  const handleToggleFeedDebug = async (value: boolean) => {
    try {
      await AccountManager.setFeedDebugOverlayEnabled(value);
      setIsFeedDebugEnabled(value);
      // set global for immediate effect
      (global as any).__ORBYT_FEED_DEBUG_OVERLAY__ = value;
    } catch (error) {
      console.error('error saving feed debug overlay setting:', error);
      Alert.alert('error', 'failed to save setting. please try again.');
    }
  };

  const settingsSections = [
    {
      title: 'account',
      items: [
        {
          id: 'moderation',
                      label: 'content moderation',
          icon: 'mingcute:safe-shield-2-fill',
          onPress: () => navigation.navigate({ name: 'ModerationControls', params: {} }),
          showChevron: true
        },
        {
          id: 'channels',
          label: 'manage channels',
          icon: 'device-tv',
          onPress: () => navigation.navigate('ChannelManagement'),
          showChevron: true
        },
        // {
        //   id: 'notifications',
        //   label: 'Notifications',
        //   icon: 'notification',
        //   onPress: () => handlePlaceholderAction('Notifications'),
        //   showChevron: true
        // }
      ]
    },
    {
      title: 'content',
      items: [
        {
          id: 'watch-history',
          label: 'watch history',
          icon: 'mingcute:history-anticlockwise-line',
          onPress: () => navigation.navigate('WatchHistory'),
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
      title: 'app',
      items: [
        {
          id: 'color-palette',
          label: 'color palette',
          icon: 'color-picker-fill',
          onPress: () => navigation.navigate('ColorPalette'),
          showChevron: true
        },
        {
          id: 'about',
          label: 'about orbyt',
          icon: 'device-tv',
          onPress: () => navigation.navigate('About'),
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
    {
      title: 'debug',
      items: []
    }
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <BackArrowIcon size={28} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Content */}
      <ScrollView 
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        {settingsSections.map((section, sectionIndex) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionContent}>
              {section.items.map((item, itemIndex) => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.settingItem,
                    itemIndex === section.items.length - 1 && styles.lastItem
                  ]}
                  onPress={item.onPress}
                  activeOpacity={0.7}
                  disabled={isSubmitting}
                >
                  <View style={styles.settingItemLeft}>
                    <View style={styles.iconContainer}>
                      {item.icon === 'device-tv' ? (
                        <TvIcon size={20} color={Colors.white} />
                      ) : (
                        <Icon name={item.icon} size={20} color={Colors.white} />
                      )}
                    </View>
                    <View style={styles.settingItemTextContainer}>
                      <Text style={styles.settingItemText}>{item.label}</Text>
                      {(item as any).subtitle && (
                        <Text style={styles.settingItemSubtitle}>{(item as any).subtitle}</Text>
                      )}
                    </View>
                  </View>
                  {item.showChevron && (
                    <Icon name="chevron-right" size={20} color={Colors.gray} />
                  )}
                </TouchableOpacity>
              ))}
              
              {/* Experimental Feeds Toggle (only in content section) */}
              {section.title === 'content' && (
                <View style={[styles.settingItem, { borderBottomWidth: 0.5, borderBottomColor: Colors.mediumGray }]}> 
                  <View style={styles.settingItemLeft}>
                    <View style={styles.iconContainer}>
                      <Icon name="experimental-feeds" size={20} color={Colors.white} />
                    </View>
                    <View style={styles.settingItemTextContainer}>
                      <Text style={styles.settingItemText}>experimental feeds</Text>
                      <Text style={styles.settingItemSubtitle}>show non-video feeds</Text>
                    </View>
                  </View>
                  <Switch
                    value={isExperimentalFeedsEnabled}
                    onValueChange={handleToggleExperimentalFeeds}
                    trackColor={{ false: Colors.mediumGray, true: Colors.lightGreen }}
                    thumbColor={isExperimentalFeedsEnabled ? Colors.white : Colors.lightGray}
                    ios_backgroundColor={Colors.mediumGray}
                  />
                </View>
              )}
              {section.title === 'debug' && (
                <View style={[styles.settingItem]}> 
                  <View style={styles.settingItemLeft}>
                    <View style={styles.iconContainer}>
                      <Icon name="bug" size={20} color={Colors.white} />
                    </View>
                    <View style={styles.settingItemTextContainer}>
                                      <Text style={styles.settingItemText}>feed debug overlay</Text>
                <Text style={styles.settingItemSubtitle}>show realtime feed/debug info</Text>
                    </View>
                  </View>
                  <Switch
                    value={isFeedDebugEnabled}
                    onValueChange={handleToggleFeedDebug}
                    trackColor={{ false: Colors.mediumGray, true: Colors.lightGreen }}
                    thumbColor={isFeedDebugEnabled ? Colors.white : Colors.lightGray}
                    ios_backgroundColor={Colors.mediumGray}
                  />
                </View>
              )}
            </View>
          </View>
        ))}

        {/* Logout Button */}
        <View style={styles.logoutSection}>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
            activeOpacity={0.7}
            disabled={isSubmitting}
          >
            <Icon name="logout" size={20} color={Colors.black} />
            <Text style={styles.logoutButtonText}>log out</Text>
          </TouchableOpacity>
        </View>


      </ScrollView>
      
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.mediumGray,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: Colors.white,
    fontSize: 18,
    fontFamily: 'Firma-SemiBold',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 40,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    color: Colors.gray,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
    marginBottom: 12,
    paddingHorizontal: 20,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionContent: {
    backgroundColor: Colors.darkGray,
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.mediumGray,
    overflow: 'hidden',
  },

  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.mediumGray,
  },
  lastItem: {
    borderBottomWidth: 0,
  },
  settingItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.mediumGray,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  settingItemTextContainer: {
    flex: 1,
  },
  settingItemText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '500',
    fontFamily: 'Firma-Medium',
  },
  settingItemSubtitle: {
    color: Colors.gray,
    fontSize: 12,
    fontWeight: '400',
    fontFamily: 'Firma-Regular',
    marginTop: 2,
  },
  switchItem: {
    justifyContent: 'space-between',
    marginTop: 12,
  },
  logoutSection: {
    marginTop: 32,
    paddingHorizontal: 20,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.red,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  logoutButtonText: {
    color: Colors.black,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
    marginLeft: 8,
  },
});

export default SettingsScreen; 