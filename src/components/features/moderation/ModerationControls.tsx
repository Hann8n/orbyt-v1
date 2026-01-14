import React, { useState, useEffect } from 'react';
import { BORDER_RADIUS } from '../../../utils/constants';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Colors } from '../../ui/UI';
import Icon from '../../ui/Icon';
import { useUserStoreState } from '../../../stores/userStore';
import { useModerationSettings } from '../../../hooks/useModerationSettings';

interface ModerationControlsProps {
  visible: boolean;
  onClose: () => void;
  onLogout?: (clearAllAccounts?: boolean) => Promise<void>;
}

const ModerationControls: React.FC<ModerationControlsProps> = ({ visible }) => {
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
            <Text style={styles.loadingText}>Loading settings...</Text>
          </View>
        ) : (
          <>
            {/* Statistics Section */}
            {stats && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>moderation statistics</Text>
                <View style={styles.statsGrid}>{/* muted words stat removed */}</View>
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
              <Pressable
                style={styles.webSettingsTextButton}
                onPress={() => {
                  // External moderation settings link is not currently available
                }}
              >
                <Icon name="external-link" size={24} color={Colors.white} />
                <Text style={styles.webSettingsTextButtonText}>adjust settings on bsky.app</Text>
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
    paddingHorizontal: 20,
  },
  loadingText: {
    color: Colors.gray,
    fontSize: 16,
    fontFamily: 'Figtree-Medium',
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    color: Colors.gray,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Figtree-SemiBold',
    marginBottom: 8,
    paddingHorizontal: 20,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionDescription: {
    color: Colors.lightGray,
    fontSize: 12,
    fontFamily: 'Figtree-Regular',
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
    fontFamily: 'Figtree-Medium',
  },
  settingItemDescription: {
    color: Colors.lightGray,
    fontSize: 12,
    fontFamily: 'Figtree-Regular',
    marginTop: 2,
  },
  preferenceIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  preferenceText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Figtree-SemiBold',
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
    fontFamily: 'Figtree-Medium',
    color: Colors.lightGray,
  },
  toggleButtonTextActive: {
    color: Colors.black,
    fontFamily: 'Figtree-Bold',
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
    fontFamily: 'Figtree-Regular',
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
    fontFamily: 'Figtree-Bold',
    textAlign: 'center',
  },
  statLabel: {
    color: Colors.lightGray,
    fontSize: 12,
    marginTop: 5,
    fontFamily: 'Figtree-Regular',
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
    fontFamily: 'Figtree-Medium',
    marginLeft: 6,
  },
  webSettingsDescription: {
    color: Colors.lightGray,
    fontSize: 12,
    fontFamily: 'Figtree-Regular',
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 8,
  },
});

export default ModerationControls;
