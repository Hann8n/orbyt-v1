import React, { useState, useEffect } from 'react';
import { BORDER_RADIUS } from '../src/utils/constants';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Linking,
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../src/components/ui/Icon';
import { Colors } from '../src/components/ui/UI';
import { AnimatedStarsBackground, AnimatedTV, CustomPDSInputSheet } from '../src/components/ui';
import { useAuth } from '../src/stores/userStore';

interface LoginScreenProps {
  onLogin: (handle: string) => Promise<void>;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const DEBUG = __DEV__ && false;
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [oauthError, setOAuthError] = useState<string | null>(null);
  const [showCustomPDSSheet, setShowCustomPDSSheet] = useState<boolean>(false);

  // User store hooks
  const { 
    isAuthenticating, 
    authError, 
    signIn, 
    clearAuthError 
  } = useAuth();

  const handleLogin = async () => {
    setIsLoading(true);
    setOAuthError(null);
    clearAuthError();

    try {
      // For Bluesky login, use the default Bluesky PDS
      // This will open the Bluesky OAuth flow without requiring a specific handle
      if (DEBUG) console.log('[LoginScreen] handleLogin: Bluesky OAuth login begin');
      await signIn('https://bsky.social');
      if (DEBUG) console.log('[LoginScreen] handleLogin: Bluesky OAuth login success');
      
      if (DEBUG) console.log('[LoginScreen] handleLogin: success');
      
      await onLogin('oauth-success');
    } catch (error) {
      // Check if this is a user cancellation vs actual error
      const errorMessage = error instanceof Error ? error.message : 'OAuth login failed';
      const isUserCancellation = errorMessage.includes('cancelled') || 
                                errorMessage.includes('Authentication was cancelled') ||
                                errorMessage.includes('user_cancelled');
      
      if (!isUserCancellation) {
        // Enhanced error logging for production debugging
        console.error('[LoginScreen] OAuth login error:', {
          error: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
          timestamp: new Date().toISOString(),
          identifier: 'https://bsky.social'
        });
        
        setOAuthError(errorMessage);
        Alert.alert(
          'OAuth Sign-in Failed',
          `Failed to sign in with Bluesky.\n\nError: ${errorMessage}\n\nPlease check the console logs for more details.`,
          [{ text: 'OK' }]
        );
      }
      if (DEBUG) console.log('[LoginScreen] handleLogin: error', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCustomPDSSignIn = async (identifier: string) => {
    setIsLoading(true);
    setOAuthError(null);
    clearAuthError();

    try {
      if (DEBUG) console.log('[LoginScreen] handleCustomPDSSignIn: custom PDS login begin');
      await signIn(identifier);
      if (DEBUG) console.log('[LoginScreen] handleCustomPDSSignIn: custom PDS login success');
      
      await onLogin('oauth-success');
    } catch (error) {
      // Enhanced error logging for production debugging
      const errorMessage = error instanceof Error ? error.message : 'Custom PDS login failed';
      console.error('[LoginScreen] Custom PDS login error:', {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
        identifier
      });
      
      // Re-throw the error so the CustomPDSInputSheet can handle it
      throw error;
    } finally {
      setIsLoading(false);
    }
  };



  const handleCreateAccount = () => {
    Linking.openURL('https://bsky.app');
  };




  const renderManualLogin = () => (
    <View style={styles.formContainer}>
      {oauthError && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{oauthError}</Text>
        </View>
      )}

      {/* Sign in button */}
      <TouchableOpacity
        style={styles.liquidGlassButton}
        onPress={handleLogin}
        disabled={isLoading}
        activeOpacity={0.8}
      >
        <BlurView
          intensity={20}
          tint="light"
          style={styles.blurContainer}
        >
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.9)', 'rgba(255, 255, 255, 0.7)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.glassGradient}
          >
            <View style={styles.glassOverlay}>
              {isLoading ? (
                <View style={styles.buttonContent}>
                  <ActivityIndicator 
                    color={Colors.black} 
                    size="small" 
                    style={{ marginRight: 8 }} 
                  />
                  <Text style={styles.blueskyButtonText}>
                    Signing in...
                  </Text>
                </View>
              ) : (
                <View style={styles.buttonContent}>
                  <Icon name="bluesky-icon" size={20} color={Colors.bluesky} style={{ marginRight: 8 }} />
                  <Text style={styles.blueskyButtonText}>
                    Sign in with Bluesky
                  </Text>
                </View>
              )}
            </View>
          </LinearGradient>
        </BlurView>
      </TouchableOpacity>

      {/* Custom PDS text button */}
      <TouchableOpacity
        style={styles.customPDSTextButton}
        onPress={() => setShowCustomPDSSheet(true)}
        disabled={isLoading}
      >
        <Text style={styles.customPDSTextButtonText}>Custom Login</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <AnimatedStarsBackground>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.container, { 
          paddingTop: insets.top,
          paddingBottom: insets.bottom 
        }]}
      >
        {/* Logo and App Name */}
        <View style={styles.logoContainer}>
          <View style={styles.logoBackground}>
            <LinearGradient
              colors={['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 1)', 'rgba(0, 0, 0, 1)', 'rgba(0, 0, 0, 0)']}
              locations={[0, 0.1, 0.9, 1]}
              style={styles.logoGradient}
            >
              <AnimatedTV size={120} />
              <Text style={styles.appName}>orbyt</Text>
            </LinearGradient>
          </View>
        </View>

        {renderManualLogin()}

        {/* Custom PDS Input Sheet */}
        <CustomPDSInputSheet
          visible={showCustomPDSSheet}
          onDismiss={() => setShowCustomPDSSheet(false)}
          onSignIn={handleCustomPDSSignIn}
          title="Custom Login"
          name="login-custom-pds"
        />

      </KeyboardAvoidingView>
    </AnimatedStarsBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  logoContainer: {
    alignItems: 'center',
    paddingTop: 20,
    position: 'absolute',
    top: '20%',
    left: 0,
    right: 0,
  },
  logoBackground: {
    borderRadius: 25,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  logoGradient: {
    paddingVertical: 30,
    paddingHorizontal: 40,
    alignItems: 'center',
    borderRadius: 25,
  },
  appName: {
    color: Colors.white,
    fontSize: 42,
    fontWeight: 'bold',
    fontFamily: 'Firma-Black',
    textAlign: 'center',
  },
  formContainer: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    marginTop: 'auto',
    marginBottom: 40,
  },
  liquidGlassButton: {
    width: '100%',
    borderRadius: BORDER_RADIUS.MEDIUM,
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
    borderRadius: BORDER_RADIUS.MEDIUM,
    overflow: 'hidden',
  },
  glassGradient: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.MEDIUM,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  glassOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  blueskyButtonText: {
    color: Colors.black,
    fontSize: 18,
    fontFamily: 'Firma-Bold',
  },
  customPDSTextButton: {
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  customPDSTextButtonText: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Firma-SemiBold',
    textAlign: 'center',
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
  oauthInfoContainer: {
    marginBottom: 24,
  },
  oauthInfoText: {
    color: Colors.gray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    textAlign: 'center',
    lineHeight: 20,
  },

  createAccountLink: {
    marginTop: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
  },
  createAccountText: {
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
  },
  createAccountLinkText: {
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Firma-SemiBold',
    textDecorationLine: 'underline',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdsButton: {
    backgroundColor: Colors.darkGray,
    marginTop: 12,
  },
  pdsButtonText: {
    color: Colors.white,
  },

});