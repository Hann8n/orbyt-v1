import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { BORDER_RADIUS } from '../../utils/constants';
import { Colors } from './UI';
import { useAuth, useAccountManagement } from '../../stores/userStore';
import VerticalListSheet, { TrueSheet } from './VerticalListSheet';
import { FontFamily, Typography } from '../../utils/components/typography';
import { hexToRGBA } from '../../utils/formatting/colors';

interface SessionDiagnosticsToolProps {
  visible: boolean;
  onDismiss: () => void;
}

const SessionDiagnosticsTool: React.FC<SessionDiagnosticsToolProps> = ({ visible, onDismiss }) => {
  const { t } = useTranslation();
  const { clearCorruptedSessions, savedAccounts } = useAccountManagement();
  const { signOut } = useAuth();

  useEffect(() => {
    if (visible) TrueSheet.present('session-diagnostics-sheet');
  }, [visible]);

  const handleClearSessions = async () => {
    try {
      await clearCorruptedSessions();
      Alert.alert(t('common.success'), t('session.sessionsCleared'));
      onDismiss();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : t('errors.unknown');
      Alert.alert(t('common.error'), t('session.failedToClearSessions', { error: errorMsg }));
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(false); // Don't clear all accounts
      Alert.alert(t('common.success'), t('session.signedOutSuccess'));
      onDismiss();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : t('errors.unknown');
      Alert.alert(t('common.error'), t('session.failedToSignOut', { error: errorMsg }));
    }
  };

  return (
    <VerticalListSheet
      name="session-diagnostics-sheet"
      onDismiss={onDismiss}
      title={t('session.tools')}
      showCancelButton={true}
    >
      <View style={styles.container}>
        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>
            {savedAccounts.length > 0
              ? t('session.savedAccountsCount', { count: savedAccounts.length })
              : t('session.noSavedAccounts')}
          </Text>
        </View>

        <View style={styles.actionsContainer}>
          <Pressable
            style={[styles.actionButton, styles.clearButton]}
            onPress={handleClearSessions}
          >
            <Text style={styles.actionButtonText}>{t('session.clearAllSessions')}</Text>
          </Pressable>

          <Pressable style={[styles.actionButton, styles.signOutButton]} onPress={handleSignOut}>
            <Text style={styles.actionButtonText}>{t('session.signOut')}</Text>
          </Pressable>
        </View>
      </View>
    </VerticalListSheet>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  infoContainer: {
    backgroundColor: hexToRGBA(Colors.black, 0.2),
    borderRadius: BORDER_RADIUS.MEDIUM,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.overlay.white10,
  },
  infoText: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.bodySmall,
    lineHeight: Typography.lineHeights.bodySmall,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
  },
  actionsContainer: {
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  actionButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: BORDER_RADIUS.MEDIUM,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  clearButton: {
    backgroundColor: Colors.orange[500],
  },
  signOutButton: {
    backgroundColor: Colors.coral[500],
  },
  actionButtonText: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.body,
    lineHeight: Typography.lineHeights.body,
    fontFamily: FontFamily.semibold,
  },
});

export default SessionDiagnosticsTool;
