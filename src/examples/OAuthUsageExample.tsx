/**
 * OAuth Usage Example
 * Demonstrates how to use the improved OAuth system with better error handling
 */

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { useOAuth } from '../hooks/useOAuth';
import { useAccountManager } from '../hooks/useAccountManager';
import { analyzeOAuthError, handleOAuthError } from '../utils/oauthErrorHandler';

export function OAuthUsageExample() {
  const { isAuthenticated, isAuthenticating, error, signIn, signOut, clearError } = useOAuth();
  const { accounts, activeAccountDid, switchAccount, removeAccount } = useAccountManager();
  const [identifier, setIdentifier] = useState('');

  const handleSignIn = async () => {
    try {
      await signIn(identifier || 'bsky.social');
    } catch (error) {
      const errorInfo = analyzeOAuthError(error);
      
      if (errorInfo.requiresReauth) {
        Alert.alert(
          'Session Expired',
          'Your session has expired. Please sign in again.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign In', onPress: () => handleSignIn() }
          ]
        );
      } else if (!errorInfo.isUserCancellation) {
        Alert.alert('Sign In Failed', errorInfo.userFriendlyMessage);
      }
    }
  };

  const handleAccountSwitch = async (accountDid: string) => {
    try {
      await switchAccount(accountDid);
    } catch (error) {
      const errorInfo = analyzeOAuthError(error);
      
      if (errorInfo.requiresReauth) {
        Alert.alert(
          'Session Expired',
          'This account\'s session has expired. Please sign in again.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign In', onPress: () => handleSignIn() }
          ]
        );
      } else {
        Alert.alert('Account Switch Failed', errorInfo.userFriendlyMessage);
      }
    }
  };

  const handleRemoveAccount = async (accountDid: string) => {
    try {
      await removeAccount(accountDid);
    } catch (error) {
      handleOAuthError(error, 'remove account');
    }
  };

  if (isAuthenticated) {
    return (
      <View style={{ padding: 20 }}>
        <Text>Welcome! You are signed in.</Text>
        
        {accounts.length > 1 && (
          <View>
            <Text>Switch Account:</Text>
            {accounts.map(account => (
              <TouchableOpacity
                key={account.did}
                onPress={() => handleAccountSwitch(account.did)}
                style={{ 
                  padding: 10, 
                  backgroundColor: activeAccountDid === account.did ? '#007AFF' : '#F0F0F0',
                  margin: 5 
                }}
              >
                <Text>{account.displayName || account.handle}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        
        <TouchableOpacity onPress={signOut} style={{ padding: 10, backgroundColor: '#FF3B30' }}>
          <Text style={{ color: 'white' }}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ padding: 20 }}>
      <Text>Sign In to Bluesky</Text>
      
      {error && (
        <View style={{ padding: 10, backgroundColor: '#FF3B30', margin: 10 }}>
          <Text style={{ color: 'white' }}>{error}</Text>
          <TouchableOpacity onPress={clearError}>
            <Text style={{ color: 'white' }}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}
      
      <TouchableOpacity 
        onPress={handleSignIn} 
        disabled={isAuthenticating}
        style={{ 
          padding: 15, 
          backgroundColor: isAuthenticating ? '#CCC' : '#007AFF',
          margin: 10 
        }}
      >
        <Text style={{ color: 'white', textAlign: 'center' }}>
          {isAuthenticating ? 'Signing In...' : 'Sign In with OAuth'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

/**
 * Key improvements demonstrated:
 * 
 * 1. **Universal Error Handling**: Uses analyzeOAuthError() to categorize errors
 * 2. **Automatic Session Refresh**: OAuth service handles token refresh automatically
 * 3. **Better UX**: Specific error messages and appropriate user actions
 * 4. **Simplified Code**: Less boilerplate, more focused on business logic
 * 5. **Consistent Patterns**: Same error handling across all OAuth operations
 * 
 * The system now:
 * - Automatically detects session expiration
 * - Provides clear user feedback
 * - Handles network errors gracefully
 * - Redirects to login when needed
 * - Uses the OAuth package features more effectively
 */
