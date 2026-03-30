/**
 * Shared feed helpers (thumb URL normalization for external embeds).
 */
/** Resolve remote or local thumb URL for external embed upload (protocol-relative → https, keep file://). */
export function normalizeExternalEmbedThumbSource(raw: string | undefined): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const t = raw.trim();
  if (!t) return undefined;
  if (t.startsWith('file://')) return t;
  if (t.startsWith('https://') || t.startsWith('http://')) return t;
  if (t.startsWith('//')) return `https:${t}`;
  return undefined;
}
