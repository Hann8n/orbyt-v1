import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useOAuth } from './useOAuth';

/**
 * Simple test component to verify OAuth functionality
 */
export default function OAuthTest() {
  const { 
    session, 
    isLoading, 
    isSigningIn, 
    error, 
    signIn, 
    signOut,
    makeAuthenticatedRequest 
  } = useOAuth();

  const handleSignIn = async () => {
    try {
      await signIn('https://bsky.social');
      Alert.alert('Success', 'OAuth sign in successful!');
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Sign in failed');
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      Alert.alert('Success', 'Signed out successfully!');
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Sign out failed');
    }
  };

  const testAuthenticatedRequest = async () => {
    if (!session) {
      Alert.alert('Error', 'No active session');
      return;
    }

    try {
      const response = await makeAuthenticatedRequest(
        'https://bsky.social/xrpc/app.bsky.actor.getProfile',
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        Alert.alert('Success', `Profile loaded for: ${data.handle}`);
      } else {
        Alert.alert('Error', `Request failed: ${response.status}`);
      }
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Request failed');
    }
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>OAuth Test</Text>
      
      {error && (
        <Text style={styles.error}>Error: {error}</Text>
      )}

      {session ? (
        <View style={styles.sessionInfo}>
          <Text style={styles.text}>Signed in as: {session.did}</Text>
          <Text style={styles.text}>
            Expires: {new Date(session.expiresAt).toLocaleString()}
          </Text>
          
          <TouchableOpacity 
            style={styles.button} 
            onPress={testAuthenticatedRequest}
            disabled={isSigningIn}
          >
            <Text style={styles.buttonText}>Test API Request</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.button, styles.signOutButton]} 
            onPress={handleSignOut}
            disabled={isSigningIn}
          >
            <Text style={styles.buttonText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity 
          style={styles.button} 
          onPress={handleSignIn}
          disabled={isSigningIn}
        >
          <Text style={styles.buttonText}>
            {isSigningIn ? 'Signing In...' : 'Sign In with Bluesky'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#000',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
  },
  text: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 10,
  },
  error: {
    fontSize: 16,
    color: '#ff6b6b',
    marginBottom: 20,
    textAlign: 'center',
  },
  sessionInfo: {
    alignItems: 'center',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginVertical: 10,
    minWidth: 200,
    alignItems: 'center',
  },
  signOutButton: {
    backgroundColor: '#ff6b6b',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
