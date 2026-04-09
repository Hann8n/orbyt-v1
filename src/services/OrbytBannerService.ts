import { useQuery } from '@tanstack/react-query';

// Header types
interface Header {
  id: string;
  imageUrl: string;
  destinationUrl?: string | null;
  title: string | null;
  /** Secondary text used by the header banner. */
  subtitle?: string | null;
  // Optional custom colors
  titleColor?: string;
  /** Color for subtitle text. */
  subtitleColor?: string;
  // Optional font customization
  titleFontFamily?: string;
  titleFontSize?: number;
  /** Font for subtitle text. */
  subtitleFontFamily?: string;
  subtitleFontSize?: number;
  /**
   * Controls rendering order of text overlay
   * - 'title-first' renders title above subtitle
   * - 'subtitle-first' renders subtitle above title
   */
  textOrder?: 'title-first' | 'subtitle-first';
  // Optional text opacity (0 to 1)
  titleOpacity?: number;
  /** Opacity for subtitle text. */
  subtitleOpacity?: number;
  /** Optional per-header height ratio override (0-1 of screen height). */
  heightRatio?: number;
  /** Optional readability shim under text. */
  bottomShimEnabled?: boolean;
  /** Optional shim opacity override (0..1). */
  bottomShimOpacity?: number;
}

interface HeadersResponse {
  headers: Header[];
}

// Channel types
interface ChannelsResponse {
  channels: string[];
}

// Base API response interface
abstract class OrbytAPIService<T extends object> {
  protected abstract readonly REMOTE_URL: string;
  protected abstract readonly ENDPOINT_NAME: string;
  protected abstract readonly DATA_PROPERTY: keyof T;

  // Custom caching removed - React Query handles all caching

  /**
   * Build candidate URLs for fetching data in this priority:
   * 1) Environment variable (EXPO_PUBLIC_{SERVICE}_URL)
   * 2) Common localhost ports for static servers
   * 3) Remote fallback
   */
  protected buildCandidateUrls(): string[] {
    const envVarName = `EXPO_PUBLIC_${this.ENDPOINT_NAME.toUpperCase()}_URL`;
    const env = process.env as Record<string, string | undefined>;
    const envUrl = env[envVarName];
    const candidates: string[] = [];

    if (envUrl && envUrl.trim().length > 0) {
      candidates.push(envUrl.trim());
    }

    // Local development candidates
    candidates.push(
      `http://localhost:5173/api/${this.ENDPOINT_NAME}.json`,
      `http://127.0.0.1:5173/api/${this.ENDPOINT_NAME}.json`,
      `http://localhost:5500/api/${this.ENDPOINT_NAME}.json`,
      `http://127.0.0.1:5500/api/${this.ENDPOINT_NAME}.json`,
      `http://localhost:3000/api/${this.ENDPOINT_NAME}.json`,
      `http://127.0.0.1:3000/api/${this.ENDPOINT_NAME}.json`
    );

    // Remote fallback
    candidates.push(this.REMOTE_URL);

    return candidates;
  }

  protected getBaseUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Return origin plus path up to the directory containing the JSON file
      const path = parsed.pathname.replace(/\/[^/]*$/, '/');
      return `${parsed.origin}${path}`;
    } catch {
      return '';
    }
  }

  protected async fetchData(): Promise<T> {
    try {
      // React Query handles caching - no custom cache needed
      const candidates = this.buildCandidateUrls();
      let data: T | null = null;
      let usedUrl: string | null = null;

      for (const candidate of candidates) {
        try {
          const response = await fetch(candidate);
          if (!response.ok) {
            continue; // try next candidate
          }
          const json = (await response.json()) as T;
          const payload = json as Record<string, unknown>;
          if (payload && payload[this.DATA_PROPERTY as string]) {
            data = json;
            usedUrl = candidate;
            break;
          }
        } catch {
          // Try next candidate
        }
      }

      if (!data) {
        throw new Error(`No ${this.ENDPOINT_NAME} endpoints responded with valid data`);
      }

      // Update base URL for HeaderService
      if (usedUrl && this instanceof HeaderService) {
        HeaderService.setLastSuccessfulBaseUrl(usedUrl);
      }

      return data;
    } catch (_error) {
      // Return empty data as fallback
      return this.getEmptyData();
    }
  }

  /**
   * Clear the cache - no-op since React Query handles all caching
   */
  clearCache(): void {
    // React Query handles all caching - no custom cache to clear
  }

  /**
   * Get the last successful base URL (for HeaderService compatibility)
   */
  getLastSuccessfulBaseUrl(): string | null {
    return null; // Override in subclasses if needed
  }

  /**
   * Return empty data structure for the service
   */
  protected abstract getEmptyData(): T;

  protected updateLastSuccessfulBaseUrl(_url: string): void {
    // Default no-op for services that do not need base URL tracking.
  }
}

