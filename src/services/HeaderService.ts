interface Header {
  id: string;
  imageUrl: string;
  destinationUrl?: string | null;
  title: string;
  description: string;
  // Optional custom colors
  titleColor?: string;
  descriptionColor?: string;
  // Backwards-compat alias used by some JSONs for description color
  subtitleColor?: string;
  // Optional font customization
  titleFontFamily?: string;
  titleFontSize?: number;
  descriptionFontFamily?: string;
  descriptionFontSize?: number;
  /**
   * Controls rendering order of text overlay
   * - 'title-first' renders title above description
   * - 'description-first' renders description above title (default for backwards compat)
   */
  textOrder?: 'title-first' | 'description-first';
  // Optional text opacity (0 to 1)
  titleOpacity?: number;
  descriptionOpacity?: number;
}

interface HeadersResponse {
  headers: Header[];
}

class HeaderService {
  // Remote default
  private static readonly REMOTE_URL = 'https://getorbyt.com/api/headers.json';
  private static cache: HeadersResponse | null = null;
  private static lastFetch: number = 0;
  private static readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private static lastSuccessfulBaseUrl: string | null = null;

  /**
   * Build candidate URLs for fetching headers in this priority:
   * 1) EXPO_PUBLIC_HEADERS_URL env var
   * 2) Common localhost ports for static servers
   * 3) Remote fallback
   */
  private static buildCandidateUrls(): string[] {
    const envUrl = (process.env as any)?.EXPO_PUBLIC_HEADERS_URL as string | undefined;
    const candidates: string[] = [];

    if (envUrl && envUrl.trim().length > 0) {
      candidates.push(envUrl.trim());
    }

    // Local development candidates
    candidates.push(
      'http://localhost:5173/api/headers.json',
      'http://127.0.0.1:5173/api/headers.json',
      'http://localhost:5500/api/headers.json',
      'http://127.0.0.1:5500/api/headers.json',
      'http://localhost:3000/api/headers.json',
      'http://127.0.0.1:3000/api/headers.json',
    );

    // Remote fallback
    candidates.push(this.REMOTE_URL);

    return candidates;
  }

  private static getBaseUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Return origin plus path up to the directory containing headers.json
      const path = parsed.pathname.replace(/\/[^/]*$/, '/');
      return `${parsed.origin}${path}`;
    } catch {
      return '';
    }
  }

  static async getHeaders(): Promise<Header[]> {
    try {
      const now = Date.now();
      if (this.cache && (now - this.lastFetch) < this.CACHE_DURATION) {
        return this.cache.headers;
      }

      const candidates = this.buildCandidateUrls();
      let data: HeadersResponse | null = null;
      let usedUrl: string | null = null;

      for (const candidate of candidates) {
        try {
          const response = await fetch(candidate);
          if (!response.ok) {
            continue; // try next candidate
          }
          const json = (await response.json()) as HeadersResponse;
          if (json && Array.isArray(json.headers)) {
            data = json;
            usedUrl = candidate;
            break;
          }
        } catch {
          // Try next candidate
        }
      }

      if (!data) {
        throw new Error('No header endpoints responded with valid data');
      }

      // Update cache and last successful base URL
      this.cache = data;
      this.lastFetch = now;
      if (usedUrl) {
        this.lastSuccessfulBaseUrl = this.getBaseUrl(usedUrl);
      }

      return data.headers;
    } catch (error) {
      console.error('Error fetching headers:', error);

      if (this.cache) {
        return this.cache.headers;
      }

      return [];
    }
  }

  static getImageUrl(imageUrl: string): string {
    if (!imageUrl) return '';

    // Absolute URL
    if (imageUrl.startsWith('http')) {
      return imageUrl;
    }

    // Resolve against last successful base URL if available
    const base = this.lastSuccessfulBaseUrl || 'https://getorbyt.com/';

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

  static clearCache(): void {
    this.cache = null;
    this.lastFetch = 0;
  }
}

export default HeaderService;
export type { Header };
