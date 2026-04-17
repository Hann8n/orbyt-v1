import type { MessageView, PostView } from '@/services/api/types';
import { getVideoView } from '@/utils/video/helpers';

/** Embed view type; API/SDK may also return main lexicon id without `#view` (same shape). */
export const EMBED_RECORD_VIEW = 'app.bsky.embed.record#view';
export const EMBED_RECORD = 'app.bsky.embed.record';
export const RECORD_VIEW_RECORD = 'app.bsky.embed.record#viewRecord';
export const RECORD_VIEW_NOT_FOUND = 'app.bsky.embed.record#viewNotFound';
export const RECORD_VIEW_BLOCKED = 'app.bsky.embed.record#viewBlocked';
export const RECORD_VIEW_DETACHED = 'app.bsky.embed.record#viewDetached';

export const CHAT_EMBED_VIDEO_WIDTH = 150;
export const CHAT_EMBED_VIDEO_ASPECT = 9 / 16; // 9:16 card
export const CHAT_EMBED_VIDEO_RADIUS = 10; // slightly less round
/** Bottom corner toward screen edge — text/caption bubbles only */
export const CHAT_BUBBLE_OUTSIDE_BOTTOM_RADIUS = 6;

/** Shape of embed.record for display. */
export type EmbedRecordShape = {
  $type?: string;
  uri?: string;
  cid?: string;
  author?: { did: string; handle?: string; displayName?: string; avatar?: string };
  value?: { text?: string };
  embeds?: Array<{
    $type?: string;
    thumbnail?: string;
    playlist?: string;
    aspectRatio?: { width: number; height: number };
  }>;
  indexedAt?: string;
  replyCount?: number;
  repostCount?: number;
  likeCount?: number;
  notFound?: true;
  blocked?: true;
  detached?: true;
};

export type EmbedImage = {
  thumb?: string;
  fullsize?: string;
  alt?: string;
  aspectRatio?: { width: number; height: number };
};

/** Get video view from record.embeds (post can have video in embeds[] or as recordWithMedia). */
export function getVideoViewFromRecordEmbeds(
  embeds: EmbedRecordShape['embeds']
): { thumbnail: string | null; playlist?: string } | null {
  if (!embeds?.length) return null;
  for (let i = 0; i < embeds.length; i++) {
    const view = getVideoView(embeds[i] as PostView['embed']);
    if (view) return { thumbnail: view.thumbnail || null, playlist: view.playlist };
    const item = embeds[i] as {
      $type?: string;
      media?: { $type?: string; thumbnail?: string; playlist?: string };
    };
    if (item?.$type === 'app.bsky.embed.recordWithMedia#view' && item.media) {
      const mediaView = getVideoView(item.media as PostView['embed']);
      if (mediaView)
        return { thumbnail: mediaView.thumbnail || null, playlist: mediaView.playlist };
    }
  }
  return null;
}

/** Get images/GIFs from record.embeds (app.bsky.embed.images#view or recordWithMedia with images). */
export function getImagesFromRecordEmbeds(embeds: EmbedRecordShape['embeds']): EmbedImage[] {
  const result: EmbedImage[] = [];
  if (!embeds?.length) return result;
  for (let i = 0; i < embeds.length; i++) {
    const e = embeds[i] as {
      $type?: string;
      images?: EmbedImage[];
      media?: { $type?: string; images?: EmbedImage[] };
    };
    if (e?.$type === 'app.bsky.embed.images' || e?.$type === 'app.bsky.embed.images#view') {
      if (Array.isArray(e.images)) {
        for (const img of e.images) {
          if (img && (img.thumb || img.fullsize))
            result.push({
              thumb: img.thumb,
              fullsize: img.fullsize,
              alt: img.alt,
              aspectRatio: img.aspectRatio,
            });
        }
      }
    } else if (e?.$type === 'app.bsky.embed.recordWithMedia#view' && e.media) {
      const media = e.media as { $type?: string; images?: EmbedImage[] };
      if (
        (media.$type === 'app.bsky.embed.images' || media.$type === 'app.bsky.embed.images#view') &&
        Array.isArray(media.images)
      ) {
        for (const img of media.images) {
          if (img && (img.thumb || img.fullsize))
            result.push({
              thumb: img.thumb,
              fullsize: img.fullsize,
              alt: img.alt,
              aspectRatio: img.aspectRatio,
            });
        }
      }
    }
  }
  return result;
}

export function isEmbedRecordView(embed: MessageView['embed'] | null | undefined): boolean {
  if (!embed || typeof embed !== 'object') return false;
  const t = (embed as { $type?: string }).$type;
  const isRecordEmbed = t === EMBED_RECORD_VIEW || t === EMBED_RECORD;
  return isRecordEmbed && 'record' in embed && (embed as { record?: unknown }).record != null;
}
