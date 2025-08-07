import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon, { BackArrowIcon } from '../../ui/Icon';
import { ModerationService } from '../../../services/ModerationService';
import { ModerationSettings, LabelPreference } from '../../../services/ModerationTypes';
import { BRAND, STATUS } from '../../../utils/formatting/Colors';
import { RootStackParamList, useLogout } from '../../../navigation/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ModerationControlsProps {
  visible: boolean;
  onClose: () => void;
  onLogout?: (clearAllAccounts?: boolean) => Promise<void>;
}

type ModerationControlsNavigationProp = NativeStackNavigationProp<RootStackParamList, 'ModerationControls' | 'BlockedUsers' | 'MutedUsers' | 'MutedWords' | 'HiddenPosts'>;

interface ContentTypeOption {
  id: string;
  label: string;
  description: string;
  icon: string;
  preference: LabelPreference;
}

const ModerationControls: React.FC<ModerationControlsProps> = ({ visible, onClose, onLogout }) => {
  const navigation = useNavigation<ModerationControlsNavigationProp>();
  const logoutFromContext = useLogout();
  const logoutFunction = onLogout || logoutFromContext;
  const [settings, setSettings] = useState<ModerationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const insets = useSafeAreaInsets();

  // Content type options with their current preferences - simplified to match Bluesky
  const [contentOptions, setContentOptions] = useState<ContentTypeOption[]>([
    {
      id: 'porn',
      label: 'Adult Content',
      description: 'Sexual content and pornography',
      icon: '',
      preference: 'hide'
    },
    {
      id: 'sexual',
      label: 'Sexual Content',
      description: 'Sexual themes and suggestive content',
      icon: '',
      preference: 'warn'
    },
    {
      id: 'nudity',
      label: 'Nudity',
      description: 'Nude or partially nude content',
      icon: '',
      preference: 'warn'
    },
    {
      id: 'graphic-media',
      label: 'Graphic Media',
      description: 'Violent or graphic content',
      icon: '',
      preference: 'warn'
    }
  ]);

  // General moderation settings
  const [generalSettings, setGeneralSettings] = useState({
    hideSensitiveContent: true,
    hideAdultContent: true,
    hideViolence: true,
    hideSpam: true,
    hideMisleading: true,
    hideBlockedUsers: true,
    hideMutedUsers: true,
    showContentWarnings: true,
    autoExpandContentWarnings: false,
    adultContentEnabled: false,
  });

  useEffect(() => {
    if (visible) {
      loadSettings();
      loadStats();
    }
  }, [visible]);

  const loadStats = async () => {
    try {
      const moderationStats = await ModerationService.getModerationStats();
      setStats(moderationStats);
    } catch (error) {
      console.error('Error loading moderation stats:', error);
    }
  };

  const loadSettings = async () => {
    try {
      setLoading(true);
      const currentSettings = await ModerationService.getModerationSettings();
      setSettings(currentSettings);
      
      // Update general settings
      setGeneralSettings({
        hideSensitiveContent: currentSettings.hideSensitiveContent,
        hideAdultContent: currentSettings.hideAdultContent,
        hideViolence: currentSettings.hideViolence,
        hideSpam: currentSettings.hideSpam,
        hideMisleading: currentSettings.hideMisleading,
        hideBlockedUsers: currentSettings.hideBlockedUsers,
        hideMutedUsers: currentSettings.hideMutedUsers,
        showContentWarnings: currentSettings.showContentWarnings,
        autoExpandContentWarnings: currentSettings.autoExpandContentWarnings,
        adultContentEnabled: currentSettings.adultContentEnabled,
      });

      // Update content options with current label preferences
      const updatedContentOptions = contentOptions.map(option => ({
        ...option,
        preference: currentSettings.labels[option.id] || option.preference
      }));
      
      setContentOptions(updatedContentOptions);
    } catch (error) {
      console.error('Error loading moderation settings:', error);
      Alert.alert('Error', 'Failed to load moderation settings');
    } finally {
      setLoading(false);
    }
  };



  const updateContentPreference = async (contentId: string, preference: LabelPreference) => {
    // Update the content options state
    const updatedContentOptions = contentOptions.map(option => 
      option.id === contentId ? { ...option, preference } : option
    );
    setContentOptions(updatedContentOptions);
    
    // Auto-save the changes
    try {
      if (settings) {
        const updatedSettings: ModerationSettings = {
          ...settings,
          labels: {
            ...settings.labels,
            [contentId]: preference
          }
        };
        
        await ModerationService.saveModerationSettings(updatedSettings);
        setSettings(updatedSettings);
      }
    } catch (error) {
      console.error('Error auto-saving content preference:', error);
    }
  };

  const updateGeneralSetting = async (key: keyof typeof generalSettings, value: boolean) => {
    // Prevent enabling sensitive content - only allow disabling
    if (key === 'adultContentEnabled' && value === true) {
      Alert.alert(
        'Cannot Enable Sensitive Content',
        'Sensitive content can only be disabled from this app. To enable it, please use the Bluesky web app or official Bluesky app.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    setGeneralSettings(prev => ({ ...prev, [key]: value }));
    
    // Auto-save the changes
    try {
      if (settings) {
        const updatedSettings: ModerationSettings = {
          ...settings,
          [key]: value
        };
        
        await ModerationService.saveModerationSettings(updatedSettings);
        setSettings(updatedSettings);
      }
    } catch (error) {
      console.error('Error auto-saving general setting:', error);
    }
  };

  const getPreferenceIcon = (preference: LabelPreference) => {
    switch (preference) {
      case 'ignore':
        return 'eye';
      case 'warn':
        return 'eye-off';
      case 'hide':
        return 'warning-box';
      default:
        return 'eye-off';
    }
  };

  const getPreferenceColor = (preference: LabelPreference) => {
    switch (preference) {
      case 'ignore':
        return '#4CAF50';
      case 'warn':
        return '#FF9800';
      case 'hide':
        return '#F44336';
      default:
        return '#666';
    }
  };

  const getPreferenceLabel = (preference: LabelPreference) => {
    switch (preference) {
      case 'ignore':
        return 'Show';
      case 'warn':
        return 'Warn';
      case 'hide':
        return 'Hide';
      default:
        return 'Warn';
    }
  };

  const cyclePreference = (currentPreference: LabelPreference): LabelPreference => {
    switch (currentPreference) {
      case 'ignore':
        return 'warn';
      case 'warn':
        return 'hide';
      case 'hide':
        return 'ignore';
      default:
        return 'warn';
    }
  };

  if (!visible) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <BackArrowIcon size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Content Moderation</Text>
        </View>
      </View>

      {/* Content */}
      <ScrollView 
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading settings...</Text>
          </View>
        ) : (
          <>
            {/* Statistics Section */}
            {stats && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Moderation Statistics</Text>
                <View style={styles.statsGrid}>
                  <TouchableOpacity 
                    style={styles.statItem}
                    onPress={() => navigation.navigate('BlockedUsers')}
                    activeOpacity={0.7}
                  >
                    <View style={styles.statContent}>
                      <Text style={styles.statValue}>{stats.blockedUsers}</Text>
                      <Text style={styles.statLabel}>Blocked{'\n'}Users</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.statItem}
                    onPress={() => navigation.navigate('MutedUsers')}
                    activeOpacity={0.7}
                  >
                    <View style={styles.statContent}>
                      <Text style={styles.statValue}>{stats.mutedUsers}</Text>
                      <Text style={styles.statLabel}>Muted{'\n'}Users</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.statItem}
                    onPress={() => navigation.navigate('MutedWords')}
                    activeOpacity={0.7}
                  >
                    <View style={styles.statContent}>
                      <Text style={styles.statValue}>{stats.mutedWords}</Text>
                      <Text style={styles.statLabel}>Muted{'\n'}Words</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* General Settings */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>General Settings</Text>
              <View style={styles.sectionContent}>
                <View style={styles.settingItem}>
                  <View style={styles.settingItemLeft}>
                    <View style={styles.iconContainer}>
                      <Icon name="block" size={24} color="#fff" />
                    </View>
                    <View style={styles.settingTextContainer}>
                      <Text style={styles.settingItemText}>Hide Blocked Users</Text>
                      <Text style={styles.settingItemDescription}>
                        Hide content from users you've blocked
                      </Text>
                    </View>
                  </View>
                  <Switch
                    value={generalSettings.hideBlockedUsers}
                    onValueChange={(value) => updateGeneralSetting('hideBlockedUsers', value)}
                    trackColor={{ false: '#333', true: '#4CAF50' }}
                    thumbColor={generalSettings.hideBlockedUsers ? '#fff' : '#666'}
                  />
                </View>

                <View style={styles.settingItem}>
                  <View style={styles.settingItemLeft}>
                    <View style={styles.iconContainer}>
                      <Icon name="muted-users" size={24} color="#fff" />
                    </View>
                    <View style={styles.settingTextContainer}>
                      <Text style={styles.settingItemText}>Hide Muted Users</Text>
                      <Text style={styles.settingItemDescription}>
                        Hide content from users you've muted
                      </Text>
                    </View>
                  </View>
                  <Switch
                    value={generalSettings.hideMutedUsers}
                    onValueChange={(value) => updateGeneralSetting('hideMutedUsers', value)}
                    trackColor={{ false: '#333', true: '#4CAF50' }}
                    thumbColor={generalSettings.hideMutedUsers ? '#fff' : '#666'}
                  />
                </View>
              </View>
            </View>

            {/* Content Type Settings */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Content Filters</Text>
              <Text style={styles.sectionDescription}>
                Choose how to handle different types of content
              </Text>
              <View style={styles.sectionContent}>
                {generalSettings.adultContentEnabled && (
                  <View style={styles.settingItem}>
                    <View style={styles.settingItemLeft}>
                      <View style={styles.iconContainer}>
                        <Icon name="sensitive-content" size={24} color="#fff" />
                      </View>
                      <View style={styles.settingTextContainer}>
                        <Text style={styles.settingItemText}>Sensitive Content</Text>
                        <Text style={styles.settingItemDescription}>
                          Allow sensitive content (adult, sexual, nudity, graphic) to be displayed
                        </Text>
                      </View>
                    </View>
                    <Switch
                      value={generalSettings.adultContentEnabled}
                      onValueChange={(value) => updateGeneralSetting('adultContentEnabled', value)}
                      trackColor={{ false: '#333', true: '#4CAF50' }}
                      thumbColor={generalSettings.adultContentEnabled ? '#fff' : '#666'}
                    />
                  </View>
                )}


                {contentOptions.map((option, index) => {
                  const isAdultContent = ['porn', 'sexual', 'nudity'].includes(option.id);
                  // Hide adult content options when sensitive content is disabled
                  if (isAdultContent && !generalSettings.adultContentEnabled) {
                    return null;
                  }
                  
                  return (
                    <View
                      key={option.id}
                      style={[
                        styles.contentOptionItem,
                        index === contentOptions.length - 1 && styles.lastItem
                      ]}
                    >
                      <View style={styles.settingTextContainer}>
                        <Text style={styles.settingItemText}>
                          {option.label}
                        </Text>
                        <Text style={styles.settingItemDescription}>
                          {option.description}
                        </Text>
                      </View>
                      
                      {/* Toggle Buttons Below Each Item */}
                      <View style={styles.toggleButtonsContainer}>
                        <View style={styles.toggleButtonGroup}>
                          <TouchableOpacity
                            style={[
                              styles.toggleButton,
                              option.preference === 'ignore' && [styles.toggleButtonActive, { backgroundColor: STATUS.SUCCESS, borderRightColor: STATUS.SUCCESS }]
                            ]}
                            onPress={() => {
                              console.log('Show button pressed for:', option.id);
                              updateContentPreference(option.id, 'ignore');
                            }}
                            activeOpacity={0.7}
                          >
                            <Text style={[
                              styles.toggleButtonText,
                              option.preference === 'ignore' && styles.toggleButtonTextActive
                            ]}>
                              Show
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.toggleButton,
                              option.preference === 'warn' && [styles.toggleButtonActive, { backgroundColor: STATUS.WARNING, borderRightColor: STATUS.WARNING }]
                            ]}
                            onPress={() => {
                              console.log('Warn button pressed for:', option.id);
                              updateContentPreference(option.id, 'warn');
                            }}
                            activeOpacity={0.7}
                          >
                            <Text style={[
                              styles.toggleButtonText,
                              option.preference === 'warn' && styles.toggleButtonTextActive
                            ]}>
                              Warn
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.toggleButton,
                              styles.toggleButtonLast,
                              option.preference === 'hide' && [styles.toggleButtonActive, { backgroundColor: STATUS.ERROR, borderRightColor: STATUS.ERROR }]
                            ]}
                            onPress={() => {
                              console.log('Hide button pressed for:', option.id);
                              updateContentPreference(option.id, 'hide');
                            }}
                            activeOpacity={0.7}
                          >
                            <Text style={[
                              styles.toggleButtonText,
                              option.preference === 'hide' && styles.toggleButtonTextActive
                            ]}>
                              Hide
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* Web Settings Button */}
            <View style={styles.webSettingsSection}>
              <TouchableOpacity
                style={styles.webSettingsTextButton}
                onPress={() => ModerationService.openBlueskyModerationSettings()}
                activeOpacity={0.7}
              >
                <Icon name="external-link" size={24} color="#fff" />
                <Text style={styles.webSettingsTextButtonText}>
                  adjust settings on bsky.app
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: '#333',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
  },

  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  loadingText: {
    color: '#666',
    fontSize: 16,
    fontFamily: 'Firma-Medium',
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
    marginBottom: 8,
    paddingHorizontal: 20,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionDescription: {
    color: '#999',
    fontSize: 12,
    fontFamily: 'Firma-Regular',
    marginBottom: 12,
    paddingHorizontal: 20,
  },
  sectionContent: {
    backgroundColor: '#1C1C1E',
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333',
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 0.5,
    borderBottomColor: '#333',
  },
  contentOptionItem: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 0.5,
    borderBottomColor: '#333',
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
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  settingTextContainer: {
    flex: 1,
  },
  settingItemText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    fontFamily: 'Firma-Medium',
  },
  settingItemDescription: {
    color: '#999',
    fontSize: 12,
    fontFamily: 'Firma-Regular',
    marginTop: 2,
  },
  preferenceIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  preferenceText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
    marginLeft: 4,
  },
  toggleButtonGroup: {
    flexDirection: 'row',
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    flex: 1,
    maxWidth: 300,
    overflow: 'hidden',
  },
  toggleButton: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#333',
  },
  toggleButtonActive: {
    backgroundColor: STATUS.SUCCESS,
    borderRightColor: STATUS.SUCCESS,
  },
  toggleButtonText: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: 'Firma-Medium',
    color: '#999',
  },
  toggleButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  toggleButtonLast: {
    borderRightWidth: 0,
  },
  toggleButtonsContainer: {
    marginTop: 12,
    alignItems: 'center',
  },
  disabledItem: {
    opacity: 0.5,
  },
  disabledIcon: {
    backgroundColor: '#444',
  },
  disabledText: {
    color: '#666',
  },
  disabledToggleGroup: {
    opacity: 0.5,
  },
  disabledToggleButton: {
    backgroundColor: '#444',
  },
  disabledToggleText: {
    color: '#666',
  },
  infoSection: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  infoText: {
    color: '#999',
    fontSize: 12,
    fontFamily: 'Firma-Regular',
    marginLeft: 12,
    lineHeight: 18,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  statItem: {
    width: '31%',
    backgroundColor: '#1C1C1E',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  statContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'Firma-Bold',
    textAlign: 'center',
  },
  statLabel: {
    color: '#999',
    fontSize: 12,
    marginTop: 5,
    fontFamily: 'Firma-Regular',
    textAlign: 'center',
    lineHeight: 16,
  },
  debugOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  webSettingsSection: {
    marginTop: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  webSettingsTextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  webSettingsTextButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    fontFamily: 'Firma-Medium',
    marginLeft: 6,
  },
  webSettingsDescription: {
    color: '#999',
    fontSize: 12,
    fontFamily: 'Firma-Regular',
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 8,
  },
});

export default ModerationControls; 