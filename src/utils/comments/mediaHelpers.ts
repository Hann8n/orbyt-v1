import { compressImage } from 'expo-image-and-video-compressor';
import type { KlipyItem } from '../../services/klipy/KlipyService';

const BSKY_LEXICON_EMBED_IMAGE_BLOB_MAX_BYTES = 1_000_000;

function normalizeKlipyAssetUrl(url: string | null | undefined): string | undefined {
  if (!url || typeof url !== 'string') return undefined;
  const t = url.trim();
  if (!t) return undefined;
  if (t.startsWith('//')) return `https:${t}`;
  return t;
}

function isLikelyRasterImageUrl(url: string): boolean {
  const clean = url.split('?')[0].toLowerCase();
  return /\.(gif|webp|png|jpe?g)$/i.test(clean);
}

export async function ensureCommentUploadImage(uri: string): Promise<string> {
  const maxBytes = BSKY_LEXICON_EMBED_IMAGE_BLOB_MAX_BYTES;
  const targetMaxBytes = Math.floor(maxBytes * 0.95);

  const readSize = async (targetUri: string): Promise<number> => {
    const response = await fetch(targetUri);
    if (!response.ok) throw new Error(`Failed to read image (${response.status})`);
    const blob = await response.blob();
    return blob.size;
  };

  let candidateUri = uri;
  let size = await readSize(candidateUri);
  if (size <= maxBytes) return candidateUri;

  const qualitySteps = [0.8, 0.65, 0.5, 0.4];
  for (const quality of qualitySteps) {
    candidateUri = await compressImage(candidateUri, {
      output: 'jpg',
      quality,
      maxWidth: 1600,
      maxHeight: 1600,
    });
    size = await readSize(candidateUri);
    if (size <= targetMaxBytes) return candidateUri;
  }

  throw new Error('Selected image is too large to upload');
}

/** Prefer static preview for Bluesky thumb upload; allow protocol-relative URLs and image fullUrl fallback. */
export function klipyThumbUrlForEmbed(item: KlipyItem): string | undefined {
  const preview = normalizeKlipyAssetUrl(item.previewUrl);
  const full = normalizeKlipyAssetUrl(item.fullUrl);
  if (preview && /^https?:\/\//.test(preview)) return preview;
  if (full && /^https?:\/\//.test(full) && isLikelyRasterImageUrl(full)) return full;
  return undefined;
}
