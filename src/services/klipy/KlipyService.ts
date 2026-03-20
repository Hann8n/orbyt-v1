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
  /** True when item is a Klipy advertisement (not selectable as content). */
  isAd?: boolean;
  /** For ads: HTML content to render in WebView (per Klipy docs). */
  content?: string;
  /** For ads: destination URL when content is a link (fallback). */
  destinationUrl?: string;
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

/** Resolve file/files node per Klipy response (docs use `file`, some variants use `files`). */
function getFileNode(obj: Record<string, unknown>): unknown {
  return obj.file ?? obj.files ?? obj.file_meta ?? obj.fileMeta;
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

/** Browser-like User-Agent required by Klipy to receive advertisements in API responses. */
const KLIPY_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

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
        'User-Agent': KLIPY_USER_AGENT,
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
    adMinWidth?: number;
    adMaxWidth?: number;
    adMinHeight?: number;
    adMaxHeight?: number;
  }): Promise<KlipyListResponse> {
    const page = opts.page ?? 1;
    const perPage = opts.perPage ?? DEFAULT_PER_PAGE;
    const formatFilter = Array.isArray(opts.formatFilter)
      ? opts.formatFilter.join(',')
      : opts.formatFilter;

    const segment = kindToPathSegment(opts.kind);
    const params: Record<string, unknown> = {
      customer_id: opts.customerId,
      q: opts.query,
      page,
      per_page: perPage,
      locale: opts.locale,
      content_filter: opts.contentFilter,
      format_filter: formatFilter,
    };
    if (opts.adMinWidth != null) params['ad-min-width'] = opts.adMinWidth;
    if (opts.adMaxWidth != null) params['ad-max-width'] = opts.adMaxWidth;
    if (opts.adMinHeight != null) params['ad-min-height'] = opts.adMinHeight;
    if (opts.adMaxHeight != null) params['ad-max-height'] = opts.adMaxHeight;

    const json = await this.getJson<unknown>(`api/v1/${this.appKey}/${segment}/search`, params);

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
    adMinWidth?: number;
    adMaxWidth?: number;
    adMinHeight?: number;
    adMaxHeight?: number;
  }): Promise<KlipyListResponse> {
    const page = opts.page ?? 1;
    const perPage = opts.perPage ?? DEFAULT_PER_PAGE;
    const formatFilter = Array.isArray(opts.formatFilter)
      ? opts.formatFilter.join(',')
      : opts.formatFilter;

    const segment = kindToPathSegment(opts.kind);
    const params: Record<string, unknown> = {
      customer_id: opts.customerId,
      page,
      per_page: perPage,
      locale: opts.locale,
      content_filter: opts.contentFilter,
      format_filter: formatFilter,
    };
    if (opts.adMinWidth != null) params['ad-min-width'] = opts.adMinWidth;
    if (opts.adMaxWidth != null) params['ad-max-width'] = opts.adMaxWidth;
    if (opts.adMinHeight != null) params['ad-min-height'] = opts.adMinHeight;
    if (opts.adMaxHeight != null) params['ad-max-height'] = opts.adMaxHeight;

    const json = await this.getJson<unknown>(`api/v1/${this.appKey}/${segment}/trending`, params);

    return KlipyService.normalizeList(json, { kind: opts.kind, page, perPage });
  }

  private static normalizeList(
    raw: unknown,
    opts: { kind: KlipyKind; page: number; perPage: number }
  ): KlipyListResponse {
    const { kind, page, perPage } = opts;
    const dataNode = (raw as { data?: unknown })?.data;
    const inner =
      dataNode && typeof dataNode === 'object'
        ? (dataNode as {
            data?: unknown[];
            has_next?: boolean;
            current_page?: number;
            per_page?: number;
          })
        : null;
    const list = Array.isArray(inner?.data) ? inner.data : [];

    const items: KlipyItem[] = [];
    for (const rawIt of list) {
      const it = rawIt as unknown;
      const obj = it as Record<string, unknown>;
      const fileNode = getFileNode(obj);

      const isAd = obj.type === 'ad';

      if (isAd) {
        const content = typeof obj.content === 'string' ? obj.content : undefined;
        const destUrl = (obj.destination_url ?? obj.destinationUrl ?? obj.ad_url ?? obj.adUrl) as
          | string
          | undefined;
        const previewUrl =
          pickPreferredFileUrl(fileNode, { sizes: ['sm', 'xs', 'md', 'hd'], format: 'webp' }) ??
          pickPreferredFileUrl(fileNode, { sizes: ['sm', 'xs', 'md', 'hd'], format: 'png' }) ??
          pickPreferredFileUrl(fileNode, { sizes: ['sm', 'xs', 'md', 'hd'], format: 'jpg' }) ??
          pickPreferredUrl(
            (obj.media_formats ?? obj.mediaFormats ?? obj.media) as
              | Record<string, unknown>
              | undefined,
            ['webp', 'png', 'jpg', 'gif']
          ) ??
          '';
        const fullUrl = previewUrl || destUrl || '';
        if (!obj.id || (!content && !destUrl)) continue;
        items.push({
          id: `ad:${obj.id}`,
          kind,
          title: obj.title as string | undefined,
          slug: obj.slug as string | undefined,
          previewUrl: previewUrl || fullUrl,
          fullUrl,
          width: (obj.width as number) ?? undefined,
          height: (obj.height as number) ?? undefined,
          isAd: true,
          content,
          destinationUrl: destUrl,
        });
        continue;
      }

      const media = (obj.media_formats ?? obj.mediaFormats ?? obj.media) as
        | Record<string, unknown>
        | undefined;
      const previewPrefer: KlipyFormat[] = ['webp', 'png', 'jpg', 'gif', 'mp4', 'webm'];
      const fullPrefer: KlipyFormat[] = ['gif', 'webp', 'png', 'jpg', 'mp4', 'webm'];

      const previewUrl =
        pickPreferredFileUrl(fileNode, { sizes: ['sm', 'xs', 'md', 'hd'], format: 'webp' }) ??
        pickPreferredFileUrl(fileNode, { sizes: ['sm', 'xs', 'md', 'hd'], format: 'png' }) ??
        pickPreferredFileUrl(fileNode, { sizes: ['sm', 'xs', 'md', 'hd'], format: 'jpg' }) ??
        pickPreferredFileUrl(fileNode, { sizes: ['sm', 'xs', 'md', 'hd'], format: 'gif' }) ??
        pickPreferredUrl(media, previewPrefer) ??
        '';

      const fullUrl =
        pickPreferredFileUrl(fileNode, { sizes: ['md', 'hd', 'sm', 'xs'], format: 'gif' }) ??
        pickPreferredFileUrl(fileNode, { sizes: ['md', 'hd', 'sm', 'xs'], format: 'webp' }) ??
        pickPreferredFileUrl(fileNode, { sizes: ['md', 'hd', 'sm', 'xs'], format: 'png' }) ??
        pickPreferredFileUrl(fileNode, { sizes: ['md', 'hd', 'sm', 'xs'], format: 'jpg' }) ??
        pickPreferredFileUrl(fileNode, { sizes: ['md', 'hd', 'sm', 'xs'], format: 'mp4' }) ??
        pickPreferredFileUrl(fileNode, { sizes: ['md', 'hd', 'sm', 'xs'], format: 'webm' }) ??
        pickPreferredUrl(media, fullPrefer) ??
        previewUrl;

      if (!obj.id || !previewUrl || !fullUrl) continue;

      const id = typeof obj.id === 'number' || typeof obj.id === 'string' ? obj.id : String(obj.id);
      items.push({
        id,
        kind,
        title: obj.title as string | undefined,
        slug: obj.slug as string | undefined,
        previewUrl,
        fullUrl,
        width: obj.width as number | undefined,
        height: obj.height as number | undefined,
      });
    }

    const total = inner ? (inner as { total?: number }).total : undefined;
    const hasNextPage =
      typeof inner?.has_next === 'boolean' ? inner.has_next : items.length >= perPage;

    return { items, page, perPage, total, hasNextPage };
  }
}
