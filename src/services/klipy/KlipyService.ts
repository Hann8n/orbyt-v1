import { Platform } from 'react-native';

export type KlipyKind = 'gif' | 'sticker' | 'meme' | 'emoji';

export type KlipyFormat = 'gif' | 'webp' | 'jpg' | 'png' | 'mp4' | 'webm';

export interface KlipyItem {
  id: number | string;
  kind: KlipyKind;
  title?: string;
  slug?: string;
  previewUrl: string;
  fullUrl: string;
  width?: number;
  height?: number;
}

export interface KlipyListResponse {
  items: KlipyItem[];
  page: number;
  perPage: number;
  total?: number;
  hasNextPage: boolean;
}

const DEFAULT_PER_PAGE = 24;

function toQueryString(params: Record<string, string | number | boolean | undefined | null>) {
  const entries = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return entries.length ? `?${entries.join('&')}` : '';
}

function pickPreferredUrl(media: Record<string, unknown> | undefined, prefer: KlipyFormat[]) {
  if (!media || typeof media !== 'object') return undefined;
  for (const key of prefer) {
    const candidate = (media as Record<string, unknown>)[key];
    if (candidate && typeof candidate === 'object') {
      const url = (candidate as { url?: unknown }).url;
      if (typeof url === 'string' && url.startsWith('http')) return url;
    }
  }
  return undefined;
}

function pickPreferredFileUrl(
  file: unknown,
  opts: { sizes: Array<'xs' | 'sm' | 'md' | 'hd'>; format: KlipyFormat }
) {
  if (!file || typeof file !== 'object') return undefined;
  const fileObj = file as Record<string, unknown>;
  for (const size of opts.sizes) {
    const sizeNode = fileObj[size];
    if (!sizeNode || typeof sizeNode !== 'object') continue;
    const fmtNode = (sizeNode as Record<string, unknown>)[opts.format];
    if (!fmtNode || typeof fmtNode !== 'object') continue;
    const url = (fmtNode as { url?: unknown }).url;
    if (typeof url === 'string' && url.startsWith('http')) return url;
  }
  return undefined;
}

function kindToPathSegment(kind: KlipyKind) {
  switch (kind) {
    case 'gif':
      return 'gifs';
    case 'sticker':
      return 'stickers';
    case 'meme':
      return 'static-memes';
    case 'emoji':
      return 'emojis';
  }
}

export class KlipyService {
  private readonly baseUrl: string;
  private readonly appKey: string;

