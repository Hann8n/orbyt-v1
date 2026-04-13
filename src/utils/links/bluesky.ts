/**
 * Utility functions for handling Bluesky URL conversions
 */

import { Linking, Alert } from 'react-native';
import i18n from '../../i18n';

/**
 * Convert AT Protocol URI to Bluesky web URL
 * @param atUri - AT Protocol URI (e.g., at://did:plc:abc123/app.bsky.feed.post/xyz789)
 * @returns Bluesky web URL (e.g., https://bsky.app/profile/did:plc:abc123/post/xyz789)
 */
const convertAtUriToBlueskyUrl = (atUri: string): string => {
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
 * Convert AT Protocol list URI to Bluesky web URL
 * @param atUri - AT Protocol URI (e.g., at://did:plc:abc123/app.bsky.graph.list/xyz789)
 * @returns Bluesky web URL (e.g., https://bsky.app/profile/did:plc:abc123/lists/xyz789)
 */
const convertListUriToBlueskyUrl = (atUri: string): string => {
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
    const errorMessage = fallbackMessage || i18n.t('errors.unableToOpenPost');
    Alert.alert(i18n.t('errors.cannotOpenPost'), errorMessage, [{ text: i18n.t('common.ok') }]);
  } catch (_error: unknown) {
    const errorMessage = fallbackMessage || i18n.t('errors.failedToOpenPost');
    Alert.alert(i18n.t('common.error'), errorMessage, [{ text: i18n.t('common.ok') }]);
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
    const errorMessage = fallbackMessage || i18n.t('errors.unableToOpenList');
    Alert.alert(i18n.t('errors.cannotOpenList'), errorMessage, [{ text: i18n.t('common.ok') }]);
  } catch (_error: unknown) {
    const errorMessage = fallbackMessage || i18n.t('errors.failedToOpenList');
    Alert.alert(i18n.t('common.error'), errorMessage, [{ text: i18n.t('common.ok') }]);
  }
};
