import { useQuery } from '@tanstack/react-query';

// Header types
interface Header {
  id: string;
  imageUrl: string;
  destinationUrl?: string | null;
  title: string;
  /** Secondary text used by the header banner. */
  subtitle?: string;
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
}

interface HeadersResponse {
  headers: Header[];
}

// Channel types
interface ChannelsResponse {
  channels: string[];
}

// Base API response interface
interface ApiResponse {
  [key: string]: any;
}

abstract class APIService<T extends ApiResponse> {
  protected abstract readonly REMOTE_URL: string;
  protected abstract readonly ENDPOINT_NAME: string;
  protected abstract readonly DATA_PROPERTY: keyof T;
  
  protected cache: T | null = null;
  protected lastFetch: number = 0;
  protected readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  /**
   * Build candidate URLs for fetching data in this priority:
   * 1) Environment variable (EXPO_PUBLIC_{SERVICE}_URL)
   * 2) Common localhost ports for static servers
   * 3) Remote fallback
   */
  protected buildCandidateUrls(): string[] {
    const envVarName = `EXPO_PUBLIC_${this.ENDPOINT_NAME.toUpperCase()}_URL`;
    const envUrl = (process.env as any)?.[envVarName] as string | undefined;
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
      `http://127.0.0.1:3000/api/${this.ENDPOINT_NAME}.json`,
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
      const now = Date.now();
      if (this.cache && (now - this.lastFetch) < this.CACHE_DURATION) {
        return this.cache;
      }

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
          if (json && json[this.DATA_PROPERTY]) {
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

      // Update cache
      this.cache = data;
      this.lastFetch = now;

      // Update base URL for HeaderService
      if (usedUrl && this instanceof HeaderService) {
        (this as any).updateLastSuccessfulBaseUrl(usedUrl);
      }

      return data;
    } catch (error) {

      if (this.cache) {
        return this.cache;
      }

      // Return empty data as fallback
      return this.getEmptyData();
    }
  }

  /**
   * Clear the cache to force a fresh fetch
   */
  clearCache(): void {
    this.cache = null;
    this.lastFetch = 0;
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
}

// Header Service
class HeaderService extends APIService<HeadersResponse> {
  protected readonly REMOTE_URL = 'https://getorbyt.com/api/headers.json';
  protected readonly ENDPOINT_NAME = 'headers';
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

  protected updateLastSuccessfulBaseUrl(url: string): void {
    HeaderService.lastSuccessfulBaseUrl = this.getBaseUrl(url);
  }

  static clearCache(): void {
    const instance = new HeaderService();
    instance.clearCache();
  }
}

// Static Channels Service
class StaticChannelsService extends APIService<ChannelsResponse> {
  protected readonly REMOTE_URL = 'https://getorbyt.com/api/channels.json';
  protected readonly ENDPOINT_NAME = 'channels';
  protected readonly DATA_PROPERTY: keyof ChannelsResponse = 'channels';

  protected getEmptyData(): ChannelsResponse {
    return { channels: [] };
  }

  static async getChannels(): Promise<string[]> {
    try {
      const instance = new StaticChannelsService();
      const data = await instance.fetchData();
      return data.channels || [];
    } catch (error) {
      return [];
    }
  }

  static clearCache(): void {
    const instance = new StaticChannelsService();
    instance.clearCache();
  }
}

// TanStack Query hooks for the services
export const useHeaders = () => {
  return useQuery({
    queryKey: ['headers'],
    queryFn: () => HeaderService.getHeaders(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

export const useStaticChannels = () => {
  return useQuery({
    queryKey: ['staticChannels'],
    queryFn: async () => {
      try {
        return await StaticChannelsService.getChannels();
      } catch (error) {
        return [];
      }
    },
    staleTime: 1 * 60 * 1000, // 1 minute (shorter for testing)
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 3, // Retry up to 3 times
    retryDelay: 1000, // Wait 1 second between retries
  });
};

export default APIService;
export { HeaderService, StaticChannelsService };
export type { Header };