  constructor(opts: { baseUrl: string; appKey: string }) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.appKey = opts.appKey;
  }

  private async getJson<T>(path: string, params: Record<string, unknown>): Promise<T> {
    const qs = toQueryString(
      params as Record<string, string | number | boolean | undefined | null>
    );
    const url = `${this.baseUrl}/${path}${qs}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': `Orbyt/${Platform.OS}`,
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Klipy request failed (${res.status}): ${text}`);
    }

    return (await res.json()) as T;
  }

  async search(opts: {
    customerId: string;
    kind: KlipyKind;
    query: string;
    page?: number;
    perPage?: number;
    locale?: string;
    contentFilter?: 'off' | 'low' | 'medium' | 'high';
    formatFilter?: KlipyFormat | KlipyFormat[];
  }): Promise<KlipyListResponse> {
    const page = opts.page ?? 1;
    const perPage = opts.perPage ?? DEFAULT_PER_PAGE;
    const formatFilter = Array.isArray(opts.formatFilter)
      ? opts.formatFilter.join(',')
      : opts.formatFilter;

    const segment = kindToPathSegment(opts.kind);
    const json = await this.getJson<unknown>(`api/v1/${this.appKey}/${segment}/search`, {
      customer_id: opts.customerId,
      q: opts.query,
      page,
      per_page: perPage,
      locale: opts.locale,
      content_filter: opts.contentFilter,
      format_filter: formatFilter,
    });

    return KlipyService.normalizeList(json, { kind: opts.kind, page, perPage });
  }

  async trending(opts: {
    customerId: string;
    kind: KlipyKind;
    page?: number;
    perPage?: number;
    locale?: string;
    contentFilter?: 'off' | 'low' | 'medium' | 'high';
    formatFilter?: KlipyFormat | KlipyFormat[];
  }): Promise<KlipyListResponse> {
    const page = opts.page ?? 1;
    const perPage = opts.perPage ?? DEFAULT_PER_PAGE;
    const formatFilter = Array.isArray(opts.formatFilter)
      ? opts.formatFilter.join(',')
      : opts.formatFilter;

    const segment = kindToPathSegment(opts.kind);
    const json = await this.getJson<unknown>(`api/v1/${this.appKey}/${segment}/trending`, {
      customer_id: opts.customerId,
      page,
      per_page: perPage,
      locale: opts.locale,
      content_filter: opts.contentFilter,
      format_filter: formatFilter,
    });

    return KlipyService.normalizeList(json, { kind: opts.kind, page, perPage });
  }

  private static normalizeList(
    raw: unknown,
    opts: { kind: KlipyKind; page: number; perPage: number }
  ): KlipyListResponse {
    const { kind, page, perPage } = opts;
    const root = raw as {
      data?: { data?: unknown[]; total?: number } | unknown[];
      total?: number;
    };

    const arr = Array.isArray(root?.data)
      ? root.data
      : (root?.data as { data?: unknown[] } | undefined)?.data;
    const list = Array.isArray(arr) ? arr : [];

    const items: KlipyItem[] = list
      .map((it: unknown) => {
        const obj = it as {
          id?: number | string;
          title?: string;
          slug?: string;
          width?: number;
          height?: number;
          media_formats?: Record<string, unknown>;
          mediaFormats?: Record<string, unknown>;
          media?: Record<string, unknown>;
          file?: unknown;
          file_meta?: unknown;
          fileMeta?: unknown;
          type?: string;
        };

        const media = obj.media_formats ?? obj.mediaFormats ?? obj.media;

        const previewPrefer: KlipyFormat[] = ['webp', 'png', 'jpg', 'gif', 'mp4', 'webm'];
        const fullPrefer: KlipyFormat[] = ['gif', 'webp', 'png', 'jpg', 'mp4', 'webm'];

        const previewUrl =
          pickPreferredFileUrl(obj.file, { sizes: ['sm', 'xs', 'md', 'hd'], format: 'webp' }) ??
          pickPreferredFileUrl(obj.file, { sizes: ['sm', 'xs', 'md', 'hd'], format: 'png' }) ??
          pickPreferredFileUrl(obj.file, { sizes: ['sm', 'xs', 'md', 'hd'], format: 'jpg' }) ??
          pickPreferredFileUrl(obj.file, { sizes: ['sm', 'xs', 'md', 'hd'], format: 'gif' }) ??
          pickPreferredUrl(media, previewPrefer) ??
          '';

        // Prefer image/GIF URLs for embed URIs (AT Protocol external + in-app Image). MP4 last so
        // comments render as animated/static images instead of falling through to a bare link card.
        const fullUrl =
          pickPreferredFileUrl(obj.file, { sizes: ['md', 'hd', 'sm', 'xs'], format: 'gif' }) ??
          pickPreferredFileUrl(obj.file, { sizes: ['md', 'hd', 'sm', 'xs'], format: 'webp' }) ??
          pickPreferredFileUrl(obj.file, { sizes: ['md', 'hd', 'sm', 'xs'], format: 'png' }) ??
          pickPreferredFileUrl(obj.file, { sizes: ['md', 'hd', 'sm', 'xs'], format: 'jpg' }) ??
          pickPreferredFileUrl(obj.file, { sizes: ['md', 'hd', 'sm', 'xs'], format: 'mp4' }) ??
          pickPreferredFileUrl(obj.file, { sizes: ['md', 'hd', 'sm', 'xs'], format: 'webm' }) ??
          pickPreferredUrl(media, fullPrefer) ??
          previewUrl;

        if (!obj.id || !previewUrl || !fullUrl) return null;

        return {
          id: obj.id,
          kind,
          title: obj.title,
          slug: obj.slug,
          previewUrl,
          fullUrl,
          width: obj.width,
          height: obj.height,
        } satisfies KlipyItem;
      })
      .filter((x): x is KlipyItem => !!x);

    const total = (root?.data as { total?: number } | undefined)?.total ?? root?.total;
    const hasNextPage = items.length >= perPage;

    return { items, page, perPage, total, hasNextPage };
  }
}
