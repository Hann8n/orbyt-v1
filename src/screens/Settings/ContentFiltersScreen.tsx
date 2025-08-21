import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Switch, Linking } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ListHeader from '../../components/ui/ListHeader';
import Icon from '../../components/ui/Icon';
import { Colors } from '../../components/ui/UI';
import UI from '../../components/ui/UI';
import { RootStackParamList } from '../../navigation/types';
import feedService, { createQueryKeys } from '../../services/FeedService';
import { ModerationService } from '../../services/ModerationService';
import { ModerationSettings, LabelPreference } from '../../services/ModerationTypes';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'ContentFilters'>;

interface ContentTypeOption {
  id: string;
  label: string;
  description: string;
  icon: string;
  preference: LabelPreference;
}

const ContentFiltersScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<ModerationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [adultContentEnabled, setAdultContentEnabled] = useState(false);
  const [contentOptions, setContentOptions] = useState<ContentTypeOption[]>([
    {
      id: 'porn',
      label: 'Adult',
      description: 'Sexual content and pornography',
      icon: '',
      preference: 'hide'
    },
    {
      id: 'sexual',
      label: 'Suggestive',
      description: 'Sexual themes and suggestive content',
      icon: '',
      preference: 'warn'
    },
    {
      id: 'nudity',
      label: 'Artistic Nudity',
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

  useEffect(() => {
    // Prime UI immediately from cached settings for accurate initial state
    const cached = ModerationService.getCachedModerationSettings();
    setSettings(cached);
    setAdultContentEnabled(cached.adultContentEnabled);
    setContentOptions(prev => prev.map(option => ({
      ...option,
      preference: cached.labels[option.id] || option.preference
    })));

    // Then refresh from API without blocking UI
    (async () => {
      try {
        setLoading(true);
        const currentSettings = await ModerationService.getModerationSettings();
        setSettings(currentSettings);
        setAdultContentEnabled(currentSettings.adultContentEnabled);
        setContentOptions(prev => prev.map(option => ({
          ...option,
          preference: currentSettings.labels[option.id] || option.preference
        })));
      } catch (e) {
        console.error('Error loading content filters:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const updateContentPreference = async (contentId: string, preference: LabelPreference) => {
    setContentOptions(options => options.map(o => o.id === contentId ? { ...o, preference } : o));
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
        // Reset moderation/feeds so all content re-evaluates with new rules
        ModerationService.clearModerationCache();
        feedService.clearCurrentFeed();
        feedService.clearFeedCache();
        queryClient.invalidateQueries({ queryKey: createQueryKeys.feed.all });
      }
    } catch (e) {
      console.error('Error saving content preference:', e);
    }
  };

  const updateAdultContent = async (value: boolean) => {
    if (value === true) {
      Alert.alert(
        'Cannot Enable Sensitive Content',
        'Sensitive content can only be disabled from this app. To enable it, please use the Bluesky web app or official Bluesky app.',
        [{ text: 'OK' }]
      );
      return;
    }
    setAdultContentEnabled(value);
    try {
      if (settings) {
        const updatedSettings: ModerationSettings = {
          ...settings,
          adultContentEnabled: value,
        };
        await ModerationService.saveModerationSettings(updatedSettings);
        setSettings(updatedSettings);
        // Reset moderation/feeds so all content re-evaluates with new rules
        ModerationService.clearModerationCache();
        feedService.clearCurrentFeed();
        feedService.clearFeedCache();
        queryClient.invalidateQueries({ queryKey: createQueryKeys.feed.all });
      }
    } catch (e) {
      console.error('Error saving sensitive content setting:', e);
    }
  };

  return (
    <View style={styles.container}>
      <ListHeader
        mode="stacked"
        title="content filters"
        showBackButton
        onBackPress={() => navigation.goBack()}
        applySafeAreaTop
      />

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
        {/* Content Type Settings */}
        <View style={styles.section}>
          <View style={{ marginBottom: 12 }}>
            {adultContentEnabled && (
              <View style={styles.menuOption}>
                <View style={styles.menuOptionLeft}>
                  <Text style={styles.menuOptionText}>sensitive content</Text>
                </View>
                <Switch
                  value={adultContentEnabled}
                  onValueChange={updateAdultContent}
                  trackColor={{ false: Colors.mediumGray, true: Colors.lightGreen }}
                  thumbColor={adultContentEnabled ? Colors.white : Colors.lightGray}
                  ios_backgroundColor={Colors.mediumGray}
                />
              </View>
            )}
          </View>

          {contentOptions.map((option, index) => {
            const isAdult = ['porn', 'sexual', 'nudity'].includes(option.id);
            if (isAdult && !adultContentEnabled) return null;
            return (
              <View key={option.id} style={{ marginBottom: 12 }}>
                <View style={[styles.menuOption, { alignItems: 'center' }]}>
                  <View style={[styles.menuOptionLeft, { paddingRight: 12 }]}>
                    <Text style={styles.menuOptionText}>{option.label}</Text>
                  </View>
                  <View style={[styles.toggleButtonsContainer, { justifyContent: 'center' }]}>
                    <View style={styles.toggleButtonGroup}>
                      <TouchableOpacity
                        style={[styles.toggleButton, option.preference === 'ignore' && [styles.toggleButtonActive, { backgroundColor: UI.Colors.STATUS.SUCCESS, borderRightColor: UI.Colors.STATUS.SUCCESS }]]}
                        onPress={() => updateContentPreference(option.id, 'ignore')}
                        activeOpacity={0.7}
                        accessibilityLabel="Show"
                      >
                        <Icon
                          name="check"
                          size={16}
                          color={option.preference === 'ignore' ? Colors.black : Colors.lightGray}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.toggleButton, option.preference === 'warn' && [styles.toggleButtonActive, { backgroundColor: UI.Colors.STATUS.WARNING, borderRightColor: UI.Colors.STATUS.WARNING }]]}
                        onPress={() => updateContentPreference(option.id, 'warn')}
                        activeOpacity={0.7}
                        accessibilityLabel="Warn"
                      >
                        <Icon
                          name="eye"
                          size={16}
                          color={option.preference === 'warn' ? Colors.black : Colors.lightGray}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.toggleButton, styles.toggleButtonLast, option.preference === 'hide' && [styles.toggleButtonActive, { backgroundColor: UI.Colors.STATUS.ERROR, borderRightColor: UI.Colors.STATUS.ERROR }]]}
                        onPress={() => updateContentPreference(option.id, 'hide')}
                        activeOpacity={0.7}
                        accessibilityLabel="Hide"
                      >
                        <Icon
                          name="close"
                          size={16}
                          color={option.preference === 'hide' ? Colors.black : Colors.lightGray}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
        <View style={{ marginTop: 4 }}>
          <TouchableOpacity
            style={styles.menuOption}
            onPress={() => Linking.openURL('https://bsky.app/moderation')}
            activeOpacity={0.7}
          >
            <View style={styles.menuOptionLeft}>
              <Text style={styles.menuOptionText}>adjust on bsky.app</Text>
              <Text style={styles.menuOptionSubtitle}>open Bluesky content settings</Text>
            </View>
            <Icon name="external-link" size={20} color={Colors.gray} />
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
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 40,
  },
  section: {
    marginTop: 12,
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
  menuOption: {
    backgroundColor: Colors.darkGray,
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 5,
  },
  menuOptionLeft: {
    flexDirection: 'column',
    flex: 1,
  },
  menuOptionText: {
    color: Colors.lightGray,
    fontSize: 18,
    fontWeight: '500',
    fontFamily: 'Firma-Medium',
  },
  menuOptionSubtitle: {
    color: Colors.gray,
    fontSize: 12,
    fontWeight: '400',
    fontFamily: 'Firma-Regular',
    marginTop: 4,
  },
  toggleButtonsContainer: {
    marginTop: 0,
    alignItems: 'center',
    alignSelf: 'center',
  },
  toggleButtonGroup: {
    flexDirection: 'row',
    backgroundColor: Colors.darkGray,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.mediumGray,
    flexShrink: 0,
    width: 180,
    overflow: 'hidden',
  },
  toggleButton: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: Colors.mediumGray,
  },
  toggleButtonActive: {
    backgroundColor: UI.Colors.STATUS.SUCCESS,
    borderRightColor: UI.Colors.STATUS.SUCCESS,
  },
  toggleButtonText: { },
  toggleButtonTextActive: { },
  toggleButtonLast: {
    borderRightWidth: 0,
  },
});

export default ContentFiltersScreen;


