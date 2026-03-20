import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BORDER_RADIUS } from '../../../utils/constants';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Colors } from '../../../theme';
import Icon from '../../ui/Icon';
import { useUserStoreState } from '../../../stores/userStore';
import { useModerationSettings } from '../../../hooks/useModerationSettings';

interface ModerationControlsProps {
  visible: boolean;
  onClose: () => void;
  onLogout?: (clearAllAccounts?: boolean) => Promise<void>;
}

const ModerationControls: React.FC<ModerationControlsProps> = ({ visible }) => {
  const { t } = useTranslation();
  const { currentUser } = useUserStoreState();

  // Use React Query hook for moderation settings (account-scoped)
  const { isLoading: isLoadingSettings } = useModerationSettings(currentUser?.did ?? undefined);

  const [loading, setLoading] = useState(isLoadingSettings);
  const [stats, setStats] = useState<any>(null);

  const loadStats = async () => {
    try {
      // Stats feature is not currently implemented
      setStats(null);
    } catch (_error: unknown) {
      // ignore
    }
  };

  useEffect(() => {
    if (visible) {
      loadStats();
    }
  }, [visible]);

  // Update loading state when React Query loading state changes
  useEffect(() => {
    setLoading(isLoadingSettings);
  }, [isLoadingSettings]);

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
            <Text style={styles.loadingText}>{t('settings.loadingSettings')}</Text>
          </View>
        ) : (
          <>
            {/* Statistics Section */}
            {stats && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('settings.moderationStatistics')}</Text>
                <View style={styles.statsGrid}>{/* muted words stat removed */}</View>
              </View>
            )}

            {/* General Settings */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('settings.generalSettings')}</Text>
              <View style={styles.sectionContent}>
                <View style={styles.settingItem}>
                  <View style={styles.settingItemLeft}>
                    <View style={styles.iconContainer}>
                      <Icon name="block" size={24} color={Colors.neutral[50]} />
                    </View>
                    <View style={styles.settingTextContainer}>
                      <Text style={styles.settingItemText}>{t('settings.hideBlockedMuted')}</Text>
                      <Text style={styles.settingItemDescription}>
                        {t('settings.hideBlockedMutedDescription')}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>

            {/* Content Filters moved to dedicated screen */}

            {/* Web Settings Button */}
            <View style={styles.webSettingsSection}>
              <Pressable
                style={styles.webSettingsTextButton}
                onPress={() => {
                  // External moderation settings link is not currently available
                }}
              >
                <Icon name="external-link" size={24} color={Colors.neutral[50]} />
                <Text style={styles.webSettingsTextButtonText}>{t('settings.adjustOnBsky')}</Text>
              </Pressable>
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
    paddingHorizontal: 24,
  },
  loadingText: {
    color: Colors.neutral[500],
    fontSize: 16,
    fontFamily: 'Figtree-Medium',
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    color: Colors.neutral[500],
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Figtree-SemiBold',
    marginBottom: 8,
    paddingHorizontal: 24,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionContent: {
    backgroundColor: Colors.neutral[900],
    marginHorizontal: 20,
    borderRadius: BORDER_RADIUS.MEDIUM,
    borderWidth: 1,
    borderColor: Colors.neutral[600],
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.neutral[600],
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
    backgroundColor: Colors.neutral[600],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  settingTextContainer: {
    flex: 1,
  },
  settingItemText: {
    color: Colors.neutral[50],
    fontSize: 16,
    fontWeight: '500',
    fontFamily: 'Figtree-Medium',
  },
  settingItemDescription: {
    color: Colors.neutral[200],
    fontSize: 12,
    fontFamily: 'Figtree-Regular',
    marginTop: 2,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  webSettingsSection: {
    marginTop: 16,
    paddingHorizontal: 24,
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
    color: Colors.neutral[50],
    fontSize: 14,
    fontWeight: '500',
    fontFamily: 'Figtree-Medium',
    marginLeft: 6,
  },
});

export default ModerationControls;
