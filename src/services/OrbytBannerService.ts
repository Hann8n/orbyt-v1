import { queryOptions, useQuery } from '@tanstack/react-query';
import {
  getCurrentLocaleTag,
  resolveLocalizedText,
  type TranslationMap,
} from '@/i18n/resolveLocalizedText';
import { queryKeys } from '@/utils/query/queryKeys';
import { fetchJson } from '@/services/api/fetchJson';

// Header types
interface Header {
  id: string;
  imageUrl: string;
  destinationUrl?: string | null;
  title: string | null;
  titleTranslations?: TranslationMap;
  /** Secondary text used by the header banner. */
  subtitle?: string | null;
  subtitleTranslations?: TranslationMap;
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

interface HeadersApiResponse {
  headers: Header[];
}

// Header Service
class HeaderService {
  protected static lastSuccessfulBaseUrl: string | null = null;

  private static getHeaderCandidates(): string[] {
    const env = process.env as Record<string, string | undefined>;
    const candidates: string[] = [];
    const envVarNames = ['EXPO_PUBLIC_BANNERS_URL', 'EXPO_PUBLIC_HEADERS_URL'];

    for (const envVarName of envVarNames) {
      const envUrl = env[envVarName];
      if (envUrl && envUrl.trim().length > 0) {
        candidates.push(envUrl.trim());
      }
    }

    candidates.push('https://api.getorbyt.com/v1/headers/active');
    return candidates;
  }

  private static getBaseUrl(url: string): string {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/[^/]*$/, '/');
    return `${parsed.origin}${path}`;
  }

  static async getHeaders(signal?: globalThis.AbortSignal): Promise<Header[]> {
    let lastError: unknown = null;

    for (const candidate of HeaderService.getHeaderCandidates()) {
      try {
        const data = await fetchJson<HeadersApiResponse>(candidate, {
          signal,
          timeoutMs: 8000,
        });

        if (!Array.isArray(data.headers)) {
          continue;
        }

        HeaderService.setLastSuccessfulBaseUrl(candidate);
        return data.headers.map(header => ({
          ...header,
          title: resolveLocalizedText(header.title, header.titleTranslations),
          subtitle: resolveLocalizedText(header.subtitle ?? null, header.subtitleTranslations),
        }));
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Failed to fetch active headers');
  }

  static getHeadersQueryOptions(locale: string) {
    return queryOptions({
      queryKey: queryKeys.orbyt.headers(locale),
      queryFn: ({ signal }) => HeaderService.getHeaders(signal),
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnMount: false,
    });
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
    HeaderService.lastSuccessfulBaseUrl = HeaderService.getBaseUrl(url);
  }
}

// TanStack Query hooks for the services
export const useHeaders = () => {
  const locale = getCurrentLocaleTag();
  return useQuery(HeaderService.getHeadersQueryOptions(locale));
};

export { HeaderService };
export type { Header };
