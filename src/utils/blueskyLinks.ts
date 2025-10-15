/**
 * Utility functions for handling Bluesky deep links and URL conversions
 */

import { Linking, Alert } from 'react-native';

/**
 * Convert AT Protocol URI to Bluesky web URL
 * @param atUri - AT Protocol URI (e.g., at://did:plc:abc123/app.bsky.feed.post/xyz789)
 * @returns Bluesky web URL (e.g., https://bsky.app/profile/did:plc:abc123/post/xyz789)
 */
export const convertAtUriToBlueskyUrl = (atUri: string): string => {
  if (!atUri.startsWith('at://')) {
    return atUri;
  }
  
  // Extract the necessary parts from the AT URI
  const parts = atUri.replace('at://', '').split('/');
  if (parts.length >= 3) {
    const did = parts[0];
    const collection = parts[1];
    const rkey = parts[2];
    
    // Format as a bsky.app URL
    return `https://bsky.app/profile/${did}/post/${rkey}`;
  }
  
  return atUri;
};

/**
 * Convert Bluesky web URL to app deep link URL
 * @param webUrl - Bluesky web URL
 * @returns Bluesky app deep link URL
 */
export const convertWebUrlToAppUrl = (webUrl: string): string => {
  return webUrl.replace('https://bsky.app/', 'bluesky://');
};

/**
 * Open a post in the Bluesky app with fallback to web
 * @param postUri - AT Protocol URI or web URL
 * @param fallbackMessage - Optional custom error message
 */
export const openPostInBluesky = async (postUri: string, fallbackMessage?: string): Promise<void> => {
  try {
    // Convert to web URL if needed
    const webUrl = convertAtUriToBlueskyUrl(postUri);
    const appUrl = convertWebUrlToAppUrl(webUrl);
    
    // Try to open with Bluesky app first
    const canOpenApp = await Linking.canOpenURL(appUrl);
    if (canOpenApp) {
      await Linking.openURL(appUrl);
      return;
    }
    
    // Fallback to web URL
    const canOpenWeb = await Linking.openURL(webUrl);
    if (canOpenWeb) {
      await Linking.openURL(webUrl);
      return;
    }
    
    // If neither works, show error
    const errorMessage = fallbackMessage || 
      'Unable to open this post. Please install the Bluesky app or check your internet connection.';
    Alert.alert('Cannot Open Post', errorMessage, [{ text: 'OK' }]);
  } catch (error) {
    console.error('Error opening post in Bluesky:', error);
    const errorMessage = fallbackMessage || 'Failed to open post in Bluesky app.';
    Alert.alert('Error', errorMessage, [{ text: 'OK' }]);
  }
};

/**
 * Open a profile in the Bluesky app with fallback to web
 * @param did - User DID
 * @param fallbackMessage - Optional custom error message
 */
export const openProfileInBluesky = async (did: string, fallbackMessage?: string): Promise<void> => {
  try {
    const webUrl = `https://bsky.app/profile/${did}`;
    const appUrl = `bluesky://profile/${did}`;
    
    // Try to open with Bluesky app first
    const canOpenApp = await Linking.canOpenURL(appUrl);
    if (canOpenApp) {
      await Linking.openURL(appUrl);
      return;
    }
    
    // Fallback to web URL
    const canOpenWeb = await Linking.canOpenURL(webUrl);
    if (canOpenWeb) {
      await Linking.openURL(webUrl);
      return;
    }
    
    // If neither works, show error
    const errorMessage = fallbackMessage || 
      'Unable to open this profile. Please install the Bluesky app or check your internet connection.';
    Alert.alert('Cannot Open Profile', errorMessage, [{ text: 'OK' }]);
  } catch (error) {
    console.error('Error opening profile in Bluesky:', error);
    const errorMessage = fallbackMessage || 'Failed to open profile in Bluesky app.';
    Alert.alert('Error', errorMessage, [{ text: 'OK' }]);
  }
};

/**
 * Create a Bluesky compose intent URL
 * @param text - Text to pre-fill in compose
 * @param useApp - Whether to use app URL scheme (default: true)
 * @returns Intent URL for composing a post
 */
export const createComposeIntentUrl = (text: string, useApp: boolean = true): string => {
  const encodedText = encodeURIComponent(text);
  const baseUrl = useApp ? 'bluesky://intent/compose' : 'https://bsky.app/intent/compose';
  return `${baseUrl}?text=${encodedText}`;
};

/**
 * Open Bluesky compose with pre-filled text
 * @param text - Text to pre-fill in compose
 * @param fallbackMessage - Optional custom error message
 */
export const openComposeInBluesky = async (text: string, fallbackMessage?: string): Promise<void> => {
  try {
    // Try app URL first
    const appUrl = createComposeIntentUrl(text, true);
    const canOpenApp = await Linking.canOpenURL(appUrl);
    if (canOpenApp) {
      await Linking.openURL(appUrl);
      return;
    }
    
    // Fallback to web URL
    const webUrl = createComposeIntentUrl(text, false);
    const canOpenWeb = await Linking.canOpenURL(webUrl);
    if (canOpenWeb) {
      await Linking.openURL(webUrl);
      return;
    }
    
    // If neither works, show error
    const errorMessage = fallbackMessage || 
      'Unable to open Bluesky compose. Please install the Bluesky app or check your internet connection.';
    Alert.alert('Cannot Open Compose', errorMessage, [{ text: 'OK' }]);
  } catch (error) {
    console.error('Error opening Bluesky compose:', error);
    const errorMessage = fallbackMessage || 'Failed to open Bluesky compose.';
    Alert.alert('Error', errorMessage, [{ text: 'OK' }]);
  }
};
