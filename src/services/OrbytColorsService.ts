/**
 * OrbytColorsService - Fetches profile colors and beta status from orbyt API
 *
 * Colors are indexed by Jetstream from com.getorbyt.profile records.
 * The /v1/colors endpoints are public (read-only, non-sensitive data).
 */
import { logger } from '../utils/logger';

const API_BASE_URL = 'https://api.getorbyt.com';

/**
 * Color data returned from the orbyt API
 */
export interface OrbytColorData {
  textColor: string;
  backgroundColor: string;
  joinedAt: string;
  isBeta: boolean;
}

/**
 * Service for fetching profile colors from the orbyt API
 */
class OrbytColorsService {
  /**
   * Fetch colors for a single DID
   * @param did - The DID to fetch colors for
   * @returns Color data or null if not found
   */
  static async fetchColors(did: string): Promise<OrbytColorData | null> {
    if (!did) return null;

    try {
      const response = await fetch(`${API_BASE_URL}/v1/colors/${encodeURIComponent(did)}`);

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        logger.warn(`orbyt API error: ${response.status}`, {
          component: 'OrbytColorsService',
          did,
        });
        return null;
      }

      return (await response.json()) as OrbytColorData;
    } catch (error) {
      logger.error('Failed to fetch colors from orbyt API', error, {
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
      const response = await fetch(`${API_BASE_URL}/v1/colors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dids: limitedDids }),
      });

      if (!response.ok) {
        logger.warn(`orbyt API batch error: ${response.status}`, {
          component: 'OrbytColorsService',
        });
        return {};
      }

      return (await response.json()) as Record<string, OrbytColorData | null>;
    } catch (error) {
      logger.error('Failed to batch fetch colors from orbyt API', error, {
        component: 'OrbytColorsService',
      });
      return {};
    }
  }
}

export default OrbytColorsService;
