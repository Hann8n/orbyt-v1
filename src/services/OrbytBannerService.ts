import { queryOptions, useQuery } from '@tanstack/react-query';
import {
  getCurrentLocaleTag,
  resolveLocalizedText,
  type TranslationMap,
} from '@/i18n/resolveLocalizedText';
import { queryKeys } from '@/utils/query/queryKeys';
import { fetchOrbytPublicJson } from '@/services/orbyt/orbytPublicFetch';
import { logger } from '@/utils/logger';

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
  titleColor?: string;
  /** Color for subtitle text. */
  subtitleColor?: string;
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
  titleOpacity?: number;
  /** Opacity for subtitle text. */
  subtitleOpacity?: number;
  /** Optional per-header height ratio override (0-1 of screen height). */
  heightRatio?: number;
  /** Optional readability shim under text. */
  bottomShimEnabled?: boolean;
  /** Optional shim opacity override (0..1). */
  bottomShimOpacity?: number;
  /** Optional overlay tint color for the header image. */
  overlayColor?: string;
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
        const data = await fetchOrbytPublicJson<HeadersApiResponse>(candidate, {
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

    logger.warn('No header endpoints returned valid data; using empty banner list', {
      component: 'HeaderService',
      error: lastError instanceof Error ? lastError.message : String(lastError),
    });
    return [];
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

    if (imageUrl.startsWith('http')) {
      return imageUrl;
    }

    const base = HeaderService.lastSuccessfulBaseUrl || 'https://getorbyt.com/';

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
