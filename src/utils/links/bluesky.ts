/**
 * Utility functions for handling Bluesky URL conversions
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
 * Convert AT Protocol URI to Bluesky profile URL
 * @param atUri - AT Protocol URI (e.g., at://did:plc:abc123/app.bsky.feed.post/xyz789)
 * @returns Bluesky profile URL (e.g., https://bsky.app/profile/did:plc:abc123)
 */
export const convertAtUriToProfileUrl = (atUri: string): string => {
  if (!atUri.startsWith('at://')) {
    return atUri;
  }

  // Extract the DID from the AT URI
  const parts = atUri.replace('at://', '').split('/');
  if (parts.length >= 1) {
    const did = parts[0];
    return `https://bsky.app/profile/${did}`;
  }

  return atUri;
};

/**
 * Open a post in the Bluesky app with fallback to web
 * @param postUri - AT Protocol URI or web URL
 * @param fallbackMessage - Optional custom error message
 */
export const openPostInBluesky = async (
  postUri: string,
  fallbackMessage?: string
): Promise<void> => {
  try {
    // Convert to web URL
    const webUrl = convertAtUriToBlueskyUrl(postUri);

    // Open the web URL directly (will open in browser or Bluesky app if available)
    const canOpenWeb = await Linking.canOpenURL(webUrl);
    if (canOpenWeb) {
      await Linking.openURL(webUrl);
      return;
    }

    // If it doesn't work, show error
    const errorMessage =
      fallbackMessage || 'Unable to open this post. Please check your internet connection.';
    Alert.alert('Cannot Open Post', errorMessage, [{ text: 'OK' }]);
  } catch (error: unknown) {
    console.error('Error opening post in Bluesky:', error);
    const errorMessage = fallbackMessage || 'Failed to open post in Bluesky.';
    Alert.alert('Error', errorMessage, [{ text: 'OK' }]);
  }
};
