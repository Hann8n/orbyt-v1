/**
 * Utility functions for handling Bluesky URL conversions and deep linking
 */

import { Linking, Alert } from 'react-native';
import { Href } from 'expo-router';

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
export const openPostInBluesky = async (postUri: string, fallbackMessage?: string): Promise<void> => {
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
    const errorMessage = fallbackMessage || 
      'Unable to open this post. Please check your internet connection.';
    Alert.alert('Cannot Open Post', errorMessage, [{ text: 'OK' }]);
  } catch (error) {
error('Error opening post in Bluesky:', error);
    const errorMessage = fallbackMessage || 'Failed to open post in Bluesky.';
    Alert.alert('Error', errorMessage, [{ text: 'OK' }]);
  }
};

/**
 * Deep link route information
 */
export interface DeepLinkRoute {
  href: Href;
  params?: Record<string, string>;
}

/**
 * Parse a deep link URL and convert it to an Expo Router route
 * Supports:
 * - AT Protocol URIs (at://did:plc:.../app.bsky.feed.post/...)
 * - Bluesky web URLs (https://bsky.app/profile/.../post/...)
 * - Orbyt custom URLs (com.getorbyt://... or https://getorbyt.com/...)
 * - Profile URLs (https://bsky.app/profile/...)
 * - Channel URIs (at://did:plc:.../app.bsky.feed.generator/...)
 * 
 * @param url - The URL to parse
 * @returns DeepLinkRoute object with href and params, or null if not parseable
 */
export const parseDeepLink = (url: string): DeepLinkRoute | null => {
  if (!url) return null;

  try {
    // Handle AT Protocol URIs
    if (url.startsWith('at://')) {
      return parseAtUri(url);
    }

    // Handle custom scheme URLs (com.getorbyt://...)
    if (url.startsWith('com.getorbyt://') || url.startsWith('com.getorbyt:')) {
      const path = url.replace(/^com\.getorbyt:\/\//, '').replace(/^com\.getorbyt:/, '');
      return parsePath(path);
    }

    // Handle HTTPS URLs
    if (url.startsWith('https://')) {
      // Orbyt domain URLs (getorbyt.com and orbyt.video)
      if (url.includes('getorbyt.com') || url.includes('orbyt.video')) {
        const path = new URL(url).pathname;
        return parsePath(path);
      }
      
      // Bluesky URLs
      if (url.includes('bsky.app')) {
        return parseBlueskyUrl(url);
      }
    }

    // Handle relative paths
    if (url.startsWith('/')) {
      return parsePath(url);
    }

    return null;
  } catch (error) {
    console.warn('Error parsing deep link:', error);
    return null;
  }
};

/**
 * Parse AT Protocol URI
 */
const parseAtUri = (atUri: string): DeepLinkRoute | null => {
  const parts = atUri.replace('at://', '').split('/');
  
  if (parts.length < 3) return null;

  const did = parts[0];
  const collection = parts[1];
  const rkey = parts[2];

  // Handle posts
  if (collection === 'app.bsky.feed.post') {
    // Extract post ID from rkey or use the full URI
    return {
      href: {
        pathname: '/post/[id]',
        params: { id: atUri }
      }
    };
  }

  // Handle profiles
  if (collection === 'app.bsky.actor.profile') {
    return {
      href: {
        pathname: '/profile/[did]',
        params: { did }
      }
    };
  }

  // Handle channels/feeds
  if (collection === 'app.bsky.feed.generator') {
    return {
      href: {
        pathname: '/channel/[id]',
        params: { id: atUri }
      }
    };
  }

  return null;
};

/**
 * Parse Bluesky web URL
 */
const parseBlueskyUrl = (url: string): DeepLinkRoute | null => {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;

    // Profile URLs: https://bsky.app/profile/{did or handle}
    if (pathname.startsWith('/profile/')) {
      const identifier = pathname.split('/profile/')[1]?.split('/')[0];
      if (identifier) {
        return {
          href: {
            pathname: '/profile/[did]',
            params: { did: identifier }
          }
        };
      }
    }

    // Post URLs: https://bsky.app/profile/{did}/post/{rkey}
    if (pathname.includes('/post/')) {
      const match = pathname.match(/\/profile\/([^/]+)\/post\/([^/]+)/);
      if (match) {
        const [, profileId, postId] = match;
        // We'll need to construct the AT URI or use the post ID
        // For now, use the post ID from the URL
        return {
          href: {
            pathname: '/post/[id]',
            params: { id: `${profileId}/post/${postId}` }
          }
        };
      }
    }

    return null;
  } catch (error) {
    console.warn('Error parsing Bluesky URL:', error);
    return null;
  }
};

/**
 * Parse a path string (e.g., /post/123, /profile/did:plc:..., /channel/...)
 */
const parsePath = (path: string): DeepLinkRoute | null => {
  if (!path) return null;

  // Remove leading slash
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  const segments = cleanPath.split('/').filter(Boolean);

  if (segments.length === 0) return null;

  const [route, ...params] = segments;

  switch (route) {
    case 'post':
      if (params[0]) {
        return {
          href: {
            pathname: '/post/[id]',
            params: { id: params[0] }
          }
        };
      }
      break;

    case 'profile':
      if (params[0]) {
        return {
          href: {
            pathname: '/profile/[did]',
            params: { did: params[0] }
          }
        };
      }
      break;

    case 'channel':
      if (params[0]) {
        return {
          href: {
            pathname: '/channel/[id]',
            params: { id: params[0] }
          }
        };
      }
      break;

    case 'chat':
      if (params[0]) {
        return {
          href: {
            pathname: '/chat/[id]',
            params: { id: params[0] }
          }
        };
      }
      return {
        href: '/chat'
      };

    case 'create':
      return {
        href: '/create'
      };

    case 'settings':
      return {
        href: '/settings'
      };

    default:
      // Try to match dynamic routes
      if (route && params.length > 0) {
        return {
          href: {
            pathname: `/${route}/[id]` as any,
            params: { id: params[0] }
          }
        };
      }
  }

  return null;
};
