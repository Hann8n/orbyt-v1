import React, { useState, useCallback } from 'react';
import { BORDER_RADIUS } from '../../utils/constants';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import Icon from './Icon';
import { Colors } from './UI';
import VerticalListSheet from './VerticalListSheet';
import { PDSDiscoveryService } from '../../services/PDSDiscoveryService';

interface CustomPDSInputSheetProps {
  visible: boolean;
  onDismiss: () => void;
  onSignIn: (identifier: string) => Promise<void>;
  title?: string;
  name?: string;
}

const CustomPDSInputSheet: React.FC<CustomPDSInputSheetProps> = ({
  visible,
  onDismiss,
  onSignIn,
  title = "Custom Login",
  name = "custom-pds-input",
}) => {
  const [username, setUsername] = useState('');
  const [pdsError, setPdsError] = useState<string | null>(null);
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [isValidatingPds, setIsValidatingPds] = useState(false);

  const handleUsernameLogin = useCallback(async () => {
    const trimmedUsername = username.trim();
    
    if (!trimmedUsername) {
      setPdsError('Please enter your username or handle');
      return;
    }

    // Basic validation for common formats
    if (!trimmedUsername.includes('.') && !trimmedUsername.includes('@')) {
      setPdsError('Please enter a full handle (e.g., user.domain.com) or email');
      return;
    }

    setPdsError(null);
    setIsAddingAccount(true);
    setIsValidatingPds(true);
    
    try {
      // Prepare identifier and let expo-atproto-auth handle the rest
      const identifier = await PDSDiscoveryService.prepareIdentifier(trimmedUsername);
      
      await onSignIn(identifier);
      
      // Close the sheet on success
      onDismiss();
    } catch (error) {
      // Check if this is a user cancellation vs actual error
      const errorMessage = error instanceof Error ? error.message : 'OAuth sign-in failed';
      const isUserCancellation = errorMessage.includes('cancelled') || 
                                errorMessage.includes('Authentication was cancelled') ||
                                errorMessage.includes('user_cancelled');
      
      if (!isUserCancellation) {
        // More specific error messages based on common issues
        let userFriendlyMessage = `Could not connect to ${trimmedUsername}`;
        
        if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
          userFriendlyMessage = `Network error connecting to ${trimmedUsername}. Please check your internet connection and try again.`;
        } else if (errorMessage.includes('not found') || errorMessage.includes('404')) {
          userFriendlyMessage = `Could not find the server for ${trimmedUsername}. Please check the handle and try again.`;
        } else if (errorMessage.includes('invalid') || errorMessage.includes('malformed')) {
          userFriendlyMessage = `Invalid handle format: ${trimmedUsername}. Please enter a valid handle (e.g., user.domain.com).`;
        }
        
        setPdsError(userFriendlyMessage);
      }
    } finally {
      setIsAddingAccount(false);
      setIsValidatingPds(false);
    }
  }, [username, onSignIn, onDismiss]);

  const handleDismiss = useCallback(async () => {
    setUsername('');
    setPdsError(null);
    setIsAddingAccount(false);
    setIsValidatingPds(false);
    onDismiss();
  }, [onDismiss]);

  return (
    <VerticalListSheet
      visible={visible}
      onDismiss={handleDismiss}
      title={title}
      showCancelButton={false}
      name={name}
    >
      <View style={styles.usernameInputContainer}>
        {pdsError && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{pdsError}</Text>
          </View>
        )}
        
        <View style={styles.inputContainer}>
          <Icon name="at" size={20} color={Colors.lightGray} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="enter your handle"
            placeholderTextColor={Colors.gray}
            value={username}
            onChangeText={(text) => {
              setUsername(text);
              if (pdsError) setPdsError(null); // Clear error when user starts typing
            }}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={handleUsernameLogin}
            editable={!isAddingAccount && !isValidatingPds}
            autoFocus
          />
        </View>
        
        <Text style={styles.helpText}>
          Enter your full handle (e.g., user.domain.com) or email address
        </Text>
        
        <TouchableOpacity
          style={[
            styles.loginButton,
            (username.trim() && !isAddingAccount && !isValidatingPds) && styles.loginButtonActive,
            (!username.trim() || isAddingAccount || isValidatingPds) && styles.loginButtonDisabled
          ]}
          onPress={handleUsernameLogin}
          disabled={!username.trim() || isAddingAccount || isValidatingPds}
          activeOpacity={0.8}
        >
          {isAddingAccount || isValidatingPds ? (
            <View style={styles.buttonContent}>
              <ActivityIndicator color={Colors.white} size="small" style={{ marginRight: 8 }} />
              <Text style={styles.loginButtonText}>
                {isValidatingPds ? 'Connecting...' : 'Signing in...'}
              </Text>
            </View>
          ) : (
            <Text style={[
              styles.loginButtonText,
              (username.trim() && !isAddingAccount && !isValidatingPds) && styles.loginButtonTextActive
            ]}>Sign In</Text>
          )}
        </TouchableOpacity>
      </View>
    </VerticalListSheet>
  );
};

const styles = StyleSheet.create({
  usernameInputContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.LARGE,
    marginBottom: 20,
    paddingHorizontal: 20,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: Colors.white,
    fontSize: 16,
    height: '100%',
    fontFamily: 'Firma-SemiBold',
  },
  loginButton: {
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.FULL,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  loginButtonActive: {
    backgroundColor: Colors.white,
  },
  loginButtonDisabled: {
    opacity: 0.5,
  },
  loginButtonText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
  },
  loginButtonTextActive: {
    color: Colors.black,
  },
  errorContainer: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    borderRadius: BORDER_RADIUS.SMALL,
  },
  errorText: {
    color: Colors.red,
    fontSize: 14,
    fontFamily: 'Firma-Medium',
    textAlign: 'center',
  },
  helpText: {
    color: Colors.gray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20,
    lineHeight: 18,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default CustomPDSInputSheet;
