import React from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { BORDER_RADIUS } from '../../utils/constants';
import { Colors } from './UI';
import { useAuth, useAccountManagement } from '../../stores/userStore';
import VerticalListSheet from './VerticalListSheet';

interface SessionDiagnosticsToolProps {
  visible: boolean;
  onDismiss: () => void;
}

const SessionDiagnosticsTool: React.FC<SessionDiagnosticsToolProps> = ({ visible, onDismiss }) => {
  const { clearCorruptedSessions, savedAccounts } = useAccountManagement();
  const { signOut } = useAuth();

  const handleClearSessions = async () => {
    try {
      await clearCorruptedSessions();
      Alert.alert('Success', 'All sessions have been cleared. Please sign in again.');
      onDismiss();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      Alert.alert('Error', `Failed to clear sessions: ${errorMsg}`);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(false); // Don't clear all accounts
      Alert.alert('Success', 'Signed out successfully.');
      onDismiss();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      Alert.alert('Error', `Failed to sign out: ${errorMsg}`);
    }
  };

  return (
    <VerticalListSheet
      visible={visible}
      onDismiss={onDismiss}
      title="Session Tools"
      showCancelButton={true}
    >
      <View style={styles.container}>
        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>
            {savedAccounts.length > 0
              ? `You have ${savedAccounts.length} saved account${savedAccounts.length === 1 ? '' : 's'}`
              : 'No saved accounts found'}
          </Text>
        </View>

        <View style={styles.actionsContainer}>
          <Pressable
            style={[styles.actionButton, styles.clearButton]}
            onPress={handleClearSessions}
          >
            <Text style={styles.actionButtonText}>Clear All Sessions</Text>
          </Pressable>

          <Pressable style={[styles.actionButton, styles.signOutButton]} onPress={handleSignOut}>
            <Text style={styles.actionButtonText}>Sign Out</Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: BORDER_RADIUS.MEDIUM,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  infoText: {
    color: Colors.neutral[200],
    fontSize: 14,
    fontFamily: 'Figtree-Regular',
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
    fontSize: 16,
    fontFamily: 'Figtree-SemiBold',
  },
});

export default SessionDiagnosticsTool;
