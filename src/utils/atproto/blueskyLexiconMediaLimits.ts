/**
 * Maximum blob sizes enforced by the AT Protocol lexicons used on Bluesky.
 * These are the authoritative record-validation limits (not guessed constants).
 * See @atproto/api lexicons: app.bsky.embed.images, app.bsky.embed.video.
 */
export const BSKY_LEXICON_EMBED_IMAGE_BLOB_MAX_BYTES = 1_000_000;