// Header Service
class HeaderService extends OrbytAPIService<HeadersResponse> {
  protected readonly REMOTE_URL = 'https://api.getorbyt.com/v1/headers/active';
  protected readonly ENDPOINT_NAME = 'banners';
  protected readonly DATA_PROPERTY: keyof HeadersResponse = 'headers';

  protected static lastSuccessfulBaseUrl: string | null = null;

  protected getEmptyData(): HeadersResponse {
    return { headers: [] };
  }

  static async getHeaders(): Promise<Header[]> {
    const instance = new HeaderService();
    const data = await instance.fetchData();
    return data.headers;
  }

  protected buildCandidateUrls(): string[] {
    const envVarNames = ['EXPO_PUBLIC_BANNERS_URL', 'EXPO_PUBLIC_HEADERS_URL'];
    const candidates: string[] = [];
    const env = process.env as Record<string, string | undefined>;

    for (const envVarName of envVarNames) {
      const envUrl = env[envVarName];
      if (envUrl && envUrl.trim().length > 0) {
        candidates.push(envUrl.trim());
      }
    }

    // Production should prefer the canonical API immediately to avoid localhost timeout penalties.
    candidates.push(this.REMOTE_URL);

    // Keep local JSON fallbacks only for explicit development workflows.
    if (__DEV__) {
      candidates.push(
        'http://localhost:5173/api/banners.json',
        'http://127.0.0.1:5173/api/banners.json',
        'http://localhost:5500/api/banners.json',
        'http://127.0.0.1:5500/api/banners.json',
        'http://localhost:3000/api/banners.json',
        'http://127.0.0.1:3000/api/banners.json',
        'http://localhost:5173/api/headers.json',
        'http://127.0.0.1:5173/api/headers.json',
        'http://localhost:5500/api/headers.json',
        'http://127.0.0.1:5500/api/headers.json',
        'http://localhost:3000/api/headers.json',
        'http://127.0.0.1:3000/api/headers.json'
      );
    }

    return candidates;
  }

  getLastSuccessfulBaseUrl(): string | null {
    return HeaderService.lastSuccessfulBaseUrl;
  }

  static getImageUrl(imageUrl: string): string {
    if (!imageUrl) return '';

    // Absolute URL
    if (imageUrl.startsWith('http')) {
      return imageUrl;
    }

    // Resolve against last successful base URL if available
    const base = HeaderService.lastSuccessfulBaseUrl || 'https://getorbyt.com/';

    // Handle paths like ../orbyt_header1.png coming from api directory
    if (imageUrl.startsWith('../')) {
      // Remove one level from base path
      try {
        const u = new URL(base);
        const trimmedPath = u.pathname.replace(/\/[^/]+\/?$/, '/');
        return `${u.origin}${trimmedPath}${imageUrl.substring(3)}`;
      } catch {
        return `https://getorbyt.com/${imageUrl.substring(3)}`;
      }
    }

    // Generic relative resolution
    try {
      const resolved = new URL(imageUrl, base);
      return resolved.toString();
    } catch {
      return `https://getorbyt.com/${imageUrl}`;
    }
  }

  static setLastSuccessfulBaseUrl(url: string): void {
    HeaderService.lastSuccessfulBaseUrl = new HeaderService().getBaseUrl(url);
  }

  static clearCache(): void {
    // React Query handles all caching - no custom cache to clear
  }
}

// Static Channels Service
class StaticChannelsService extends OrbytAPIService<ChannelsResponse> {
  protected readonly REMOTE_URL = 'https://getorbyt.com/api/channels.json';
  protected readonly ENDPOINT_NAME = 'channels';
  protected readonly DATA_PROPERTY: keyof ChannelsResponse = 'channels';

  protected getEmptyData(): ChannelsResponse {
    return { channels: [] };
  }

  static async getChannels(): Promise<string[]> {
    const instance = new StaticChannelsService();
    const data = await instance.fetchData();
    return data.channels || [];
  }

  static clearCache(): void {
    // React Query handles all caching - no custom cache to clear
  }
}

// TanStack Query hooks for the services
export const useHeaders = () => {
  return useQuery({
    queryKey: ['headers'],
    queryFn: () => HeaderService.getHeaders(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnMount: false,
  });
};

// Export abstract class as OrbytBannerService for backwards compatibility
const OrbytBannerService = OrbytAPIService;
export default OrbytBannerService;
export { HeaderService, StaticChannelsService };
export type { Header };
