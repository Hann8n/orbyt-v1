import React, { useState, useEffect, useCallback } from 'react';
import { BORDER_RADIUS } from '../../../utils/constants';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Switch,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '../../ui/UI';
import Icon from '../../ui/Icon';
import { ModerationService } from '../../../services/ModerationService';
import { ModerationSettings, LabelPreference } from '../../../services/ModerationTypes';
import { useProfile } from '../../../services/cache/ProfileCache';
import { useChannelColors } from '../../../services/cache/ChannelCache';
import { useCurrentUser, useAuth, useUserStoreState } from '../../../stores/userStore';

interface ModerationControlsProps {
  visible: boolean;
  onClose: () => void;
  onLogout?: (clearAllAccounts?: boolean) => Promise<void>;
}

interface ContentTypeOption {
  id: string;
  label: string;
  description: string;
  icon: string;
  preference: LabelPreference;
}

const ModerationControls: React.FC<ModerationControlsProps> = ({ visible, onClose, onLogout }) => {
  const router = useRouter();
  const { signOut } = useAuth();
  const { agent } = useUserStoreState();
  const logoutFunction = onLogout || signOut;
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
      // Stats feature is not currently implemented
      setStats(null);
    } catch (error) {
    }
  };

  const loadSettings = async () => {
    try {
      setLoading(true);
      const currentSettings = await ModerationService.getModerationSettings(agent);
      setSettings(currentSettings);
      
      // Update general settings
      setGeneralSettings({
        hideSensitiveContent: currentSettings.hideSensitiveContent,
        hideAdultContent: currentSettings.hideAdultContent,
        hideViolence: currentSettings.hideViolence,
        hideSpam: currentSettings.hideSpam,
        hideMisleading: currentSettings.hideMisleading,
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
        
        await ModerationService.saveModerationSettings(updatedSettings, agent);
        setSettings(updatedSettings);
      }
    } catch (error) {
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
        
        await ModerationService.saveModerationSettings(updatedSettings, agent);
        setSettings(updatedSettings);
      }
    } catch (error) {
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
    <View style={styles.container}> 

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
                <Text style={styles.sectionTitle}>moderation statistics</Text>
                <View style={styles.statsGrid}>
                  {/* muted words stat removed */}
                </View>
              </View>
            )}

            {/* General Settings */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>general settings</Text>
              <View style={styles.sectionContent}>
                <View style={styles.settingItem}>
                  <View style={styles.settingItemLeft}>
                    <View style={styles.iconContainer}>
                      <Icon name="block" size={24} color={Colors.white} />
                    </View>
                    <View style={styles.settingTextContainer}>
                      <Text style={styles.settingItemText}>hide blocked and muted users</Text>
                      <Text style={styles.settingItemDescription}>
                        content from blocked or muted users is always hidden
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>

            {/* Content Filters moved to dedicated screen */}

            {/* Web Settings Button */}
            <View style={styles.webSettingsSection}>
              <TouchableOpacity
                style={styles.webSettingsTextButton}
                onPress={() => {
                  // External moderation settings link is not currently available
                }}
                activeOpacity={0.7}
              >
                <Icon name="external-link" size={24} color={Colors.white} />
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
    backgroundColor: Colors.black,
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
    color: Colors.gray,
    fontSize: 16,
    fontFamily: 'Firma-Medium',
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    color: Colors.gray,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
    marginBottom: 8,
    paddingHorizontal: 20,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionDescription: {
    color: Colors.lightGray,
    fontSize: 12,
    fontFamily: 'Firma-Regular',
    marginBottom: 12,
    paddingHorizontal: 20,
  },
  sectionContent: {
    backgroundColor: Colors.darkGray,
    marginHorizontal: 20,
    borderRadius: BORDER_RADIUS.MEDIUM,
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
  contentOptionItem: {
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
    borderRadius: BORDER_RADIUS.SMALL,
    backgroundColor: Colors.mediumGray,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  settingTextContainer: {
    flex: 1,
  },
  settingItemText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '500',
    fontFamily: 'Firma-Medium',
  },
  settingItemDescription: {
    color: Colors.lightGray,
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
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.MEDIUM,
    borderWidth: 1,
    borderColor: Colors.mediumGray,
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
    borderRightColor: Colors.mediumGray,
  },
  toggleButtonActive: {
    backgroundColor: Colors.green,
    borderRightColor: Colors.green,
  },
  toggleButtonText: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: 'Firma-Medium',
    color: Colors.lightGray,
  },
  toggleButtonTextActive: {
    color: Colors.black,
    fontFamily: 'Firma-Bold',
    fontWeight: '700',
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
    backgroundColor: Colors.mediumGray,
  },
  disabledText: {
    color: Colors.gray,
  },
  disabledToggleGroup: {
    opacity: 0.5,
  },
  disabledToggleButton: {
    backgroundColor: Colors.mediumGray,
  },
  disabledToggleText: {
    color: Colors.gray,
  },
  infoSection: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.MEDIUM,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.mediumGray,
  },
  infoText: {
    color: Colors.lightGray,
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
    backgroundColor: Colors.darkGray,
    padding: 15,
    borderRadius: BORDER_RADIUS.MEDIUM,
    marginBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.mediumGray,
  },
  statContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    color: Colors.white,
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'Firma-Bold',
    textAlign: 'center',
  },
  statLabel: {
    color: Colors.lightGray,
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
    color: Colors.white,
    fontSize: 14,
    fontWeight: '500',
    fontFamily: 'Firma-Medium',
    marginLeft: 6,
  },
  webSettingsDescription: {
    color: Colors.lightGray,
    fontSize: 12,
    fontFamily: 'Firma-Regular',
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 8,
  },
});

export default ModerationControls; 