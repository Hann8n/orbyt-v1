import { ExpoOAuthClient, type ExpoOAuthClientOptions } from '@atproto/oauth-client-expo';
import { logger } from '../../utils/logger';

export class AtProtoOAuthService {
  private static instance: AtProtoOAuthService | null = null;
  private client: ExpoOAuthClient | null = null;

  private constructor() {}

  static getInstance(): AtProtoOAuthService {
    if (!AtProtoOAuthService.instance) {
      AtProtoOAuthService.instance = new AtProtoOAuthService();
    }
    return AtProtoOAuthService.instance;
  }

  private async fetchClientMetadata(): Promise<ExpoOAuthClientOptions['clientMetadata']> {
    try {
      const response = await fetch('https://getorbyt.com/oauth-client-metadata.json');
      if (!response.ok) {
        throw new Error(`Failed to fetch client metadata: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      logger.error('Failed to fetch client metadata', error, { component: 'OAuthService' });
      throw new Error('Failed to load OAuth client configuration');
    }
  }

  async getClient(): Promise<ExpoOAuthClient> {
    if (!this.client) {
      const clientMetadata = await this.fetchClientMetadata();
      this.client = new ExpoOAuthClient({
        handleResolver: 'https://bsky.social',
        clientMetadata,
      });
    }
    return this.client;
  }

  clearClient(): void {
    this.client = null;
  }
}
