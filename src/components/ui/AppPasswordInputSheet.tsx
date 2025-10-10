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
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from './Icon';
import { Colors } from './UI';
import VerticalListSheet from './VerticalListSheet';

interface AppPasswordInputSheetProps {
  visible: boolean;
  onDismiss: () => void;
  onSignIn: (username: string, appPassword: string) => Promise<void>;
  title?: string;
  name?: string;
}

const AppPasswordInputSheet: React.FC<AppPasswordInputSheetProps> = ({
  visible,
  onDismiss,
  onSignIn,
  title = "App Password Login",
  name = "app-password-input",
}) => {
  const [username, setUsername] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleSignIn = useCallback(async () => {
    const trimmedUsername = username.trim();
    const trimmedPassword = appPassword.trim();
    
    if (!trimmedUsername) {
      setError('Please enter your username or handle');
      return;
    }

    if (!trimmedPassword) {
      setError('Please enter your app password');
      return;
    }

    setError(null);
    setIsSigningIn(true);
    
    try {
      await onSignIn(trimmedUsername, trimmedPassword);
      
      // Close the sheet on success
      onDismiss();
    } catch (error) {
      // Check if this is a user cancellation vs actual error
      const errorMessage = error instanceof Error ? error.message : 'App password login failed';
      
      // More specific error messages based on common issues
      let userFriendlyMessage = `Failed to sign in with app password`;
      
      if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
        userFriendlyMessage = `Network error. Please check your internet connection and try again.`;
      } else if (errorMessage.includes('invalid') || errorMessage.includes('authentication')) {
        userFriendlyMessage = `Invalid username or app password. Please check your credentials and try again.`;
      } else if (errorMessage.includes('not found') || errorMessage.includes('404')) {
        userFriendlyMessage = `Could not find the server. Please check your username and try again.`;
      }
      
      setError(userFriendlyMessage);
    } finally {
      setIsSigningIn(false);
    }
  }, [username, appPassword, onSignIn, onDismiss]);

  const handleDismiss = useCallback(async () => {
    setUsername('');
    setAppPassword('');
    setError(null);
    setIsSigningIn(false);
    onDismiss();
  }, [onDismiss]);

  const canSignIn = username.trim() && appPassword.trim() && !isSigningIn;

  return (
    <VerticalListSheet
      visible={visible}
      onDismiss={handleDismiss}
      title={title}
      showCancelButton={false}
      name={name}
    >
      <View style={styles.container}>
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        
        <View style={styles.inputContainer}>
          <Icon name="at" size={20} color={Colors.darkGray} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="username or handle"
            placeholderTextColor={Colors.gray}
            value={username}
            onChangeText={(text) => {
              setUsername(text);
              if (error) setError(null); // Clear error when user starts typing
            }}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            editable={!isSigningIn}
            autoFocus
          />
        </View>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="app password"
            placeholderTextColor={Colors.gray}
            value={appPassword}
            onChangeText={(text) => {
              setAppPassword(text);
              if (error) setError(null); // Clear error when user starts typing
            }}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={handleSignIn}
            editable={!isSigningIn}
          />
        </View>
        
        <Text style={styles.helpText}>
          Enter your username and app password. You can create an app password in your Bluesky account settings.
        </Text>
        
        <TouchableOpacity
          style={[
            styles.liquidGlassButton,
            !canSignIn && styles.loginButtonDisabled
          ]}
          onPress={handleSignIn}
          disabled={!canSignIn}
        >
          <BlurView
            intensity={20}
            tint="light"
            style={styles.blurContainer}
          >
            <LinearGradient
              colors={
                !canSignIn
                  ? ['rgba(128, 128, 128, 0.3)', 'rgba(128, 128, 128, 0.1)']
                  : ['rgba(3, 133, 255, 0.8)', 'rgba(3, 133, 255, 0.6)']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.glassGradient}
            >
              <View style={styles.glassOverlay}>
                {isSigningIn ? (
                  <View style={styles.buttonContent}>
                    <ActivityIndicator color={Colors.white} size="small" style={{ marginRight: 8 }} />
                    <Text style={styles.loginButtonText}>
                      Signing in...
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.loginButtonText}>Sign In</Text>
                )}
              </View>
            </LinearGradient>
          </BlurView>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.helpLink}
          onPress={() => {
            // Open Bluesky app password help page
            // This would need to be implemented with Linking
          }}
        >
          <Text style={styles.helpLinkText}>
            Need help creating an app password?
          </Text>
        </TouchableOpacity>
      </View>
    </VerticalListSheet>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 20,
    marginBottom: 16,
    paddingHorizontal: 16,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: Colors.black,
    fontSize: 16,
    height: '100%',
    fontFamily: 'Firma-SemiBold',
  },
  liquidGlassButton: {
    borderRadius: BORDER_RADIUS.LARGE,
    marginTop: 8,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  blurContainer: {
    borderRadius: BORDER_RADIUS.LARGE,
    overflow: 'hidden',
  },
  glassGradient: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.LARGE,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  glassOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
  errorContainer: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    borderRadius: BORDER_RADIUS.SMALL,
  },
  errorText: {
    color: '#ff4444',
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
  helpLink: {
    alignSelf: 'center',
    paddingVertical: 8,
  },
  helpLinkText: {
    color: Colors.bluesky,
    fontSize: 14,
    fontFamily: 'Firma-SemiBold',
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default AppPasswordInputSheet;
