/**
 * OrbytColorsService - Handles fetching profile colors and beta status from the Orbyt API
 *
 * This service fetches colors from api.getorbyt.com instead of individual PDS endpoints.
 * Colors are indexed by Jetstream from com.getorbyt.profile records.
 */
import { logger } from '../utils/logger';

const API_BASE_URL = 'https://api.getorbyt.com';

/**
 * Color data returned from the Orbyt API
 */
export interface OrbytColorData {
  textColor: string;
  backgroundColor: string;
  joinedAt: string;
  isBeta: boolean;
}

/**
 * Service for fetching profile colors from the Orbyt API
 */
class OrbytColorsService {
  /**
   * Get the API token from environment variable
   */
  private static getToken(): string | null {
    return process.env.EXPO_PUBLIC_ORBYT_API_TOKEN || null;
  }

  /**
   * Build request headers with authentication
   */
  private static buildHeaders(): Record<string, string> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  /**
   * Fetch colors for a single DID
   * @param did - The DID to fetch colors for
   * @returns Color data or null if not found
   */
  static async fetchColors(did: string): Promise<OrbytColorData | null> {
    if (!did) return null;

    try {
      const headers = this.buildHeaders();
      const response = await fetch(`${API_BASE_URL}/v1/colors/${encodeURIComponent(did)}`, {
        headers,
      });

      if (response.status === 404) {
        return null;
      }

      if (response.status === 401) {
        logger.warn('Unauthorized: Check Orbyt API token', {
          component: 'OrbytColorsService',
        });
        return null;
      }

      if (!response.ok) {
        logger.warn(`Orbyt API error: ${response.status}`, {
          component: 'OrbytColorsService',
          did,
        });
        return null;
      }

      return (await response.json()) as OrbytColorData;
    } catch (error) {
      logger.error('Failed to fetch colors from Orbyt API', error, {
        component: 'OrbytColorsService',
        did,
      });
      return null;
    }
  }

  /**
   * Batch fetch colors for multiple DIDs
   * @param dids - Array of DIDs to fetch colors for (max 100)
   * @returns Map of DID to color data (null for not found)
   */
  static async batchFetchColors(dids: string[]): Promise<Record<string, OrbytColorData | null>> {
    if (!dids || dids.length === 0) {
      return {};
    }

    // API limit is 100 DIDs per request
    const limitedDids = dids.slice(0, 100);

    try {
      const headers = this.buildHeaders();
      const response = await fetch(`${API_BASE_URL}/v1/colors`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ dids: limitedDids }),
      });

      if (response.status === 401) {
        logger.warn('Unauthorized: Check Orbyt API token', {
          component: 'OrbytColorsService',
        });
        return {};
      }

      if (!response.ok) {
        logger.warn(`Orbyt API batch error: ${response.status}`, {
          component: 'OrbytColorsService',
        });
        return {};
      }

      return (await response.json()) as Record<string, OrbytColorData | null>;
    } catch (error) {
      logger.error('Failed to batch fetch colors from Orbyt API', error, {
        component: 'OrbytColorsService',
      });
      return {};
    }
  }
}

export default OrbytColorsService;
