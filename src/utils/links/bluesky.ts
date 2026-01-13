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
 * Convert AT Protocol list URI to Bluesky web URL
 * @param atUri - AT Protocol URI (e.g., at://did:plc:abc123/app.bsky.graph.list/xyz789)
 * @returns Bluesky web URL (e.g., https://bsky.app/profile/did:plc:abc123/lists/xyz789)
 */
export const convertListUriToBlueskyUrl = (atUri: string): string => {
  if (!atUri.startsWith('at://')) {
    return atUri;
  }

  // Extract the necessary parts from the AT URI
  // Format: at://did:plc:xxxx/app.bsky.graph.list/rkey
  const parts = atUri.replace('at://', '').split('/');
  if (parts.length >= 3) {
    const did = parts[0];
    const rkey = parts[2];

    // Format as a bsky.app list URL
    return `https://bsky.app/profile/${did}/lists/${rkey}`;
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

/**
 * Open a list in the Bluesky app with fallback to web
 * @param listUri - AT Protocol URI or web URL
 * @param fallbackMessage - Optional custom error message
 */
export const openListInBluesky = async (
  listUri: string,
  fallbackMessage?: string
): Promise<void> => {
  try {
    // Convert to web URL
    const webUrl = convertListUriToBlueskyUrl(listUri);

    // Open the web URL directly (will open in browser or Bluesky app if available)
    const canOpenWeb = await Linking.canOpenURL(webUrl);
    if (canOpenWeb) {
      await Linking.openURL(webUrl);
      return;
    }

    // If it doesn't work, show error
    const errorMessage =
      fallbackMessage || 'Unable to open this list. Please check your internet connection.';
    Alert.alert('Cannot Open List', errorMessage, [{ text: 'OK' }]);
  } catch (error: unknown) {
    console.error('Error opening list in Bluesky:', error);
    const errorMessage = fallbackMessage || 'Failed to open list in Bluesky.';
    Alert.alert('Error', errorMessage, [{ text: 'OK' }]);
  }
};

/**
 * Get Orbyt profile URL
 * @param handle - User handle (optional)
 * @param did - User DID (optional, used as fallback if handle is not available)
 * @returns Orbyt profile URL (e.g., https://getorbyt.com/@handle.bsky.social or https://getorbyt.com/@did:plc:abc123)
 */
export const getOrbytProfileUrl = (handle?: string, did?: string): string => {
  const identifier = handle || did;
  if (!identifier) {
    return '';
  }
  return `https://getorbyt.com/@${identifier}`;
};

/**
 * Convert AT Protocol URI to Orbyt web URL
 * @param atUri - AT Protocol URI (e.g., at://did:plc:abc123/app.bsky.feed.post/xyz789)
 * @param handle - User handle (optional, preferred over DID)
 * @param did - User DID (optional, used as fallback if handle is not available)
 * @returns Orbyt web URL (e.g., https://getorbyt.com/@handle.bsky.social/xyz789 or https://getorbyt.com/@did:plc:abc123/xyz789)
 */
export const convertAtUriToOrbytUrl = (atUri: string, handle?: string, did?: string): string => {
  if (!atUri.startsWith('at://')) {
    return atUri;
  }

  // Extract the necessary parts from the AT URI
  const parts = atUri.replace('at://', '').split('/');
  if (parts.length >= 3) {
    const rkey = parts[2];
    const identifier = handle || did || parts[0]; // Fallback to DID from URI if neither provided

    // Format as a getorbyt.com URL
    return `https://getorbyt.com/@${identifier}/${rkey}`;
  }

  return atUri;
};
