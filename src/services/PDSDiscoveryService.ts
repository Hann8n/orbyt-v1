/**
 * PDS Discovery Service - Simplified
 * Let expo-atproto-auth handle all the complexity of handle resolution
 */
export class PDSDiscoveryService {
  /**
   * Prepare identifier for OAuth - let expo-atproto-auth handle the rest
   * This is much simpler and lets the library do what it's designed for
   */
  static async prepareIdentifier(identifier: string): Promise<string> {
    // If it's already a full URL, return as-is
    if (identifier.startsWith('https://')) {
      return identifier;
    }

    // If it's email format (user@domain.com), convert to handle format
    if (identifier.includes('@')) {
      const [username, domain] = identifier.split('@');
      return `${username}.${domain}`;
    }

    // If it's already a handle (user.domain.com), return as-is
    if (identifier.includes('.')) {
      return identifier;
    }

    // If it's just a username, append bsky.social
    return `${identifier}.bsky.social`;
  }

}
